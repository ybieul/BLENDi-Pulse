// apps/api/src/utils/userProfile.utils.ts
// Serializador padrão do usuário para o app — o objeto `user` de
// GET /users/me. Extraído do user.controller.ts no CP-1.1.1d para que
// POST /auth/google/exchange devolva exatamente o mesmo usuário completo,
// sem uma segunda cópia da lista de campos para manter em sincronia.

import { calculateLevel } from '@blendi/shared';
import type { IUser } from '../models/User';
import { calculateFatTargetFromCalories } from './macroCalculation.utils';

export const DEFAULT_DAILY_HYDRATION_TARGET = 2500;

type NotificationPreferencesState = {
  dailyPulse: boolean;
  streakReminder: boolean;
  supplementReminder: boolean;
  hydrationReminder: boolean;
  levelUp: boolean;
};

type DailyPulseTimeState = {
  hour: number;
  minute: number;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  dailyPulse: true,
  streakReminder: true,
  supplementReminder: true,
  hydrationReminder: true,
  levelUp: true,
};

const DEFAULT_DAILY_PULSE_TIME: DailyPulseTimeState = {
  hour: 7,
  minute: 0,
};

export function normalizeNotificationPreferences(
  preferences: Partial<NotificationPreferencesState> | null | undefined
) {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preferences,
  };
}

export function normalizeDailyPulseTime(
  dailyPulseTime: Partial<DailyPulseTimeState> | null | undefined
) {
  return {
    ...DEFAULT_DAILY_PULSE_TIME,
    ...dailyPulseTime,
  };
}

/** Usuário lido com `.lean()` (sem defaults do schema aplicados). */
export type SerializableUser = IUser & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Objeto `user` de GET /users/me, com todos os campos. */
export function serializeUserProfile(user: SerializableUser) {
  const totalXP = user.totalXP ?? 0;
  const levelInfo = calculateLevel(totalXP);

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    profilePhoto: user.profilePhoto,
    hasProfilePhoto: user.hasProfilePhoto ?? false,
    profilePhotoUpdatedAt: user.profilePhotoUpdatedAt ?? null,
    blendiModel: user.blendiModel,
    // .lean() não aplica defaults do schema — contas anteriores a estes
    // campos não os têm gravados, por isso o fallback explícito.
    blendiOwnership: user.blendiOwnership ?? 'blendi',
    otherBlenderModel: user.otherBlenderModel ?? null,
    dietaryPreferences: user.dietaryPreferences ?? [],
    goal: user.goal,
    weightGoal: user.weightGoal,
    weight: user.weight,
    height: user.height,
    targetWeight: user.targetWeight,
    activityLevel: user.activityLevel,
    birthDate: user.birthDate,
    biologicalSex: user.biologicalSex,
    hasRealBodyProfile: user.hasRealBodyProfile ?? false,
    preferredLanguage: user.locale,
    unitSystem: user.unitSystem,
    timezone: user.timezone,
    pushToken: user.pushToken ?? null,
    notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
    dailyPulseTime: normalizeDailyPulseTime(user.dailyPulseTime),
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCarbTarget: user.dailyCarbTarget ?? 200,
    dailyCalorieTarget: user.dailyCalorieTarget,
    dailyFatTarget:
      user.dailyFatTarget ?? calculateFatTargetFromCalories(user.dailyCalorieTarget),
    dailyHydrationTarget: user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET,
    isPro: user.isPro ?? false,
    subscriptionId: user.subscriptionId ?? null,
    subscriptionPlan: user.subscriptionPlan ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    subscriptionCancelRequestedAt: user.subscriptionCancelRequestedAt ?? null,
    revenueCatCustomerId: user.revenueCatCustomerId ?? null,
    createdAt: user.createdAt,
    currentStreak: user.currentStreak,
    streakDays: user.currentStreak,
    longestStreak: user.longestStreak ?? 0,
    blendCount: user.blendCount,
    totalXP,
    lastLevelUp: user.lastLevelUp ?? null,
    currentLevel: levelInfo.level,
    levelProgress: levelInfo.progress,
    totalBlends: user.blendCount,
    lastCleanedAt: user.lastCleanedAt ?? null,
  };
}
