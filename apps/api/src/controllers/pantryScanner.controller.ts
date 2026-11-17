import type { NextFunction, Request, Response } from 'express';
import {
  AI_REQUEST_BUDGET_MS,
  pantryAnalysisResultSchema,
  pantryIngredientSchema,
  pantryLockedPreviewResultSchema,
  pantryScanSchema,
  pulseAiRecipeSchema,
  toPulseAiRecipePreview,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PantryLockedPreviewResult,
  type PantryScanInput,
  type PulseAiRecipe,
} from '@blendi/shared';
import { addMonths } from 'date-fns';
import mongoose from 'mongoose';
import { ZodError, z } from 'zod';

import { BlendLogModel } from '../models/BlendLog';
import { LOCKED_PREVIEW_TTL_MS_BY_KIND, LockedPreviewModel } from '../models/LockedPreview';
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
import { runWithAiRequestBudget } from '../services/aiRequestBudget.service';
import { updateMissionProgress } from '../services/missionProgress.service';
import { awardXP, type AwardXPResult } from '../services/xp.service';
import { buildPantryAnalysisPrompt } from '../services/pantryPromptBuilder.service';
import {
  buildPantryRecipePrompt,
  type BuildPulseAiPromptResult,
} from '../services/promptBuilder.service';
import { INVALID_JSON_RETRY_INSTRUCTION } from '../utils/aiResponseRetry.utils';
import { prepareAiRecipePayload } from '../utils/aiRecipePayload.utils';
import { applyRecipeStepCheck } from '../utils/recipeSteps.utils';
import { markWaterNotInPhoto } from '../utils/recipeWater.utils';
import { sendErrorResponse } from '../utils/error.utils';
import {
  buildBlenderLimitRetryMessage,
  summarizeBlenderLimitViolation,
  validateBlenderLimits,
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
// CP-1.1.4b: prévias bloqueadas por ciclo mensal, depois dos scans grátis.
const FREE_MONTHLY_SCAN_PREVIEW_LIMIT = 1;
const LOCKED_PREVIEW_KIND = 'pantry_scanner';
const PREVIEW_NOT_FOUND_CODE = 'scanner/preview-not-found';
const PREVIEW_LOCKED_CODE = 'scanner/preview-locked';
const DIETARY_RESTRICTION_UNMET_CODE = 'scanner/dietary-restriction-unmet';
// CP-1.1.9: todas as receitas passaram do limite físico do BLENDi mesmo após o retry.
const BLENDER_LIMIT_UNMET_CODE = 'scanner/blender-limit-unmet';
// CP-B1: o prompt pede 2 receitas e aceita 1 quando os ingredientes não dão
// para 2; mais que isso é resposta fora do formato.
const PANTRY_RECIPE_COUNT = 2;
// CP-B1: código e texto que o app já mostra para "IA indisponível" no Pantry.
const AI_UNAVAILABLE_CODE = 'scanner/vision-unavailable';
// CP-B1: o system prompt do Pantry exige um array; as novas tentativas por
// receita (limite, macros, dieta) pedem a receita corrigida, e a IA ora
// respondia em objeto, ora no array do system prompt — que era descartado.
// Agora o formato é dito explicitamente, e o parser aceita os dois.
const PANTRY_SINGLE_RECIPE_RETRY_FORMAT_INSTRUCTION =
  'Return only this one corrected recipe, as a JSON array containing exactly 1 recipe object with the same structure.';
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

// CP-B1: motivo do resultado da leitura da resposta da IA, para log e para
// decidir a nova tentativa. Nunca carrega o conteúdo da receita — só o
// caminho e o código do primeiro erro do Zod.
type PantryRecipesParseResult =
  | { status: 'ok'; recipes: PulseAiRecipe[]; invalidCount: number; issuePath?: string }
  | { status: 'empty' }
  | { status: 'invalid-json' }
  | { status: 'invalid-schema'; issuePath: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeZodIssue(error: ZodError, prefix?: string): string {
  const issue = error.issues[0];
  const path = [...(prefix !== undefined ? [prefix] : []), ...(issue?.path ?? [])].join('.');

  return `${path || 'root'} (${issue?.code ?? 'unknown'})`;
}

// Lista de receitas da resposta: array direto (o formato do prompt), o
// envelope { recipes: [...] } ou uma receita solta (objeto) — os dois últimos
// aceitos como sempre foram/como a nova tentativa pode responder.
function extractPantryRecipeList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isPlainObject(payload)) {
    if (Array.isArray(payload.recipes)) {
      return payload.recipes;
    }

    return 'recipes' in payload ? null : [payload];
  }

  return null;
}

/**
 * Lê a resposta da geração do Pantry. Cada receita é validada sozinha: uma
 * receita boa não se perde porque a outra veio fora do schema (CP-B1). Só
 * quando nenhuma é válida o resultado é 'invalid-schema' (→ nova tentativa).
 */
function parsePantryRecipes(content: string): PantryRecipesParseResult {
  let payload: unknown;

  try {
    payload = JSON.parse(content);
  } catch {
    return { status: 'invalid-json' };
  }

  const list = extractPantryRecipeList(payload);

  if (!list) {
    return { status: 'invalid-schema', issuePath: 'root (invalid_type)' };
  }

  if (list.length === 0) {
    return { status: 'empty' };
  }

  if (list.length > PANTRY_RECIPE_COUNT) {
    return { status: 'invalid-schema', issuePath: 'root (too_big)' };
  }

  const recipes: PulseAiRecipe[] = [];
  let firstIssuePath: string | undefined;

  list.forEach((item, index) => {
    const parsed = pulseAiRecipeSchema.safeParse(prepareAiRecipePayload(item));

    if (parsed.success) {
      recipes.push(parsed.data);
    } else {
      firstIssuePath ??= describeZodIssue(parsed.error, String(index));
    }
  });

  if (recipes.length === 0) {
    return { status: 'invalid-schema', issuePath: firstIssuePath ?? 'root' };
  }

  return {
    status: 'ok',
    recipes,
    invalidCount: list.length - recipes.length,
    ...(firstIssuePath ? { issuePath: firstIssuePath } : {}),
  };
}

function logPantryRecipesParse(
  attempt: number,
  content: string,
  result: PantryRecipesParseResult
): void {
  const details = {
    attempt,
    reason: result.status,
    responseLength: content.length,
    ...(result.status === 'ok'
      ? { recipeCount: result.recipes.length, invalidCount: result.invalidCount }
      : {}),
    ...('issuePath' in result && result.issuePath ? { issuePath: result.issuePath } : {}),
  };

  if (result.status === 'ok' && result.invalidCount === 0) {
    console.info('[pantryScanner] recipe generation parsed', details);
    return;
  }

  console.warn('[pantryScanner] recipe generation parsed with issues', details);
}

type PantryRecipeParseResult =
  | { status: 'ok'; recipe: PulseAiRecipe }
  | { status: 'invalid-json' }
  | { status: 'invalid-schema'; issuePath: string };

/**
 * Lê a resposta de uma nova tentativa por receita (limite, macros, dieta).
 * CP-B1: aceita o objeto da receita OU um array com exatamente 1 receita (o
 * formato que a nova tentativa pede e que o system prompt do Pantry exige) —
 * antes só o objeto, e a resposta em array era descartada.
 */
function parsePantryRecipe(content: string): PantryRecipeParseResult {
  let payload: unknown;

  try {
    payload = JSON.parse(content);
  } catch {
    return { status: 'invalid-json' };
  }

  const list = extractPantryRecipeList(payload);

  if (!list || list.length !== 1) {
    return {
      status: 'invalid-schema',
      issuePath: `root (${list ? `array of ${list.length}` : 'invalid_type'})`,
    };
  }

  const parsed = pulseAiRecipeSchema.safeParse(prepareAiRecipePayload(list[0]));

  return parsed.success
    ? { status: 'ok', recipe: parsed.data }
    : { status: 'invalid-schema', issuePath: describeZodIssue(parsed.error) };
}

function describeRetryParseFailure(
  content: string,
  result: Exclude<PantryRecipeParseResult, { status: 'ok' }>
) {
  return {
    reason: result.status,
    responseLength: content.length,
    ...(result.status === 'invalid-schema' ? { issuePath: result.issuePath } : {}),
  };
}

// Conversa da nova tentativa de uma receita: a receita como turno da IA e o
// pedido de correção + o formato de resposta (CP-B1) como turno do usuário.
function buildPantryRecipeRetryMessages(
  prompt: BuildPulseAiPromptResult,
  recipe: PulseAiRecipe,
  retryMessage: string
): BuildPulseAiPromptResult['messages'] {
  return [
    ...prompt.messages,
    { role: 'assistant', content: JSON.stringify(recipe) },
    { role: 'user', content: `${retryMessage} ${PANTRY_SINGLE_RECIPE_RETRY_FORMAT_INSTRUCTION}` },
  ];
}

// Resultado das verificações que podem descartar uma receita (CP-1.1.9):
// 'unmet' = a receita refeita continua fora da regra (ou veio inválida);
// 'aiUnavailable' = a nova tentativa falhou no provedor de IA (a receita não
// foi julgada).
type PantryEnforcementFailure = 'unmet' | 'aiUnavailable';
type PantryRecipeEnforcement =
  | { recipe: PulseAiRecipe; failure?: undefined }
  | { recipe: null; failure: PantryEnforcementFailure };

// Limite físico do BLENDi (CP-B2: só o volume — blenderGuardrail.utils.ts),
// mesma rede de segurança das receitas do chat do Pulse AI
// (pulseAi.controller.ts, ensureBlenderGuardrail), por receita: um único
// retry (callAi direto, maxTokens 2000). CP-1.1.9: se continuar acima do
// limite (ou vier inválida), a receita é descartada ('unmet') — antes seguia
// mesmo acima do limite; se o retry falhar no provedor, 'aiUnavailable'.
async function ensurePantryRecipeBlenderLimits(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  blendiModel: BlendiModel
): Promise<PantryRecipeEnforcement> {
  const initialCheck = validateBlenderLimits(recipe, blendiModel);

  if (initialCheck.withinLimits) {
    return { recipe };
  }

  console.info('[pantryScanner] blender limit exceeded, retrying', {
    blendiModel,
    violation: summarizeBlenderLimitViolation(initialCheck.violation),
  });

  try {
    const retryMessage = buildBlenderLimitRetryMessage(initialCheck.violation);
    const retryResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: buildPantryRecipeRetryMessages(prompt, recipe, retryMessage),
      maxTokens: 2000,
    });
    const retryParse = parsePantryRecipe(retryResponse.content);

    if (retryParse.status !== 'ok') {
      console.warn(
        '[pantryScanner] blender limit retry returned an invalid recipe, discarding',
        describeRetryParseFailure(retryResponse.content, retryParse)
      );
      return { recipe: null, failure: 'unmet' };
    }

    const retriedRecipe = retryParse.recipe;

    const retriedCheck = validateBlenderLimits(retriedRecipe, blendiModel);

    if (!retriedCheck.withinLimits) {
      console.warn('[pantryScanner] blender limit still exceeded after retry, discarding', {
        blendiModel,
        violation: summarizeBlenderLimitViolation(retriedCheck.violation),
      });
      return { recipe: null, failure: 'unmet' };
    }

    return { recipe: retriedRecipe };
  } catch (error) {
    console.error('[pantryScanner] blender limit retry failed, discarding', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { recipe: null, failure: 'aiUnavailable' };
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
      messages: buildPantryRecipeRetryMessages(prompt, recipe, retryMessage),
      maxTokens: 2000,
    });
    const retryParse = parsePantryRecipe(retryResponse.content);

    if (retryParse.status !== 'ok') {
      console.warn(
        '[pantryScanner] macro consistency retry returned an invalid recipe, keeping the original',
        describeRetryParseFailure(retryResponse.content, retryParse)
      );
      return { ...recipe, macrosValidated: false };
    }

    const retriedConsistency = validateMacroConsistency(retryParse.recipe);
    return { ...retryParse.recipe, macrosValidated: retriedConsistency.macrosValidated };
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
// do guardrail de volume e da consistência de macros, cujos retries podem
// trazer de volta um ingrediente proibido. Um retry só desta receita, no mesmo
// padrão de ensurePantryRecipeBlenderLimits; se continuar violando (ou o
// retry falhar), a receita é descartada (null).
async function ensurePantryRecipeRestrictions(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: Pick<PantryScannerUserProfile, 'dietaryPreferences' | 'blendiModel'>
): Promise<PantryRecipeEnforcement> {
  const initialCheck = validateRecipeRestrictions(recipe, user.dietaryPreferences, user.blendiModel);

  if (initialCheck.compliant) {
    return { recipe };
  }

  console.info('[pantryScanner] recipe restriction violated, retrying', {
    violations: summarizeRestrictionViolations(initialCheck.violations),
  });

  try {
    const retryMessage = buildRecipeRestrictionRetryMessage(recipe, initialCheck.violations);
    const retryResponse = await callAi({
      systemPrompt: prompt.systemPrompt,
      messages: buildPantryRecipeRetryMessages(prompt, recipe, retryMessage),
      maxTokens: 2000,
    });
    const retryParse = parsePantryRecipe(retryResponse.content);

    if (retryParse.status !== 'ok') {
      console.warn(
        '[pantryScanner] recipe restriction retry returned an invalid recipe, discarding',
        describeRetryParseFailure(retryResponse.content, retryParse)
      );
      return { recipe: null, failure: 'unmet' };
    }

    const retriedRecipe = retryParse.recipe;

    const retriedCheck = validateRecipeRestrictions(
      retriedRecipe,
      user.dietaryPreferences,
      user.blendiModel
    );

    if (!retriedCheck.compliant) {
      console.warn('[pantryScanner] recipe restriction still violated after retry, discarding', {
        violations: summarizeRestrictionViolations(retriedCheck.violations),
      });
      return { recipe: null, failure: 'unmet' };
    }

    return {
      recipe: {
        ...retriedRecipe,
        macrosValidated: validateMacroConsistency(retriedRecipe).macrosValidated,
      },
    };
  } catch (error) {
    console.error('[pantryScanner] recipe restriction retry failed, discarding', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { recipe: null, failure: 'aiUnavailable' };
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
        // CP-1.1.4b: a prévia do ciclo volta junto com os scans.
        monthlyScanPreviewUsage: 0,
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

// CP-1.1.4b: reserva a prévia do ciclo ANTES de chamar a IA de visão. Mesmo
// padrão atômico de reservePulseAiPreview (pulseAi.controller.ts): o filtro do
// findOneAndUpdate garante grátis, scans do ciclo esgotados e prévia ainda
// livre — duas requisições simultâneas não passam juntas. Conta antiga sem o
// campo conta como 0 ($inc cria o campo com 1). Não toca em scanCount.
async function reservePantryScanPreview(user: PantryScannerUserProfile): Promise<boolean> {
  if (user.isPro) {
    return false;
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      scanCount: { $gte: FREE_MONTHLY_SCAN_LIMIT },
      $or: [
        { monthlyScanPreviewUsage: { $lt: FREE_MONTHLY_SCAN_PREVIEW_LIMIT } },
        { monthlyScanPreviewUsage: { $exists: false } },
      ],
    },
    {
      $inc: {
        monthlyScanPreviewUsage: 1,
      },
    },
    {
      new: true,
    }
  )
    .select({ monthlyScanPreviewUsage: 1 })
    .lean()
    .exec();

  return Boolean(updatedUser);
}

// Devolve a prévia quando nenhuma receita é entregue. Mesmo padrão de
// rollbackPulseAiPreviewReservation.
async function rollbackPantryScanPreview(userId: string): Promise<void> {
  await UserModel.updateOne(
    {
      _id: userId,
      isPro: false,
      monthlyScanPreviewUsage: { $gt: 0 },
    },
    {
      $inc: {
        monthlyScanPreviewUsage: -1,
      },
    }
  ).exec();
}

// Guarda as receitas inteiras em locked_previews e devolve só a parte visível:
// ingredientes detectados, dados do ciclo e os macros de cada receita. Sem XP,
// sem missão, sem cache, sem scanCount.
async function deliverPantryLockedPreview(params: {
  userId: string;
  ingredients: PantryIngredient[];
  recipes: PulseAiRecipe[];
  scansUsed: number;
  resetDate: Date;
}): Promise<PantryLockedPreviewResult> {
  const expiresAt = new Date(Date.now() + LOCKED_PREVIEW_TTL_MS_BY_KIND[LOCKED_PREVIEW_KIND]);
  const preview = await LockedPreviewModel.create({
    kind: LOCKED_PREVIEW_KIND,
    userId: params.userId,
    content: { recipes: params.recipes },
    context: { ingredients: params.ingredients },
    expiresAt,
  });

  try {
    // O schema estrito é quem define a parte visível: um campo a mais falha
    // aqui, e a prévia órfã é apagada (o caller devolve a reserva).
    return pantryLockedPreviewResultSchema.parse({
      locked: true,
      previewId: String(preview._id),
      previewExpiresAt: expiresAt.toISOString(),
      ingredients: params.ingredients.map(ingredient => ({
        name: ingredient.name,
        ...(ingredient.estimatedQuantity ? { estimatedQuantity: ingredient.estimatedQuantity } : {}),
        confidence: ingredient.confidence,
      })),
      recipes: params.recipes.map(toPulseAiRecipePreview),
      scansUsed: params.scansUsed,
      scansLimit: FREE_MONTHLY_SCAN_LIMIT,
      resetDate: params.resetDate.toISOString(),
    });
  } catch (error) {
    await LockedPreviewModel.deleteOne({ _id: preview._id })
      .exec()
      .catch(cleanupError => {
        console.error('[pantryScanner] failed to delete orphan locked preview', {
          errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
        });
      });
    throw error;
  }
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

// CP-B1: 'aiUnavailable' = a geração falhou no provedor (qualquer exceção da
// chamada) ou voltou fora do formato duas vezes — responde 503, não "sem
// receitas". 'generated' = a IA respondeu (com 0, 1 ou 2 receitas).
type PantryRecipeGeneration =
  | { kind: 'aiUnavailable' }
  | ({ kind: 'generated' } & PantryGeneratedRecipes);

interface PantryGeneratedRecipes {
  /** Receitas conformes, prontas para entregar. */
  recipes: PulseAiRecipe[];
  /** Quantas a IA gerou antes do descarte por restrição. */
  generatedCount: number;
  /** Descartadas por dieta/gelo no Lite (CP-1.1.9: para escolher o código de erro). */
  restrictionDiscards: number;
  /** Descartadas por limite físico (volume). */
  blenderLimitDiscards: number;
  /** Perdidas porque a nova tentativa falhou no provedor de IA (não julgadas). */
  aiUnavailableDiscards: number;
}

type PantryRecipeCheck =
  | { recipe: PulseAiRecipe; discardedBy?: undefined }
  | { recipe: null; discardedBy: 'restriction' | 'blenderLimit' | 'aiUnavailable' };

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

    let parseResult = parsePantryRecipes(aiResponse.content);
    logPantryRecipesParse(1, aiResponse.content, parseResult);

    // CP-B1: JSON ou schema inválido → 1 nova tentativa, no mesmo padrão do
    // Pulse AI (a conversa original + INVALID_JSON_RETRY_INSTRUCTION).
    if (parseResult.status === 'invalid-json' || parseResult.status === 'invalid-schema') {
      const retryResponse = await callAi({
        systemPrompt: prompt.systemPrompt,
        messages: [...prompt.messages, { role: 'user', content: INVALID_JSON_RETRY_INSTRUCTION }],
        maxTokens: PANTRY_RECIPE_MAX_TOKENS,
      });

      parseResult = parsePantryRecipes(retryResponse.content);
      logPantryRecipesParse(2, retryResponse.content, parseResult);

      if (parseResult.status === 'invalid-json' || parseResult.status === 'invalid-schema') {
        console.error('[pantryScanner] recipe generation invalid after retry, responding as unavailable', {
          reason: parseResult.status,
        });
        return { kind: 'aiUnavailable' };
      }
    }

    // 'empty': a IA devolveu array vazio (sem receita possível com esses
    // ingredientes) — segue para a resposta de hoje (200 sem receitas).
    const recipes = parseResult.status === 'ok' ? parseResult.recipes : [];
    const checkedRecipes = await Promise.all(
      recipes.map(async (recipe): Promise<PantryRecipeCheck> => {
        const limited = await ensurePantryRecipeBlenderLimits(recipe, prompt, user.blendiModel);
        if (!limited.recipe) {
          return { recipe: null, discardedBy: limited.failure === 'aiUnavailable' ? 'aiUnavailable' : 'blenderLimit' };
        }

        const macroCheckedRecipe = await ensurePantryRecipeMacroConsistency(limited.recipe, prompt);
        const restricted = await ensurePantryRecipeRestrictions(macroCheckedRecipe, prompt, user);
        if (!restricted.recipe) {
          return { recipe: null, discardedBy: restricted.failure === 'aiUnavailable' ? 'aiUnavailable' : 'restriction' };
        }
        const restrictedRecipe = restricted.recipe;

        // Conferência final: os retries de macros e de restrições refazem a
        // receita e podem passar do limite físico de novo.
        if (!validateBlenderLimits(restrictedRecipe, user.blendiModel).withinLimits) {
          console.warn('[pantryScanner] blender limit exceeded after later retries, discarding');
          return { recipe: null, discardedBy: 'blenderLimit' };
        }

        // CP-B2: checagem objetiva dos passos e a marcação de água fora da foto.
        const stepChecked = applyRecipeStepCheck(restrictedRecipe, user.blendiModel, '[pantryScanner]');
        return { recipe: markWaterNotInPhoto(stepChecked, ingredients) };
      })
    );

    const compliantRecipes = checkedRecipes
      .map(check => check.recipe)
      .filter((recipe): recipe is PulseAiRecipe => recipe !== null);
    const restrictionDiscards = checkedRecipes.filter(check => check.discardedBy === 'restriction').length;
    const blenderLimitDiscards = checkedRecipes.filter(check => check.discardedBy === 'blenderLimit').length;
    const aiUnavailableDiscards = checkedRecipes.filter(check => check.discardedBy === 'aiUnavailable').length;

    if (compliantRecipes.length < recipes.length) {
      console.info('[pantryScanner] recipes discarded by restriction check', {
        generated: recipes.length,
        delivered: compliantRecipes.length,
      });
    }

    return {
      kind: 'generated',
      recipes: compliantRecipes,
      generatedCount: recipes.length,
      restrictionDiscards,
      blenderLimitDiscards,
      aiUnavailableDiscards,
    };
  } catch (error) {
    // CP-B1: falha do provedor na geração (ou na nova tentativa de formato)
    // é "IA indisponível" — antes virava 200 com recipes: [] e o app dizia
    // que não dava para montar receitas com esses ingredientes.
    console.error('[pantryScanner] recipe generation failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { kind: 'aiUnavailable' };
  }
}

// CP-B1: teto de tempo de IA da requisição (visão + geração + novas
// tentativas somadas). Estourado, a chamada seguinte falha como IA
// indisponível (503) e o scan/prévia volta pelos caminhos de hoje.
export function analyzePantry(req: Request, res: Response, next: NextFunction): Promise<void> {
  return runWithAiRequestBudget(AI_REQUEST_BUDGET_MS.pantryScannerAnalyze, () =>
    analyzePantryWithinBudget(req, res, next)
  );
}

async function analyzePantryWithinBudget(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // CP-1.1.4b: id do dono da prévia reservada e ainda não entregue. Enquanto
  // estiver preenchido, qualquer saída sem receita entregue devolve a prévia
  // (releasePreview) — nos caminhos conhecidos antes de responder, e no catch
  // para erros inesperados.
  let heldPreviewUserId: string | null = null;

  const releasePreview = async (): Promise<void> => {
    if (!heldPreviewUserId) {
      return;
    }

    const userIdToRelease = heldPreviewUserId;
    heldPreviewUserId = null;
    await rollbackPantryScanPreview(userIdToRelease);
  };

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
      mimeType,
      imageSizeKb,
    });

    const initialUser = await findPantryScannerUserProfile(userId);

    if (!initialUser) {
      sendUserNotFound(res);
      return;
    }

    const currentUser = await resetScanCycleIfNeeded(initialUser);

    // CP-1.1.4b: grátis com os scans do ciclo esgotados ainda tem 1 prévia
    // bloqueada por ciclo. Reservada aqui, antes da visão: sem prévia livre,
    // o 429 de hoje sai sem chamar a IA.
    const isPreviewScan = !currentUser.isPro && currentUser.scanCount >= FREE_MONTHLY_SCAN_LIMIT;

    if (isPreviewScan) {
      if (!(await reservePantryScanPreview(currentUser))) {
        sendMonthlyLimitReached(res, currentUser.scanResetDate);
        return;
      }

      heldPreviewUserId = currentUser.id;
    }

    let visionResponseContent: string;

    try {
      const visionResponse = await callVisionAi({
        imageBase64,
        mimeType,
        prompt: buildPantryAnalysisPrompt(currentUser.locale),
      });

      visionResponseContent = visionResponse.content;
    } catch (error) {
      if (error instanceof AiProviderRequestError) {
        await releasePreview();
        sendPantryAiUnavailable(res);
        return;
      }

      throw error;
    }

    const visionAnalysis = parsePantryVisionAnalysis(visionResponseContent);

    if (!visionAnalysis) {
      await releasePreview();
      sendErrorResponse(res, {
        statusCode: 500,
        code: 'scanner/vision-parse-error',
        message: 'Pantry Scanner returned an invalid vision response.',
      });
      return;
    }

    if (visionAnalysis.noFoodDetected) {
      await releasePreview();
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
      await releasePreview();
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

    if (isPreviewScan) {
      await runPantryPreviewScan({
        res,
        user: currentUser,
        usableIngredients,
        analysisNotes: visionAnalysis.analysisNotes,
        releasePreview,
        markDelivered: () => {
          heldPreviewUserId = null;
        },
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

    const generation = await generatePantryRecipes(currentUser, usableIngredients);

    // CP-B1: a IA falhou na geração — devolve o scan, sem XP, 503.
    if (generation.kind === 'aiUnavailable') {
      await rollbackPantryScanCount(currentUser);
      sendPantryAiUnavailable(res);
      return;
    }

    const { recipes, generatedCount } = generation;

    // CP-1.1.1c: a IA gerou receitas, mas todas violaram a dieta/gelo no Lite
    // mesmo após o retry. Nada é entregue: devolve o scan e não dá XP.
    // (Geração vazia ou falha da IA — generatedCount 0 — é tratada logo abaixo.)
    if (generatedCount > 0 && recipes.length === 0) {
      await rollbackPantryScanCount(currentUser);
      sendAllRecipesDiscarded(res, generation);
      return;
    }

    // CP-1.1.1d: a geração voltou vazia (generatedCount 0; CP-B1: falha da IA
    // já saiu acima como 503). O app
    // recebe a mesma resposta 200 de antes (recipes: [], xpAwarded: 0), mas o
    // scan é devolvido e não há XP nem progresso de missão — o usuário não
    // recebeu nada por esse scan.
    if (recipes.length === 0) {
      await rollbackPantryScanCount(currentUser);

      sendNoRecipesGenerated(res, {
        ingredients: usableIngredients,
        analysisNotes: visionAnalysis.analysisNotes,
        scansUsed: Math.max(0, scanIncrement.scanCount - 1),
        resetDate: scanIncrement.scanResetDate,
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
    // Erro inesperado com a prévia ainda reservada (ex.: falha ao gravar a
    // prévia): devolve antes de seguir para o handler de erro.
    await releasePreview().catch(rollbackError => {
      console.error('[pantryScanner] failed to roll back the scan preview', {
        errorName: rollbackError instanceof Error ? rollbackError.name : 'UnknownError',
      });
    });
    next(error);
  }
}

// Todas as receitas geradas foram descartadas: o código diz por quê.
// - Alguma se perdeu porque a nova tentativa falhou no provedor de IA: 503
//   scanner/vision-unavailable ("temporariamente indisponível") — tentar de
//   novo pode dar certo; não é culpa da dieta nem do copo.
// - Senão, se alguma caiu pela dieta, o motivo é a dieta (como antes do
//   CP-1.1.9); só quando todas caíram pelo limite físico o código é o novo.
function sendAllRecipesDiscarded(res: Response, generation: PantryGeneratedRecipes): void {
  if (generation.aiUnavailableDiscards > 0) {
    sendPantryAiUnavailable(res);
    return;
  }

  if (generation.restrictionDiscards === 0 && generation.blenderLimitDiscards > 0) {
    sendErrorResponse(res, {
      statusCode: 422,
      code: BLENDER_LIMIT_UNMET_CODE,
      message: 'Pantry Scanner could not generate a recipe within the blender limits.',
    });
    return;
  }

  sendDietaryRestrictionUnmet(res);
}

function sendPantryAiUnavailable(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 503,
    code: AI_UNAVAILABLE_CODE,
    message: 'Pantry Scanner is temporarily unavailable.',
  });
}

function sendDietaryRestrictionUnmet(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 422,
    code: DIETARY_RESTRICTION_UNMET_CODE,
    message: 'Pantry Scanner could not generate a recipe that meets the user restrictions.',
  });
}

function sendNoRecipesGenerated(
  res: Response,
  params: {
    ingredients: PantryIngredient[];
    analysisNotes?: string;
    scansUsed: number;
    resetDate: Date;
  }
): void {
  res.status(200).json({
    success: true,
    data: {
      ...buildPantryAnalysisResult({
        ingredients: params.ingredients,
        recipes: [],
        analysisNotes: params.analysisNotes,
        noFoodDetected: false,
        scansUsed: params.scansUsed,
        resetDate: params.resetDate,
      }),
      xpAwarded: 0,
      leveledUp: false,
      newLevel: null,
    },
  });
}

// CP-1.1.4b: scan de prévia (grátis, scans do ciclo esgotados, prévia
// reservada). Gera as receitas com as mesmas validações de hoje, mas não
// incrementa scanCount, não dá XP, não conta para missão e não grava cache.
// Sem receita entregue, devolve a prévia e responde como o fluxo de hoje.
async function runPantryPreviewScan(params: {
  res: Response;
  user: PantryScannerUserProfile;
  usableIngredients: PantryIngredient[];
  analysisNotes?: string;
  releasePreview: () => Promise<void>;
  markDelivered: () => void;
}): Promise<void> {
  const { res, user, usableIngredients } = params;
  const generation = await generatePantryRecipes(user, usableIngredients);

  // CP-B1: a IA falhou na geração — devolve a prévia, 503.
  if (generation.kind === 'aiUnavailable') {
    await params.releasePreview();
    sendPantryAiUnavailable(res);
    return;
  }

  const { recipes, generatedCount } = generation;

  if (generatedCount > 0 && recipes.length === 0) {
    await params.releasePreview();
    sendAllRecipesDiscarded(res, generation);
    return;
  }

  if (recipes.length === 0) {
    await params.releasePreview();
    sendNoRecipesGenerated(res, {
      ingredients: usableIngredients,
      analysisNotes: params.analysisNotes,
      scansUsed: user.scanCount,
      resetDate: user.scanResetDate,
    });
    return;
  }

  const preview = await deliverPantryLockedPreview({
    userId: user.id,
    ingredients: usableIngredients,
    recipes,
    scansUsed: user.scanCount,
    resetDate: user.scanResetDate,
  });

  params.markDelivered();

  res.status(200).json({
    success: true,
    data: preview,
  });
}

// ─── Desbloqueio de prévia (CP-1.1.4b) ───────────────────────────────────────

const pantryLockedPreviewContentSchema = z.object({
  recipes: z.array(pulseAiRecipeSchema).min(1),
});

const pantryLockedPreviewContextSchema = z.object({
  ingredients: z.array(pantryIngredientSchema),
});

function sendPreviewNotFound(res: Response): void {
  // Mesma resposta para id inválido, inexistente, expirado, de outro usuário
  // ou de outro recurso (kind): não revela que um id existe.
  sendErrorResponse(res, {
    statusCode: 404,
    code: PREVIEW_NOT_FOUND_CODE,
    message: 'Preview not found or expired.',
  });
}

export async function unlockPantryPreview(
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

    const previewId = req.params.id;

    if (typeof previewId !== 'string' || !mongoose.isValidObjectId(previewId)) {
      sendPreviewNotFound(res);
      return;
    }

    const previewObjectId = new mongoose.Types.ObjectId(previewId);

    // Dono, kind e validade no próprio filtro: prévia de outro usuário, do
    // Pulse AI ou expirada (o TTL do Mongo pode levar ~1 min) cai no mesmo 404.
    const preview = await LockedPreviewModel.findOne({
      _id: previewObjectId,
      userId,
      kind: LOCKED_PREVIEW_KIND,
      expiresAt: { $gt: new Date() },
    })
      .lean()
      .exec();

    if (!preview) {
      sendPreviewNotFound(res);
      return;
    }

    // isPro lido do banco agora — nada vindo do app decide o desbloqueio.
    const user = await UserModel.findById(userId).select({ isPro: 1 }).lean().exec();

    if (!user) {
      sendUserNotFound(res);
      return;
    }

    if (user.isPro !== true) {
      sendErrorResponse(res, {
        statusCode: 403,
        code: PREVIEW_LOCKED_CODE,
        message: 'Pulse Pro is required to unlock this preview.',
      });
      return;
    }

    const parsedContent = pantryLockedPreviewContentSchema.safeParse(preview.content);
    const parsedContext = pantryLockedPreviewContextSchema.safeParse(preview.context);

    if (!parsedContent.success || !parsedContext.success) {
      console.error('[pantryScanner] locked preview with invalid content', { previewId });
      sendPreviewNotFound(res);
      return;
    }

    // Sem XP e sem missão: o desbloqueio só entrega o que já foi gerado.
    res.status(200).json({
      success: true,
      data: {
        previewId,
        ingredients: parsedContext.data.ingredients,
        recipes: parsedContent.data.recipes,
      },
    });
  } catch (error) {
    next(error);
  }
}
