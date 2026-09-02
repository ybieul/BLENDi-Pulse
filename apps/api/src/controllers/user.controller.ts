import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import {
  calculateLevel,
  calculateMacrosSchema,
  dailyPulseTimeSchema,
  notificationPreferencesSchema,
  updateUserSchema,
} from '@blendi/shared';
import { UserModel } from '../models/User';
import { UserPhotoModel } from '../models/UserPhoto';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

const DEFAULT_DAILY_HYDRATION_TARGET = 2500;
const MAX_PROFILE_PHOTO_BASE64_LENGTH = 530_000;

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
const NOTIFICATION_PREFERENCE_KEYS = [
  'dailyPulse',
  'streakReminder',
  'supplementReminder',
  'hydrationReminder',
  'levelUp',
] as const;
const expoPushTokenPattern = /^ExponentPushToken\[[^\]]+\]$/;
const nativePushTokenPattern = /^\S{20,}$/;
const pushTokenSchema = z.object({
  pushToken: z
    .string({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.required',
    })
    .trim()
    .min(1, 'errors.validation.required')
    .refine(
      token =>
        token.startsWith('ExponentPushToken[')
          ? expoPushTokenPattern.test(token)
          : nativePushTokenPattern.test(token),
      'errors.validation.invalid_option'
    ),
});
const profilePhotoBodySchema = z.object({
  imageBase64: z
    .string({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.required',
    })
    .trim()
    .min(1, 'errors.validation.required'),
  fileType: z
    .string({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.required',
    })
    .trim()
    .transform(value => value.toLowerCase())
    .pipe(z.enum(['jpeg', 'png'])),
});

type ProfilePhotoFileType = z.infer<typeof profilePhotoBodySchema>['fileType'];

const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff];
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47];

/**
 * Confirma que os bytes reais do arquivo — não apenas o `fileType`
 * declarado pelo cliente — correspondem à assinatura de um JPEG ou PNG
 * válido. Antes desta checagem, `fileType` era um rótulo puramente
 * confiado: um SVG com `<script>` embutido, por exemplo, era aceito e
 * servido de volta rotulado como `image/png` sem nenhuma rejeição
 * (achado M8 do diagnóstico de segurança, confirmado com um payload real).
 *
 * 16 caracteres base64 (múltiplo de 4 — decodifica sem padding parcial)
 * cobrem os 12 primeiros bytes do arquivo, suficiente para as duas
 * assinaturas verificadas aqui.
 */
function hasValidImageMagicBytes(imageBase64: string, fileType: ProfilePhotoFileType): boolean {
  const headerBytes = Buffer.from(imageBase64.slice(0, 16), 'base64');
  const signature = fileType === 'jpeg' ? JPEG_MAGIC_BYTES : PNG_MAGIC_BYTES;

  return signature.every((byte, index) => headerBytes[index] === byte);
}
type UserPhotoProfileResponse = {
  _id: unknown;
  email: string;
  name: string;
  profilePhoto?: string | null;
  hasProfilePhoto?: boolean | null;
  profilePhotoUpdatedAt?: Date | null;
  updatedAt?: Date | null;
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeNotificationPreferences(
  preferences: Partial<NotificationPreferencesState> | null | undefined
) {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preferences,
  };
}

function normalizeDailyPulseTime(dailyPulseTime: Partial<DailyPulseTimeState> | null | undefined) {
  return {
    ...DEFAULT_DAILY_PULSE_TIME,
    ...dailyPulseTime,
  };
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

function getProfilePhotoMimeType(fileType: ProfilePhotoFileType): string {
  return fileType === 'png' ? 'image/png' : 'image/jpeg';
}

function buildUserPhotoProfileResponse(user: UserPhotoProfileResponse) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    profilePhoto: user.profilePhoto ?? null,
    hasProfilePhoto: user.hasProfilePhoto ?? false,
    profilePhotoUpdatedAt: user.profilePhotoUpdatedAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
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

    const totalXP = user.totalXP ?? 0;
    const levelInfo = calculateLevel(totalXP);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          profilePhoto: user.profilePhoto,
          hasProfilePhoto: user.hasProfilePhoto ?? false,
          profilePhotoUpdatedAt: user.profilePhotoUpdatedAt ?? null,
          blendiModel: user.blendiModel,
          goal: user.goal,
          preferredLanguage: user.locale,
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          pushToken: user.pushToken ?? null,
          notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
          dailyPulseTime: normalizeDailyPulseTime(user.dailyPulseTime),
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyCalorieTarget: user.dailyCalorieTarget,
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
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadProfilePhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = profilePhotoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    if (parsed.data.imageBase64.length > MAX_PROFILE_PHOTO_BASE64_LENGTH) {
      sendErrorResponse(res, {
        statusCode: 413,
        code: 'profilePhoto/file-too-large',
        message: 'Profile photo exceeds the maximum allowed size.',
      });
      return;
    }

    if (!hasValidImageMagicBytes(parsed.data.imageBase64, parsed.data.fileType)) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'profilePhoto/invalid-content',
        message: 'Invalid image content.',
      });
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const session = await UserModel.db.startSession();
    let user: UserPhotoProfileResponse | null = null;

    try {
      const operationTimestamp = new Date();

      await session.withTransaction(async () => {
        await UserPhotoModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              imageBase64: parsed.data.imageBase64,
              fileType: parsed.data.fileType,
            },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            session,
          }
        ).lean();

        user = await UserModel.findByIdAndUpdate(
          userId,
          {
            $set: {
              hasProfilePhoto: true,
              profilePhotoUpdatedAt: operationTimestamp,
            },
          },
          {
            new: true,
            runValidators: true,
            session,
          }
        ).lean<UserPhotoProfileResponse>();

        if (!user) {
          throw new Error('USER_NOT_FOUND');
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
        sendErrorResponse(res, {
          statusCode: 404,
          code: 'resource/not-found',
          message: 'User not found.',
        });
        return;
      }

      throw err;
    } finally {
      await session.endSession();
    }

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
        user: buildUserPhotoProfileResponse(user),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyProfilePhoto(
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

    const user = await UserModel.findById(userId).select({ _id: 1 }).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const profilePhoto = await UserPhotoModel.findOne({ userId })
      .select({ imageBase64: 1, fileType: 1 })
      .lean();

    if (!profilePhoto) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'profilePhoto/not-found',
        message: 'Profile photo not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        imageBase64: profilePhoto.imageBase64,
        mimeType: getProfilePhotoMimeType(profilePhoto.fileType),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteProfilePhoto(
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

    const session = await UserModel.db.startSession();
    let user: UserPhotoProfileResponse | null = null;

    try {
      const operationTimestamp = new Date();

      await session.withTransaction(async () => {
        await UserPhotoModel.deleteOne({ userId }, { session });

        user = await UserModel.findByIdAndUpdate(
          userId,
          {
            $set: {
              hasProfilePhoto: false,
              profilePhotoUpdatedAt: operationTimestamp,
            },
          },
          {
            new: true,
            runValidators: true,
            session,
          }
        ).lean<UserPhotoProfileResponse>();

        if (!user) {
          throw new Error('USER_NOT_FOUND');
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
        sendErrorResponse(res, {
          statusCode: 404,
          code: 'resource/not-found',
          message: 'User not found.',
        });
        return;
      }

      throw err;
    } finally {
      await session.endSession();
    }

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
        user: buildUserPhotoProfileResponse(user),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePushToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const currentUser = await UserModel.findById(userId).lean();

    if (!currentUser) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    if (currentUser.pushToken === parsed.data.pushToken) {
      res.status(200).json({
        success: true,
        data: {
          user: {
            id: String(currentUser._id),
            pushToken: currentUser.pushToken ?? null,
            updatedAt: currentUser.updatedAt,
          },
        },
      });
      return;
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          pushToken: parsed.data.pushToken,
        },
      },
      {
        new: true,
        runValidators: true,
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
          pushToken: user.pushToken ?? null,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = notificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const currentUser = await UserModel.findById(userId).lean();

    if (!currentUser) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const preferenceUpdates: Record<string, boolean> = {};

    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      const value = parsed.data[key];
      if (value !== undefined) {
        preferenceUpdates[`notificationPreferences.${key}`] = value;
      }
    }

    if (Object.keys(preferenceUpdates).length === 0) {
      res.status(200).json({
        success: true,
        data: {
          user: {
            id: String(currentUser._id),
            notificationPreferences: normalizeNotificationPreferences(currentUser.notificationPreferences),
            updatedAt: currentUser.updatedAt,
          },
        },
      });
      return;
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: preferenceUpdates,
      },
      {
        new: true,
        runValidators: true,
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
          notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDailyPulseTime(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = dailyPulseTimeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          dailyPulseTime: parsed.data,
        },
      },
      {
        new: true,
        runValidators: true,
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
          dailyPulseTime: normalizeDailyPulseTime(user.dailyPulseTime),
          updatedAt: user.updatedAt,
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