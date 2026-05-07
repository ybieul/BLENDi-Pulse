import type { NextFunction, Request, Response } from 'express';
import { BlendLogModel } from '../models/BlendLog';
import { UserModel } from '../models/User';
import { getMidnightUTC } from '../utils/timezone.utils';
import { sendErrorResponse } from '../utils/error.utils';

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
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