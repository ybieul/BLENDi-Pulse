import cron from 'node-cron';
import type { WeeklyReportComparison, WeeklyReportData } from '@blendi/shared';
import { BlendLogModel } from '../models/BlendLog';
import { HydrationLogModel } from '../models/HydrationLog';
import { NotificationLogModel, type NotificationType } from '../models/NotificationLog';
import { SupplementLogModel } from '../models/SupplementLog';
import { WeeklyReportModel } from '../models/WeeklyReport';
import {
  UserModel,
  type IUserSupplement,
  type UserGoal,
  type UserLocale,
  type UserUnitSystem,
} from '../models/User';
import {
  getDailyPulseContent,
  getHydrationReminderContent,
  getStreakReminderContent,
  getSupplementReminderContent,
  getWeeklyReportContent,
} from '../services/notificationContent.service';
import { generateWeeklyReport } from '../services/weeklyReportGenerator.service';
import {
  cleanInvalidTokens,
  sendNotificationBatch,
  type PushNotificationPayload,
} from '../services/pushNotification.service';
import { getMidnightUTC, getNextOccurrenceUTC, toLocalDate } from '../utils/timezone.utils';

const DAILY_PULSE_CRON_EXPRESSION = '*/5 * * * *';
const HALF_HOUR_CRON_EXPRESSION = '*/30 * * * *';
const WEEKLY_REPORT_CRON_EXPRESSION = '0 * * * *';
const FIVE_MINUTES_IN_MILLISECONDS = 5 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKLY_REPORT_LOCAL_MONDAY_HOUR = 9;
const WEEKLY_REPORT_LOCAL_MONDAY_WEEKDAY = 1;
const DEFAULT_DAILY_HYDRATION_TARGET = 2500;
const NOTIFICATION_DEEP_LINKS: Record<NotificationType, string> = {
  dailyPulse: 'blendipulse://pulse-ai/chat',
  streakReminder: 'blendipulse://blend',
  supplementReminder: 'blendipulse://track',
  hydrationReminder: 'blendipulse://track',
  levelUp: 'blendipulse://me',
  weeklyReport: 'blendipulse://me/weekly-report',
};

interface DailyPulseUserCandidate {
  _id: unknown;
  pushToken?: string;
  goal: UserGoal;
  timezone: string;
  dailyPulseTime: {
    hour: number;
    minute: number;
  };
}

interface StreakReminderUserCandidate {
  _id: unknown;
  pushToken?: string;
  currentStreak: number;
  locale: UserLocale;
  timezone: string;
}

interface SupplementReminderUserCandidate {
  _id: unknown;
  pushToken?: string;
  locale: UserLocale;
  timezone: string;
  supplementStack: Array<Pick<IUserSupplement, 'supplementId' | 'name' | 'isActive'>>;
}

interface HydrationReminderUserCandidate {
  _id: unknown;
  pushToken?: string;
  locale: UserLocale;
  timezone: string;
  unitSystem: UserUnitSystem;
  dailyHydrationTarget: number;
}

interface WeeklyReportUserCandidate {
  _id: unknown;
  pushToken?: string;
  locale: UserLocale;
  timezone: string;
}

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function hasNonEmptyPushToken(pushToken: unknown): pushToken is string {
  return typeof pushToken === 'string' && pushToken.trim().length > 0;
}

function formatLocalDateKey(localDate: Date): string {
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isWithinLocalHalfHourWindow(localDate: Date, hour: number): boolean {
  return localDate.getUTCHours() === hour && localDate.getUTCMinutes() >= 0 && localDate.getUTCMinutes() <= 30;
}

function buildPushPayload(
  pushToken: string,
  type: Exclude<NotificationType, 'levelUp'>,
  title: string,
  body: string
): PushNotificationPayload {
  return {
    pushToken,
    title,
    body,
    data: {
      deepLink: NOTIFICATION_DEEP_LINKS[type],
      type,
    },
    priority: 'high',
  };
}

async function reserveNotificationLog(
  userId: unknown,
  type: Exclude<NotificationType, 'levelUp'>,
  notificationDate: string
): Promise<boolean> {
  const existingLog = await NotificationLogModel.exists({
    userId,
    type,
    notificationDate,
  });

  if (existingLog) {
    return false;
  }

  try {
    await NotificationLogModel.create({
      userId,
      type,
      notificationDate,
    });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return false;
    }

    throw err;
  }
}

async function dispatchNotifications(payloads: PushNotificationPayload[]): Promise<void> {
  const result = await sendNotificationBatch(payloads);
  await cleanInvalidTokens(result.invalidTokens);
}

async function runDailyPulseJob(): Promise<void> {
  const nowUtc = new Date();
  const windowEndUtc = new Date(nowUtc.getTime() + FIVE_MINUTES_IN_MILLISECONDS);
  const notifications: PushNotificationPayload[] = [];

  const users = await UserModel.find({
    'notificationPreferences.dailyPulse': true,
    pushToken: { $exists: true, $type: 'string', $ne: '' },
  })
    .select({
      pushToken: 1,
      goal: 1,
      timezone: 1,
      dailyPulseTime: 1,
    })
    .lean<DailyPulseUserCandidate[]>()
    .exec();

  for (const user of users) {
    if (!hasNonEmptyPushToken(user.pushToken)) {
      continue;
    }

    const nextOccurrenceUtc = getNextOccurrenceUTC(
      user.dailyPulseTime.hour,
      user.dailyPulseTime.minute,
      user.timezone
    );

    if (nextOccurrenceUtc.getTime() < nowUtc.getTime() || nextOccurrenceUtc.getTime() > windowEndUtc.getTime()) {
      continue;
    }

    const notificationDate = formatLocalDateKey(toLocalDate(nextOccurrenceUtc, user.timezone));
    const content = await getDailyPulseContent(String(user._id), user.goal);
    const reserved = await reserveNotificationLog(user._id, 'dailyPulse', notificationDate);

    if (!reserved) {
      continue;
    }

    notifications.push(
      buildPushPayload(user.pushToken, 'dailyPulse', content.title, content.body)
    );
  }

  await dispatchNotifications(notifications);
}

async function runStreakReminderJob(): Promise<void> {
  const nowUtc = new Date();
  const notifications: PushNotificationPayload[] = [];

  const users = await UserModel.find({
    'notificationPreferences.streakReminder': true,
    currentStreak: { $gt: 0 },
    pushToken: { $exists: true, $type: 'string', $ne: '' },
  })
    .select({
      pushToken: 1,
      currentStreak: 1,
      locale: 1,
      timezone: 1,
    })
    .lean<StreakReminderUserCandidate[]>()
    .exec();

  for (const user of users) {
    if (!hasNonEmptyPushToken(user.pushToken)) {
      continue;
    }

    const localNow = toLocalDate(nowUtc, user.timezone);
    if (!isWithinLocalHalfHourWindow(localNow, 19)) {
      continue;
    }

    const notificationDate = formatLocalDateKey(localNow);
    const startOfDayUtc = getMidnightUTC(user.timezone);
    const blendCount = await BlendLogModel.countDocuments({
      userId: user._id,
      createdAt: { $gte: startOfDayUtc },
    }).exec();

    if (blendCount > 0) {
      continue;
    }

    const content = getStreakReminderContent(user.currentStreak, user.locale);
    const reserved = await reserveNotificationLog(user._id, 'streakReminder', notificationDate);

    if (!reserved) {
      continue;
    }

    notifications.push(
      buildPushPayload(user.pushToken, 'streakReminder', content.title, content.body)
    );
  }

  await dispatchNotifications(notifications);
}

async function runSupplementReminderJob(): Promise<void> {
  const nowUtc = new Date();
  const notifications: PushNotificationPayload[] = [];

  const users = await UserModel.find({
    'notificationPreferences.supplementReminder': true,
    'supplementStack.isActive': true,
    pushToken: { $exists: true, $type: 'string', $ne: '' },
  })
    .select({
      pushToken: 1,
      locale: 1,
      timezone: 1,
      supplementStack: 1,
    })
    .lean<SupplementReminderUserCandidate[]>()
    .exec();

  for (const user of users) {
    if (!hasNonEmptyPushToken(user.pushToken)) {
      continue;
    }

    const localNow = toLocalDate(nowUtc, user.timezone);
    if (!isWithinLocalHalfHourWindow(localNow, 20)) {
      continue;
    }

    const notificationDate = formatLocalDateKey(localNow);
    const activeSupplements = user.supplementStack.filter(supplement => supplement.isActive);

    if (activeSupplements.length === 0) {
      continue;
    }

    const consumedLogs = await SupplementLogModel.find({
      userId: user._id,
      logDate: notificationDate,
    })
      .select({ supplementId: 1, _id: 0 })
      .lean<Array<{ supplementId: string }>>()
      .exec();

    const consumedSupplementIds = new Set(consumedLogs.map(log => log.supplementId));
    const pendingSupplementNames = activeSupplements
      .filter(supplement => !consumedSupplementIds.has(supplement.supplementId))
      .map(supplement => supplement.name);

    if (pendingSupplementNames.length === 0) {
      continue;
    }

    const content = getSupplementReminderContent(pendingSupplementNames, user.locale);
    const reserved = await reserveNotificationLog(user._id, 'supplementReminder', notificationDate);

    if (!reserved) {
      continue;
    }

    notifications.push(
      buildPushPayload(user.pushToken, 'supplementReminder', content.title, content.body)
    );
  }

  await dispatchNotifications(notifications);
}

async function runHydrationReminderJob(): Promise<void> {
  const nowUtc = new Date();
  const notifications: PushNotificationPayload[] = [];

  const users = await UserModel.find({
    'notificationPreferences.hydrationReminder': true,
    pushToken: { $exists: true, $type: 'string', $ne: '' },
  })
    .select({
      pushToken: 1,
      locale: 1,
      timezone: 1,
      unitSystem: 1,
      dailyHydrationTarget: 1,
    })
    .lean<HydrationReminderUserCandidate[]>()
    .exec();

  for (const user of users) {
    if (!hasNonEmptyPushToken(user.pushToken)) {
      continue;
    }

    const localNow = toLocalDate(nowUtc, user.timezone);
    if (!isWithinLocalHalfHourWindow(localNow, 15)) {
      continue;
    }

    const notificationDate = formatLocalDateKey(localNow);
    const startOfDayUtc = getMidnightUTC(user.timezone);
    const hydrationLogs = await HydrationLogModel.find({
      userId: user._id,
      createdAt: { $gte: startOfDayUtc },
    })
      .select({ amountMl: 1, _id: 0 })
      .lean<Array<{ amountMl: number }>>()
      .exec();

    const totalCurrentMl = hydrationLogs.reduce((sum, log) => sum + log.amountMl, 0);
    const dailyHydrationTarget = user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET;

    if (totalCurrentMl >= dailyHydrationTarget * 0.5) {
      continue;
    }

    const content = getHydrationReminderContent(
      totalCurrentMl,
      dailyHydrationTarget,
      user.unitSystem,
      user.locale
    );
    const reserved = await reserveNotificationLog(user._id, 'hydrationReminder', notificationDate);

    if (!reserved) {
      continue;
    }

    notifications.push(
      buildPushPayload(user.pushToken, 'hydrationReminder', content.title, content.body)
    );
  }

  await dispatchNotifications(notifications);
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function buildPreviousWeekComparison(
  userId: unknown,
  currentWeekStartDate: string,
  data: WeeklyReportData
): Promise<WeeklyReportComparison | undefined> {
  const previousWeekStartDate = formatLocalDateKey(
    new Date(new Date(`${currentWeekStartDate}T00:00:00.000Z`).getTime() - 7 * MILLISECONDS_PER_DAY)
  );

  const previousReport = await WeeklyReportModel.findOne({
    userId,
    weekStartDate: previousWeekStartDate,
  })
    .select({ data: 1 })
    .lean();

  if (!previousReport) {
    return undefined;
  }

  return {
    avgProteinPerDayDeltaPercent: percentDelta(
      data.nutrition.avgProteinPerDay,
      previousReport.data.nutrition.avgProteinPerDay
    ),
    avgDailyMlDeltaPercent: percentDelta(
      data.hydration.avgDailyMl,
      previousReport.data.hydration.avgDailyMl
    ),
    adherenceRateDeltaPercent: percentDelta(
      data.supplements.adherenceRate,
      previousReport.data.supplements.adherenceRate
    ),
  };
}

async function runWeeklyReportJob(): Promise<void> {
  const nowUtc = new Date();
  const notifications: PushNotificationPayload[] = [];

  const users = await UserModel.find({
    isPro: true,
    pushToken: { $exists: true, $type: 'string', $ne: '' },
  })
    .select({
      pushToken: 1,
      locale: 1,
      timezone: 1,
    })
    .lean<WeeklyReportUserCandidate[]>()
    .exec();

  for (const user of users) {
    if (!hasNonEmptyPushToken(user.pushToken)) {
      continue;
    }

    const localNow = toLocalDate(nowUtc, user.timezone);
    const isMonday = localNow.getUTCDay() === WEEKLY_REPORT_LOCAL_MONDAY_WEEKDAY;
    const isReportHour = localNow.getUTCHours() === WEEKLY_REPORT_LOCAL_MONDAY_HOUR;

    if (!isMonday || !isReportHour) {
      continue;
    }

    // "Semana anterior": os 7 dias que terminaram ontem (domingo local).
    const weekEndDate = formatLocalDateKey(new Date(localNow.getTime() - MILLISECONDS_PER_DAY));
    const weekStartDate = formatLocalDateKey(new Date(localNow.getTime() - 7 * MILLISECONDS_PER_DAY));

    const alreadyGenerated = await WeeklyReportModel.exists({ userId: user._id, weekStartDate });
    if (alreadyGenerated) {
      continue;
    }

    try {
      const data = await generateWeeklyReport(String(user._id), weekStartDate, weekEndDate);
      const previousWeekComparison = await buildPreviousWeekComparison(user._id, weekStartDate, data);

      await WeeklyReportModel.create({
        userId: user._id,
        weekStartDate,
        weekEndDate,
        isProAtGeneration: true,
        data,
        ...(previousWeekComparison && { previousWeekComparison }),
      });

      const content = getWeeklyReportContent(data, user.locale);
      const reserved = await reserveNotificationLog(user._id, 'weeklyReport', weekStartDate);

      if (reserved) {
        notifications.push(
          buildPushPayload(user.pushToken, 'weeklyReport', content.title, content.body)
        );
      }
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        continue;
      }

      console.error(
        '[notifications.jobs] Weekly Report generation failed for user',
        String(user._id),
        err
      );
    }
  }

  await dispatchNotifications(notifications);
}

export function initializeNotificationJobs(): void {
  cron.schedule(DAILY_PULSE_CRON_EXPRESSION, () => {
    void runDailyPulseJob().catch(err => {
      console.error('[notifications.jobs] Daily Pulse job failed:', err);
    });
  });

  cron.schedule(HALF_HOUR_CRON_EXPRESSION, () => {
    void runStreakReminderJob().catch(err => {
      console.error('[notifications.jobs] Streak Reminder job failed:', err);
    });
  });

  cron.schedule(HALF_HOUR_CRON_EXPRESSION, () => {
    void runSupplementReminderJob().catch(err => {
      console.error('[notifications.jobs] Supplement Reminder job failed:', err);
    });
  });

  cron.schedule(HALF_HOUR_CRON_EXPRESSION, () => {
    void runHydrationReminderJob().catch(err => {
      console.error('[notifications.jobs] Hydration Reminder job failed:', err);
    });
  });

  cron.schedule(WEEKLY_REPORT_CRON_EXPRESSION, () => {
    void runWeeklyReportJob().catch(err => {
      console.error('[notifications.jobs] Weekly Report job failed:', err);
    });
  });

  console.log('✅ Notification cron jobs registered successfully.');
}
