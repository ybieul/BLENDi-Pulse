import type { NextFunction, Request, Response } from 'express';
import {
  XP_EVENTS,
  pantryAnalysisResultSchema,
  pantryIngredientSchema,
  pantryScanSchema,
  pulseAiRecipeSchema,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PulseAiRecipe,
} from '@blendi/shared';
import { addMonths } from 'date-fns';
import { ZodError, z } from 'zod';

import { BlendLogModel } from '../models/BlendLog';
import {
  UserModel,
  type BlendiModel,
  type UserGoal,
  type UserLocale,
  type UserUnitSystem,
} from '../models/User';
import {
  AiProviderRequestError,
  callAi,
  callVisionAi,
} from '../services/aiProvider.service';
import { awardXP } from '../services/xp.service';
import { buildPantryAnalysisPrompt } from '../services/pantryPromptBuilder.service';
import { buildPantryRecipePrompt } from '../services/promptBuilder.service';
import { sendErrorResponse } from '../utils/error.utils';

const FREE_MONTHLY_SCAN_LIMIT = 3;
const PANTRY_RECIPE_COUNT = 2;
const PANTRY_RECIPE_MAX_TOKENS = 1600;
const USABLE_CONFIDENCE_LEVELS = new Set<PantryIngredient['confidence']>(['high', 'medium']);

interface PantryScannerUserProfile {
  id: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  timezone: string;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  scanCount: number;
  scanResetDate: Date;
  isPro: boolean;
}

type PantryScanIncrementResult =
  | {
      kind: 'ok';
      scanCount: number;
      scanResetDate: Date;
    }
  | {
      kind: 'limit-reached';
      scanResetDate: Date;
    }
  | {
      kind: 'user-not-found';
    };

const pantryVisionAnalysisSchema = z.object({
  ingredients: z.array(pantryIngredientSchema, {
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }),
  analysisNotes: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .optional(),
  noFoodDetected: z
    .boolean({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    })
    .optional()
    .default(false),
});

const pantryRecipeArraySchema = z.array(pulseAiRecipeSchema, {
  required_error: 'errors.validation.required',
  invalid_type_error: 'errors.validation.invalid_option',
}).length(PANTRY_RECIPE_COUNT);

const pantryRecipeWrapperSchema = z.object({
  recipes: pantryRecipeArraySchema,
});

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendUserNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'User not found.',
  });
}

function sendInvalidImage(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: 'scanner/invalid-image',
    message: 'Invalid pantry scan image.',
    errors: formatZodErrors(err),
  });
}

function sendMonthlyLimitReached(res: Response, resetDate: Date): void {
  res.status(429).json({
    success: false,
    code: 'scanner/monthly-limit-reached',
    message: 'Monthly Pantry Scanner limit reached.',
    scansUsed: FREE_MONTHLY_SCAN_LIMIT,
    scansLimit: FREE_MONTHLY_SCAN_LIMIT,
    resetDate: resetDate.toISOString(),
  });
}

function calculateImageSizeKb(imageBase64: string): number {
  return Number((((imageBase64.length * 3) / 4) / 1024).toFixed(1));
}

function triggerPantryScannerXP(userId: string, timezone: string): number {
  Promise.resolve()
    .then(() => awardXP(userId, 'pantryScanner', timezone))
    .catch(err => console.error('XP award failed:', err));

  return XP_EVENTS.pantryScanner;
}

function getNextScanResetDate(scanResetDate: Date, now = new Date()): Date {
  let nextScanResetDate = new Date(scanResetDate);

  while (now.getTime() > nextScanResetDate.getTime()) {
    nextScanResetDate = addMonths(nextScanResetDate, 1);
  }

  return nextScanResetDate;
}

function buildPantryAnalysisResult(params: {
  ingredients: PantryIngredient[];
  recipes: PulseAiRecipe[];
  analysisNotes?: string;
  noFoodDetected: boolean;
  noUsableIngredients?: boolean;
  scansUsed: number;
  resetDate: Date;
}): PantryAnalysisResult {
  return pantryAnalysisResultSchema.parse({
    ingredients: params.ingredients,
    ...(params.analysisNotes ? { analysisNotes: params.analysisNotes } : {}),
    noFoodDetected: params.noFoodDetected,
    ...(params.noUsableIngredients ? { noUsableIngredients: true } : {}),
    recipes: params.recipes,
    scansUsed: params.scansUsed,
    scansLimit: FREE_MONTHLY_SCAN_LIMIT,
    resetDate: params.resetDate.toISOString(),
  });
}

function parsePantryVisionAnalysis(content: string): z.infer<typeof pantryVisionAnalysisSchema> | null {
  try {
    const payload: unknown = JSON.parse(content);
    const parsed = pantryVisionAnalysisSchema.safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parsePantryRecipes(content: string): PulseAiRecipe[] {
  try {
    const payload: unknown = JSON.parse(content);
    const directRecipes = pantryRecipeArraySchema.safeParse(payload);

    if (directRecipes.success) {
      return directRecipes.data;
    }

    const wrappedRecipes = pantryRecipeWrapperSchema.safeParse(payload);

    return wrappedRecipes.success ? wrappedRecipes.data.recipes : [];
  } catch {
    return [];
  }
}

async function findPantryScannerUserProfile(
  userId: string
): Promise<PantryScannerUserProfile | null> {
  const user = await UserModel.findById(userId)
    .select({
      blendiModel: 1,
      goal: 1,
      locale: 1,
      unitSystem: 1,
      timezone: 1,
      dailyProteinTarget: 1,
      dailyCarbTarget: 1,
      dailyCalorieTarget: 1,
      scanCount: 1,
      scanResetDate: 1,
      isPro: 1,
    })
    .lean()
    .exec();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    blendiModel: user.blendiModel as BlendiModel,
    goal: user.goal as UserGoal,
    locale: user.locale as UserLocale,
    unitSystem: user.unitSystem as UserUnitSystem,
    timezone: user.timezone,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCarbTarget: user.dailyCarbTarget ?? 200,
    dailyCalorieTarget: user.dailyCalorieTarget,
    scanCount: user.scanCount ?? 0,
    scanResetDate: user.scanResetDate ?? new Date(),
    isPro: user.isPro ?? false,
  };
}

async function resetScanCycleIfNeeded(
  user: PantryScannerUserProfile
): Promise<PantryScannerUserProfile> {
  if (user.isPro || Date.now() <= user.scanResetDate.getTime()) {
    return user;
  }

  const nextScanResetDate = getNextScanResetDate(user.scanResetDate);

  await UserModel.updateOne(
    {
      _id: user.id,
      isPro: false,
      scanResetDate: user.scanResetDate,
    },
    {
      $set: {
        scanCount: 0,
        scanResetDate: nextScanResetDate,
      },
    }
  ).exec();

  return {
    ...user,
    scanCount: 0,
    scanResetDate: nextScanResetDate,
  };
}

async function incrementPantryScanCount(
  user: PantryScannerUserProfile
): Promise<PantryScanIncrementResult> {
  if (user.isPro) {
    const updatedUser = await UserModel.findByIdAndUpdate(
      user.id,
      {
        $inc: {
          scanCount: 1,
        },
      },
      {
        new: true,
      }
    )
      .select({ scanCount: 1, scanResetDate: 1 })
      .lean()
      .exec();

    if (!updatedUser) {
      return { kind: 'user-not-found' };
    }

    return {
      kind: 'ok',
      scanCount: updatedUser.scanCount ?? user.scanCount + 1,
      scanResetDate: updatedUser.scanResetDate ?? user.scanResetDate,
    };
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      scanCount: { $lt: FREE_MONTHLY_SCAN_LIMIT },
    },
    {
      $inc: {
        scanCount: 1,
      },
    },
    {
      new: true,
    }
  )
    .select({ scanCount: 1, scanResetDate: 1 })
    .lean()
    .exec();

  if (!updatedUser) {
    const existingUser = await UserModel.findById(user.id)
      .select({ scanResetDate: 1 })
      .lean()
      .exec();

    if (!existingUser) {
      return { kind: 'user-not-found' };
    }

    return {
      kind: 'limit-reached',
      scanResetDate: existingUser.scanResetDate ?? user.scanResetDate,
    };
  }

  return {
    kind: 'ok',
    scanCount: updatedUser.scanCount ?? user.scanCount + 1,
    scanResetDate: updatedUser.scanResetDate ?? user.scanResetDate,
  };
}

async function getRecentBlendRecipeNames(userId: string): Promise<string[]> {
  const recentBlendLogs = await BlendLogModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select({ recipeName: 1, _id: 0 })
    .lean()
    .exec();

  return recentBlendLogs.flatMap(log => (log.recipeName ? [log.recipeName] : []));
}

async function generatePantryRecipes(
  user: PantryScannerUserProfile,
  ingredients: PantryIngredient[]
): Promise<PulseAiRecipe[]> {
  const prompt = buildPantryRecipePrompt({
    blendiModel: user.blendiModel,
    goal: user.goal,
    locale: user.locale,
    language: user.locale,
    unitSystem: user.unitSystem,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCarbTarget: user.dailyCarbTarget,
    dailyCalorieTarget: user.dailyCalorieTarget,
    recentBlendRecipeNames: await getRecentBlendRecipeNames(user.id),
    availableIngredients: ingredients.map(ingredient => ({
      name: ingredient.name,
      estimatedQuantity: ingredient.estimatedQuantity,
    })),
  });

  try {
    const aiResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: prompt.messages,
      maxTokens: PANTRY_RECIPE_MAX_TOKENS,
    });

    return parsePantryRecipes(aiResponse.content);
  } catch (error) {
    console.error('[pantryScanner] recipe generation failed', {
      userId: user.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return [];
  }
}

export async function analyzePantry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = pantryScanSchema.safeParse(req.body);

    if (!parsed.success) {
      sendInvalidImage(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const { imageBase64, mimeType } = parsed.data;
    const imageSizeKb = calculateImageSizeKb(imageBase64);

    console.info('[pantryScanner] analyze request', {
      userId,
      mimeType,
      imageSizeKb,
    });

    const initialUser = await findPantryScannerUserProfile(userId);

    if (!initialUser) {
      sendUserNotFound(res);
      return;
    }

    const currentUser = await resetScanCycleIfNeeded(initialUser);

    if (!currentUser.isPro && currentUser.scanCount >= FREE_MONTHLY_SCAN_LIMIT) {
      sendMonthlyLimitReached(res, currentUser.scanResetDate);
      return;
    }

    let visionResponseContent: string;

    try {
      const visionResponse = await callVisionAi({
        imageBase64,
        mimeType,
        prompt: buildPantryAnalysisPrompt(),
      });

      visionResponseContent = visionResponse.content;
    } catch (error) {
      if (error instanceof AiProviderRequestError) {
        sendErrorResponse(res, {
          statusCode: 503,
          code: 'scanner/vision-unavailable',
          message: 'Pantry Scanner is temporarily unavailable.',
        });
        return;
      }

      throw error;
    }

    const visionAnalysis = parsePantryVisionAnalysis(visionResponseContent);

    if (!visionAnalysis) {
      sendErrorResponse(res, {
        statusCode: 500,
        code: 'scanner/vision-parse-error',
        message: 'Pantry Scanner returned an invalid vision response.',
      });
      return;
    }

    if (visionAnalysis.noFoodDetected) {
      res.status(200).json({
        success: true,
        data: buildPantryAnalysisResult({
          ingredients: [],
          recipes: [],
          analysisNotes: visionAnalysis.analysisNotes,
          noFoodDetected: true,
          scansUsed: currentUser.scanCount,
          resetDate: currentUser.scanResetDate,
        }),
      });
      return;
    }

    const usableIngredients = visionAnalysis.ingredients.filter(ingredient => (
      USABLE_CONFIDENCE_LEVELS.has(ingredient.confidence)
    ));

    if (usableIngredients.length === 0) {
      res.status(200).json({
        success: true,
        data: buildPantryAnalysisResult({
          ingredients: [],
          recipes: [],
          analysisNotes: visionAnalysis.analysisNotes,
          noFoodDetected: false,
          noUsableIngredients: true,
          scansUsed: currentUser.scanCount,
          resetDate: currentUser.scanResetDate,
        }),
      });
      return;
    }

    const scanIncrement = await incrementPantryScanCount(currentUser);

    if (scanIncrement.kind === 'user-not-found') {
      sendUserNotFound(res);
      return;
    }

    if (scanIncrement.kind === 'limit-reached') {
      sendMonthlyLimitReached(res, scanIncrement.scanResetDate);
      return;
    }

    const recipes = await generatePantryRecipes(currentUser, usableIngredients);

    const xpAwarded = triggerPantryScannerXP(currentUser.id, currentUser.timezone);

    res.status(200).json({
      success: true,
      data: {
        ...buildPantryAnalysisResult({
          ingredients: usableIngredients,
          recipes,
          analysisNotes: visionAnalysis.analysisNotes,
          noFoodDetected: false,
          scansUsed: scanIncrement.scanCount,
          resetDate: scanIncrement.scanResetDate,
        }),
        xpAwarded,
      },
    });
  } catch (error) {
    next(error);
  }
}