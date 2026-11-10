import type { NextFunction, Request, Response } from 'express';
import {
  pantryAnalysisResultSchema,
  pantryIngredientSchema,
  pantryScanSchema,
  pulseAiRecipeSchema,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PantryScanInput,
  type PulseAiRecipe,
} from '@blendi/shared';
import { addMonths } from 'date-fns';
import { ZodError, z } from 'zod';

import { BlendLogModel } from '../models/BlendLog';
import {
  UserModel,
  type BlendiModel,
  type DietaryPreference,
  type UserGoal,
  type UserLocale,
  type UserUnitSystem,
  type WeightGoal,
} from '../models/User';
import {
  AiProviderRequestError,
  callAi,
  callVisionAi,
} from '../services/aiProvider.service';
import { updateMissionProgress } from '../services/missionProgress.service';
import { awardXP, type AwardXPResult } from '../services/xp.service';
import { buildPantryAnalysisPrompt } from '../services/pantryPromptBuilder.service';
import {
  buildPantryRecipePrompt,
  type BuildPulseAiPromptResult,
} from '../services/promptBuilder.service';
import { sendErrorResponse } from '../utils/error.utils';
import {
  buildProteinGuardrailRetryMessage,
  validateProteinGuardrail,
} from '../utils/blenderGuardrail.utils';
import {
  buildMacroInconsistencyRetryMessage,
  validateMacroConsistency,
} from '../utils/macroValidation.utils';
import {
  buildRecipeRestrictionRetryMessage,
  summarizeRestrictionViolations,
  validateRecipeRestrictions,
} from '../utils/recipeRestrictions.utils';

const FREE_MONTHLY_SCAN_LIMIT = 3;
const DIETARY_RESTRICTION_UNMET_CODE = 'scanner/dietary-restriction-unmet';
const PANTRY_RECIPE_COUNT = 2;
// gemini-2.5-flash consome parte do orçamento de saída com "thinking" interno
// antes do JSON visível — 1600 truncava as 2 receitas quase sempre. Testado:
// 4000 ainda truncava, 6000 completou de forma confiável; 7000 dá margem.
const PANTRY_RECIPE_MAX_TOKENS = 7000;
const USABLE_CONFIDENCE_LEVELS = new Set<PantryIngredient['confidence']>(['high', 'medium']);

interface PantryScannerUserProfile {
  id: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  weightGoal?: WeightGoal;
  dietaryPreferences: DietaryPreference[];
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

function sendInvalidContent(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: 'scanner/invalid-content',
    message: 'Invalid image content.',
  });
}

const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff];
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47];

/**
 * Confirma que os bytes reais da imagem — não apenas o `mimeType` declarado
 * pelo cliente — correspondem à assinatura de um JPEG ou PNG válido. Mesma
 * proteção aplicada ao upload de foto de perfil (`user.controller.ts`,
 * achado M8 do diagnóstico de segurança); aqui a imagem nunca é persistida
 * nem servida de volta a nenhum cliente — é processada uma vez pela Vision
 * AI e descartada — então o risco não é XSS armazenado, é abuso de custo/
 * quota: um payload que não é uma imagem de verdade ainda consumiria uma
 * chamada real de IA (e contaria contra o limite mensal de scans) antes de
 * falhar.
 *
 * 16 caracteres base64 (múltiplo de 4 — decodifica sem padding parcial)
 * cobrem os 12 primeiros bytes do arquivo, suficiente para as duas
 * assinaturas verificadas aqui.
 */
function hasValidImageMagicBytes(imageBase64: string, mimeType: PantryScanInput['mimeType']): boolean {
  const headerBytes = Buffer.from(imageBase64.slice(0, 16), 'base64');
  const signature = mimeType === 'image/jpeg' ? JPEG_MAGIC_BYTES : PNG_MAGIC_BYTES;

  return signature.every((byte, index) => headerBytes[index] === byte);
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

async function triggerPantryScannerXP(userId: string, timezone: string): Promise<AwardXPResult> {
  // Aguarda o resultado real do award em vez de disparar fire-and-forget e
  // devolver um valor otimista — sem isso, leveledUp/newLevel nunca chegavam
  // na resposta e a celebração de level up nunca disparava ao escanear a
  // despensa (mesma correção de hydration/supplementStack/favorite.controller.ts).
  return awardXP(userId, 'pantryScanner', timezone);
}

function triggerPantryScannerMissionProgress(userId: string, timezone: string): void {
  Promise.resolve()
    .then(() => updateMissionProgress(userId, 'scanPantry', timezone))
    .catch(err => console.error('Mission update failed:', err));
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

function parsePantryRecipe(content: string): PulseAiRecipe | null {
  try {
    const payload: unknown = JSON.parse(content);
    const parsed = pulseAiRecipeSchema.safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Camada 2 do guardrail físico de proteína (blenderGuardrail.utils.ts), mesma
// rede de segurança já aplicada às receitas do chat do Pulse AI
// (pulseAi.controller.ts, ensureBlenderGuardrail) — aqui replicada por
// receita individual, mesmo padrão de ensurePantryRecipeMacroConsistency
// abaixo (callAi direto, maxTokens 2000, um único retry). Antes desta função,
// o Pantry Scanner nunca rodava essa camada — uma receita podia declarar
// proteína acima do limite físico do blender sem nenhuma correção automática.
async function ensurePantryRecipeProteinGuardrail(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  blendiModel: BlendiModel
): Promise<PulseAiRecipe> {
  const initialGuardrail = validateProteinGuardrail(recipe, blendiModel);

  if (initialGuardrail.withinGuardrail) {
    return recipe;
  }

  console.info('[pantryScanner] protein guardrail exceeded, retrying', {
    blendiModel,
    discrepancy: initialGuardrail.discrepancy,
  });

  try {
    const retryMessage = buildProteinGuardrailRetryMessage(initialGuardrail.discrepancy);
    const retryResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: [
        ...prompt.messages,
        { role: 'assistant', content: JSON.stringify(recipe) },
        { role: 'user', content: retryMessage },
      ],
      maxTokens: 2000,
    });
    const retriedRecipe = parsePantryRecipe(retryResponse.content);

    return retriedRecipe ?? recipe;
  } catch (error) {
    console.error('[pantryScanner] protein guardrail retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return recipe;
  }
}

// Camada 3 de validação matemática de macros (protein×4 + carbs×4 + fat×9 ≈
// calories), mesma rede de segurança já aplicada às receitas do chat do Pulse
// AI (pulseAi.controller.ts, ensureMacroConsistency) — aqui replicada por
// receita individual, já que o Pantry Scanner gera um array de 2 receitas por
// chamada em vez de uma só. Nunca bloqueia o usuário: macrosValidated:false
// ainda é servido, só sinalizado.
async function ensurePantryRecipeMacroConsistency(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult
): Promise<PulseAiRecipe> {
  const initialConsistency = validateMacroConsistency(recipe);

  if (initialConsistency.macrosValidated) {
    return { ...recipe, macrosValidated: true };
  }

  console.info('[pantryScanner] macro inconsistency detected, retrying', {
    discrepancy: initialConsistency.discrepancy,
  });

  try {
    const retryMessage = buildMacroInconsistencyRetryMessage(
      recipe,
      initialConsistency.discrepancy
    );
    const retryResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: [
        ...prompt.messages,
        { role: 'assistant', content: JSON.stringify(recipe) },
        { role: 'user', content: retryMessage },
      ],
      maxTokens: 2000,
    });
    const retriedRecipe = parsePantryRecipe(retryResponse.content);

    if (!retriedRecipe) {
      return { ...recipe, macrosValidated: false };
    }

    const retriedConsistency = validateMacroConsistency(retriedRecipe);
    return { ...retriedRecipe, macrosValidated: retriedConsistency.macrosValidated };
  } catch (error) {
    console.error('[pantryScanner] macro consistency retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { ...recipe, macrosValidated: false };
  }
}

// CP-1.1.1c: validação determinística da dieta e do gelo no Lite
// (recipeRestrictions.utils.ts), por receita, como ÚLTIMA conferência — depois
// do guardrail de proteína e da consistência de macros, cujos retries podem
// trazer de volta um ingrediente proibido. Um retry só desta receita, no mesmo
// padrão de ensurePantryRecipeProteinGuardrail; se continuar violando (ou o
// retry falhar), a receita é descartada (null).
async function ensurePantryRecipeRestrictions(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: Pick<PantryScannerUserProfile, 'dietaryPreferences' | 'blendiModel'>
): Promise<PulseAiRecipe | null> {
  const initialCheck = validateRecipeRestrictions(recipe, user.dietaryPreferences, user.blendiModel);

  if (initialCheck.compliant) {
    return recipe;
  }

  console.info('[pantryScanner] recipe restriction violated, retrying', {
    violations: summarizeRestrictionViolations(initialCheck.violations),
  });

  try {
    const retryMessage = buildRecipeRestrictionRetryMessage(recipe, initialCheck.violations);
    const retryResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: [
        ...prompt.messages,
        { role: 'assistant', content: JSON.stringify(recipe) },
        { role: 'user', content: retryMessage },
      ],
      maxTokens: 2000,
    });
    const retriedRecipe = parsePantryRecipe(retryResponse.content);

    if (!retriedRecipe) {
      console.warn('[pantryScanner] recipe restriction retry returned an invalid recipe, discarding');
      return null;
    }

    const retriedCheck = validateRecipeRestrictions(
      retriedRecipe,
      user.dietaryPreferences,
      user.blendiModel
    );

    if (!retriedCheck.compliant) {
      console.warn('[pantryScanner] recipe restriction still violated after retry, discarding', {
        violations: summarizeRestrictionViolations(retriedCheck.violations),
      });
      return null;
    }

    return {
      ...retriedRecipe,
      macrosValidated: validateMacroConsistency(retriedRecipe).macrosValidated,
    };
  } catch (error) {
    console.error('[pantryScanner] recipe restriction retry failed, discarding', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return null;
  }
}

async function findPantryScannerUserProfile(
  userId: string
): Promise<PantryScannerUserProfile | null> {
  const user = await UserModel.findById(userId)
    .select({
      blendiModel: 1,
      goal: 1,
      weightGoal: 1,
      dietaryPreferences: 1,
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
    weightGoal: user.weightGoal as WeightGoal | undefined,
    // .lean() não aplica o default do schema — conta antiga sem o campo = sem dieta.
    dietaryPreferences: (user.dietaryPreferences ?? []) as DietaryPreference[],
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

// CP-1.1.1c: devolve o scan quando a resposta final é erro por restrição
// (todas as receitas descartadas). Mesmo padrão de
// rollbackPulseAiUsageReservation (pulseAi.controller.ts). Vale também para
// Pro, que incrementa scanCount sem limite.
async function rollbackPantryScanCount(user: PantryScannerUserProfile): Promise<void> {
  await UserModel.updateOne(
    {
      _id: user.id,
      scanCount: { $gt: 0 },
    },
    {
      $inc: {
        scanCount: -1,
      },
    }
  ).exec();
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

interface PantryRecipeGeneration {
  /** Receitas conformes, prontas para entregar. */
  recipes: PulseAiRecipe[];
  /** Quantas a IA gerou antes do descarte por restrição. */
  generatedCount: number;
}

async function generatePantryRecipes(
  user: PantryScannerUserProfile,
  ingredients: PantryIngredient[]
): Promise<PantryRecipeGeneration> {
  const prompt = buildPantryRecipePrompt({
    blendiModel: user.blendiModel,
    goal: user.goal,
    weightGoal: user.weightGoal,
    dietaryPreferences: user.dietaryPreferences,
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

    const recipes = parsePantryRecipes(aiResponse.content);

    const checkedRecipes = await Promise.all(
      recipes.map(async recipe => {
        const proteinGuardedRecipe = await ensurePantryRecipeProteinGuardrail(
          recipe,
          prompt,
          user.blendiModel
        );
        const macroCheckedRecipe = await ensurePantryRecipeMacroConsistency(
          proteinGuardedRecipe,
          prompt
        );
        return ensurePantryRecipeRestrictions(macroCheckedRecipe, prompt, user);
      })
    );

    const compliantRecipes = checkedRecipes.filter(
      (recipe): recipe is PulseAiRecipe => recipe !== null
    );

    if (compliantRecipes.length < recipes.length) {
      console.info('[pantryScanner] recipes discarded by restriction check', {
        generated: recipes.length,
        delivered: compliantRecipes.length,
      });
    }

    return { recipes: compliantRecipes, generatedCount: recipes.length };
  } catch (error) {
    console.error('[pantryScanner] recipe generation failed', {
      userId: user.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { recipes: [], generatedCount: 0 };
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

    if (!hasValidImageMagicBytes(imageBase64, mimeType)) {
      sendInvalidContent(res);
      return;
    }

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

    const { recipes, generatedCount } = await generatePantryRecipes(currentUser, usableIngredients);

    // CP-1.1.1c: a IA gerou receitas, mas todas violaram a dieta/gelo no Lite
    // mesmo após o retry. Nada é entregue: devolve o scan e não dá XP.
    // (Geração vazia ou falha da IA — generatedCount 0 — segue como antes.)
    if (generatedCount > 0 && recipes.length === 0) {
      await rollbackPantryScanCount(currentUser);
      sendErrorResponse(res, {
        statusCode: 422,
        code: DIETARY_RESTRICTION_UNMET_CODE,
        message: 'Pantry Scanner could not generate a recipe that meets the user restrictions.',
      });
      return;
    }

    const xpResult = await triggerPantryScannerXP(currentUser.id, currentUser.timezone);
    triggerPantryScannerMissionProgress(currentUser.id, currentUser.timezone);

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
        xpAwarded: xpResult.awarded ? xpResult.amount : 0,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
      },
    });
  } catch (error) {
    next(error);
  }
}