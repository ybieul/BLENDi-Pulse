import type { NextFunction, Request, Response } from 'express';
import {
  AI_REQUEST_BUDGET_MS,
  PANTRY_ALLERGY_CONFIRMATION_REQUIRED_CODE,
  PANTRY_PRO_READ_BURST_LIMIT,
  PANTRY_PRO_READ_BURST_WINDOW_MS,
  PANTRY_PRO_READ_DAILY_LIMIT,
  PANTRY_READS_PER_SCAN,
  PANTRY_READ_TTL_MS,
  pantryAllergyCheckSchema,
  pantryAnalysisResultSchema,
  pantryGenerateSchema,
  pantryIngredientSchema,
  pantryLockedPreviewResultSchema,
  pantryReadResultSchema,
  pantryScanSchema,
  pulseAiRecipeSchema,
  toPulseAiRecipePreview,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PantryLiquidChoice,
  type PantryLockedPreviewResult,
  type PantryReadResult,
  type PantryScanInput,
  type PulseAiRecipe,
  type AllergenSelection,
  type PantryAllergyCheckResult,
  type RecipeUnmetTarget,
  type UserAllergies,
  FREE_PANTRY_SCANS_PER_MONTH,
  FREE_PANTRY_PREVIEWS_PER_CYCLE,
} from '@blendi/shared';
import { addMonths } from 'date-fns';
import mongoose from 'mongoose';
import { ZodError, z } from 'zod';

import { BlendLogModel } from '../models/BlendLog';
import { LOCKED_PREVIEW_TTL_MS_BY_KIND, LockedPreviewModel } from '../models/LockedPreview';
import { PantryReadModel, type IPantryReadIngredient } from '../models/PantryRead';
import {
  UserModel,
  type BlendiModel,
  type BlendiOwnership,
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
  type PantryAlcoholPromptOptions,
} from '../services/promptBuilder.service';
import { INVALID_JSON_RETRY_INSTRUCTION } from '../utils/aiResponseRetry.utils';
import { resolveAlcoholAge, type AlcoholAgeStatus } from '../utils/alcoholAge.utils';
import { detectAlcoholRequest } from '../utils/alcoholRequest.utils';
import {
  findMissingItems,
  findUnselectedItemsUsed,
  hasPhotoLiquid,
  isAlcoholicItemName,
  isBlendSuitable,
  recipeUsesPlainWater,
} from '../utils/pantryRequest.utils';
import { applyRequestCheckNotices, hasLegitimateCapacityNotice, withRequestNotices } from '../utils/recipeNotices.utils';
import {
  REQUESTED_ITEM_MAX_RETRIES,
  extractRequestedFoods,
  findMissingRequestedFoods,
  ingredientSatisfiesRequestedFood,
  requiredRequestedFoods,
  type RequestedFood,
} from '../utils/requestedFoods.utils';
import {
  REQUESTED_TARGET_MAX_RETRIES,
  buildRequestedTargetsRetryMessage,
  findUnmetTargets,
  parseRequestedTargets,
  suggestionForUnmetTarget,
  type RequestedTarget,
} from '../utils/requestedTargets.utils';
import { isSameDayInTimezone } from '../utils/timezone.utils';
import { prepareAiRecipePayload } from '../utils/aiRecipePayload.utils';
import { applyRecipeStepCheck } from '../utils/recipeSteps.utils';
import {
  buildPromptAllergyContext,
  findAllergensInName,
  forbiddenAllergyCodes,
  isEmptySelection,
  mentionsForbiddenAllergen,
  readUserAllergies,
  resolveAllergyRequest,
  withAllergyNotices,
  type AllergyRequestResolution,
} from '../utils/allergyFamilies.utils';
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
  type RecipeRestrictionOptions,
} from '../utils/recipeRestrictions.utils';

// CP-1.1.4b: prévias bloqueadas por ciclo mensal, depois dos scans grátis.
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

// ─── CP-B7: leitura e geração em duas etapas ───────────────────────────────
// Free: teto fixo de leituras por ciclo = (scans + prévia do ciclo) × leituras
// por scan (decisão do Gabriel: fixo, para ninguém ficar preso com scan
// sobrando), e nenhuma leitura sem scan nem prévia restante.
const FREE_CYCLE_READ_LIMIT =
  (FREE_PANTRY_SCANS_PER_MONTH + FREE_PANTRY_PREVIEWS_PER_CYCLE) * PANTRY_READS_PER_SCAN;
const READ_LIMIT_REACHED_CODE = 'scanner/read-limit-reached';
const READ_RATE_LIMITED_CODE = 'scanner/read-rate-limited';
const READ_DAILY_LIMIT_CODE = 'scanner/read-daily-limit';
// Leitura inexistente, de outro usuário, vencida ou já usada: a mesma
// resposta (não revela que um id existe); o app pede uma nova foto.
const READ_EXPIRED_CODE = 'scanner/read-expired';
const INVALID_GENERATE_REQUEST_CODE = 'scanner/invalid-generate-request';
const INVALID_SELECTION_CODE = 'scanner/invalid-selection';
// Mesmo fluxo do Pulse AI (CP-B5): a mesma folha e o mesmo POST
// /pulse-ai/age-confirmation; o app reenvia depois.
const AGE_CONFIRMATION_REQUIRED_CODE = 'scanner/age-confirmation-required';
const ALCOHOL_NOT_ALLOWED_CODE = 'scanner/alcohol-not-allowed';
// Todas as receitas usaram item desmarcado mesmo após a nova tentativa.
const SELECTION_UNMET_CODE = 'scanner/selection-unmet';

// Nomes do líquido escolhido, para não confundir com item desmarcado.
const LIQUID_CHOICE_NAMES: Record<PantryLiquidChoice, readonly string[]> = {
  water: ['water', 'água'],
  milk: ['milk', 'leite'],
  plant_milk: ['milk', 'leite', 'bebida vegetal', 'plant beverage'],
  none: [],
};

interface PantryScannerUserProfile {
  id: string;
  blendiModel: BlendiModel;
  /** CP-B3: 'other'/'none' — limites do Lite, texto da receita sem BLENDi. */
  blendiOwnership: BlendiOwnership;
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
  /** CP-1.1.4b: prévias usadas no ciclo. */
  monthlyScanPreviewUsage: number;
  isPro: boolean;
  /** CP-B7: idade para álcool (mesma resolução do Pulse AI). */
  alcoholAge: AlcoholAgeStatus;
  /** CP-B7 (Pro): leituras no dia e quando o contador foi zerado. */
  pantryReadDayResetDate?: Date;
  /** CP-B6: alergias cadastradas (conta antiga sem o campo = nenhuma). */
  allergies: UserAllergies;
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

// CP-B7: a visão diz se o item serve para shake/smoothie. Ausente ou fora do
// formato (resposta antiga, "true" em texto) = true: nunca derruba a leitura.
const pantryVisionIngredientSchema = pantryIngredientSchema.extend({
  blendSuitable: z.preprocess(
    value => (typeof value === 'boolean' ? value : undefined),
    z.boolean().optional()
  ),
});

// CP-B7: a leitura passou a listar todo alimento e bebida da foto (mais itens
// na resposta). O teto padrão da visão (1000) cortaria o JSON de uma
// geladeira cheia; só a saída usada é cobrada.
const PANTRY_VISION_MAX_TOKENS = 2500;

const pantryVisionAnalysisSchema = z.object({
  ingredients: z.array(pantryVisionIngredientSchema, {
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
    scansUsed: FREE_PANTRY_SCANS_PER_MONTH,
    scansLimit: FREE_PANTRY_SCANS_PER_MONTH,
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
    scansLimit: FREE_PANTRY_SCANS_PER_MONTH,
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
type PantryRestrictionEnforcement =
  | { recipe: PulseAiRecipe; dietOverrideIngredientIndexes: number[]; allergyOverrideKeys: string[]; failure?: undefined }
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
  blendiModel: BlendiModel,
  options: { keepExplicitRequest?: boolean } = {}
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
    // CP-B7: com itens adicionados/pedido, a nova tentativa mantém o que
    // foi pedido (mesma regra do Pulse AI).
    const retryMessage = buildBlenderLimitRetryMessage(initialCheck.violation, prompt.textContext, {
      keepExplicitRequest: options.keepExplicitRequest === true,
    });
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
// CP-B7: `options` traz o pedido explícito (adicionados + pedido) e a
// política de álcool, como no Pulse AI; devolve os índices liberados.
async function ensurePantryRecipeRestrictions(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: Pick<PantryScannerUserProfile, 'dietaryPreferences' | 'blendiModel'>,
  options: RecipeRestrictionOptions = {}
): Promise<PantryRestrictionEnforcement> {
  const initialCheck = validateRecipeRestrictions(recipe, user.dietaryPreferences, user.blendiModel, options);

  if (initialCheck.compliant) {
    return {
      recipe,
      dietOverrideIngredientIndexes: initialCheck.dietOverrideIngredientIndexes ?? [],
      allergyOverrideKeys: initialCheck.allergyOverrideKeys ?? [],
    };
  }

  console.info('[pantryScanner] recipe restriction violated, retrying', {
    violations: summarizeRestrictionViolations(initialCheck.violations),
  });

  try {
    const retryMessage = buildRecipeRestrictionRetryMessage(recipe, initialCheck.violations, {
      genericBlender: prompt.textContext?.genericBlender,
      allergies: options.allergies,
    });
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
      user.blendiModel,
      options
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
      dietOverrideIngredientIndexes: retriedCheck.dietOverrideIngredientIndexes ?? [],
      allergyOverrideKeys: retriedCheck.allergyOverrideKeys ?? [],
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
      blendiOwnership: 1,
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
      monthlyScanPreviewUsage: 1,
      isPro: 1,
      birthDate: 1,
      hasRealBodyProfile: 1,
      alcoholAgeConfirmed: 1,
      pantryReadDayResetDate: 1,
      allergies: 1,
    })
    .lean()
    .exec();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    blendiModel: user.blendiModel as BlendiModel,
    // .lean() não aplica o default do schema — conta antiga sem o campo = BLENDi.
    blendiOwnership: (user.blendiOwnership ?? 'blendi') as BlendiOwnership,
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
    monthlyScanPreviewUsage: user.monthlyScanPreviewUsage ?? 0,
    isPro: user.isPro ?? false,
    alcoholAge: resolveAlcoholAge(user),
    ...(user.pantryReadDayResetDate ? { pantryReadDayResetDate: user.pantryReadDayResetDate } : {}),
    allergies: readUserAllergies(user.allergies),
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
        // CP-B7: as leituras do ciclo também.
        pantryReadCount: 0,
        scanResetDate: nextScanResetDate,
      },
    }
  ).exec();

  return {
    ...user,
    scanCount: 0,
    monthlyScanPreviewUsage: 0,
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
      scanCount: { $lt: FREE_PANTRY_SCANS_PER_MONTH },
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
      scanCount: { $gte: FREE_PANTRY_SCANS_PER_MONTH },
      $or: [
        { monthlyScanPreviewUsage: { $lt: FREE_PANTRY_PREVIEWS_PER_CYCLE } },
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
      scansLimit: FREE_PANTRY_SCANS_PER_MONTH,
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
  /** Descartadas por dieta/gelo no Lite/álcool (CP-1.1.9: para escolher o código de erro). */
  restrictionDiscards: number;
  /** Descartadas por limite físico (volume). */
  blenderLimitDiscards: number;
  /** CP-B7: descartadas porque usaram item desmarcado mesmo após a nova tentativa. */
  selectionDiscards: number;
  /** Perdidas porque a nova tentativa falhou no provedor de IA (não julgadas). */
  aiUnavailableDiscards: number;
}

type PantryDiscardReason = 'restriction' | 'blenderLimit' | 'selection' | 'aiUnavailable';

type PantryRecipeCheck =
  | { recipe: PulseAiRecipe; discardedBy?: undefined }
  | { recipe: null; discardedBy: PantryDiscardReason };

/**
 * CP-B7: o que a pessoa confirmou na tela, já conferido contra a leitura.
 * Os textos são dados da pessoa: nunca vão para o log.
 */
interface PantryUserChoices {
  /** Itens marcados (lidos da foto): disponíveis. */
  selected: PantryIngredient[];
  /** Itens lidos e desmarcados: nunca entram. */
  unselected: string[];
  /** Adicionados à mão: pedido explícito, obrigatórios em todas as receitas. */
  added: string[];
  /** Pedido opcional (mesmas regras do Pulse AI). */
  request?: string;
  /** CP-B7: alimentos citados no pedido (sem negação), cobrados como os adicionados. */
  requestFoods: RequestedFood[];
  /** CP-B7: valores pedidos no pedido ("com 30 g de proteína"). */
  requestTargets: RequestedTarget[];
  /** CP-B8a: o capacityNotice só vale perto do limite do copo deste modelo. */
  blendiModel: BlendiModel;
  liquid?: PantryLiquidChoice;
  alcohol: PantryAlcoholPromptOptions;
  /** Álcool pedido por menor/"Não": receita sem álcool, com aviso. */
  alcoholFreeVersion: boolean;
  /** CP-B6: alergias e o que foi confirmado/recusado nesta geração. */
  allergy: AllergyRequestResolution;
}

function hasExplicitRequest(choices: PantryUserChoices): boolean {
  return choices.added.length > 0 || choices.request !== undefined;
}

/** Texto do pedido explícito para o validador (adicionados + pedido), como a mensagem atual do Pulse AI. */
function buildPantryExplicitRequest(choices: PantryUserChoices): string | undefined {
  const parts = [...choices.added, ...(choices.request ? [choices.request] : [])];
  return parts.length > 0 ? parts.join('. ') : undefined;
}

/** Itens adicionados que precisam estar em cada receita (o alcoólico só quando o álcool é permitido). */
function requiredItemsForCoverage(choices: PantryUserChoices): string[] {
  return choices.alcohol.policy === 'allowed'
    ? choices.added
    : choices.added.filter(item => !isAlcoholicItemName(item));
}

interface PantryChoiceGaps {
  /** Itens adicionados à mão (texto digitado) e alimentos do pedido (termo) que faltam. */
  missingAdded: string[];
  unselectedUsed: string[];
  forbiddenWater: boolean;
}

function findPantryChoiceGaps(recipe: PulseAiRecipe, choices: PantryUserChoices): PantryChoiceGaps {
  const allowedNames = [
    ...choices.selected.map(ingredient => ingredient.name),
    ...choices.added,
    ...(choices.liquid ? LIQUID_CHOICE_NAMES[choices.liquid] : []),
  ];
  // CP-B7: ingrediente que atende a um alimento do pedido é permitido, mesmo
  // desmarcado na leitura (o pedido vence) e em outro idioma.
  const notRequested = {
    ingredients: recipe.ingredients.filter(
      ingredient => !choices.requestFoods.some(food => ingredientSatisfiesRequestedFood(ingredient.name, food))
    ),
  };
  // CP-B7/CP-B8a: pedido que não coube no copo já sai explicado no
  // capacityNotice — só quando o volume confirma (perto do limite).
  const chargeRequested = !hasLegitimateCapacityNotice(recipe, choices.blendiModel);

  return {
    missingAdded: chargeRequested
      ? [
          ...findMissingItems(recipe, requiredItemsForCoverage(choices)),
          ...findMissingRequestedFoods(recipe.ingredients.map(ingredient => ingredient.name), choices.requestFoods)
            .map(food => food.display),
        ]
      : [],
    unselectedUsed: findUnselectedItemsUsed(notRequested, choices.unselected, allowedNames),
    forbiddenWater: choices.liquid === 'none' && recipeUsesPlainWater(recipe),
  };
}

function hasChoiceGaps(gaps: PantryChoiceGaps): boolean {
  return gaps.missingAdded.length > 0 || gaps.unselectedUsed.length > 0 || gaps.forbiddenWater;
}

/** Resumo para log: só contagens, sem nome de ingrediente (dado da pessoa). */
function summarizeChoiceGaps(gaps: PantryChoiceGaps) {
  return {
    missingAdded: gaps.missingAdded.length,
    unselectedUsed: gaps.unselectedUsed.length,
    forbiddenWater: gaps.forbiddenWater,
  };
}

function buildChoiceGapsRetryMessage(gaps: PantryChoiceGaps): string {
  return [
    "Your previous recipe does not follow the user's choices.",
    ...(gaps.missingAdded.length > 0
      ? [
          `It is missing these required items the user added by hand or asked for: ${JSON.stringify(gaps.missingAdded)}. Every recipe must contain every required item, in the requested amount or a sensible amount for one serving. When the ingredient name differs from what the user typed, add the typed name in parentheses, for example "Pasta de amendoim (peanut butter)".`,
        ]
      : []),
    ...(gaps.unselectedUsed.length > 0
      ? [
          `It uses items the user unchecked, which are not available: ${JSON.stringify(gaps.unselectedUsed)}. Remove them and use only the available ingredients.`,
        ]
      : []),
    ...(gaps.forbiddenWater
      ? ['It uses water, but the user has no liquid: remove the water and make a thick, creamy recipe that still blends.']
      : []),
    'Keep the recipe idea and keep it within the cup volume, then return the corrected recipe with the macros recalculated from the new quantities.',
  ].join(' ');
}

type PantryChoiceEnforcement =
  | { recipe: PulseAiRecipe; attempts: number; failure?: undefined }
  | { recipe: null; failure: 'selection' | 'aiUnavailable' };

/**
 * CP-B7: conferência das escolhas da pessoa, antes das outras (os retries
 * de volume, macros e dieta conversam com a receita já corrigida). A
 * primeira nova tentativa vale para qualquer escolha não seguida; enquanto
 * faltar item adicionado ou pedido, até REQUESTED_ITEM_MAX_RETRIES (antes do
 * CP-B7, uma). Item que ainda faltar segue para o aviso da conferência
 * final; item desmarcado que persiste descarta a receita ("desmarcado nunca
 * entra").
 */
async function ensurePantryUserChoices(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  choices: PantryUserChoices
): Promise<PantryChoiceEnforcement> {
  let current = recipe;
  let gaps = findPantryChoiceGaps(current, choices);
  let attempts = 0;

  while (hasChoiceGaps(gaps) && attempts < REQUESTED_ITEM_MAX_RETRIES && (attempts === 0 || gaps.missingAdded.length > 0)) {
    attempts += 1;
    console.info('[pantryScanner] user choices not followed, retrying', { ...summarizeChoiceGaps(gaps), attempt: attempts });

    try {
      const retryResponse = await callAi({
        systemPrompt: prompt.systemPrompt,
        messages: buildPantryRecipeRetryMessages(prompt, current, buildChoiceGapsRetryMessage(gaps)),
        maxTokens: 2000,
      });
      const retryParse = parsePantryRecipe(retryResponse.content);

      if (retryParse.status !== 'ok') {
        console.warn(
          '[pantryScanner] user choices retry returned an invalid recipe',
          describeRetryParseFailure(retryResponse.content, retryParse)
        );
        return gaps.unselectedUsed.length > 0 ? { recipe: null, failure: 'selection' } : { recipe: current, attempts };
      }

      current = retryParse.recipe;
      gaps = findPantryChoiceGaps(current, choices);
    } catch (error) {
      console.error('[pantryScanner] user choices retry failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      return gaps.unselectedUsed.length > 0 ? { recipe: null, failure: 'aiUnavailable' } : { recipe: current, attempts };
    }
  }

  if (gaps.unselectedUsed.length > 0) {
    console.warn('[pantryScanner] unchecked item still used after retry, discarding', summarizeChoiceGaps(gaps));
    return { recipe: null, failure: 'selection' };
  }

  return { recipe: current, attempts };
}

function pantryUnmetTargetsOf(recipe: PulseAiRecipe, choices: PantryUserChoices): RecipeUnmetTarget[] {
  if (choices.requestTargets.length === 0 || hasLegitimateCapacityNotice(recipe, choices.blendiModel)) return [];
  return findUnmetTargets(recipe, choices.requestTargets);
}

/**
 * CP-B7: valor pedido no "Algum pedido?" fora da tolerância. Uma nova
 * tentativa pelo mesmo caminho; nunca descarta a receita (o que persistir
 * vira aviso na conferência final).
 */
async function ensurePantryRequestedTargets(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: Pick<PantryScannerUserProfile, 'dietaryPreferences'>,
  choices: PantryUserChoices
): Promise<{ recipe: PulseAiRecipe; attempts: number }> {
  let current = recipe;
  let attempts = 0;

  while (attempts < REQUESTED_TARGET_MAX_RETRIES) {
    const unmet = pantryUnmetTargetsOf(current, choices);
    if (unmet.length === 0) break;

    attempts += 1;
    console.info('[pantryScanner] requested target unmet, retrying', {
      nutrients: unmet.map(item => item.nutrient),
      attempt: attempts,
    });

    try {
      const retryResponse = await callAi({
        systemPrompt: prompt.systemPrompt,
        messages: buildPantryRecipeRetryMessages(
          prompt,
          current,
          buildRequestedTargetsRetryMessage(unmet, {
            dietaryPreferences: user.dietaryPreferences,
            allergies: forbiddenAllergyCodes(choices.allergy),
            format: 'pantry',
          })
        ),
        maxTokens: 2000,
      });
      const retryParse = parsePantryRecipe(retryResponse.content);

      if (retryParse.status !== 'ok') {
        console.warn(
          '[pantryScanner] requested target retry returned an invalid recipe, keeping the last one',
          describeRetryParseFailure(retryResponse.content, retryParse)
        );
        break;
      }

      current = retryParse.recipe;
    } catch (error) {
      console.error('[pantryScanner] requested target retry failed, keeping the last one', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      break;
    }
  }

  return { recipe: current, attempts };
}

/** Provedor e modelo da geração (para o evento de log do aviso). */
interface PantryAiMeta {
  provider?: string;
  model?: string;
}

async function checkPantryRecipe(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: PantryScannerUserProfile,
  choices: PantryUserChoices,
  aiMeta: PantryAiMeta
): Promise<PantryRecipeCheck> {
  const followed = await ensurePantryUserChoices(recipe, prompt, choices);
  if (!followed.recipe) {
    return { recipe: null, discardedBy: followed.failure };
  }

  // CP-B7: valor pedido conferido antes do volume, dos macros e da dieta.
  const targeted = await ensurePantryRequestedTargets(followed.recipe, prompt, user, choices);

  const limited = await ensurePantryRecipeBlenderLimits(targeted.recipe, prompt, user.blendiModel, {
    keepExplicitRequest: hasExplicitRequest(choices),
  });
  if (!limited.recipe) {
    return { recipe: null, discardedBy: limited.failure === 'aiUnavailable' ? 'aiUnavailable' : 'blenderLimit' };
  }

  const macroCheckedRecipe = await ensurePantryRecipeMacroConsistency(limited.recipe, prompt);
  const restricted = await ensurePantryRecipeRestrictions(macroCheckedRecipe, prompt, user, {
    explicitRequest: buildPantryExplicitRequest(choices),
    // CP-B7: a rede de álcool passa a valer no Pantry.
    alcohol: choices.alcohol.policy,
    // CP-B6: alergias (só as confirmadas nesta geração liberadas).
    allergies: choices.allergy.restrictions,
  });
  if (!restricted.recipe) {
    return { recipe: null, discardedBy: restricted.failure === 'aiUnavailable' ? 'aiUnavailable' : 'restriction' };
  }

  // Conferência final: os retries de macros e de restrições refazem a
  // receita e podem passar do limite físico de novo.
  if (!validateBlenderLimits(restricted.recipe, user.blendiModel).withinLimits) {
    console.warn('[pantryScanner] blender limit exceeded after later retries, discarding');
    return { recipe: null, discardedBy: 'blenderLimit' };
  }

  // CP-B7: conferência final das escolhas (os retries refazem a receita).
  const finalGaps = findPantryChoiceGaps(restricted.recipe, choices);
  if (finalGaps.unselectedUsed.length > 0) {
    console.warn('[pantryScanner] unchecked item used after later retries, discarding', summarizeChoiceGaps(finalGaps));
    return { recipe: null, discardedBy: 'selection' };
  }
  if (hasChoiceGaps(finalGaps)) {
    console.warn('[pantryScanner] user choices still not followed, delivering', summarizeChoiceGaps(finalGaps));
  }

  // CP-B7a/CP-B7: pedido explícito nunca some em silêncio — item adicionado
  // ou pedido que faltou e valor pedido não atingido viram aviso no card
  // (só o backend preenche), com a sugestão que respeita a dieta.
  const noticed = applyRequestCheckNotices(
    withAllergyNotices(
      withRequestNotices(restricted.recipe, restricted.dietOverrideIngredientIndexes, choices.alcoholFreeVersion),
      {
        profile: choices.allergy.profile,
        overrideKeys: restricted.allergyOverrideKeys,
        suggestion: choices.allergy.suggestion,
      }
    ),
    {
      origin: 'pantry',
      blendiModel: user.blendiModel,
      missing: finalGaps.missingAdded,
      unmet: pantryUnmetTargetsOf(restricted.recipe, choices).map(unmet => {
        const suggestion = suggestionForUnmetTarget(unmet, user.dietaryPreferences, forbiddenAllergyCodes(choices.allergy));
        return suggestion ? { ...unmet, suggestion } : unmet;
      }),
      itemAttempts: followed.attempts,
      targetAttempts: targeted.attempts,
      provider: aiMeta.provider,
      model: aiMeta.model,
    }
  );

  // CP-B2: checagem objetiva dos passos. Água fora da foto: só quando a
  // pessoa não escolheu o líquido (ou escolheu "Sem líquido" e a água ficou).
  const stepChecked = applyRecipeStepCheck(noticed, user.blendiModel, '[pantryScanner]');
  if (choices.liquid === undefined || choices.liquid === 'none') {
    return { recipe: markWaterNotInPhoto(stepChecked, choices.selected) };
  }

  const { usesWaterNotInPhoto: _ignored, ...withoutWaterMark } = stepChecked;
  void _ignored;
  return { recipe: withoutWaterMark };
}

async function generatePantryRecipes(
  user: PantryScannerUserProfile,
  choices: PantryUserChoices
): Promise<PantryRecipeGeneration> {
  const prompt = buildPantryRecipePrompt({
    blendiModel: user.blendiModel,
    blendiOwnership: user.blendiOwnership,
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
    availableIngredients: choices.selected.map(ingredient => ({
      name: ingredient.name,
      estimatedQuantity: ingredient.estimatedQuantity,
    })),
    requiredItems: choices.added,
    userRequest: choices.request,
    liquid: choices.liquid,
    alcohol: choices.alcohol,
    allergies: buildPromptAllergyContext(choices.allergy),
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
    const aiMeta: PantryAiMeta = { provider: aiResponse.provider, model: aiResponse.model };
    const checkedRecipes = await Promise.all(
      recipes.map(recipe => checkPantryRecipe(recipe, prompt, user, choices, aiMeta))
    );

    const compliantRecipes = checkedRecipes
      .map(check => check.recipe)
      .filter((recipe): recipe is PulseAiRecipe => recipe !== null);
    const countDiscards = (reason: PantryDiscardReason) =>
      checkedRecipes.filter(check => check.discardedBy === reason).length;

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
      restrictionDiscards: countDiscards('restriction'),
      blenderLimitDiscards: countDiscards('blenderLimit'),
      selectionDiscards: countDiscards('selection'),
      aiUnavailableDiscards: countDiscards('aiUnavailable'),
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

// ─── CP-B7: limite de leituras ─────────────────────────────────────────────

type PantryReadReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; code: string; message: string; resetDate?: Date };

// Free: atômico no filtro do findOneAndUpdate — teto do ciclo e pelo menos
// um scan ou a prévia restante. Conta antiga sem o campo conta como 0.
async function reserveFreePantryRead(user: PantryScannerUserProfile): Promise<PantryReadReservation> {
  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      $and: [
        { $or: [{ pantryReadCount: { $lt: FREE_CYCLE_READ_LIMIT } }, { pantryReadCount: { $exists: false } }] },
        {
          $or: [
            { scanCount: { $lt: FREE_PANTRY_SCANS_PER_MONTH } },
            { monthlyScanPreviewUsage: { $lt: FREE_PANTRY_PREVIEWS_PER_CYCLE } },
            { monthlyScanPreviewUsage: { $exists: false } },
          ],
        },
      ],
    },
    { $inc: { pantryReadCount: 1 } },
    { new: true }
  )
    .select({ pantryReadCount: 1 })
    .lean()
    .exec();

  if (!updatedUser) {
    return {
      ok: false,
      code: READ_LIMIT_REACHED_CODE,
      message: 'Pantry Scanner photo reads for this cycle are used up.',
      resetDate: user.scanResetDate,
    };
  }

  return {
    ok: true,
    release: async () => {
      await UserModel.updateOne(
        { _id: user.id, pantryReadCount: { $gt: 0 } },
        { $inc: { pantryReadCount: -1 } }
      ).exec();
    },
  };
}

// Pro: sem limite diário prático. Proteção contra robô: no máximo
// PANTRY_PRO_READ_BURST_LIMIT leituras na janela (o array guarda os horários
// das últimas N em ordem; o mais antigo é o índice 0) e o teto de segurança
// por dia no fuso da conta. Os dois no filtro do mesmo update (atômico).
async function reserveProPantryRead(user: PantryScannerUserProfile): Promise<PantryReadReservation> {
  const now = new Date();

  if (!user.pantryReadDayResetDate || !isSameDayInTimezone(user.pantryReadDayResetDate, now, user.timezone)) {
    await UserModel.updateOne(
      {
        _id: user.id,
        ...(user.pantryReadDayResetDate
          ? { pantryReadDayResetDate: user.pantryReadDayResetDate }
          : { pantryReadDayResetDate: { $exists: false } }),
      },
      { $set: { pantryReadDayCount: 0, pantryReadDayResetDate: now } }
    ).exec();
  }

  const windowStart = new Date(now.getTime() - PANTRY_PRO_READ_BURST_WINDOW_MS);
  const oldestIndex = `pantryReadRecent.${PANTRY_PRO_READ_BURST_LIMIT - 1}`;

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: true,
      $and: [
        { $or: [{ pantryReadDayCount: { $lt: PANTRY_PRO_READ_DAILY_LIMIT } }, { pantryReadDayCount: { $exists: false } }] },
        { $or: [{ [oldestIndex]: { $exists: false } }, { 'pantryReadRecent.0': { $lte: windowStart } }] },
      ],
    },
    {
      $inc: { pantryReadDayCount: 1 },
      $push: { pantryReadRecent: { $each: [now], $slice: -PANTRY_PRO_READ_BURST_LIMIT } },
    },
    { new: true }
  )
    .select({ pantryReadDayCount: 1 })
    .lean()
    .exec();

  if (!updatedUser) {
    const current = await UserModel.findById(user.id).select({ pantryReadDayCount: 1 }).lean().exec();
    const dailyCapReached = (current?.pantryReadDayCount ?? 0) >= PANTRY_PRO_READ_DAILY_LIMIT;

    return dailyCapReached
      ? { ok: false, code: READ_DAILY_LIMIT_CODE, message: 'Daily Pantry Scanner photo reads limit reached.' }
      : { ok: false, code: READ_RATE_LIMITED_CODE, message: 'Too many Pantry Scanner photo reads. Wait a moment.' };
  }

  return {
    ok: true,
    release: async () => {
      await UserModel.updateOne(
        { _id: user.id, pantryReadDayCount: { $gt: 0 } },
        { $inc: { pantryReadDayCount: -1 }, $pull: { pantryReadRecent: now } }
      ).exec();
    },
  };
}

function reservePantryRead(user: PantryScannerUserProfile): Promise<PantryReadReservation> {
  return user.isPro ? reserveProPantryRead(user) : reserveFreePantryRead(user);
}

function sendReadLimit(res: Response, reservation: Extract<PantryReadReservation, { ok: false }>): void {
  res.status(429).json({
    success: false,
    code: reservation.code,
    message: reservation.message,
    ...(reservation.resetDate ? { resetDate: reservation.resetDate.toISOString() } : {}),
  });
}

function isNextGenerationPreview(user: PantryScannerUserProfile): boolean {
  return !user.isPro && user.scanCount >= FREE_PANTRY_SCANS_PER_MONTH;
}

function buildPantryReadResult(params: {
  user: PantryScannerUserProfile;
  readId?: string;
  readExpiresAt?: Date;
  ingredients: IPantryReadIngredient[];
  hasLiquid: boolean;
  noFoodDetected: boolean;
  noUsableIngredients?: boolean;
  analysisNotes?: string;
}): PantryReadResult {
  return pantryReadResultSchema.parse({
    ...(params.readId && params.readExpiresAt
      ? { readId: params.readId, readExpiresAt: params.readExpiresAt.toISOString() }
      : {}),
    ingredients: params.ingredients.map(ingredient => {
      // CP-B6: pelas alergias de AGORA (o generate confere de novo).
      const allergens = findAllergensInName(ingredient.name, params.user.allergies);
      return {
        name: ingredient.name,
        ...(ingredient.estimatedQuantity ? { estimatedQuantity: ingredient.estimatedQuantity } : {}),
        confidence: ingredient.confidence,
        isAlcoholic: ingredient.isAlcoholic,
        blendSuitable: isBlendSuitable(ingredient),
        ...(!isEmptySelection(allergens) ? { isAllergen: true, allergens } : {}),
      };
    }),
    hasLiquid: params.hasLiquid,
    noFoodDetected: params.noFoodDetected,
    ...(params.noUsableIngredients ? { noUsableIngredients: true } : {}),
    ...(params.analysisNotes ? { analysisNotes: params.analysisNotes } : {}),
    alcoholAge: params.user.alcoholAge,
    nextGenerationIsPreview: isNextGenerationPreview(params.user),
    scansUsed: params.user.scanCount,
    scansLimit: FREE_PANTRY_SCANS_PER_MONTH,
    resetDate: params.user.scanResetDate.toISOString(),
  });
}

// ─── POST /pantry-scanner/read (CP-B7) ─────────────────────────────────────

/**
 * Lê a foto: só a visão. Não conta scan, não gera receita, não dá XP. Guarda
 * a leitura (nunca a imagem) por PANTRY_READ_TTL_MS. Conta a leitura no
 * limite do plano; falha do provedor devolve a leitura.
 */
export function readPantry(req: Request, res: Response, next: NextFunction): Promise<void> {
  return runWithAiRequestBudget(AI_REQUEST_BUDGET_MS.pantryScannerRead, () =>
    readPantryWithinBudget(req, res, next)
  );
}

async function readPantryWithinBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    console.info('[pantryScanner] read request', {
      mimeType,
      imageSizeKb: calculateImageSizeKb(imageBase64),
    });

    const initialUser = await findPantryScannerUserProfile(userId);

    if (!initialUser) {
      sendUserNotFound(res);
      return;
    }

    const currentUser = await resetScanCycleIfNeeded(initialUser);
    const reservation = await reservePantryRead(currentUser);

    if (!reservation.ok) {
      sendReadLimit(res, reservation);
      return;
    }

    let visionResponseContent: string;

    try {
      const visionResponse = await callVisionAi({
        imageBase64,
        mimeType,
        prompt: buildPantryAnalysisPrompt(currentUser.locale),
        maxTokens: PANTRY_VISION_MAX_TOKENS,
      });

      visionResponseContent = visionResponse.content;
    } catch (error) {
      if (error instanceof AiProviderRequestError) {
        await reservation.release();
        sendPantryAiUnavailable(res);
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
        data: buildPantryReadResult({
          user: currentUser,
          ingredients: [],
          hasLiquid: false,
          noFoodDetected: true,
          analysisNotes: visionAnalysis.analysisNotes,
        }),
      });
      return;
    }

    const usableIngredients: IPantryReadIngredient[] = visionAnalysis.ingredients
      .filter(ingredient => USABLE_CONFIDENCE_LEVELS.has(ingredient.confidence))
      .map(ingredient => ({
        name: ingredient.name,
        ...(ingredient.estimatedQuantity ? { estimatedQuantity: ingredient.estimatedQuantity } : {}),
        confidence: ingredient.confidence,
        // Da lista do validador (com os falsos amigos), nunca da IA.
        isAlcoholic: isAlcoholicItemName(ingredient.name),
        // CP-B7: bebida alcoólica fica sempre na lista principal (desmarcada,
        // com rótulo), nunca em "Outros itens".
        blendSuitable: isAlcoholicItemName(ingredient.name) || ingredient.blendSuitable !== false,
      }));

    if (usableIngredients.length === 0) {
      res.status(200).json({
        success: true,
        data: buildPantryReadResult({
          user: currentUser,
          ingredients: [],
          hasLiquid: false,
          noFoodDetected: false,
          noUsableIngredients: true,
          analysisNotes: visionAnalysis.analysisNotes,
        }),
      });
      return;
    }

    // CP-B7: só os itens de blend contam (água com gás, molho... de "Outros
    // itens" não viram base do shake).
    const hasLiquid = hasPhotoLiquid(usableIngredients.filter(isBlendSuitable));
    const expiresAt = new Date(Date.now() + PANTRY_READ_TTL_MS);
    const read = await PantryReadModel.create({
      userId: currentUser.id,
      ingredients: usableIngredients,
      hasLiquid,
      expiresAt,
    });

    res.status(200).json({
      success: true,
      data: buildPantryReadResult({
        user: currentUser,
        readId: String(read._id),
        readExpiresAt: expiresAt,
        ingredients: usableIngredients,
        hasLiquid,
        noFoodDetected: false,
        analysisNotes: visionAnalysis.analysisNotes,
      }),
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /pantry-scanner/generate (CP-B7) ─────────────────────────────────

function sendReadExpired(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 410,
    code: READ_EXPIRED_CODE,
    message: 'This photo read expired or was already used. Take a new photo.',
  });
}

function normalizeItemKey(name: string): string {
  return name.trim().toLowerCase();
}

function dedupeItems(items: readonly string[]): string[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = normalizeItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generatePantry(req: Request, res: Response, next: NextFunction): Promise<void> {
  return runWithAiRequestBudget(AI_REQUEST_BUDGET_MS.pantryScannerGenerate, () =>
    generatePantryWithinBudget(req, res, next)
  );
}

async function generatePantryWithinBudget(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // CP-1.1.4b: id do dono da prévia reservada e ainda não entregue.
  let heldPreviewUserId: string | null = null;
  // CP-B7: leitura consumida e ainda sem receita entregue — qualquer saída
  // sem receita a devolve (a pessoa tenta de novo sem nova foto).
  let heldReadId: string | null = null;

  const releasePreview = async (): Promise<void> => {
    if (!heldPreviewUserId) {
      return;
    }

    const userIdToRelease = heldPreviewUserId;
    heldPreviewUserId = null;
    await rollbackPantryScanPreview(userIdToRelease);
  };

  const releaseRead = async (): Promise<void> => {
    if (!heldReadId) {
      return;
    }

    const readIdToRelease = heldReadId;
    heldReadId = null;
    await PantryReadModel.updateOne({ _id: readIdToRelease }, { $set: { consumedAt: null } }).exec();
  };

  try {
    const parsed = pantryGenerateSchema.safeParse(req.body);

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: INVALID_GENERATE_REQUEST_CODE,
        message: 'Invalid Pantry Scanner generate request.',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const { readId, liquid, request, allergyOverride, allergyDeclined } = parsed.data;

    if (!mongoose.isValidObjectId(readId)) {
      sendReadExpired(res);
      return;
    }

    const initialUser = await findPantryScannerUserProfile(userId);

    if (!initialUser) {
      sendUserNotFound(res);
      return;
    }

    const currentUser = await resetScanCycleIfNeeded(initialUser);

    // Dono, validade e "ainda não usada" no próprio filtro: leitura de outro
    // usuário, vencida (o TTL do Mongo pode levar ~1 min) ou já usada cai no
    // mesmo 410.
    const read = await PantryReadModel.findOne({
      _id: readId,
      userId: currentUser.id,
      expiresAt: { $gt: new Date() },
      consumedAt: null,
    })
      .lean()
      .exec();

    if (!read) {
      sendReadExpired(res);
      return;
    }

    // `selected` só aceita itens da leitura: o app não injeta ingrediente
    // como "lido da foto".
    const readByKey = new Map(read.ingredients.map(ingredient => [normalizeItemKey(ingredient.name), ingredient]));
    const selectedKeys = new Set(parsed.data.selected.map(normalizeItemKey));

    if ([...selectedKeys].some(key => !readByKey.has(key))) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: INVALID_SELECTION_CODE,
        message: 'Selected items must come from the photo read.',
      });
      return;
    }

    const selectedRead = read.ingredients.filter(ingredient => selectedKeys.has(normalizeItemKey(ingredient.name)));
    const unselected = read.ingredients
      .filter(ingredient => !selectedKeys.has(normalizeItemKey(ingredient.name)))
      .map(ingredient => ingredient.name);
    const added = dedupeItems(parsed.data.added).filter(item => !selectedKeys.has(normalizeItemKey(item)));

    // ── Alergias (CP-B6): item marcado ou adicionado que bate com alergia, ou
    // alérgeno citado no pedido, só com a confirmação desta geração. Sem ela,
    // a resposta própria sai ANTES de contar scan, consumir a leitura ou
    // chamar a IA. As alergias são lidas do banco agora (não da leitura).
    const chosenAllergens = [...selectedRead.map(ingredient => ingredient.name), ...added]
      .map(name => findAllergensInName(name, currentUser.allergies))
      .reduce<AllergenSelection>(
        (all, found) => ({ common: [...all.common, ...found.common], custom: [...all.custom, ...found.custom] }),
        { common: [], custom: [] }
      );
    const allergy = resolveAllergyRequest({
      profile: currentUser.allergies,
      text: request ?? '',
      chosen: chosenAllergens,
      override: allergyOverride,
      declined: allergyDeclined,
      language: currentUser.locale,
    });

    if (!isEmptySelection(allergy.unresolved)) {
      // Sem o alérgeno no log (dado de saúde).
      console.info('[pantryScanner] allergen chosen or requested without confirmation, asking');
      sendErrorResponse(res, {
        statusCode: 428,
        code: PANTRY_ALLERGY_CONFIRMATION_REQUIRED_CODE,
        message: 'Allergy confirmation is required for this request.',
        data: { allergens: allergy.unresolved },
      });
      return;
    }

    // ── Álcool (CP-B5 no Pantry): decisão = pedido de álcool no texto OU item
    // alcoólico marcado/adicionado. A pergunta de idade sai ANTES de contar
    // scan e de chamar a IA.
    const alcoholicSelected = selectedRead.filter(ingredient => ingredient.isAlcoholic);
    const alcoholicAdded = added.filter(isAlcoholicItemName);
    const requestDecision = request ? detectAlcoholRequest(request, currentUser.locale) : 'no';
    const alcoholRequested =
      requestDecision === 'yes' || alcoholicSelected.length > 0 || alcoholicAdded.length > 0;

    console.info('[pantryScanner] generate request', {
      selected: selectedRead.length,
      unselected: unselected.length,
      added: added.length,
      hasRequest: request !== undefined,
      liquid: liquid ?? 'unset',
      hasLiquid: read.hasLiquid,
      alcoholDecision: requestDecision,
      alcoholRequested,
      alcoholAge: currentUser.alcoholAge,
    });

    if (alcoholRequested && currentUser.alcoholAge === 'unknown') {
      sendErrorResponse(res, {
        statusCode: 428,
        code: AGE_CONFIRMATION_REQUIRED_CODE,
        message: 'Age confirmation is required for this request.',
      });
      return;
    }

    if (alcoholicSelected.length > 0 && currentUser.alcoholAge === 'under-age') {
      sendErrorResponse(res, {
        statusCode: 403,
        code: ALCOHOL_NOT_ALLOWED_CODE,
        message: 'Alcoholic items are not available for this account.',
      });
      return;
    }

    const alcoholAllowed = alcoholRequested && currentUser.alcoholAge === 'of-age';
    const choices: PantryUserChoices = {
      selected: selectedRead.map(ingredient => ({
        name: ingredient.name,
        ...(ingredient.estimatedQuantity ? { estimatedQuantity: ingredient.estimatedQuantity } : {}),
        confidence: ingredient.confidence,
      })),
      unselected,
      added,
      ...(request ? { request } : {}),
      // CP-B7: alimento e valor pedidos no "Algum pedido?" são conferidos
      // como no Pulse AI (álcool só quando permitido; gelo nunca no Lite).
      // CP-B6: alérgeno pedido e não confirmado não é cobrado.
      requestFoods: request
        ? requiredRequestedFoods(extractRequestedFoods(request), {
            blendiModel: currentUser.blendiModel,
            alcoholAllowed: alcoholAllowed,
          }).filter(food => !mentionsForbiddenAllergen(food.display, allergy.restrictions))
        : [],
      requestTargets: parseRequestedTargets(request),
      blendiModel: currentUser.blendiModel,
      ...(liquid ? { liquid } : {}),
      alcohol: {
        policy: alcoholAllowed ? 'allowed' : 'forbidden',
        requested: alcoholRequested,
        inEveryRecipe: alcoholicAdded.length > 0 || requestDecision === 'yes',
      },
      alcoholFreeVersion: alcoholRequested && currentUser.alcoholAge === 'under-age',
      allergy,
    };
    // O que a resposta e a prévia mostram como ingredientes: os marcados e os
    // adicionados.
    const deliveredIngredients: PantryIngredient[] = [
      ...choices.selected,
      ...added.map(name => ({ name, confidence: 'high' as const })),
    ];

    // Consome a leitura de forma atômica: dois toques no "Gerar" não geram duas vezes.
    const consumed = await PantryReadModel.findOneAndUpdate(
      { _id: readId, userId: currentUser.id, expiresAt: { $gt: new Date() }, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { new: true }
    )
      .lean()
      .exec();

    if (!consumed) {
      sendReadExpired(res);
      return;
    }

    heldReadId = readId;

    // CP-1.1.4b: grátis com os scans do ciclo esgotados ainda tem 1 prévia
    // bloqueada por ciclo, reservada antes da IA.
    if (isNextGenerationPreview(currentUser)) {
      if (!(await reservePantryScanPreview(currentUser))) {
        await releaseRead();
        sendMonthlyLimitReached(res, currentUser.scanResetDate);
        return;
      }

      heldPreviewUserId = currentUser.id;

      await runPantryPreviewScan({
        res,
        user: currentUser,
        choices,
        deliveredIngredients,
        releasePreview,
        releaseRead,
        read: { readId, expiresAt: read.expiresAt },
        markDelivered: () => {
          heldPreviewUserId = null;
          heldReadId = null;
        },
      });
      return;
    }

    const scanIncrement = await incrementPantryScanCount(currentUser);

    if (scanIncrement.kind === 'user-not-found') {
      await releaseRead();
      sendUserNotFound(res);
      return;
    }

    if (scanIncrement.kind === 'limit-reached') {
      await releaseRead();
      sendMonthlyLimitReached(res, scanIncrement.scanResetDate);
      return;
    }

    const generation = await generatePantryRecipes(currentUser, choices);

    // CP-B1: a IA falhou na geração — devolve o scan, sem XP, 503.
    if (generation.kind === 'aiUnavailable') {
      await rollbackPantryScanCount(currentUser);
      await releaseRead();
      sendPantryAiUnavailable(res);
      return;
    }

    const { recipes, generatedCount } = generation;

    // CP-1.1.1c: a IA gerou receitas, mas todas foram descartadas mesmo após
    // as novas tentativas. Nada é entregue: devolve o scan e não dá XP.
    if (generatedCount > 0 && recipes.length === 0) {
      await rollbackPantryScanCount(currentUser);
      await releaseRead();
      sendAllRecipesDiscarded(res, generation);
      return;
    }

    // CP-1.1.1d: a geração voltou vazia — 200 sem receitas, scan devolvido,
    // sem XP. CP-B7: a leitura volta e o id segue valendo.
    if (recipes.length === 0) {
      await rollbackPantryScanCount(currentUser);
      await releaseRead();

      sendNoRecipesGenerated(res, {
        readId,
        readExpiresAt: read.expiresAt,
        ingredients: deliveredIngredients,
        scansUsed: Math.max(0, scanIncrement.scanCount - 1),
        resetDate: scanIncrement.scanResetDate,
      });
      return;
    }

    // Receita entregue. Para editar e gerar de novo sem nova foto: uma
    // leitura nova com os mesmos ingredientes e o MESMO vencimento.
    const nextRead = await PantryReadModel.create({
      userId: currentUser.id,
      ingredients: read.ingredients,
      hasLiquid: read.hasLiquid,
      expiresAt: read.expiresAt,
    });
    heldReadId = null;

    const xpResult = await triggerPantryScannerXP(currentUser.id, currentUser.timezone);
    triggerPantryScannerMissionProgress(currentUser.id, currentUser.timezone);

    res.status(200).json({
      success: true,
      data: {
        ...buildPantryAnalysisResult({
          ingredients: deliveredIngredients,
          recipes,
          noFoodDetected: false,
          scansUsed: scanIncrement.scanCount,
          resetDate: scanIncrement.scanResetDate,
        }),
        readId: String(nextRead._id),
        readExpiresAt: read.expiresAt.toISOString(),
        xpAwarded: xpResult.awarded ? xpResult.amount : 0,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
      },
    });
  } catch (error) {
    // Erro inesperado com a prévia ou a leitura ainda presas: devolve antes
    // de seguir para o handler de erro.
    await releasePreview().catch(rollbackError => {
      console.error('[pantryScanner] failed to roll back the scan preview', {
        errorName: rollbackError instanceof Error ? rollbackError.name : 'UnknownError',
      });
    });
    await releaseRead().catch(rollbackError => {
      console.error('[pantryScanner] failed to release the photo read', {
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
//   CP-1.1.9); CP-B7: se todas caíram por item desmarcado, o código é o
//   da seleção; só quando todas caíram pelo limite físico, o do volume.
function sendAllRecipesDiscarded(res: Response, generation: PantryGeneratedRecipes): void {
  if (generation.aiUnavailableDiscards > 0) {
    sendPantryAiUnavailable(res);
    return;
  }

  if (generation.restrictionDiscards === 0 && generation.selectionDiscards > 0) {
    sendErrorResponse(res, {
      statusCode: 422,
      code: SELECTION_UNMET_CODE,
      message: 'Pantry Scanner could not generate a recipe with only the checked items.',
    });
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
    readId?: string;
    readExpiresAt?: Date;
    ingredients: PantryIngredient[];
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
        noFoodDetected: false,
        scansUsed: params.scansUsed,
        resetDate: params.resetDate,
      }),
      ...(params.readId && params.readExpiresAt
        ? { readId: params.readId, readExpiresAt: params.readExpiresAt.toISOString() }
        : {}),
      xpAwarded: 0,
      leveledUp: false,
      newLevel: null,
    },
  });
}

// CP-1.1.4b: scan de prévia (grátis, scans do ciclo esgotados, prévia
// reservada). Gera as receitas com as mesmas validações, mas não incrementa
// scanCount, não dá XP, não conta para missão e não grava cache. Sem receita
// entregue, devolve a prévia (e a leitura) e responde como o fluxo normal.
// CP-B7: roda na geração, com as escolhas da pessoa; a prévia mostra os
// ingredientes (marcados + adicionados) e só os macros.
async function runPantryPreviewScan(params: {
  res: Response;
  user: PantryScannerUserProfile;
  choices: PantryUserChoices;
  deliveredIngredients: PantryIngredient[];
  releasePreview: () => Promise<void>;
  releaseRead: () => Promise<void>;
  markDelivered: () => void;
  read: { readId: string; expiresAt: Date };
}): Promise<void> {
  const { res, user, choices, deliveredIngredients } = params;
  const releaseAll = async () => {
    await params.releasePreview();
    await params.releaseRead();
  };
  const generation = await generatePantryRecipes(user, choices);

  // CP-B1: a IA falhou na geração — devolve a prévia, 503.
  if (generation.kind === 'aiUnavailable') {
    await releaseAll();
    sendPantryAiUnavailable(res);
    return;
  }

  const { recipes, generatedCount } = generation;

  if (generatedCount > 0 && recipes.length === 0) {
    await releaseAll();
    sendAllRecipesDiscarded(res, generation);
    return;
  }

  if (recipes.length === 0) {
    await releaseAll();
    sendNoRecipesGenerated(res, {
      readId: params.read.readId,
      readExpiresAt: params.read.expiresAt,
      ingredients: deliveredIngredients,
      scansUsed: user.scanCount,
      resetDate: user.scanResetDate,
    });
    return;
  }

  const preview = await deliverPantryLockedPreview({
    userId: user.id,
    ingredients: deliveredIngredients,
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

// ─── POST /pantry-scanner/allergy-check (CP-B6) ────────────────────────────

/**
 * Confere, na hora de adicionar à mão, se o item bate com uma alergia
 * cadastrada — as mesmas famílias do backend (o app não tem uma segunda
 * lógica). Não chama IA, não conta scan nem leitura e não grava nada. A
 * geração confere de novo (a resposta daqui é só para abrir a folha na hora).
 */
export async function checkPantryAllergy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = pantryAllergyCheckSchema.safeParse(req.body);

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: INVALID_GENERATE_REQUEST_CODE,
        message: 'Invalid Pantry Scanner allergy check.',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId).select({ allergies: 1 }).lean().exec();

    if (!user) {
      sendUserNotFound(res);
      return;
    }

    const allergens = findAllergensInName(parsed.data.item, readUserAllergies(user.allergies));
    const data: PantryAllergyCheckResult = { isAllergen: !isEmptySelection(allergens), allergens };

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
