import type { NextFunction, Request, Response } from 'express';
import { HydrationLogModel } from '../models/HydrationLog';
import { UserModel } from '../models/User';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';
import { getMidnightUTC } from '../utils/timezone.utils';

const DEFAULT_HYDRATION_AMOUNT_ML = 250;
const DEFAULT_HYDRATION_GOAL_ML = 2000;

interface HydrationContext {
  timezone: string;
  goalMl: number;
}

interface HydrationLogResponseItem {
  id: string;
  amountMl: number;
  createdAt: Date;
}

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

function getAmountMl(body: Request['body']): number | null {
  const amountMl = body?.amountMl;

  if (amountMl == null) {
    return DEFAULT_HYDRATION_AMOUNT_ML;
  }

  if (typeof amountMl !== 'number' || !Number.isInteger(amountMl) || amountMl <= 0) {
    return null;
  }

  return amountMl;
}

async function getHydrationContext(userId: string): Promise<HydrationContext | null> {
  const user = await UserModel.findById(userId).select({ timezone: 1 }).lean();

  if (!user) {
    return null;
  }

  return {
    timezone: user.timezone,
    goalMl: DEFAULT_HYDRATION_GOAL_ML,
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