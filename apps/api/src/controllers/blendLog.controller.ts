import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { createBlendLogSchema } from '@blendi/shared';
import { BlendLogModel } from '../models/BlendLog';
import { UserModel } from '../models/User';
import {
  getMidnightUTC,
  isSameDayInTimezone,
  toLocalDate,
} from '../utils/timezone.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

interface BlendUserContext {
  timezone: string;
  currentStreak: number;
  blendCount: number;
}

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

function isPreviousDayInTimezone(previousDate: Date, currentDate: Date, timezone: string): boolean {
  const currentLocalDate = toLocalDate(currentDate, timezone);
  const previousLocalDay = new Date(currentLocalDate);

  previousLocalDay.setUTCDate(currentLocalDate.getUTCDate() - 1);

  return isSameDayInTimezone(previousDate, previousLocalDay, timezone);
}

async function getBlendUserContext(userId: string): Promise<BlendUserContext | null> {
  const user = await UserModel.findById(userId)
    .select({ timezone: 1, currentStreak: 1, blendCount: 1 })
    .lean();

  if (!user) {
    return null;
  }

  return {
    timezone: user.timezone,
    currentStreak: user.currentStreak ?? 0,
    blendCount: user.blendCount ?? 0,
  };
}

async function updateCurrentStreak(
  userId: string,
  currentCreatedAt: Date,
  timezone: string,
  currentStreak: number
): Promise<number> {
  const previousLog = await BlendLogModel.findOne({
    userId,
    createdAt: { $lt: currentCreatedAt },
  })
    .sort({ createdAt: -1 })
    .select({ createdAt: 1 })
    .lean();

  let nextStreak = 1;

  if (previousLog) {
    if (isSameDayInTimezone(previousLog.createdAt, currentCreatedAt, timezone)) {
      nextStreak = Math.max(currentStreak, 1);
    } else if (isPreviousDayInTimezone(previousLog.createdAt, currentCreatedAt, timezone)) {
      nextStreak = Math.max(currentStreak, 0) + 1;
    }
  }

  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        currentStreak: nextStreak,
      },
    },
    {
      new: true,
    }
  )
    .select({ currentStreak: 1 })
    .lean();

  return updatedUser?.currentStreak ?? nextStreak;
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

    const user = await getBlendUserContext(userId);
    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const log = await BlendLogModel.create({
      userId,
      ...parsed.data,
    });

    const [updatedUser, updatedCurrentStreak] = await Promise.all([
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
      updateCurrentStreak(userId, log.createdAt, user.timezone, user.currentStreak),
    ]);

    const updatedBlendCount = updatedUser?.blendCount ?? user.blendCount + 1;

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
        currentStreak: updatedCurrentStreak,
        blendCount: updatedBlendCount,
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