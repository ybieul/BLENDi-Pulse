import mongoose from 'mongoose';
import { calculateLevel, type WeeklyReportData } from '@blendi/shared';
import { BlendLogModel } from '../models/BlendLog';
import { HydrationLogModel } from '../models/HydrationLog';
import { SupplementLogModel } from '../models/SupplementLog';
import { XPLogModel } from '../models/XPLog';
import { DailyMissionModel } from '../models/DailyMission';
import { UserModel } from '../models/User';
import { getSupplementConsumedCount, getSupplementDailyTargetCount } from '../utils/supplementProgress.utils';
import { toUTC } from '../utils/timezone.utils';

interface BlendDailyTotal {
  date: string;
  protein: number;
  calories: number;
}

interface BlendAggregateResult {
  dailyTotals: BlendDailyTotal[];
  summary: Array<{ blendCount: number; totalProtein: number }>;
  topRated: Array<{
    name: string;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    rating: number;
  }>;
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

// Mesma técnica de `buildLocalDayUtcRange` já duplicada em cada controller de
// histórico (blendLog/hydration/supplementLog) — não há utilitário compartilhado
// para isso hoje, então seguimos a mesma convenção em vez de importar de um
// controller (camada errada para um service consumir).
function buildWeekUtcRange(weekStartDate: string, weekEndDate: string, timezone: string): {
  startAt: Date;
  endAtExclusive: Date;
} {
  const start = new Date(`${weekStartDate}T00:00:00.000Z`);
  const end = new Date(`${weekEndDate}T00:00:00.000Z`);

  const startAt = toUTC(
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0)),
    timezone
  );
  const endAtExclusive = toUTC(
    new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1, 0, 0, 0)),
    timezone
  );

  return { startAt, endAtExclusive };
}

// Assume que weekStartDate/weekEndDate formam uma semana completa (segunda a
// domingo, 7 dias) — garantido pelo caller (cron da Tarefa 4). Produz sempre
// as 7 chaves em ordem cronológica.
function getWeekDayKeys(weekStartDate: string): string[] {
  const start = new Date(`${weekStartDate}T00:00:00.000Z`);
  const keys: string[] = [];

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    keys.push(day.toISOString().slice(0, 10));
  }

  return keys;
}

// Primeiro dia sem blend que fica entre dois dias com blend dentro da própria
// semana — não depende de nenhum histórico de streak fora do BlendLog.
function findStreakBreakDate(dayKeys: string[], daysWithBlend: Set<string>): string | undefined {
  for (let i = 1; i < dayKeys.length - 1; i += 1) {
    const day = dayKeys[i];
    if (daysWithBlend.has(day)) {
      continue;
    }

    const hasBlendBefore = dayKeys.slice(0, i).some((d) => daysWithBlend.has(d));
    const hasBlendAfter = dayKeys.slice(i + 1).some((d) => daysWithBlend.has(d));

    if (hasBlendBefore && hasBlendAfter) {
      return day;
    }
  }

  return undefined;
}

async function aggregateNutrition(
  userId: string,
  timezone: string,
  dayKeys: string[],
  startAt: Date,
  endAtExclusive: Date,
  dailyProteinTarget: number,
  dailyCalorieTarget: number
): Promise<{ nutrition: WeeklyReportData['nutrition']; daysWithBlend: Set<string> }> {
  const [result] = await BlendLogModel.aggregate<BlendAggregateResult>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startAt, $lt: endAtExclusive },
      },
    },
    {
      $addFields: {
        logDate: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone },
        },
      },
    },
    {
      $facet: {
        dailyTotals: [
          {
            $group: {
              _id: '$logDate',
              protein: { $sum: '$protein' },
              calories: { $sum: '$calories' },
            },
          },
          { $project: { _id: 0, date: '$_id', protein: 1, calories: 1 } },
        ],
        summary: [
          {
            $group: {
              _id: null,
              blendCount: { $sum: 1 },
              totalProtein: { $sum: '$protein' },
            },
          },
          { $project: { _id: 0, blendCount: 1, totalProtein: 1 } },
        ],
        // Só considera destaque de receita quando há nota E nome registrados —
        // sem isso não há como preencher o subdocumento highlightRecipe (campos
        // obrigatórios no schema).
        topRated: [
          { $match: { rating: { $ne: null }, recipeName: { $exists: true, $ne: null } } },
          { $sort: { rating: -1, createdAt: -1 } },
          { $limit: 1 },
          {
            $project: {
              _id: 0,
              name: '$recipeName',
              protein: 1,
              carbs: 1,
              fat: 1,
              calories: 1,
              rating: 1,
            },
          },
        ],
      },
    },
  ]);

  const dailyTotalsMap = new Map(result.dailyTotals.map((item) => [item.date, item]));
  const daysWithBlend = new Set(dailyTotalsMap.keys());

  const summary = result.summary[0] ?? { blendCount: 0, totalProtein: 0 };
  const avgProteinPerDay = roundToTwoDecimals(summary.totalProtein / 7);

  const proteinGoalHitDays = dayKeys.filter(
    (day) => (dailyTotalsMap.get(day)?.protein ?? 0) >= dailyProteinTarget
  ).length;
  const calorieGoalHitDays = dayKeys.filter(
    (day) => (dailyTotalsMap.get(day)?.calories ?? 0) >= dailyCalorieTarget
  ).length;

  const bestDayEntry = dayKeys.reduce<{ date: string; protein: number } | null>((best, day) => {
    const protein = dailyTotalsMap.get(day)?.protein ?? 0;
    if (!best || protein > best.protein) {
      return { date: day, protein };
    }
    return best;
  }, null);

  const topRated = result.topRated[0];

  return {
    nutrition: {
      blendCount: summary.blendCount,
      avgProteinPerDay,
      proteinGoalHitDays,
      calorieGoalHitDays,
      bestDay: {
        date: bestDayEntry?.date ?? dayKeys[0],
        proteinAmount: bestDayEntry?.protein ?? 0,
      },
      ...(topRated && {
        highlightRecipe: {
          name: topRated.name,
          protein: topRated.protein,
          carbs: topRated.carbs,
          fat: topRated.fat,
          calories: topRated.calories,
          rating: topRated.rating,
        },
      }),
    },
    daysWithBlend,
  };
}

async function aggregateHydration(
  userId: string,
  timezone: string,
  dayKeys: string[],
  startAt: Date,
  endAtExclusive: Date,
  dailyHydrationTarget: number
): Promise<WeeklyReportData['hydration']> {
  const dailyTotals = await HydrationLogModel.aggregate<{ date: string; totalMl: number }>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startAt, $lt: endAtExclusive },
      },
    },
    {
      $addFields: {
        logDate: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone },
        },
      },
    },
    {
      $group: {
        _id: '$logDate',
        totalMl: { $sum: '$amountMl' },
      },
    },
    { $project: { _id: 0, date: '$_id', totalMl: 1 } },
  ]);

  const dailyTotalsMap = new Map(dailyTotals.map((item) => [item.date, item.totalMl]));
  const dailyBreakdown = dayKeys.map((day) => dailyTotalsMap.get(day) ?? 0);
  const totalMl = dailyBreakdown.reduce((sum, value) => sum + value, 0);
  const goalHitDays = dailyBreakdown.filter((value) => value >= dailyHydrationTarget).length;

  return {
    totalMl,
    avgDailyMl: roundToTwoDecimals(totalMl / 7),
    goalHitDays,
    dailyBreakdown,
  };
}

async function aggregateSupplements(
  userId: string,
  dayKeys: string[],
  startAt: Date,
  endAtExclusive: Date,
  supplementStack: Array<{ supplementId: string; name: string; dosage: string; dailyTargetCount?: number; isActive: boolean; order: number }>
): Promise<WeeklyReportData['supplements']> {
  const activeStack = supplementStack.filter((item) => item.isActive).sort((a, b) => a.order - b.order);

  if (activeStack.length === 0) {
    return {
      adherenceRate: 0,
      perfectDays: 0,
      bySupplementName: {},
      topSupplement: '',
      bottomSupplement: '',
    };
  }

  const logs = await SupplementLogModel.find({
    userId,
    createdAt: { $gte: startAt, $lt: endAtExclusive },
  })
    .select({ supplementId: 1, logDate: 1, consumedCount: 1 })
    .lean();

  const activeStackById = new Map(activeStack.map((item) => [item.supplementId, item] as const));
  const checkedByDate = new Map<string, Set<string>>();

  for (const log of logs) {
    const supplement = activeStackById.get(log.supplementId);
    if (!supplement) {
      continue;
    }

    if (
      getSupplementConsumedCount(log)
      < getSupplementDailyTargetCount(supplement.dosage, supplement.dailyTargetCount)
    ) {
      continue;
    }

    if (!checkedByDate.has(log.logDate)) {
      checkedByDate.set(log.logDate, new Set<string>());
    }
    checkedByDate.get(log.logDate)?.add(log.supplementId);
  }

  const dailyRates = dayKeys.map((day) => {
    const checkedIds = checkedByDate.get(day) ?? new Set<string>();
    return checkedIds.size / activeStack.length;
  });

  const adherenceRate = roundToTwoDecimals(dailyRates.reduce((sum, rate) => sum + rate, 0) / 7);
  const perfectDays = dailyRates.filter((rate) => rate === 1).length;

  const bySupplementName: Record<string, number> = {};
  for (const supplement of activeStack) {
    const checkedDays = dayKeys.filter((day) => checkedByDate.get(day)?.has(supplement.supplementId)).length;
    bySupplementName[supplement.name] = roundToTwoDecimals(checkedDays / 7);
  }

  const topSupplement = activeStack.reduce((top, current) =>
    bySupplementName[current.name] > bySupplementName[top.name] ? current : top
  ).name;
  const bottomSupplement = activeStack.reduce((bottom, current) =>
    bySupplementName[current.name] < bySupplementName[bottom.name] ? current : bottom
  ).name;

  return {
    adherenceRate,
    perfectDays,
    bySupplementName,
    topSupplement,
    bottomSupplement,
  };
}

async function aggregateXpEarned(userId: string, startAt: Date, endAtExclusive: Date): Promise<number> {
  const [result] = await XPLogModel.aggregate<{ total: number }>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startAt, $lt: endAtExclusive },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result?.total ?? 0;
}

async function aggregateMissionsCompleted(userId: string, dayKeys: string[]): Promise<number> {
  const missionDocs = await DailyMissionModel.find({
    userId,
    missionDate: { $in: dayKeys },
  })
    .select({ missions: 1 })
    .lean();

  return missionDocs.reduce(
    (sum, doc) => sum + doc.missions.filter((mission) => mission.completed).length,
    0
  );
}

export async function generateWeeklyReport(
  userId: string,
  weekStartDate: string,
  weekEndDate: string
): Promise<WeeklyReportData> {
  const user = await UserModel.findById(userId)
    .select({
      timezone: 1,
      dailyProteinTarget: 1,
      dailyCalorieTarget: 1,
      dailyHydrationTarget: 1,
      supplementStack: 1,
      totalXP: 1,
      lastLevelUp: 1,
      currentStreak: 1,
    })
    .lean();

  if (!user) {
    throw new Error('User not found.');
  }

  const { startAt, endAtExclusive } = buildWeekUtcRange(weekStartDate, weekEndDate, user.timezone);
  const dayKeys = getWeekDayKeys(weekStartDate);

  const [nutritionResult, hydration, supplements, xpEarned, missionsCompleted] = await Promise.all([
    aggregateNutrition(
      userId,
      user.timezone,
      dayKeys,
      startAt,
      endAtExclusive,
      user.dailyProteinTarget,
      user.dailyCalorieTarget
    ),
    aggregateHydration(userId, user.timezone, dayKeys, startAt, endAtExclusive, user.dailyHydrationTarget),
    aggregateSupplements(userId, dayKeys, startAt, endAtExclusive, user.supplementStack ?? []),
    aggregateXpEarned(userId, startAt, endAtExclusive),
    aggregateMissionsCompleted(userId, dayKeys),
  ]);

  const currentLevel = calculateLevel(user.totalXP).level;
  const levelUpOccurred = Boolean(
    user.lastLevelUp
    && user.lastLevelUp.awardedAt.getTime() >= startAt.getTime()
    && user.lastLevelUp.awardedAt.getTime() < endAtExclusive.getTime()
  );
  const streakBrokenOnDate = findStreakBreakDate(dayKeys, nutritionResult.daysWithBlend);

  return {
    nutrition: nutritionResult.nutrition,
    hydration,
    supplements,
    gamification: {
      xpEarned,
      currentLevel,
      missionsCompleted,
      blendDaysInWeek: nutritionResult.daysWithBlend.size,
      currentStreak: user.currentStreak,
      ...(streakBrokenOnDate && { streakBrokenOnDate }),
      levelUpOccurred,
    },
  };
}
