import type { WeeklyReportData } from '@blendi/shared';
import { AiCacheModel } from '../models/AiCache';
import { UserModel, type UserGoal, type UserLocale, type UserUnitSystem } from '../models/User';
import notificationEn from '../locales/notification-en.json';
import notificationPtBr from '../locales/notification-pt-br.json';

export interface NotificationContent {
  title: string;
  body: string;
}

type NotificationLocaleTemplates = typeof notificationEn;

const NOTIFICATION_TEMPLATES: Record<UserLocale, NotificationLocaleTemplates> = {
  en: notificationEn,
  'pt-BR': notificationPtBr,
};

const DEFAULT_LOCALE: UserLocale = 'en';
const FLUID_OUNCES_PER_MILLILITER = 0.033814;

function resolveLocale(locale: string | null | undefined): UserLocale {
  return locale === 'pt-BR' ? 'pt-BR' : DEFAULT_LOCALE;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function extractRecipeName(response: unknown): string | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return null;
  }

  const responseRecord = response as Record<string, unknown>;
  const directTitle = asNonEmptyString(responseRecord.title);
  if (directTitle) {
    return directTitle;
  }

  const nestedRecipe = responseRecord.recipe;
  if (!nestedRecipe || typeof nestedRecipe !== 'object' || Array.isArray(nestedRecipe)) {
    return null;
  }

  return asNonEmptyString((nestedRecipe as Record<string, unknown>).title);
}

async function getUserLocale(userId: string): Promise<UserLocale> {
  const user = await UserModel.findById(userId).select({ locale: 1 }).lean();
  return resolveLocale(user?.locale);
}

function buildSupplementSummary(
  pendingSupplementNames: string[],
  preferredLanguage: UserLocale
): string | null {
  const locale = resolveLocale(preferredLanguage);
  const normalizedNames = pendingSupplementNames
    .map(name => name.trim())
    .filter(name => name.length > 0);

  if (normalizedNames.length === 0) {
    return null;
  }

  const visibleNames = normalizedNames.slice(0, 2);
  const hiddenCount = normalizedNames.length - visibleNames.length;
  const suffix = hiddenCount > 0
    ? interpolate(NOTIFICATION_TEMPLATES[locale].supplementReminder.summaryMoreSuffix, {
      count: hiddenCount,
    })
    : '';

  return `${visibleNames.join(', ')}${suffix}`;
}

function formatHydrationValue(
  valueMl: number,
  unitSystem: UserUnitSystem,
  preferredLanguage: UserLocale
): string {
  const locale = preferredLanguage === 'pt-BR' ? 'pt-BR' : 'en-US';

  if (unitSystem === 'imperial') {
    const valueInFluidOunces = valueMl * FLUID_OUNCES_PER_MILLILITER;
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: valueInFluidOunces % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    });

    return `${formatter.format(valueInFluidOunces)} fl oz`;
  }

  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });

  return `${formatter.format(valueMl)} ml`;
}

export async function getDailyPulseContent(
  userId: string,
  goal: UserGoal
): Promise<NotificationContent> {
  const preferredLanguage = await getUserLocale(userId);
  const recentCacheEntries = await AiCacheModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(3)
    .select({ response: 1, _id: 0 })
    .lean()
    .exec();

  const recipeName = recentCacheEntries
    .map(entry => extractRecipeName(entry.response))
    .find((value): value is string => Boolean(value));

  const content = NOTIFICATION_TEMPLATES[preferredLanguage].dailyPulse;
  const goalContent = content.goals[goal];

  return {
    title: content.title,
    body: recipeName
      ? interpolate(goalContent.withRecipe, { recipeName })
      : goalContent.generic,
  };
}

export function getStreakReminderContent(
  currentStreak: number,
  preferredLanguage: UserLocale
): NotificationContent {
  const content = NOTIFICATION_TEMPLATES[resolveLocale(preferredLanguage)].streakReminder;

  if (currentStreak >= 30) {
    return {
      title: content.title,
      body: interpolate(content.long, { count: currentStreak }),
    };
  }

  if (currentStreak >= 7) {
    return {
      title: content.title,
      body: interpolate(content.medium, { count: currentStreak }),
    };
  }

  return {
    title: content.title,
    body: content.short,
  };
}

export function getSupplementReminderContent(
  pendingSupplementNames: string[],
  preferredLanguage: UserLocale
): NotificationContent {
  const locale = resolveLocale(preferredLanguage);
  const supplementSummary = buildSupplementSummary(pendingSupplementNames, locale);
  const content = NOTIFICATION_TEMPLATES[locale].supplementReminder;

  if (!supplementSummary) {
    return {
      title: content.title,
      body: content.empty,
    };
  }

  return {
    title: content.title,
    body: interpolate(content.withSummary, { supplementSummary }),
  };
}

export function getHydrationReminderContent(
  totalCurrentMl: number,
  dailyTargetMl: number,
  unitSystem: UserUnitSystem,
  preferredLanguage: UserLocale
): NotificationContent {
  const locale = resolveLocale(preferredLanguage);
  const currentValue = formatHydrationValue(totalCurrentMl, unitSystem, locale);
  const goalValue = formatHydrationValue(dailyTargetMl, unitSystem, locale);
  const content = NOTIFICATION_TEMPLATES[locale].hydrationReminder;

  return {
    title: content.title,
    body: interpolate(content.body, { currentValue, goalValue }),
  };
}

// Hierarquia de prioridade do gancho: o dado mais impressionante da semana
// vira o corpo da notificação. Cada condição é checada nessa ordem e a
// primeira que bater vence — não são cumulativas.
export function getWeeklyReportContent(
  data: WeeklyReportData,
  preferredLanguage: UserLocale
): NotificationContent {
  const locale = resolveLocale(preferredLanguage);
  const content = NOTIFICATION_TEMPLATES[locale].weeklyReport;

  if (data.gamification.levelUpOccurred) {
    return {
      title: content.title,
      body: interpolate(content.levelUp, { level: data.gamification.currentLevel }),
    };
  }

  if (data.supplements.perfectDays === 7) {
    return {
      title: content.title,
      body: content.perfectSupplements,
    };
  }

  if (data.nutrition.proteinGoalHitDays >= 6) {
    return {
      title: content.title,
      body: interpolate(content.proteinGoal, { days: data.nutrition.proteinGoalHitDays }),
    };
  }

  if (data.hydration.goalHitDays >= 6) {
    return {
      title: content.title,
      body: interpolate(content.hydrationGoal, { days: data.hydration.goalHitDays }),
    };
  }

  return {
    title: content.title,
    body: interpolate(content.fallback, { count: data.nutrition.blendCount }),
  };
}
