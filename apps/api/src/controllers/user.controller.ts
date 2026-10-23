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
import {
  calculateFatTargetFromCalories,
  calculateMacroTargets,
  calculateWeightTargetEta,
  evaluateManualMacroEditWarnings,
  type MacroEditWarning,
} from '../utils/macroCalculation.utils';

const DEFAULT_DAILY_HYDRATION_TARGET = 2500;
const MAX_PROFILE_PHOTO_BASE64_LENGTH = 530_000;

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
          weightGoal: user.weightGoal,
          weight: user.weight,
          height: user.height,
          targetWeight: user.targetWeight,
          activityLevel: user.activityLevel,
          birthDate: user.birthDate,
          biologicalSex: user.biologicalSex,
          hasRealBodyProfile: user.hasRealBodyProfile ?? false,
          preferredLanguage: user.locale,
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          pushToken: user.pushToken ?? null,
          notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
          dailyPulseTime: normalizeDailyPulseTime(user.dailyPulseTime),
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyCalorieTarget: user.dailyCalorieTarget,
          dailyFatTarget:
            user.dailyFatTarget ?? calculateFatTargetFromCalories(user.dailyCalorieTarget),
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
      weightGoal,
      dailyProteinTarget,
      dailyCalorieTarget,
      dailyCarbTarget,
      dailyFatTarget,
      dailyHydrationTarget,
      weight,
      height,
      targetWeight,
      activityLevel,
      birthDate,
      biologicalSex,
      preferredLanguage,
      unitSystem,
      completingBodyOnboarding,
    } = parsed.data;

    const updates: Record<string, unknown> = {
      ...(blendiModel !== undefined && { blendiModel }),
      ...(goal !== undefined && { goal }),
      ...(weightGoal !== undefined && { weightGoal }),
      ...(dailyProteinTarget !== undefined && { dailyProteinTarget }),
      ...(dailyCalorieTarget !== undefined && { dailyCalorieTarget }),
      ...(dailyCarbTarget !== undefined && { dailyCarbTarget }),
      ...(dailyFatTarget !== undefined && { dailyFatTarget }),
      ...(dailyHydrationTarget !== undefined && { dailyHydrationTarget }),
      ...(weight !== undefined && { weight }),
      ...(height !== undefined && { height }),
      ...(targetWeight !== undefined && { targetWeight }),
      ...(activityLevel !== undefined && { activityLevel }),
      ...(birthDate !== undefined && { birthDate }),
      ...(biologicalSex !== undefined && { biologicalSex }),
      ...(preferredLanguage !== undefined && { locale: preferredLanguage }),
      ...(unitSystem !== undefined && { unitSystem }),
      // CP-B.1 — flag sticky de "perfil completo". Só setada para true, nunca
      // resetada: a ausência do sinal (qualquer PATCH que não seja o fluxo
      // real de conclusão do onboarding de corpo) simplesmente não toca neste
      // campo, igual a todo outro campo acima.
      ...(completingBodyOnboarding === true && { hasRealBodyProfile: true }),
    };

    // Buscado incondicionalmente (não só quando um campo-gatilho vem no
    // body) porque a previsão de prazo (targetWeight) precisa do estado
    // atual de weight/weightGoal mesmo quando nenhuma meta de macro está
    // sendo recalculada neste request. A leitura continua incondicional —
    // só os campos foram reduzidos (CP-A.2.1) à lista exata usada abaixo
    // (mergedX e a comparação de weightHistoryEntry), auditada por grep,
    // mais _id (incluído por padrão pelo Mongoose, não excluído aqui).
    const currentUser = await UserModel.findById(userId)
      .select({
        weight: 1,
        height: 1,
        birthDate: 1,
        biologicalSex: 1,
        activityLevel: 1,
        weightGoal: 1,
        goal: 1,
        targetWeight: 1,
      })
      .lean();

    if (!currentUser) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const mergedWeight = weight ?? currentUser.weight;
    const mergedHeight = height ?? currentUser.height;
    const mergedBirthDate = birthDate ?? currentUser.birthDate;
    const mergedBiologicalSex = biologicalSex ?? currentUser.biologicalSex;
    const mergedActivityLevel = activityLevel ?? currentUser.activityLevel;
    const mergedWeightGoal = weightGoal ?? currentUser.weightGoal;
    const mergedGoal = goal ?? currentUser.goal;
    const mergedTargetWeight = targetWeight ?? currentUser.targetWeight;

    // Gatilhos de recálculo automático das 3 metas — ver diagnostico-macros.md
    // (Tarefa 8) e cp-a-macros.md (achado 3, Tarefa 6): `goal` (proposta do
    // blend) não afeta mais dailyCalorieTarget (isso migrou pra weightGoal),
    // mas ainda alimenta PROTEIN_MULTIPLIERS — por isso também é gatilho:
    // trocar só `goal` recalcula proteína/carboidrato, calorias não muda.
    const shouldRecalculateMacroTargets =
      weight !== undefined ||
      height !== undefined ||
      activityLevel !== undefined ||
      weightGoal !== undefined ||
      birthDate !== undefined ||
      biologicalSex !== undefined ||
      goal !== undefined;

    // Preenchido só quando o recálculo de fato acontece — usado pra incluir
    // o IMC atualizado na resposta (Tarefa 3 do CP-A.2: IMC sempre derivado
    // na hora, nunca armazenado, mas retornado também por updateMe, não só
    // por calculateMacros).
    let recalculatedMacros: ReturnType<typeof calculateMacroTargets> | null = null;

    // Só recalcula se TODO dado necessário já existir (ex.: weight/height
    // continuam opcionais até o onboarding os preencher) — sem isso,
    // aplica só os campos que vieram no body, sem recalcular nada.
    if (
      shouldRecalculateMacroTargets &&
      typeof mergedWeight === 'number' &&
      typeof mergedHeight === 'number' &&
      mergedBirthDate &&
      mergedBiologicalSex &&
      mergedActivityLevel &&
      mergedWeightGoal &&
      mergedGoal
    ) {
      const recalculated = calculateMacroTargets({
        weight: mergedWeight,
        height: mergedHeight,
        birthDate: mergedBirthDate,
        biologicalSex: mergedBiologicalSex,
        activityLevel: mergedActivityLevel,
        goal: mergedGoal,
        weightGoal: mergedWeightGoal,
      });
      recalculatedMacros = recalculated;

      // O valor recalculado prevalece sobre um valor manual de
      // dailyProteinTarget/dailyCalorieTarget/dailyCarbTarget enviado no
      // MESMO request (ex.: weight e dailyProteinTarget juntos no body) —
      // decisão explícita do prompt desta correção, não alterada aqui.
      updates.dailyProteinTarget = recalculated.dailyProteinTarget;
      updates.dailyCalorieTarget = recalculated.dailyCalorieTarget;
      updates.dailyCarbTarget = recalculated.dailyCarbTarget;
      updates.dailyFatTarget = recalculated.dailyFatTarget;
    }

    // Previsão de prazo (targetWeight) — independente de
    // shouldRecalculateMacroTargets, porque depende só de weight/weightGoal/
    // targetWeight já salvos ou recém-patchados, nunca da meta de macro em
    // si. Omitida inteiramente (undefined) se targetWeight não existir.
    const weightTargetEta =
      typeof mergedWeight === 'number' && typeof mergedTargetWeight === 'number' && mergedWeightGoal
        ? calculateWeightTargetEta(mergedWeight, mergedTargetWeight, mergedWeightGoal)
        : undefined;

    // Avisos de edição manual de proteína/calorias/carboidrato/gordura
    // (CP-A.2 Tarefa 6; carboidrato adicionado no CP-A.2.3; gordura nesta
    // correção) — só quando NENHUM campo-gatilho vem no mesmo body. Se
    // viesse, o valor recalculado prevaleceria (ver acima) e o manual nem
    // chegaria a ser salvo — avaliar aqui seria avaliar um valor que não
    // vai pro banco.
    const isManualMacroEdit =
      !shouldRecalculateMacroTargets &&
      (dailyProteinTarget !== undefined ||
        dailyCalorieTarget !== undefined ||
        dailyCarbTarget !== undefined ||
        dailyFatTarget !== undefined);

    let macroEditWarnings: MacroEditWarning[] = [];

    if (isManualMacroEdit) {
      // Mesma lógica/função de BMR+TDEE já existente — não duplicada. Como
      // shouldRecalculateMacroTargets é false aqui, os 7 campos abaixo são
      // exatamente os valores já salvos (mergedX === currentUser.X neste
      // caminho, já que nenhum deles veio no body).
      const currentBmrAndTdee =
        typeof mergedWeight === 'number' &&
        typeof mergedHeight === 'number' &&
        mergedBirthDate &&
        mergedBiologicalSex &&
        mergedActivityLevel &&
        mergedWeightGoal &&
        mergedGoal
          ? calculateMacroTargets({
              weight: mergedWeight,
              height: mergedHeight,
              birthDate: mergedBirthDate,
              biologicalSex: mergedBiologicalSex,
              activityLevel: mergedActivityLevel,
              goal: mergedGoal,
              weightGoal: mergedWeightGoal,
            })
          : null;

      macroEditWarnings = evaluateManualMacroEditWarnings({
        dailyProteinTarget,
        dailyCalorieTarget,
        dailyCarbTarget,
        dailyFatTarget,
        currentWeight: mergedWeight,
        bmr: currentBmrAndTdee?.bmr,
        tdee: currentBmrAndTdee?.tdee,
      });
    }

    // Histórico de peso — uma entrada nova só quando `weight` vem no body E
    // é diferente do valor atualmente salvo (currentUser.weight, de ANTES
    // deste PATCH). `weight !== currentUser.weight` já cobre a primeira
    // definição também, já que undefined !== qualquer número.
    const weightHistoryEntry =
      weight !== undefined && weight !== currentUser.weight
        ? { weight, recordedAt: new Date() }
        : null;

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: updates,
        ...(weightHistoryEntry && { $push: { weightHistory: weightHistoryEntry } }),
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
          email: user.email,
          name: user.name,
          profilePhoto: user.profilePhoto,
          blendiModel: user.blendiModel,
          goal: user.goal,
          weightGoal: user.weightGoal,
          locale: user.locale,
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCalorieTarget: user.dailyCalorieTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyFatTarget:
            user.dailyFatTarget ?? calculateFatTargetFromCalories(user.dailyCalorieTarget),
          dailyHydrationTarget: user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET,
          isPro: user.isPro ?? false,
          longestStreak: user.longestStreak ?? 0,
          weight: user.weight,
          height: user.height,
          targetWeight: user.targetWeight,
          activityLevel: user.activityLevel,
          birthDate: user.birthDate,
          biologicalSex: user.biologicalSex,
          hasRealBodyProfile: user.hasRealBodyProfile ?? false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          ...(recalculatedMacros && {
            imc: recalculatedMacros.imc,
            imcUnit: recalculatedMacros.imcUnit,
            imcClassification: recalculatedMacros.imcClassification,
          }),
          ...(weightTargetEta && { weightTargetEta }),
          ...(macroEditWarnings.length > 0 && { warnings: macroEditWarnings }),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWeightHistory(
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

    const user = await UserModel.findById(userId).select({ weightHistory: 1 }).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    // Ordenado explicitamente por recordedAt ascendente — não confia só na
    // ordem de inserção do $push, embora na prática já saia nessa ordem.
    const weightHistory = [...(user.weightHistory ?? [])].sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
    );

    res.status(200).json({
      success: true,
      data: { weightHistory },
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
    // Stopgap até o CP-B coletar birthDate/biologicalSex/weightGoal numa
    // tela própria do onboarding mobile (ver
    // docs/fixes/cp-a.7-fallback-onboarding-calculate-macros.md). Hoje
    // OnboardingBodyScreen não envia esses 3 campos, e os 3 são obrigatórios
    // em calculateMacrosSchema — sem este fallback, toda chamada real do
    // mobile recebe 400. Um valor realmente enviado no corpo (mesmo
    // diferente do salvo) sempre prevalece; o perfil salvo só entra quando o
    // campo vem undefined.
    const needsProfileFallback =
      req.body?.birthDate === undefined ||
      req.body?.biologicalSex === undefined ||
      req.body?.weightGoal === undefined;

    let body: unknown = req.body;

    if (needsProfileFallback) {
      const userId = req.user?.sub;
      if (!userId) {
        sendUnauthorized(res);
        return;
      }

      const user = await UserModel.findById(userId)
        .select({ birthDate: 1, biologicalSex: 1, weightGoal: 1 })
        .lean();

      if (!user) {
        sendErrorResponse(res, {
          statusCode: 404,
          code: 'resource/not-found',
          message: 'User not found.',
        });
        return;
      }

      body = {
        ...req.body,
        birthDate:
          req.body?.birthDate !== undefined
            ? req.body.birthDate
            : user.birthDate.toISOString().slice(0, 10),
        biologicalSex:
          req.body?.biologicalSex !== undefined ? req.body.biologicalSex : user.biologicalSex,
        weightGoal: req.body?.weightGoal !== undefined ? req.body.weightGoal : user.weightGoal,
      };
    }

    const parsed = calculateMacrosSchema.safeParse(body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { weight, height, birthDate, biologicalSex, activityLevel, goal, weightGoal, targetWeight, unitSystem } =
      parsed.data;

    const metricWeight = unitSystem === 'imperial' ? weight / POUNDS_PER_KILOGRAM : weight;
    const metricHeight = unitSystem === 'imperial' ? height * CENTIMETERS_PER_INCH : height;
    const metricTargetWeight =
      targetWeight === undefined
        ? undefined
        : unitSystem === 'imperial'
          ? targetWeight / POUNDS_PER_KILOGRAM
          : targetWeight;

    const result = calculateMacroTargets({
      weight: metricWeight,
      height: metricHeight,
      birthDate,
      biologicalSex,
      activityLevel,
      goal,
      weightGoal,
    });

    // O fallback de perfil acima (quando usado) cobre só birthDate/
    // biologicalSex/weightGoal — nunca o peso. Por isso a previsão de prazo
    // continua existindo só quando o próprio payload traz targetWeight.
    const weightTargetEta =
      metricTargetWeight === undefined
        ? undefined
        : calculateWeightTargetEta(metricWeight, metricTargetWeight, weightGoal);

    res.status(200).json({
      success: true,
      data: {
        ...result,
        ...(weightTargetEta && { weightTargetEta }),
      },
    });
  } catch (err) {
    next(err);
  }
}