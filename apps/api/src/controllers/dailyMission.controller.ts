import type { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { getDailyMissionsForUser } from '../services/missionProgress.service';
import { sendErrorResponse } from '../utils/error.utils';

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

export async function getDailyMissions(
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

    const dailyMission = await getDailyMissionsForUser(userId, user.timezone);
    const completedCount = dailyMission.missions.filter(mission => mission.completed).length;
    const xpAvailableFromMissions = dailyMission.missions.reduce(
      (total, mission) => total + (mission.completed ? 0 : mission.xpReward),
      0
    );
    const xpAvailable = xpAvailableFromMissions + (dailyMission.bonusAwarded ? 0 : 20);

    res.status(200).json({
      success: true,
      data: {
        dailyMission: {
          ...dailyMission.toObject(),
          xpAvailable,
          completedCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
