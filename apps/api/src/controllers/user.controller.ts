import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { calculateMacrosSchema, updateUserSchema } from '@blendi/shared';
import { UserModel } from '../models/User';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

const DEFAULT_DAILY_HYDRATION_TARGET = 2500;

const ASSUMED_AGE = 30;

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightlyActive: 1.375,
  moderatelyActive: 1.55,
  veryActive: 1.725,
} as const;

const CALORIE_ADJUSTMENTS = {
  Muscle: 300,
  Wellness: 0,
  Energy: -150,
  Recovery: 0,
} as const;

const PROTEIN_MULTIPLIERS = {
  Muscle: 2.0,
  Wellness: 1.6,
  Energy: 1.8,
  Recovery: 2.2,
} as const;

const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
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

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

export async function getMe(
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

    const user = await UserModel.findById(userId).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          profilePhoto: user.profilePhoto,
          blendiModel: user.blendiModel,
          goal: user.goal,
          preferredLanguage: user.locale,
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyCalorieTarget: user.dailyCalorieTarget,
          dailyHydrationTarget: user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET,
          isPro: user.isPro ?? false,
          createdAt: user.createdAt,
          currentStreak: user.currentStreak,
          streakDays: user.currentStreak,
          longestStreak: user.longestStreak ?? 0,
          blendCount: user.blendCount,
          totalBlends: user.blendCount,
          lastCleanedAt: user.lastCleanedAt ?? null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function markCleaned(
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

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          lastCleanedAt: new Date(),
        },
      },
      {
        new: true,
      }
    ).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: String(user._id),
          lastCleanedAt: user.lastCleanedAt ?? null,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const {
      blendiModel,
      goal,
      dailyProteinTarget,
      dailyCalorieTarget,
      dailyCarbTarget,
      dailyHydrationTarget,
      weight,
      height,
      preferredLanguage,
      unitSystem,
    } = parsed.data;

    const updates = {
      ...(blendiModel !== undefined && { blendiModel }),
      ...(goal !== undefined && { goal }),
      ...(dailyProteinTarget !== undefined && { dailyProteinTarget }),
      ...(dailyCalorieTarget !== undefined && { dailyCalorieTarget }),
      ...(dailyCarbTarget !== undefined && { dailyCarbTarget }),
      ...(dailyHydrationTarget !== undefined && { dailyHydrationTarget }),
      ...(weight !== undefined && { weight }),
      ...(height !== undefined && { height }),
      ...(preferredLanguage !== undefined && { locale: preferredLanguage }),
      ...(unitSystem !== undefined && { unitSystem }),
    };

    const user = await UserModel.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: String(user._id),
          email: user.email,
          name: user.name,
          profilePhoto: user.profilePhoto,
          blendiModel: user.blendiModel,
          goal: user.goal,
          locale: user.locale,
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCalorieTarget: user.dailyCalorieTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyHydrationTarget: user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET,
          isPro: user.isPro ?? false,
          longestStreak: user.longestStreak ?? 0,
          weight: user.weight,
          height: user.height,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function calculateMacros(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = calculateMacrosSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { weight, height, activityLevel, goal, unitSystem } = parsed.data;

    const metricWeight = unitSystem === 'imperial' ? weight / POUNDS_PER_KILOGRAM : weight;
    const metricHeight = unitSystem === 'imperial' ? height * CENTIMETERS_PER_INCH : height;

    const heightInMeters = metricHeight / 100;
    const imc = roundToOneDecimal(metricWeight / (heightInMeters * heightInMeters));

    const imcClassification =
      imc < 18.5 ? 'underweight' : imc < 25 ? 'normal' : imc < 30 ? 'overweight' : 'obese';

    const basalMetabolism = (10 * metricWeight) + (6.25 * metricHeight) - (5 * ASSUMED_AGE) + 5;
    const tdee = Math.round(basalMetabolism * ACTIVITY_MULTIPLIERS[activityLevel]);
    const dailyCalorieTarget = Math.round(tdee + CALORIE_ADJUSTMENTS[goal]);
    const dailyProteinTarget = Math.round(metricWeight * PROTEIN_MULTIPLIERS[goal]);
    const dailyFatCalories = dailyCalorieTarget * 0.3;
    const dailyCarbTarget = Math.round(
      (dailyCalorieTarget - (dailyProteinTarget * 4) - dailyFatCalories) / 4
    );

    res.status(200).json({
      success: true,
      data: {
        imc,
        imcUnit: 'kg/m²',
        imcClassification,
        dailyCalorieTarget,
        dailyProteinTarget,
        dailyCarbTarget,
        tdee,
      },
    });
  } catch (err) {
    next(err);
  }
}