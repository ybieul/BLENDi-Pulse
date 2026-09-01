import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { XP_EVENTS, createBlendLogSchema, historyQuerySchema } from '@blendi/shared';
import { BlendLogModel } from '../models/BlendLog';
import { UserModel } from '../models/User';
import { awardXP, type AwardXPResult } from '../services/xp.service';
import { updateMissionProgress } from '../services/missionProgress.service';
import {
  getMidnightUTC,
  isSameDayInTimezone,
  toUTC,
  toLocalDate,
} from '../utils/timezone.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

interface BlendUserContext {
  timezone: string;
  blendCount: number;
  dailyProteinTarget: number;
  dailyCalorieTarget: number;
}

interface BlendHistorySummary {
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
  blendCount: number;
  averageDailyProtein: number;
  averageDailyCalories: number;
}

interface BlendHistoryDailyBreakdownItem {
  date: string;
  count: number;
  protein: number;
  carbs: number;
  calories: number;
}

interface BlendGoalAggregateResult {
  total: number;
}

interface BlendGoalXPOutcome {
  goalHit: boolean;
  xpResult: AwardXPResult;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DAILY_BLEND_GOAL_XP_AMOUNTS = {
  proteinGoal: XP_EVENTS.proteinGoal,
  calorieGoal: XP_EVENTS.calorieGoal,
} as const;

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

function getFirstQueryValue(value: unknown): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return typeof rawValue === 'string' ? rawValue : undefined;
}

function coerceHistoryQueryInput(query: Request['query']) {
  const page = getFirstQueryValue(query.page);
  const limit = getFirstQueryValue(query.limit);

  return {
    from: getFirstQueryValue(query.from),
    to: getFirstQueryValue(query.to),
    ...(page !== undefined && { page: Number(page) }),
    ...(limit !== undefined && { limit: Number(limit) }),
  };
}

function getIsoDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildLocalDayUtcRange(from: string, to: string, timezone: string): {
  startAt: Date;
  endAtExclusive: Date;
} {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const startAt = toUTC(
    new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 0, 0, 0)),
    timezone
  );

  const endAtExclusive = toUTC(
    new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate() + 1, 0, 0, 0)),
    timezone
  );

  return {
    startAt,
    endAtExclusive,
  };
}

function getInclusiveDayKeys(from: string, to: string): string[] {
  const dayKeys: string[] = [];
  const current = new Date(`${getIsoDateKey(from)}T00:00:00.000Z`);
  const end = new Date(`${getIsoDateKey(to)}T00:00:00.000Z`);

  while (current.getTime() <= end.getTime()) {
    dayKeys.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dayKeys;
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function isPreviousDayInTimezone(previousDate: Date, currentDate: Date, timezone: string): boolean {
  const currentLocalDate = toLocalDate(currentDate, timezone);
  const previousLocalDay = new Date(currentLocalDate);

  previousLocalDay.setUTCDate(currentLocalDate.getUTCDate() - 1);

  return isSameDayInTimezone(previousDate, previousLocalDay, timezone);
}

async function getBlendUserContext(userId: string): Promise<BlendUserContext | null> {
  const user = await UserModel.findById(userId)
    .select({
      timezone: 1,
      blendCount: 1,
      dailyProteinTarget: 1,
      dailyCalorieTarget: 1,
    })
    .lean();

  if (!user) {
    return null;
  }

  return {
    timezone: user.timezone,
    blendCount: user.blendCount ?? 0,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCalorieTarget: user.dailyCalorieTarget,
  };
}

function createSkippedXPResult(): AwardXPResult {
  return {
    awarded: false,
    amount: 0,
    newTotalXP: 0,
    leveledUp: false,
    newLevel: null,
  };
}

async function awardDailyBlendGoalXP(
  userId: string,
  timezone: string,
  startOfDay: Date,
  target: number,
  xpType: keyof typeof DAILY_BLEND_GOAL_XP_AMOUNTS,
  metricField: 'protein' | 'calories'
): Promise<BlendGoalXPOutcome> {
  if (target <= 0 || DAILY_BLEND_GOAL_XP_AMOUNTS[xpType] <= 0) {
    return {
      goalHit: false,
      xpResult: createSkippedXPResult(),
    };
  }

  const [aggregate] = await BlendLogModel.aggregate<BlendGoalAggregateResult>([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: startOfDay,
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: `$${metricField}` },
      },
    },
    {
      $project: {
        _id: 0,
        total: 1,
      },
    },
  ]);

  if ((aggregate?.total ?? 0) < target) {
    return {
      goalHit: false,
      xpResult: createSkippedXPResult(),
    };
  }

  return {
    goalHit: true,
    xpResult: await awardXP(userId, xpType, timezone),
  };
}

async function updateCurrentStreak(
  userId: string,
  currentCreatedAt: Date,
  timezone: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const previousLog = await BlendLogModel.findOne({
    userId,
    createdAt: { $lt: currentCreatedAt },
  })
    .sort({ createdAt: -1 })
    .select({ createdAt: 1 })
    .lean();

  const isSameDay = previousLog
    ? isSameDayInTimezone(previousLog.createdAt, currentCreatedAt, timezone)
    : false;
  const isPreviousDay = previousLog
    ? isPreviousDayInTimezone(previousLog.createdAt, currentCreatedAt, timezone)
    : false;

  let updatedUser: { currentStreak?: number; longestStreak?: number } | null;

  if (isSameDay) {
    // Já há blend hoje: só garante o piso de 1, nunca reduz. $max é idempotente
    // e seguro sob concorrência sem precisar reler o valor atual antes de escrever.
    updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        $max: {
          currentStreak: 1,
          longestStreak: 1,
        },
      },
      { new: true }
    )
      .select({ currentStreak: 1, longestStreak: 1 })
      .lean();
  } else if (isPreviousDay) {
    // Sequência contínua: $inc é atômico (sem lost update). longestStreak
    // referencia o currentStreak já incrementado dentro do próprio pipeline
    // de update — não depende de um valor lido antes da escrita.
    updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      [
        {
          $set: {
            currentStreak: { $add: ['$currentStreak', 1] },
          },
        },
        {
          $set: {
            longestStreak: { $max: ['$longestStreak', '$currentStreak'] },
          },
        },
      ],
      { new: true }
    )
      .select({ currentStreak: 1, longestStreak: 1 })
      .lean();
  } else {
    // Gap: reset para 1 é idempotente sob concorrência.
    updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          currentStreak: 1,
        },
        $max: {
          longestStreak: 1,
        },
      },
      { new: true }
    )
      .select({ currentStreak: 1, longestStreak: 1 })
      .lean();
  }

  return {
    currentStreak: updatedUser?.currentStreak ?? 1,
    longestStreak: updatedUser?.longestStreak ?? 1,
  };
}

export async function createBlendLog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createBlendLogSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    // getBlendUserContext e a criação do blend não dependem uma da outra —
    // a criação só precisa de userId + payload já validado, o contexto do
    // usuário só é usado a partir daqui pra baixo (streak, metas). Rodar em
    // paralelo economiza 1 round-trip sequencial ao Atlas.
    const [user, log] = await Promise.all([
      getBlendUserContext(userId),
      BlendLogModel.create({
        userId,
        ...parsed.data,
      }),
    ]);

    if (!user) {
      // Janela de corrida raríssima: o usuário deixou de existir entre a
      // autenticação do JWT e este ponto. O blend já foi criado em paralelo —
      // remove o documento órfão antes de responder 404, já que ele nunca
      // poderia ser exibido a ninguém.
      await BlendLogModel.deleteOne({ _id: log._id }).catch(err => {
        console.error('[blendLog.controller] failed to remove orphaned blend log', {
          userId,
          logId: String(log._id),
          err,
        });
      });

      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const [updatedUser, updatedStreaks] = await Promise.all([
      UserModel.findByIdAndUpdate(
        userId,
        {
          $inc: {
            blendCount: 1,
          },
        },
        {
          new: true,
        }
      )
        .select({ blendCount: 1 })
        .lean(),
      updateCurrentStreak(userId, log.createdAt, user.timezone),
    ]);

    const updatedBlendCount = updatedUser?.blendCount ?? user.blendCount + 1;
    const startOfDay = getMidnightUTC(user.timezone);
    const [blendXPResult, proteinGoalXPOutcome, calorieGoalXPOutcome] = await Promise.all([
      awardXP(userId, 'blend', user.timezone),
      awardDailyBlendGoalXP(
        userId,
        user.timezone,
        startOfDay,
        user.dailyProteinTarget,
        'proteinGoal',
        'protein'
      ),
      awardDailyBlendGoalXP(
        userId,
        user.timezone,
        startOfDay,
        user.dailyCalorieTarget,
        'calorieGoal',
        'calories'
      ),
    ]);
    const xpResults = [blendXPResult, proteinGoalXPOutcome.xpResult, calorieGoalXPOutcome.xpResult];
    const fromFavoriteId =
      typeof req.body?.fromFavoriteId === 'string' && req.body.fromFavoriteId.trim().length > 0
        ? req.body.fromFavoriteId
        : undefined;

    // Background: progresso de missão não é usado na resposta e não compromete a
    // integridade do blend já persistido — não há motivo pra a requisição esperar
    // por até 4 cadeias de findOrCreate+increment+reconcile de bônus, cada uma
    // podendo levar vários round-trips ao Atlas. handleMissionResponse no mobile
    // invalida dailyMissions incondicionalmente após o blend, então a Home reflete
    // o resultado assim que a atualização em background terminar.
    const missionTypesToUpdate: string[] = [
      'makeBlend',
      ...(proteinGoalXPOutcome.goalHit ? ['hitProteinGoal'] : []),
      ...(calorieGoalXPOutcome.goalHit ? ['hitCalorieGoal'] : []),
      ...(fromFavoriteId !== undefined ? ['makeBlendFromFavorite'] : []),
    ];

    for (const missionType of missionTypesToUpdate) {
      void updateMissionProgress(userId, missionType, user.timezone).catch(err => {
        console.error('[blendLog.controller] updateMissionProgress failed in background', {
          userId,
          missionType,
          err,
        });
      });
    }

    const xpAwarded = xpResults
      .filter(result => result.awarded)
      .reduce((sum, result) => sum + result.amount, 0);
    const leveledUp = xpResults.some(result => result.leveledUp);
    const newLevel = xpResults.reduce<number | null>(
      (highestLevel, result) => {
        if (result.newLevel === null) {
          return highestLevel;
        }

        return highestLevel === null ? result.newLevel : Math.max(highestLevel, result.newLevel);
      },
      null
    );

    res.status(201).json({
      success: true,
      data: {
        log: {
          id: String(log._id),
          recipeName: log.recipeName ?? null,
          protein: log.protein,
          carbs: log.carbs,
          fat: log.fat,
          calories: log.calories,
          blendiModel: log.blendiModel,
          durationSeconds: log.durationSeconds,
          rating: log.rating,
          createdAt: log.createdAt,
        },
        currentStreak: updatedStreaks.currentStreak,
        longestStreak: updatedStreaks.longestStreak,
        blendCount: updatedBlendCount,
        xpAwarded,
        leveledUp,
        newLevel,
        totalBlends: updatedBlendCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getTodayLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId).select({ timezone: 1 }).lean();
    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const startOfDay = getMidnightUTC(user.timezone);
    const logs = await BlendLogModel.find({
      userId,
      createdAt: { $gte: startOfDay },
    })
      .sort({ createdAt: -1 })
      .lean();

    const totals = logs.reduce(
      (acc, log) => ({
        totalProtein: acc.totalProtein + log.protein,
        totalCarbs: acc.totalCarbs + log.carbs,
        totalCalories: acc.totalCalories + log.calories,
      }),
      {
        totalProtein: 0,
        totalCarbs: 0,
        totalCalories: 0,
      }
    );

    res.status(200).json({
      success: true,
      data: {
        totalProtein: totals.totalProtein,
        totalCarbs: totals.totalCarbs,
        totalCalories: totals.totalCalories,
        blendCount: logs.length,
        logs: logs.map(log => ({
          id: String(log._id),
          recipeName: log.recipeName,
          protein: log.protein,
          carbs: log.carbs,
          fat: log.fat,
          calories: log.calories,
          blendiModel: log.blendiModel,
          durationSeconds: log.durationSeconds,
          rating: log.rating,
          createdAt: log.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getBlendHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = historyQuerySchema.safeParse(coerceHistoryQueryInput(req.query));
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId).select({ timezone: 1 }).lean();
    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const { from, to, page, limit } = parsed.data;
    const { startAt, endAtExclusive } = buildLocalDayUtcRange(from, to, user.timezone);
    const matchQuery = {
      userId,
      createdAt: {
        $gte: startAt,
        $lt: endAtExclusive,
      },
    };

    const [logs, aggregateResult] = await Promise.all([
      BlendLogModel.find(matchQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BlendLogModel.aggregate<{
        summary: Array<{
          totalProtein: number;
          totalCarbs: number;
          totalFat: number;
          totalCalories: number;
          blendCount: number;
        }>;
        dailyBreakdown: BlendHistoryDailyBreakdownItem[];
        total: Array<{ count: number }>;
      }>([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            createdAt: {
              $gte: startAt,
              $lt: endAtExclusive,
            },
          },
        },
        {
          $addFields: {
            logDate: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: user.timezone,
              },
            },
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalProtein: { $sum: '$protein' },
                  totalCarbs: { $sum: '$carbs' },
                  totalFat: { $sum: '$fat' },
                  totalCalories: { $sum: '$calories' },
                  blendCount: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalProtein: 1,
                  totalCarbs: 1,
                  totalFat: 1,
                  totalCalories: 1,
                  blendCount: 1,
                },
              },
            ],
            dailyBreakdown: [
              {
                $group: {
                  _id: '$logDate',
                  count: { $sum: 1 },
                  protein: { $sum: '$protein' },
                  carbs: { $sum: '$carbs' },
                  calories: { $sum: '$calories' },
                },
              },
              { $sort: { _id: -1 } },
              {
                $project: {
                  _id: 0,
                  date: '$_id',
                  count: 1,
                  protein: 1,
                  carbs: 1,
                  calories: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ]),
    ]);

    const aggregate = aggregateResult[0];
    const total = aggregate?.total[0]?.count ?? 0;
    const dayKeys = getInclusiveDayKeys(from, to);
    const dailyBreakdownMap = new Map(
      (aggregate?.dailyBreakdown ?? []).map(item => [item.date, item])
    );
    const dailyBreakdown = [...dayKeys]
      .reverse()
      .map(date => dailyBreakdownMap.get(date) ?? {
        date,
        count: 0,
        protein: 0,
        carbs: 0,
        calories: 0,
      });

    const totals = aggregate?.summary[0] ?? {
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalCalories: 0,
      blendCount: 0,
    };
    const totalDays = Math.max(
      1,
      Math.floor(
        (new Date(`${getIsoDateKey(to)}T00:00:00.000Z`).getTime()
          - new Date(`${getIsoDateKey(from)}T00:00:00.000Z`).getTime()) / MILLISECONDS_PER_DAY
      ) + 1
    );
    const summary: BlendHistorySummary = {
      ...totals,
      averageDailyProtein: roundToTwoDecimals(totals.totalProtein / totalDays),
      averageDailyCalories: roundToTwoDecimals(totals.totalCalories / totalDays),
    };

    res.status(200).json({
      success: true,
      data: {
        logs: logs.map(log => ({
          id: String(log._id),
          recipeName: log.recipeName ?? null,
          protein: log.protein,
          carbs: log.carbs,
          fat: log.fat,
          calories: log.calories,
          blendiModel: log.blendiModel,
          durationSeconds: log.durationSeconds,
          rating: log.rating,
          createdAt: log.createdAt,
        })),
        summary,
        dailyBreakdown,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}