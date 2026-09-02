import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { XP_EVENTS, historyQuerySchema } from '@blendi/shared';
import { HydrationLogModel } from '../models/HydrationLog';
import { XPLogModel } from '../models/XPLog';
import { UserModel } from '../models/User';
import { updateMissionProgress } from '../services/missionProgress.service';
import { awardXP } from '../services/xp.service';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';
import { getMidnightUTC, toUTC } from '../utils/timezone.utils';

const DEFAULT_HYDRATION_AMOUNT_ML = 250;
const DEFAULT_HYDRATION_GOAL_ML = 2500;
// 5 litros — generoso o suficiente para qualquer uso real (inclusive
// registro manual de um dia inteiro de uma vez), mas fecha a lacuna de
// validação que permitia qualquer valor positivo, sem teto.
const MAX_HYDRATION_AMOUNT_ML = 5000;

interface HydrationContext {
  timezone: string;
  goalMl: number;
}

interface HydrationLogResponseItem {
  id: string;
  amountMl: number;
  createdAt: Date;
}

interface HydrationHistoryDailyBreakdownItem {
  date: string;
  totalMl: number;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendInvalidAmountMl(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: [
      {
        field: 'amountMl',
        message: 'errors.validation.integer',
      },
    ],
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

function formatLocalDateKey(timezone: string): string {
  const midnightUTC = getMidnightUTC(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(midnightUTC);

  const getPart = (type: 'year' | 'month' | 'day') =>
    parts.find(part => part.type === type)?.value ?? '00';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

function getAmountMl(body: Request['body']): number | null {
  const amountMl = body?.amountMl;

  if (amountMl == null) {
    return DEFAULT_HYDRATION_AMOUNT_ML;
  }

  if (
    typeof amountMl !== 'number'
    || !Number.isInteger(amountMl)
    || amountMl <= 0
    || amountMl > MAX_HYDRATION_AMOUNT_ML
  ) {
    return null;
  }

  return amountMl;
}

async function getHydrationContext(userId: string): Promise<HydrationContext | null> {
  const user = await UserModel.findById(userId)
    .select({ timezone: 1, dailyHydrationTarget: 1 })
    .lean();

  if (!user) {
    return null;
  }

  return {
    timezone: user.timezone,
    goalMl: user.dailyHydrationTarget ?? DEFAULT_HYDRATION_GOAL_ML,
  };
}

async function getTodayHydrationSummary(userId: string, timezone: string): Promise<{
  totalMl: number;
  logs: HydrationLogResponseItem[];
}> {
  const startOfDay = getMidnightUTC(timezone);
  const logs = await HydrationLogModel.find({
    userId,
    createdAt: { $gte: startOfDay },
  })
    .sort({ createdAt: -1 })
    .lean();

  return {
    totalMl: logs.reduce((sum, log) => sum + log.amountMl, 0),
    logs: logs.map(log => ({
      id: String(log._id),
      amountMl: log.amountMl,
      createdAt: log.createdAt,
    })),
  };
}

export async function logWater(
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

    const amountMl = getAmountMl(req.body);
    if (amountMl == null) {
      sendInvalidAmountMl(res);
      return;
    }

    const hydrationContext = await getHydrationContext(userId);
    if (!hydrationContext) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const log = await HydrationLogModel.create({
      userId,
      amountMl,
    });

    const summary = await getTodayHydrationSummary(userId, hydrationContext.timezone);
    let xpAwarded = 0;

    if (summary.totalMl >= hydrationContext.goalMl) {
      const hydrationGoalAlreadyAwarded = await XPLogModel.exists({
        userId,
        xpType: 'hydrationGoal',
        logDate: formatLocalDateKey(hydrationContext.timezone),
      });

      xpAwarded = hydrationGoalAlreadyAwarded ? 0 : XP_EVENTS.hydrationGoal;

      Promise.resolve()
        .then(() => awardXP(userId, 'hydrationGoal', hydrationContext.timezone))
        .catch(err => console.error('XP award failed:', err));

      Promise.resolve()
        .then(() => updateMissionProgress(userId, 'hitHydrationGoal', hydrationContext.timezone))
        .catch(err => console.error('Mission update failed:', err));
    }

    res.status(201).json({
      success: true,
      data: {
        log: {
          id: String(log._id),
          amountMl: log.amountMl,
          createdAt: log.createdAt,
        },
        totalMl: summary.totalMl,
        goalMl: hydrationContext.goalMl,
        xpAwarded,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getTodayHydration(
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

    const hydrationContext = await getHydrationContext(userId);
    if (!hydrationContext) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const summary = await getTodayHydrationSummary(userId, hydrationContext.timezone);

    res.status(200).json({
      success: true,
      data: {
        totalMl: summary.totalMl,
        goalMl: hydrationContext.goalMl,
        logs: summary.logs,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getHydrationHistory(
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

    const hydrationContext = await getHydrationContext(userId);
    if (!hydrationContext) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const { from, to, page, limit } = parsed.data;
    const { startAt, endAtExclusive } = buildLocalDayUtcRange(from, to, hydrationContext.timezone);
    const matchQuery = {
      userId,
      createdAt: {
        $gte: startAt,
        $lt: endAtExclusive,
      },
    };

    const [logs, aggregateResult] = await Promise.all([
      HydrationLogModel.find(matchQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      HydrationLogModel.aggregate<{
        summary: Array<{ totalMl: number }>;
        dailyBreakdown: HydrationHistoryDailyBreakdownItem[];
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
                timezone: hydrationContext.timezone,
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
                  totalMl: { $sum: '$amountMl' },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalMl: 1,
                },
              },
            ],
            dailyBreakdown: [
              {
                $group: {
                  _id: '$logDate',
                  totalMl: { $sum: '$amountMl' },
                },
              },
              { $sort: { _id: -1 } },
              {
                $project: {
                  _id: 0,
                  date: '$_id',
                  totalMl: 1,
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
    const totalMl = aggregate?.summary[0]?.totalMl ?? 0;
    const dayKeys = getInclusiveDayKeys(from, to);
    const dailyBreakdownMap = new Map(
      (aggregate?.dailyBreakdown ?? []).map(item => [item.date, item])
    );
    const dailyBreakdown = [...dayKeys]
      .reverse()
      .map(date => dailyBreakdownMap.get(date) ?? {
        date,
        totalMl: 0,
      });
    const totalDays = Math.max(
      1,
      Math.floor(
        (new Date(`${getIsoDateKey(to)}T00:00:00.000Z`).getTime()
          - new Date(`${getIsoDateKey(from)}T00:00:00.000Z`).getTime()) / MILLISECONDS_PER_DAY
      ) + 1
    );

    res.status(200).json({
      success: true,
      data: {
        logs: logs.map(log => ({
          id: String(log._id),
          amountMl: log.amountMl,
          createdAt: log.createdAt,
        })),
        summary: {
          totalMl,
          averageDailyMl: roundToTwoDecimals(totalMl / totalDays),
        },
        dailyBreakdown,
        dailyHydrationTarget: hydrationContext.goalMl,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}