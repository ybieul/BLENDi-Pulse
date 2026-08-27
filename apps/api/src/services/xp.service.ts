import { XP_EVENTS, calculateLevel, type XPEventType } from '@blendi/shared';
import { XPLogModel } from '../models/XPLog';
import { UserModel, type UserLocale } from '../models/User';
import { cleanInvalidTokens, sendNotificationBatch } from './pushNotification.service';
import { getMidnightUTC } from '../utils/timezone.utils';

const MULTI_OCCURRENCE_XP_TYPES = new Set<XPEventType>([
  'blend',
  'pulseAi',
  'favoriteRecipe',
  'pantryScanner',
]);

const LEVEL_UP_DEEP_LINK = 'blendipulse://me';
const LEVEL_UP_NOTIFICATION_TYPE = 'levelUp';
const LEVEL_NAMES: Record<UserLocale, string[]> = {
  en: ['Beginner', 'Explorer', 'Seeker', 'Builder', 'Warrior', 'Champion', 'Expert', 'Master', 'Elite', 'Legend'],
  'pt-BR': ['Iniciante', 'Explorador', 'Buscador', 'Construtor', 'Guerreiro', 'Campeão', 'Especialista', 'Mestre', 'Elite', 'Lenda'],
};

export interface AwardXPResult {
  awarded: boolean;
  amount: number;
  newTotalXP: number;
  leveledUp: boolean;
  newLevel: number | null;
}

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function formatLocalDateKey(timezone: string): string {
  const midnightUTC = getMidnightUTC(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(midnightUTC);

  const getPart = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value ?? '00';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

function buildLogDate(xpType: XPEventType, timezone: string): string {
  const localDateKey = formatLocalDateKey(timezone);

  if (MULTI_OCCURRENCE_XP_TYPES.has(xpType)) {
    // Sufixo aleatório de 4 caracteres base36 reduz a colisão de dois awards no
    // mesmo milissegundo de "provável sob carga" para astronomicamente improvável,
    // sem precisar de crypto.randomUUID() completo.
    const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return `${localDateKey}_${uniqueSuffix}`;
  }

  return localDateKey;
}

function resolveAwardAmount(xpType: XPEventType, customAmount?: number): number {
  const amount = customAmount ?? XP_EVENTS[xpType];

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError('XP amount must be a positive integer.');
  }

  return amount;
}

function getLevelName(level: number, locale: UserLocale): string {
  if (level <= LEVEL_NAMES[locale].length) {
    return LEVEL_NAMES[locale][level - 1];
  }

  return `Guru ${level}`;
}

export async function awardXP(
  userId: string,
  xpType: XPEventType,
  timezone: string,
  customAmount?: number
): Promise<AwardXPResult> {
  const logDate = buildLogDate(xpType, timezone);
  const amount = resolveAwardAmount(xpType, customAmount);

  try {
    await XPLogModel.insertOne({
      userId,
      xpType,
      logDate,
      amount,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const currentUser = await UserModel.findById(userId).select({ totalXP: 1 }).lean();

      return {
        awarded: false,
        amount: 0,
        newTotalXP: currentUser?.totalXP ?? 0,
        leveledUp: false,
        newLevel: null,
      };
    }

    throw err;
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: userId },
    {
      $inc: {
        totalXP: amount,
      },
    },
    {
      new: true,
    }
  )
    .select({
      totalXP: 1,
      lastLevelUp: 1,
      pushToken: 1,
      notificationPreferences: 1,
      locale: 1,
    })
    .lean();

  if (!updatedUser) {
    throw new Error('User not found.');
  }

  const newTotalXP = updatedUser.totalXP;
  const levelBefore = calculateLevel(newTotalXP - amount);
  const levelAfter = calculateLevel(newTotalXP);
  const leveledUp = levelAfter.level > levelBefore.level;
  const shouldPersistLevelUp = leveledUp && (updatedUser.lastLevelUp?.level ?? 0) < levelAfter.level;

  let shouldSendLevelUpNotification = false;

  if (shouldPersistLevelUp) {
    const levelUpUpdateResult = await UserModel.updateOne(
      {
        _id: userId,
        $or: [
          { 'lastLevelUp.level': { $lt: levelAfter.level } },
          { lastLevelUp: { $exists: false } },
        ],
      },
      {
        $set: {
          lastLevelUp: {
            level: levelAfter.level,
            awardedAt: new Date(),
          },
        },
      }
    );

    shouldSendLevelUpNotification = levelUpUpdateResult.modifiedCount > 0;
  }

  if (
    shouldSendLevelUpNotification
    && typeof updatedUser.pushToken === 'string'
    && updatedUser.pushToken.trim().length > 0
    && (updatedUser.notificationPreferences?.levelUp ?? true)
  ) {
    const locale = updatedUser.locale === 'pt-BR' ? 'pt-BR' : 'en';
    const levelName = getLevelName(levelAfter.level, locale);
    const title = locale === 'pt-BR' ? 'Subiu de Nível! 🎉' : 'Level Up! 🎉';
    const body = locale === 'pt-BR' ? `${levelName} — Continue assim!` : `${levelName} — Keep it up!`;
    const notificationResult = await sendNotificationBatch([
      {
        pushToken: updatedUser.pushToken,
        title,
        body,
        data: {
          deepLink: LEVEL_UP_DEEP_LINK,
          type: LEVEL_UP_NOTIFICATION_TYPE,
        },
        priority: 'high',
      },
    ]);

    await cleanInvalidTokens(notificationResult.invalidTokens);
  }

  return {
    awarded: true,
    amount,
    newTotalXP,
    leveledUp,
    newLevel: leveledUp ? levelAfter.level : null,
  };
}
