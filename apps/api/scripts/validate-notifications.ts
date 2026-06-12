import cron from 'node-cron';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database';
import { AiCacheModel } from '../src/models/AiCache';
import { NotificationLogModel } from '../src/models/NotificationLog';
import { UserModel } from '../src/models/User';
import { initializeNotificationJobs } from '../src/jobs/notifications.jobs';
import { generateAccessToken } from '../src/services/auth.service';

const API_BASE_URL = 'http://localhost:3000';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

type ValidationSummary = {
  serverReachable: {
    ok: boolean;
    status: number;
  };
  pushToken: {
    status: number;
    responsePushToken: string | null;
    dbPushToken: string | null;
    saved: boolean;
  };
  notificationPreferences: {
    status: number;
    dbPreferences: Record<string, boolean> | null;
    onlyDailyPulseChanged: boolean;
  };
  dailyPulseTime: {
    status: number;
    dbDailyPulseTime: { hour: number; minute: number } | null;
    saved: boolean;
  };
  dailyPulseCron: {
    registeredSchedules: string[];
    confirmationLogs: string[];
    firstRun: {
      fetchCalls: number;
      notificationLogCount: number;
      personalizedBody: string | null;
      genericBody: string | null;
      personalizedUsedRecipe: boolean;
      genericFallbackUsed: boolean;
    };
    secondRun: {
      fetchCallsUnchanged: boolean;
      notificationLogCountUnchanged: boolean;
    };
    notificationLogCreatedBeforeDispatch: boolean;
  };
};

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; description: string }
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const intervalMs = options.intervalMs ?? 100;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await wait(intervalMs);
  }

  throw new Error(`Timed out waiting for ${options.description}.`);
}

function buildNextDailyPulseSlot(): { hour: number; minute: number } {
  const target = new Date(Date.now() + 2 * 60 * 1000);
  return {
    hour: target.getUTCHours(),
    minute: target.getUTCMinutes(),
  };
}

async function main(): Promise<void> {
  const createdUserIds: mongoose.Types.ObjectId[] = [];
  const summary = {} as ValidationSummary;

  const createUser = async (
    overrides: Partial<Parameters<typeof UserModel.create>[0]> = {}
  ) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const user = await UserModel.create({
      email: `notification-test-${stamp}@example.com`,
      name: `Notification Test ${stamp}`,
      blendiModel: 'Lite',
      goal: 'Muscle',
      locale: 'en',
      unitSystem: 'metric',
      timezone: 'UTC',
      dailyProteinTarget: 120,
      dailyCalorieTarget: 2200,
      ...overrides,
    });

    createdUserIds.push(user._id);
    return user;
  };

  try {
    const pingResponse = await fetch(`${API_BASE_URL}/ping`);
    summary.serverReachable = {
      ok: pingResponse.ok,
      status: pingResponse.status,
    };

    if (!pingResponse.ok) {
      throw new Error(`Backend is not reachable at ${API_BASE_URL}.`);
    }

    await connectDatabase();

    const apiUser = await createUser();
    const bearerToken = generateAccessToken(String(apiUser._id), apiUser.email);

    const patch = async (path: string, body: unknown) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = (await response.json()) as {
        data?: {
          user?: {
            pushToken?: string | null;
            notificationPreferences?: Record<string, boolean>;
            dailyPulseTime?: { hour: number; minute: number };
          };
        };
      };

      return {
        status: response.status,
        json,
      };
    };

    const pushTokenValue = 'ExponentPushToken[test-validation-token]';
    const pushTokenResponse = await patch('/users/push-token', {
      pushToken: pushTokenValue,
    });
    const userAfterPushToken = await UserModel.findById(apiUser._id).lean();
    summary.pushToken = {
      status: pushTokenResponse.status,
      responsePushToken: pushTokenResponse.json.data?.user?.pushToken ?? null,
      dbPushToken: userAfterPushToken?.pushToken ?? null,
      saved: userAfterPushToken?.pushToken === pushTokenValue,
    };

    const preferencesBefore = userAfterPushToken?.notificationPreferences;
    const notificationPreferencesResponse = await patch('/users/notification-preferences', {
      dailyPulse: false,
    });
    const userAfterPreferences = await UserModel.findById(apiUser._id).lean();
    const updatedPreferences = userAfterPreferences?.notificationPreferences ?? null;
    summary.notificationPreferences = {
      status: notificationPreferencesResponse.status,
      dbPreferences: updatedPreferences,
      onlyDailyPulseChanged:
        updatedPreferences?.dailyPulse === false &&
        updatedPreferences?.streakReminder === (preferencesBefore?.streakReminder ?? true) &&
        updatedPreferences?.supplementReminder === (preferencesBefore?.supplementReminder ?? true) &&
        updatedPreferences?.hydrationReminder === (preferencesBefore?.hydrationReminder ?? true) &&
        updatedPreferences?.levelUp === (preferencesBefore?.levelUp ?? true),
    };

    const dailyPulseTimeResponse = await patch('/users/daily-pulse-time', {
      hour: 8,
      minute: 30,
    });
    const userAfterDailyPulseTime = await UserModel.findById(apiUser._id).lean();
    summary.dailyPulseTime = {
      status: dailyPulseTimeResponse.status,
      dbDailyPulseTime: userAfterDailyPulseTime?.dailyPulseTime ?? null,
      saved:
        userAfterDailyPulseTime?.dailyPulseTime?.hour === 8 &&
        userAfterDailyPulseTime?.dailyPulseTime?.minute === 30,
    };

    const slot = buildNextDailyPulseSlot();

    const [dailyUserWithRecipe, dailyUserWithoutRecipe] = await Promise.all([
      createUser({
        pushToken: 'ExponentPushToken[daily-pulse-with-recipe]',
        timezone: 'UTC',
        goal: 'Muscle',
        notificationPreferences: {
          dailyPulse: true,
          streakReminder: true,
          supplementReminder: true,
          hydrationReminder: true,
          levelUp: true,
        },
        dailyPulseTime: slot,
      }),
      createUser({
        pushToken: 'ExponentPushToken[daily-pulse-generic]',
        timezone: 'UTC',
        goal: 'Wellness',
        notificationPreferences: {
          dailyPulse: true,
          streakReminder: true,
          supplementReminder: true,
          hydrationReminder: true,
          levelUp: true,
        },
        dailyPulseTime: slot,
      }),
    ]);

    await AiCacheModel.create({
      cacheKey: `daily-pulse-cache-${dailyUserWithRecipe._id}`,
      userId: dailyUserWithRecipe._id,
      model: 'test-model',
      goal: dailyUserWithRecipe.goal,
      language: dailyUserWithRecipe.locale,
      messageHash: `message-hash-${dailyUserWithRecipe._id}`,
      dietaryFlags: [],
      response: {
        title: 'Cache Mango Blast',
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await NotificationLogModel.deleteMany({
      userId: { $in: [dailyUserWithRecipe._id, dailyUserWithoutRecipe._id] },
      type: 'dailyPulse',
    });

    const cronModule = cron as typeof cron;
    const originalSchedule = cronModule.schedule;
    const originalConsoleLog = console.log;
    const capturedSchedules: string[] = [];
    const capturedLogs: string[] = [];
    const callbacks: Array<() => void> = [];

    (cronModule as typeof cron & { schedule: typeof cron.schedule }).schedule = ((expression, callback) => {
      capturedSchedules.push(String(expression));
      callbacks.push(callback as () => void);

      return {
        start() {
        },
        stop() {
        },
        destroy() {
        },
      } as ReturnType<typeof cron.schedule>;
    }) as typeof cron.schedule;

    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.map(arg => String(arg)).join(' '));
    };

    initializeNotificationJobs();

    console.log = originalConsoleLog;
    (cronModule as typeof cron & { schedule: typeof cron.schedule }).schedule = originalSchedule;

    const dailyPulseCallback = callbacks[0];
    if (!dailyPulseCallback) {
      throw new Error('Daily Pulse cron callback was not captured.');
    }

    const originalFetch = globalThis.fetch;
    const expoRequests: Array<Array<{ to?: string; body?: string }>> = [];

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === EXPO_PUSH_API_URL) {
        const batch = JSON.parse(String(init?.body ?? '[]')) as Array<{ to?: string; body?: string }>;
        expoRequests.push(batch);

        return new Response(
          JSON.stringify({
            data: batch.map(() => ({ status: 'ok' })),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      return originalFetch(input as RequestInfo | URL, init);
    };

    try {
      dailyPulseCallback();

      await waitFor(
        async () => {
          const count = await NotificationLogModel.countDocuments({
            userId: { $in: [dailyUserWithRecipe._id, dailyUserWithoutRecipe._id] },
            type: 'dailyPulse',
          });

          return count === 2;
        },
        {
          description: 'Daily Pulse notification logs',
        }
      );

      const firstNotificationLogCount = await NotificationLogModel.countDocuments({
        userId: { $in: [dailyUserWithRecipe._id, dailyUserWithoutRecipe._id] },
        type: 'dailyPulse',
      });

      const firstBatch = expoRequests.flat();
      const personalizedPayload = firstBatch.find(
        payload => payload.to === 'ExponentPushToken[daily-pulse-with-recipe]'
      );
      const genericPayload = firstBatch.find(
        payload => payload.to === 'ExponentPushToken[daily-pulse-generic]'
      );
      const fetchCallsAfterFirstRun = expoRequests.length;

      dailyPulseCallback();
      await wait(1_000);

      const secondNotificationLogCount = await NotificationLogModel.countDocuments({
        userId: { $in: [dailyUserWithRecipe._id, dailyUserWithoutRecipe._id] },
        type: 'dailyPulse',
      });

      summary.dailyPulseCron = {
        registeredSchedules: capturedSchedules,
        confirmationLogs: capturedLogs,
        firstRun: {
          fetchCalls: fetchCallsAfterFirstRun,
          notificationLogCount: firstNotificationLogCount,
          personalizedBody: personalizedPayload?.body ?? null,
          genericBody: genericPayload?.body ?? null,
          personalizedUsedRecipe: personalizedPayload?.body?.includes('Cache Mango Blast') ?? false,
          genericFallbackUsed:
            genericPayload?.body === 'Start your day right with a fresh blend 🌿',
        },
        secondRun: {
          fetchCallsUnchanged: expoRequests.length === fetchCallsAfterFirstRun,
          notificationLogCountUnchanged:
            secondNotificationLogCount === firstNotificationLogCount,
        },
        notificationLogCreatedBeforeDispatch: firstNotificationLogCount > 0 && fetchCallsAfterFirstRun > 0,
      };
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await AiCacheModel.deleteMany({ userId: { $in: createdUserIds } });
    await NotificationLogModel.deleteMany({ userId: { $in: createdUserIds } });
    await UserModel.deleteMany({ _id: { $in: createdUserIds } });
    await mongoose.disconnect();
  }
}

void main().catch(async error => {
  console.error('[validate-notifications] Failed:', error);

  try {
    await mongoose.disconnect();
  } catch {
  }

  process.exit(1);
});
