import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  AI_REQUEST_BUDGET_MS,
  ALCOHOL_MIN_AGE_YEARS,
  RECIPE_DIET_OVERRIDE_MAX_ITEMS,
  pulseAiAgeConfirmationSchema,
  pulseAiChatSchema,
  pulseAiRecipeSchema,
  toPulseAiRecipePreview,
  type PulseAiRecipe,
} from '@blendi/shared';
import { ZodError, z } from 'zod';

import { env } from '../config/env';
import { BlendLogModel } from '../models/BlendLog';
import { LOCKED_PREVIEW_TTL_MS_BY_KIND, LockedPreviewModel } from '../models/LockedPreview';
import {
  ConversationModel,
  type IConversation,
  type IConversationMessage,
} from '../models/Conversation';
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
  buildPulseAiPrompt,
  type BuildPulseAiPromptResult,
  type PulseAiApiMessage,
} from '../services/promptBuilder.service';
import {
  AiProviderRequestError,
  callAi,
  type AiProviderResponse,
} from '../services/aiProvider.service';
import {
  deleteFromCache,
  generateCacheKey,
  type AlcoholCacheTier,
  getFromCache,
  invalidateUserCache,
  setInCache,
} from '../services/cache.service';
import { runWithAiRequestBudget } from '../services/aiRequestBudget.service';
import { updateMissionProgress } from '../services/missionProgress.service';
import { awardXP, type AwardXPResult } from '../services/xp.service';
import { INVALID_JSON_RETRY_INSTRUCTION } from '../utils/aiResponseRetry.utils';
import {
  buildDrinkIngredientsRetryMessage,
  detectAlcoholRequest,
  findMissingDrinkIngredients,
  type AlcoholRequestDecision,
} from '../utils/alcoholRequest.utils';
import { parseAiJson, prepareAiRecipePayload, readAlcoholRequested } from '../utils/aiRecipePayload.utils';
import { calculateAge } from '../utils/macroCalculation.utils';
import { applyRecipeStepCheck } from '../utils/recipeSteps.utils';
import { sendErrorResponse } from '../utils/error.utils';
import { toLastRecipeName } from '../utils/recipeName.utils';
import { isSameDayInTimezone } from '../utils/timezone.utils';
import {
  buildMacroInconsistencyRetryMessage,
  validateMacroConsistency,
} from '../utils/macroValidation.utils';
import {
  buildBlenderLimitRetryMessage,
  summarizeBlenderLimitViolation,
  validateBlenderLimits,
} from '../utils/blenderGuardrail.utils';
import { isGenericBlender } from '../utils/recipeText.utils';
import {
  buildRecipeRestrictionRetryMessage,
  summarizeRestrictionViolations,
  validateRecipeRestrictions,
  type RecipeAlcoholPolicy,
  type RecipeRestrictionOptions,
} from '../utils/recipeRestrictions.utils';

const DAILY_FREE_LIMIT = 3;
// CP-1.1.4a ("Wow Moment Paywall"): prévias bloqueadas por dia para o usuário
// grátis, depois das DAILY_FREE_LIMIT mensagens normais. Extra: não gasta nem
// devolve nenhuma das mensagens normais.
const DAILY_FREE_PREVIEW_LIMIT = 1;
const LOCKED_PREVIEW_KIND = 'pulse_ai';
const PREVIEW_NOT_FOUND_CODE = 'pulseai/preview-not-found';
const PREVIEW_LOCKED_CODE = 'pulseai/preview-locked';
// O que entra no histórico da IA no lugar de um turno bloqueado.
const LOCKED_PREVIEW_HISTORY_PLACEHOLDER =
  '[A recipe was generated here but is locked for this user. Its contents are not available.]';
const DIETARY_RESTRICTION_UNMET_CODE = 'pulseai/dietary-restriction-unmet';
// CP-1.1.9: receita acima do limite físico do BLENDi mesmo após o retry.
// CP-B2: só o volume (o teto de proteína saiu).
const BLENDER_LIMIT_UNMET_CODE = 'pulseai/blender-limit-unmet';
// CP-B5: a mensagem pediu bebida alcoólica e a conta não tem data de
// nascimento real nem resposta gravada. Nada é entregue, o uso volta, e o app
// pergunta uma vez ("Tenho 21 anos ou mais") e reenvia.
const AGE_CONFIRMATION_REQUIRED_CODE = 'pulseai/age-confirmation-required';
const CONVERSATION_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
// 6 exchanges = 6 user messages + 6 assistant messages, interleaved.
const CONVERSATION_HISTORY_MESSAGE_LIMIT = 12;

type ConversationRecord = IConversation & {
  _id: mongoose.Types.ObjectId | string;
};

interface ConversationContext {
  conversationId: mongoose.Types.ObjectId | string;
  historyMessages: PulseAiApiMessage[];
}

interface PulseAiUserProfile {
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
  dailyAiUsage: number;
  aiUsageResetDate: Date;
  isPro: boolean;
  /** CP-B5: 21+ (data de nascimento real ou confirmação), menor, ou sem resposta. */
  alcoholAge: AlcoholAgeStatus;
}

type AlcoholAgeStatus = 'of-age' | 'under-age' | 'unknown';

interface PulseAiCachedResponse {
  recipe: PulseAiRecipe;
  aiProvider: string;
  aiModel: string;
}

interface GeneratedPulseAiRecipe {
  recipe: PulseAiRecipe | null;
  aiResponse: AiProviderResponse;
  /** CP-B5: a IA marcou que a mensagem atual pede bebida alcoólica. */
  alcoholRequested: boolean;
}

const pulseAiCachedResponseSchema: z.ZodType<PulseAiCachedResponse> = z.object({
  recipe: pulseAiRecipeSchema,
  aiProvider: z.string().trim().min(1),
  aiModel: z.string().trim().min(1),
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

// Aguarda o resultado real do award em vez de disparar fire-and-forget e
// devolver um valor otimista — sem isso, leveledUp/newLevel nunca chegavam
// na resposta e a celebração de level up nunca disparava ao usar o Pulse AI
// (mesma correção de hydration/supplementStack/favorite/pantryScanner.controller.ts).
async function triggerPulseAiXP(userId: string, timezone: string): Promise<AwardXPResult> {
  return awardXP(userId, 'pulseAi', timezone);
}

function triggerPulseAiMissionProgress(userId: string, timezone: string): void {
  Promise.resolve()
    .then(() => updateMissionProgress(userId, 'usePulseAI', timezone))
    .catch(err => console.error('Mission update failed:', err));
}

function normalizeMessageForCache(message: string): string {
  return message
    .normalize('NFKD')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function getUsageRemaining(dailyAiUsage: number, isPro: boolean): number | null {
  return isPro ? null : Math.max(0, DAILY_FREE_LIMIT - dailyAiUsage);
}

type PulseAiUsageReservationResult =
  | {
      ok: true;
      usageRemaining: number | null;
    }
  | {
      ok: false;
    };

async function reservePulseAiUsage(
  user: PulseAiUserProfile
): Promise<PulseAiUsageReservationResult> {
  if (user.isPro) {
    return {
      ok: true,
      usageRemaining: null,
    };
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      dailyAiUsage: { $lt: DAILY_FREE_LIMIT },
    },
    {
      $inc: {
        dailyAiUsage: 1,
      },
    },
    {
      new: true,
    }
  )
    .select({ dailyAiUsage: 1, isPro: 1 })
    .lean()
    .exec();

  if (!updatedUser) {
    return { ok: false };
  }

  return {
    ok: true,
    usageRemaining: getUsageRemaining(
      updatedUser.dailyAiUsage ?? DAILY_FREE_LIMIT,
      updatedUser.isPro ?? false,
    ),
  };
}

async function rollbackPulseAiUsageReservation(user: PulseAiUserProfile): Promise<void> {
  if (user.isPro) {
    return;
  }

  await UserModel.updateOne(
    {
      _id: user.id,
      isPro: false,
      dailyAiUsage: { $gt: 0 },
    },
    {
      $inc: {
        dailyAiUsage: -1,
      },
    }
  ).exec();
}

// Mesmo padrão atômico de reservePulseAiUsage: o filtro do findOneAndUpdate é
// quem garante o limite, então duas requisições simultâneas não passam juntas.
// Conta antiga sem o campo conta como 0 ($inc cria o campo com 1).
async function reservePulseAiPreview(user: PulseAiUserProfile): Promise<boolean> {
  if (user.isPro) {
    return false;
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      $or: [
        { dailyAiPreviewUsage: { $lt: DAILY_FREE_PREVIEW_LIMIT } },
        { dailyAiPreviewUsage: { $exists: false } },
      ],
    },
    {
      $inc: {
        dailyAiPreviewUsage: 1,
      },
    },
    {
      new: true,
    }
  )
    .select({ dailyAiPreviewUsage: 1 })
    .lean()
    .exec();

  return Boolean(updatedUser);
}

async function rollbackPulseAiPreviewReservation(user: PulseAiUserProfile): Promise<void> {
  await UserModel.updateOne(
    {
      _id: user.id,
      isPro: false,
      dailyAiPreviewUsage: { $gt: 0 },
    },
    {
      $inc: {
        dailyAiPreviewUsage: -1,
      },
    }
  ).exec();
}

// 'full': mensagem normal (Pro ou dentro das 3 do dia). 'preview': usuário
// grátis passou do limite e ainda tinha a prévia do dia — a receita é gerada,
// mas só a parte visível sai do servidor.
type PulseAiAccessReservation =
  | { ok: true; mode: 'full'; usageRemaining: number | null }
  | { ok: true; mode: 'preview' }
  | { ok: false };

async function reservePulseAiAccess(user: PulseAiUserProfile): Promise<PulseAiAccessReservation> {
  const usageReservation = await reservePulseAiUsage(user);

  if (usageReservation.ok) {
    return { ok: true, mode: 'full', usageRemaining: usageReservation.usageRemaining };
  }

  if (await reservePulseAiPreview(user)) {
    return { ok: true, mode: 'preview' };
  }

  return { ok: false };
}

async function rollbackPulseAiAccessReservation(
  user: PulseAiUserProfile,
  reservation: Extract<PulseAiAccessReservation, { ok: true }>
): Promise<void> {
  if (reservation.mode === 'preview') {
    await rollbackPulseAiPreviewReservation(user);
    return;
  }

  await rollbackPulseAiUsageReservation(user);
}

/**
 * CP-B5: idade para álcool. A data de nascimento só conta quando é real
 * (hasRealBodyProfile): toda conta nasce com o placeholder de 30 anos
 * (accountDefaults.utils.ts) e, sem esse cuidado, quem nunca informou a data
 * passaria como 21+. Sem data real, vale a resposta única gravada.
 */
export function resolveAlcoholAge(
  user: { birthDate?: Date | null; hasRealBodyProfile?: boolean | null; alcoholAgeConfirmed?: boolean | null },
  now: Date = new Date()
): AlcoholAgeStatus {
  if (user.hasRealBodyProfile === true && user.birthDate instanceof Date && !Number.isNaN(user.birthDate.getTime())) {
    return calculateAge(user.birthDate, now) >= ALCOHOL_MIN_AGE_YEARS ? 'of-age' : 'under-age';
  }

  if (user.alcoholAgeConfirmed === true) return 'of-age';
  if (user.alcoholAgeConfirmed === false) return 'under-age';
  return 'unknown';
}

async function findPulseAiUserProfile(userId: string): Promise<PulseAiUserProfile | null> {
  const user = await UserModel.findById(userId)
    .select({
      birthDate: 1,
      hasRealBodyProfile: 1,
      alcoholAgeConfirmed: 1,
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
      dailyAiUsage: 1,
      aiUsageResetDate: 1,
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
    dailyAiUsage: user.dailyAiUsage ?? 0,
    aiUsageResetDate: user.aiUsageResetDate ?? new Date(),
    isPro: user.isPro ?? false,
    alcoholAge: resolveAlcoholAge(user),
  };
}

async function resetDailyAiUsageIfNeeded(user: PulseAiUserProfile): Promise<void> {
  const now = new Date();

  if (isSameDayInTimezone(user.aiUsageResetDate, now, user.timezone)) {
    return;
  }

  await UserModel.updateOne(
    {
      _id: user.id,
      aiUsageResetDate: user.aiUsageResetDate,
    },
    {
      $set: {
        dailyAiUsage: 0,
        dailyAiPreviewUsage: 0,
        aiUsageResetDate: now,
      },
    }
  ).exec();
}

function parsePulseAiRecipe(content: string): { recipe: PulseAiRecipe | null; alcoholRequested: boolean } {
  try {
    const rawPayload = parseAiJson(content);
    const parsed = pulseAiRecipeSchema.safeParse(prepareAiRecipePayload(rawPayload));

    return {
      recipe: parsed.success ? parsed.data : null,
      alcoholRequested: parsed.success && readAlcoholRequested(rawPayload),
    };
  } catch {
    return { recipe: null, alcoholRequested: false };
  }
}

async function generatePulseAiRecipe(
  systemPrompt: string,
  messages: PulseAiApiMessage[]
): Promise<GeneratedPulseAiRecipe> {
  const aiResponse = await callAi({
    systemPrompt,
    messages,
    // gemini-2.5-flash consome parte do orçamento de saída com "thinking" interno
    // antes do JSON visível — 800 truncava a resposta quase sempre. 2000 testado
    // e confirmado suficiente com esse modelo (ver aiProvider.service.ts).
    maxTokens: 2000,
  });

  return {
    ...parsePulseAiRecipe(aiResponse.content),
    aiResponse,
  };
}

// Por que uma verificação não entregou a receita (CP-1.1.9):
// - 'unmet': a IA respondeu, mas a receita refeita continua fora da regra (ou
//   veio inválida) — bloqueio por limite/dieta (422).
// - 'aiUnavailable': a nova tentativa nem rodou (falha do provedor de IA:
//   cota, rede, indisponibilidade) — a receita não foi julgada; a resposta é
//   a de IA indisponível (503), não a de limite/dieta.
type EnforcementFailure = 'unmet' | 'aiUnavailable';

type BlenderLimitEnforcement =
  | { ok: true; recipe: PulseAiRecipe }
  | { ok: false; failure: EnforcementFailure };

// Limite físico do BLENDi (CP-B2: só o volume — blenderGuardrail.utils.ts).
// CP-1.1.9: um retry e, se continuar acima do limite (ou vier inválido), a
// receita NÃO é entregue ('unmet') — antes ela seguia mesmo acima do limite.
// Se o retry falhar no provedor, 'aiUnavailable' (a receita não foi julgada).
async function ensureBlenderGuardrail(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  blendiModel: BlendiModel
): Promise<BlenderLimitEnforcement> {
  const initialCheck = validateBlenderLimits(recipe, blendiModel);

  if (initialCheck.withinLimits) {
    return { ok: true, recipe };
  }

  console.info('[pulseAi.controller] blender limit exceeded, retrying', {
    blendiModel,
    violation: summarizeBlenderLimitViolation(initialCheck.violation),
  });

  try {
    // CP-B5: no chat, o que a mensagem atual pediu fica na quantidade pedida.
    const retryMessage = buildBlenderLimitRetryMessage(initialCheck.violation, prompt.textContext, {
      keepExplicitRequest: true,
    });
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: retryMessage },
    ]);

    if (!retried.recipe) {
      console.warn('[pulseAi.controller] blender limit retry returned an invalid recipe');
      return { ok: false, failure: 'unmet' };
    }

    const retriedCheck = validateBlenderLimits(retried.recipe, blendiModel);

    if (!retriedCheck.withinLimits) {
      console.warn('[pulseAi.controller] blender limit still exceeded after retry', {
        blendiModel,
        violation: summarizeBlenderLimitViolation(retriedCheck.violation),
      });
      return { ok: false, failure: 'unmet' };
    }

    return { ok: true, recipe: retried.recipe };
  } catch (error) {
    console.error('[pulseAi.controller] blender limit retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { ok: false, failure: 'aiUnavailable' };
  }
}

async function ensureMacroConsistency(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult
): Promise<PulseAiRecipe> {
  const initialConsistency = validateMacroConsistency(recipe);

  if (initialConsistency.macrosValidated) {
    return { ...recipe, macrosValidated: true };
  }

  console.info('[pulseAi.controller] macro inconsistency detected, retrying', {
    discrepancy: initialConsistency.discrepancy,
  });

  try {
    const retryMessage = buildMacroInconsistencyRetryMessage(
      recipe,
      initialConsistency.discrepancy
    );
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: retryMessage },
    ]);

    if (!retried.recipe) {
      return { ...recipe, macrosValidated: false };
    }

    const retriedConsistency = validateMacroConsistency(retried.recipe);
    return { ...retried.recipe, macrosValidated: retriedConsistency.macrosValidated };
  } catch (error) {
    console.error('[pulseAi.controller] macro consistency retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { ...recipe, macrosValidated: false };
  }
}

type RecipeRestrictionEnforcement =
  | { ok: true; recipe: PulseAiRecipe; dietOverrideIngredientIndexes: number[] }
  | { ok: false; failure: EnforcementFailure };

// CP-1.1.1c: última conferência antes de entregar — roda depois do guardrail
// de volume e da consistência de macros, porque os retries delas podem
// trazer de volta um ingrediente proibido. Diferente dessas duas, esta
// BLOQUEIA: um retry e, se continuar violando (ou vier inválido), a receita
// não é entregue ('unmet'). Se o retry falhar no provedor, 'aiUnavailable'
// (CP-1.1.9: responde como IA indisponível, não como dieta). A receita refeita não passa de novo pelos retries de
// volume/macros; só o flag macrosValidated é
// recalculado.
// CP-B5: `options` traz o texto da mensagem ATUAL (libera só o ingrediente
// fora da dieta pedido nela) e a política de álcool desta receita.
async function ensureRecipeRestrictions(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  user: Pick<PulseAiUserProfile, 'dietaryPreferences' | 'blendiModel'>,
  options: RecipeRestrictionOptions
): Promise<RecipeRestrictionEnforcement> {
  const initialCheck = validateRecipeRestrictions(recipe, user.dietaryPreferences, user.blendiModel, options);

  if (initialCheck.compliant) {
    return { ok: true, recipe, dietOverrideIngredientIndexes: initialCheck.dietOverrideIngredientIndexes ?? [] };
  }

  console.info('[pulseAi.controller] recipe restriction violated, retrying', {
    violations: summarizeRestrictionViolations(initialCheck.violations),
  });

  try {
    const retryMessage = buildRecipeRestrictionRetryMessage(recipe, initialCheck.violations, {
      genericBlender: prompt.textContext?.genericBlender,
    });
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: retryMessage },
    ]);

    if (!retried.recipe) {
      console.warn('[pulseAi.controller] recipe restriction retry returned an invalid recipe');
      return { ok: false, failure: 'unmet' };
    }

    const retriedCheck = validateRecipeRestrictions(
      retried.recipe,
      user.dietaryPreferences,
      user.blendiModel,
      options
    );

    if (!retriedCheck.compliant) {
      console.warn('[pulseAi.controller] recipe restriction still violated after retry', {
        violations: summarizeRestrictionViolations(retriedCheck.violations),
      });
      return { ok: false, failure: 'unmet' };
    }

    return {
      ok: true,
      recipe: {
        ...retried.recipe,
        macrosValidated: validateMacroConsistency(retried.recipe).macrosValidated,
      },
      dietOverrideIngredientIndexes: retriedCheck.dietOverrideIngredientIndexes ?? [],
    };
  } catch (error) {
    console.error('[pulseAi.controller] recipe restriction retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { ok: false, failure: 'aiUnavailable' };
  }
}

/**
 * CP-B5.2: drink clássico pedido pelo nome sem o ingrediente que o define
 * (caipirinha sem limão; tabela em alcoholRequest.utils.ts). Uma nova
 * tentativa pelo mesmo caminho das outras (mensagem dizendo o que faltou),
 * com e sem álcool. NUNCA bloqueia: se persistir, se a resposta vier
 * inválida ou se o provedor falhar, a receita segue (as conferências de
 * volume, macros, dieta e álcool vêm depois, como sempre).
 */
async function ensureDrinkDefiningIngredients(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  message: string,
  language: UserLocale
): Promise<PulseAiRecipe> {
  const missing = findMissingDrinkIngredients(
    message,
    recipe.ingredients.map(ingredient => ingredient.name),
    language
  );

  if (missing.length === 0) {
    return recipe;
  }

  const summarize = (items: typeof missing) => items.map(item => ({ drink: item.drink, missing: item.missing }));

  console.info('[pulseAi.controller] drink defining ingredient missing, retrying', {
    missing: summarize(missing),
  });

  try {
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: buildDrinkIngredientsRetryMessage(missing) },
    ]);

    if (!retried.recipe) {
      console.warn('[pulseAi.controller] drink defining ingredient retry returned an invalid recipe, delivering the first one');
      return recipe;
    }

    const stillMissing = findMissingDrinkIngredients(
      message,
      retried.recipe.ingredients.map(ingredient => ingredient.name),
      language
    );

    if (stillMissing.length > 0) {
      console.warn('[pulseAi.controller] drink defining ingredient still missing after retry, delivering', {
        missing: summarize(stillMissing),
      });
    }

    return retried.recipe;
  } catch (error) {
    console.error('[pulseAi.controller] drink defining ingredient retry failed, delivering the first one', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });

    return recipe;
  }
}

/**
 * CP-B5.2: decisão final sobre o pedido de álcool. O código decide os casos
 * óbvios ('yes'/'no') e, nesses, o campo da IA é ignorado; só no 'ai' (nome
 * de drink sozinho) vale o alcoholRequested da IA.
 */
export function resolveAlcoholRequested(decision: AlcoholRequestDecision, aiAlcoholRequested: boolean): boolean {
  return decision === 'ai' ? aiAlcoholRequested : decision === 'yes';
}

/**
 * CP-B5: marcações do backend para o card — ingredientes fora da dieta que a
 * mensagem atual pediu (pelos índices que o validador liberou) e "versão sem
 * álcool". Sempre recalculadas: nada disso vem da IA.
 */
function withRequestNotices(
  recipe: PulseAiRecipe,
  dietOverrideIngredientIndexes: readonly number[],
  alcoholFreeVersion: boolean
): PulseAiRecipe {
  const { dietOverrideIngredients: _previousOverride, alcoholFreeVersion: _previousAlcoholFree, ...rest } = recipe;
  void _previousOverride;
  void _previousAlcoholFree;

  const overrideNames = [
    ...new Set(
      dietOverrideIngredientIndexes
        .map(index => recipe.ingredients[index]?.name.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ].slice(0, RECIPE_DIET_OVERRIDE_MAX_ITEMS);

  return {
    ...rest,
    ...(overrideNames.length > 0 ? { dietOverrideIngredients: overrideNames } : {}),
    ...(alcoholFreeVersion ? { alcoholFreeVersion: true } : {}),
  };
}

function alcoholCacheTier(user: Pick<PulseAiUserProfile, 'alcoholAge'>): AlcoholCacheTier {
  return user.alcoholAge === 'of-age' ? 'of-age' : 'not-of-age';
}

function serializeConversationMessage(message: IConversationMessage): PulseAiApiMessage {
  if (message.role === 'user') {
    return { role: 'user', content: message.content as string };
  }

  // Turno de prévia bloqueada (CP-1.1.4a): o content gravado é só macros. Nada
  // da receita vai para a IA — nem o título, que ela poderia repetir na próxima
  // resposta ("me passa os ingredientes da receita de ontem" não tem de onde tirar).
  if (message.locked === true) {
    return { role: 'assistant', content: LOCKED_PREVIEW_HISTORY_PLACEHOLDER };
  }

  // Só o título da receita entra no histórico enviado à IA.
  return { role: 'assistant', content: (message.content as PulseAiRecipe).title };
}

async function resolveConversationContext(userId: string): Promise<ConversationContext> {
  const since = new Date(Date.now() - CONVERSATION_CONTEXT_WINDOW_MS);

  const recentConversation = (await ConversationModel.findOne({
    userId,
    createdAt: { $gt: since },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as ConversationRecord | null;

  if (recentConversation) {
    return {
      conversationId: recentConversation._id,
      historyMessages: recentConversation.messages
        .slice(-CONVERSATION_HISTORY_MESSAGE_LIMIT)
        .map(serializeConversationMessage),
    };
  }

  const createdConversation = await ConversationModel.insertOne({
    userId,
    messages: [],
  });

  return {
    conversationId: createdConversation._id,
    historyMessages: [],
  };
}

type PulseAiChatOutcome =
  | { kind: 'success'; data: Record<string, unknown> }
  | { kind: 'error'; statusCode: number; code: string; message: string; errors?: unknown };

// Deduplicação de duplo-toque: mesma dimensão do cache de resposta (usuário +
// hash da mensagem), em memória de processo — proteção de curta duração contra
// requisições simultâneas, reinicia com o servidor sem problema.
const inFlightRequests = new Map<string, Promise<PulseAiChatOutcome>>();

function successOutcome(data: Record<string, unknown>): PulseAiChatOutcome {
  return { kind: 'success', data };
}

function errorOutcome(statusCode: number, code: string, message: string, errors?: unknown): PulseAiChatOutcome {
  return { kind: 'error', statusCode, code, message, errors };
}

function sendPulseAiChatOutcome(res: Response, outcome: PulseAiChatOutcome): void {
  if (outcome.kind === 'success') {
    res.status(200).json({ success: true, data: outcome.data });
    return;
  }

  sendErrorResponse(res, {
    statusCode: outcome.statusCode,
    code: outcome.code,
    message: outcome.message,
    errors: outcome.errors,
  });
}

async function persistConversationTurn(params: {
  conversationId: mongoose.Types.ObjectId | string;
  userId: string;
  userMessage: string;
  userSentAt: Date;
  recipe: PulseAiRecipe;
  /** Prévia bloqueada: grava só a parte visível e o marcador de bloqueio. */
  lockedPreview?: { previewId: mongoose.Types.ObjectId; expiresAt: Date };
}): Promise<void> {
  const assistantMessage = params.lockedPreview
    ? {
        role: 'assistant',
        content: toPulseAiRecipePreview(params.recipe),
        timestamp: new Date(),
        locked: true,
        previewId: params.lockedPreview.previewId,
        previewExpiresAt: params.lockedPreview.expiresAt,
      }
    : { role: 'assistant', content: params.recipe, timestamp: new Date() };

  const result = await ConversationModel.updateOne(
    { _id: params.conversationId },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: params.userMessage, timestamp: params.userSentAt },
            assistantMessage,
          ],
        },
      },
      // Prévia bloqueada não grava o nome: lastRecipeName sai na lista de
      // conversas, e o título também é conteúdo escondido.
      ...(params.lockedPreview
        ? {}
        : { $set: { lastRecipeName: toLastRecipeName(params.recipe.title) } }),
    },
    {
      runValidators: true,
    }
  ).exec();

  if (result.matchedCount === 0) {
    console.warn(
      '[pulseAi.controller] persistConversationTurn: conversation not found (provavelmente expirada pelo TTL) — a resposta da IA já havia sido enviada ao usuário.',
      { conversationId: String(params.conversationId), userId: params.userId }
    );
  }
}

// Guarda a receita inteira em LockedPreview, grava na conversa só a parte
// visível e responde só a parte visível. Sem XP, sem missão, sem cache.
async function deliverLockedPreview(params: {
  user: PulseAiUserProfile;
  conversationId: mongoose.Types.ObjectId | string;
  userMessage: string;
  userSentAt: Date;
  recipe: PulseAiRecipe;
}): Promise<PulseAiChatOutcome> {
  const expiresAt = new Date(Date.now() + LOCKED_PREVIEW_TTL_MS_BY_KIND[LOCKED_PREVIEW_KIND]);
  const preview = await LockedPreviewModel.create({
    kind: LOCKED_PREVIEW_KIND,
    userId: params.user.id,
    content: params.recipe,
    context: {
      conversationId: String(params.conversationId),
      userMessage: params.userMessage,
      userSentAt: params.userSentAt.toISOString(),
    },
    expiresAt,
  });

  try {
    await persistConversationTurn({
      conversationId: params.conversationId,
      userId: params.user.id,
      userMessage: params.userMessage,
      userSentAt: params.userSentAt,
      recipe: params.recipe,
      lockedPreview: { previewId: preview._id, expiresAt },
    });
  } catch (error) {
    await LockedPreviewModel.deleteOne({ _id: preview._id })
      .exec()
      .catch(cleanupError => {
        console.error('[pulseAi.controller] failed to delete orphan locked preview', {
          errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
        });
      });
    throw error;
  }

  return successOutcome({
    locked: true,
    previewId: String(preview._id),
    previewExpiresAt: expiresAt.toISOString(),
    preview: toPulseAiRecipePreview(params.recipe),
    usageRemaining: 0,
    conversationId: String(params.conversationId),
  });
}

async function runPulseAiChat(params: {
  userId: string;
  message: string;
  normalizedMessage: string;
  normalizedMessageHash: string;
  requestedLanguage: UserLocale | undefined;
}): Promise<PulseAiChatOutcome> {
  const { userId, message, normalizedMessage, normalizedMessageHash, requestedLanguage } = params;

  const initialUser = await findPulseAiUserProfile(userId);
  if (!initialUser) {
    return errorOutcome(404, 'resource/not-found', 'User not found.');
  }

  await resetDailyAiUsageIfNeeded(initialUser);
  const currentUser = await findPulseAiUserProfile(userId);
  if (!currentUser) {
    return errorOutcome(404, 'resource/not-found', 'User not found.');
  }

  // CP-B5.2: detecção mista, só sobre a mensagem atual. Quando o código
  // decide 'yes' e a idade é desconhecida, a pergunta de idade sai ANTES do
  // cache e da IA: nenhuma chamada, nenhum uso reservado.
  // CP-B5.3: o idioma do pedido só muda o "drink" (ambíguo em pt-BR; em
  // inglês é verbo e "protein drink").
  const effectiveLanguage = requestedLanguage ?? currentUser.locale;
  const alcoholDecision = detectAlcoholRequest(message, effectiveLanguage);

  if (alcoholDecision === 'yes' && currentUser.alcoholAge === 'unknown') {
    console.info('[pulseAi.controller] alcohol requested without a known age, asking for confirmation', {
      decidedBy: 'code',
    });
    return errorOutcome(428, AGE_CONFIRMATION_REQUIRED_CODE, 'Age confirmation is required for this request.');
  }

  const requestReceivedAt = new Date();
  const conversationContext = await resolveConversationContext(currentUser.id);

  const cacheKey = generateCacheKey({
    userId: currentUser.id,
    model: currentUser.blendiModel,
    // CP-B3: o texto da receita muda para quem não tem BLENDi.
    genericBlender: isGenericBlender(currentUser.blendiOwnership),
    goal: currentUser.goal,
    language: effectiveLanguage,
    unitSystem: currentUser.unitSystem,
    weightGoal: currentUser.weightGoal,
    aiProvider: env.AI_PROVIDER,
    aiModel: env.AI_MODEL,
    rawMessage: normalizedMessage,
    dietaryFlags: currentUser.dietaryPreferences,
    // CP-B5: o prompt muda para quem tem 21+ confirmado.
    alcoholTier: alcoholCacheTier(currentUser),
  });

  const cacheKeyParts = cacheKey.split(':');
  if (cacheKeyParts[8] !== normalizedMessageHash) {
    throw new Error('[pulseAi.controller] cacheKey hash mismatch');
  }

  const cachedResponse = await getFromCache(cacheKey);
  if (cachedResponse) {
    const parsedCachedResponse = pulseAiCachedResponseSchema.safeParse(cachedResponse);

    // CP-1.1.1c: receita do cache também passa pela validação de restrições
    // (pode ter sido gravada antes desta checagem existir). Se violar, a
    // entrada é removida e o fluxo segue como cache inexistente.
    // CP-B5: a chave tem o hash da mesma mensagem, então o pedido explícito
    // é o mesmo; com 21+ o álcool da receita gravada passou pela checagem
    // quando foi pedido (teto e alcoholGrams continuam conferidos).
    const cachedRestrictionCheck = parsedCachedResponse.success
      ? validateRecipeRestrictions(
          parsedCachedResponse.data.recipe,
          currentUser.dietaryPreferences,
          currentUser.blendiModel,
          {
            explicitRequest: message,
            // CP-B5.2: 'no' decidido pelo código vale também para a receita do cache.
            alcohol: currentUser.alcoholAge === 'of-age' && alcoholDecision !== 'no' ? 'allowed' : 'forbidden',
          }
        )
      : null;

    // CP-1.1.9: idem para o limite físico (receitas gravadas antes do bloqueio
    // por volume, ou antes do ajuste dos limites de volume).
    const cachedWithinBlenderLimits = parsedCachedResponse.success
      ? validateBlenderLimits(parsedCachedResponse.data.recipe, currentUser.blendiModel).withinLimits
      : false;

    if (
      (cachedRestrictionCheck && !cachedRestrictionCheck.compliant) ||
      (parsedCachedResponse.success && !cachedWithinBlenderLimits)
    ) {
      console.info('[pulseAi.controller] cached recipe violates restrictions or blender limits, regenerating', {
        violations: cachedRestrictionCheck && !cachedRestrictionCheck.compliant
          ? summarizeRestrictionViolations(cachedRestrictionCheck.violations)
          : [],
        withinBlenderLimits: cachedWithinBlenderLimits,
      });

      try {
        await deleteFromCache(cacheKey);
      } catch (error) {
        // Não bloqueia a regeneração: o setInCache abaixo sobrescreve a entrada.
        console.error('[pulseAi.controller] failed to delete violating cache entry', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    if (parsedCachedResponse.success && cachedRestrictionCheck?.compliant && cachedWithinBlenderLimits) {
      const cachedRecipe = withRequestNotices(
        parsedCachedResponse.data.recipe,
        cachedRestrictionCheck.dietOverrideIngredientIndexes ?? [],
        // CP-B5.2: com a decisão do código, o aviso de "sem álcool" sai dela.
        alcoholDecision === 'ai'
          ? parsedCachedResponse.data.recipe.alcoholFreeVersion === true
          : alcoholDecision === 'yes' && currentUser.alcoholAge === 'under-age'
      );
      const usageReservation = await reservePulseAiAccess(currentUser);

      if (!usageReservation.ok) {
        return errorOutcome(429, 'pulseai/daily-limit-reached', 'Daily Pulse AI limit reached.');
      }

      if (usageReservation.mode === 'preview') {
        try {
          return await deliverLockedPreview({
            user: currentUser,
            conversationId: conversationContext.conversationId,
            userMessage: message,
            userSentAt: requestReceivedAt,
            recipe: cachedRecipe,
          });
        } catch (error) {
          await rollbackPulseAiAccessReservation(currentUser, usageReservation);
          throw error;
        }
      }

      try {
        await persistConversationTurn({
          conversationId: conversationContext.conversationId,
          userId: currentUser.id,
          userMessage: message,
          userSentAt: requestReceivedAt,
          recipe: cachedRecipe,
        });
      } catch (error) {
        await rollbackPulseAiAccessReservation(currentUser, usageReservation);
        throw error;
      }

      const xpResult = await triggerPulseAiXP(currentUser.id, currentUser.timezone);
      triggerPulseAiMissionProgress(currentUser.id, currentUser.timezone);

      return successOutcome({
        recipe: cachedRecipe,
        fromCache: true,
        usageRemaining: usageReservation.usageRemaining,
        aiProvider: parsedCachedResponse.data.aiProvider,
        aiModel: parsedCachedResponse.data.aiModel,
        xpAwarded: xpResult.awarded ? xpResult.amount : 0,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
        conversationId: String(conversationContext.conversationId),
        macrosValidated: cachedRecipe.macrosValidated ?? true,
      });
    }
  }

  const recentBlendLogs = await BlendLogModel.find({ userId: currentUser.id })
    .sort({ createdAt: -1 })
    .limit(5)
    .select({ recipeName: 1, _id: 0 })
    .lean()
    .exec();

  const prompt = buildPulseAiPrompt({
    blendiModel: currentUser.blendiModel,
    blendiOwnership: currentUser.blendiOwnership,
    goal: currentUser.goal,
    weightGoal: currentUser.weightGoal,
    dietaryPreferences: currentUser.dietaryPreferences,
    language: requestedLanguage,
    locale: currentUser.locale,
    unitSystem: currentUser.unitSystem,
    dailyProteinTarget: currentUser.dailyProteinTarget,
    dailyCarbTarget: currentUser.dailyCarbTarget,
    dailyCalorieTarget: currentUser.dailyCalorieTarget,
    recentBlendRecipeNames: recentBlendLogs.flatMap(log => (
      log.recipeName ? [log.recipeName] : []
    )),
    message,
    alcoholOfAge: currentUser.alcoholAge === 'of-age',
    alcoholRequestDecision: alcoholDecision,
  });

  if (conversationContext.historyMessages.length > 0) {
    prompt.messages = [...conversationContext.historyMessages, ...prompt.messages];
  }

  const usageReservation = await reservePulseAiAccess(currentUser);

  if (!usageReservation.ok) {
    return errorOutcome(429, 'pulseai/daily-limit-reached', 'Daily Pulse AI limit reached.');
  }

  let shouldRollbackUsage = !currentUser.isPro;

  let recipe: PulseAiRecipe | null = null;
  let aiResponse: AiProviderResponse | null = null;
  // CP-B5: lido da primeira receita válida (é sobre a mensagem, não sobre a
  // receita); as novas tentativas não mudam esse valor. CP-B5.2: só vale
  // quando o código devolveu 'ai' (resolveAlcoholRequested).
  let aiAlcoholRequested = false;

  try {
    try {
      const generatedRecipe = await generatePulseAiRecipe(prompt.systemPrompt, prompt.messages);
      recipe = generatedRecipe.recipe;
      aiResponse = generatedRecipe.aiResponse;
      aiAlcoholRequested = generatedRecipe.alcoholRequested;
    } catch (error) {
      if (shouldRollbackUsage) {
        await rollbackPulseAiAccessReservation(currentUser, usageReservation);
        shouldRollbackUsage = false;
      }

      if (error instanceof AiProviderRequestError) {
        return errorOutcome(503, 'pulseai/ai-unavailable', 'Pulse AI is temporarily unavailable.');
      }

      throw error;
    }

    if (!recipe) {
      try {
        const regeneratedRecipe = await generatePulseAiRecipe(prompt.systemPrompt, [
          ...prompt.messages,
          {
            role: 'user',
            content: INVALID_JSON_RETRY_INSTRUCTION,
          },
        ]);
        recipe = regeneratedRecipe.recipe;
        aiResponse = regeneratedRecipe.aiResponse;
        aiAlcoholRequested = regeneratedRecipe.alcoholRequested;
      } catch (error) {
        if (shouldRollbackUsage) {
          await rollbackPulseAiAccessReservation(currentUser, usageReservation);
          shouldRollbackUsage = false;
        }

        if (error instanceof AiProviderRequestError) {
          return errorOutcome(503, 'pulseai/ai-unavailable', 'Pulse AI is temporarily unavailable.');
        }

        throw error;
      }
    }

    if (!recipe || !aiResponse) {
      if (shouldRollbackUsage) {
        await rollbackPulseAiAccessReservation(currentUser, usageReservation);
        shouldRollbackUsage = false;
      }

      return errorOutcome(500, 'pulseai/invalid-ai-response', 'Pulse AI returned an invalid response.');
    }

    // Receita não entregue por limite físico ou dieta: nada é entregue, a
    // reserva de uso volta e não há cache, turno de conversa nem XP. Falha do
    // provedor na nova tentativa responde como IA indisponível (CP-1.1.9).
    const sendEnforcementFailure = async (failure: EnforcementFailure, unmetCode: string, unmetMessage: string) => {
      if (shouldRollbackUsage) {
        await rollbackPulseAiAccessReservation(currentUser, usageReservation);
        shouldRollbackUsage = false;
      }

      if (failure === 'aiUnavailable') {
        return errorOutcome(503, 'pulseai/ai-unavailable', 'Pulse AI is temporarily unavailable.');
      }

      return errorOutcome(422, unmetCode, unmetMessage);
    };
    const sendBlenderLimitUnmet = () =>
      sendEnforcementFailure('unmet', BLENDER_LIMIT_UNMET_CODE, 'Pulse AI could not generate a recipe within the blender limits.');

    const alcoholRequested = resolveAlcoholRequested(alcoholDecision, aiAlcoholRequested);

    // CP-B5.2: só enums e booleanos (sem texto da mensagem nem da receita).
    console.info('[pulseAi.controller] alcohol request resolved', {
      decision: alcoholDecision,
      aiFlag: aiAlcoholRequested,
      alcoholRequested,
      alcoholAge: currentUser.alcoholAge,
    });

    // CP-B5: pedido de álcool sem idade conhecida. Nada é entregue nem
    // gravado e o uso volta (o reenvio depois da confirmação gasta um só).
    // CP-B5.2: aqui só chega o caso 'ai' (o 'yes' perguntou antes da IA).
    if (alcoholRequested && currentUser.alcoholAge === 'unknown') {
      if (shouldRollbackUsage) {
        await rollbackPulseAiAccessReservation(currentUser, usageReservation);
        shouldRollbackUsage = false;
      }

      console.info('[pulseAi.controller] alcohol requested without a known age, asking for confirmation');
      return errorOutcome(428, AGE_CONFIRMATION_REQUIRED_CODE, 'Age confirmation is required for this request.');
    }

    const alcoholPolicy: RecipeAlcoholPolicy =
      alcoholRequested && currentUser.alcoholAge === 'of-age' ? 'allowed' : 'forbidden';
    const alcoholFreeVersion = alcoholRequested && currentUser.alcoholAge === 'under-age';

    // CP-B5.2: drink pelo nome traz os ingredientes que o definem (nunca bloqueia).
    recipe = await ensureDrinkDefiningIngredients(recipe, prompt, message, effectiveLanguage);

    const blenderLimitEnforcement = await ensureBlenderGuardrail(recipe, prompt, currentUser.blendiModel);

    if (!blenderLimitEnforcement.ok) {
      return sendEnforcementFailure(
        blenderLimitEnforcement.failure,
        BLENDER_LIMIT_UNMET_CODE,
        'Pulse AI could not generate a recipe within the blender limits.'
      );
    }

    recipe = await ensureMacroConsistency(blenderLimitEnforcement.recipe, prompt);

    const restrictionEnforcement = await ensureRecipeRestrictions(recipe, prompt, currentUser, {
      explicitRequest: message,
      alcohol: alcoholPolicy,
    });

    if (!restrictionEnforcement.ok) {
      return sendEnforcementFailure(
        restrictionEnforcement.failure,
        DIETARY_RESTRICTION_UNMET_CODE,
        'Pulse AI could not generate a recipe that meets the user restrictions.'
      );
    }

    recipe = withRequestNotices(
      restrictionEnforcement.recipe,
      restrictionEnforcement.dietOverrideIngredientIndexes,
      alcoholFreeVersion
    );

    // Conferência final do limite físico (CP-1.1.9): os retries de macros e de
    // restrições refazem a receita e podem passar do limite de novo.
    if (!validateBlenderLimits(recipe, currentUser.blendiModel).withinLimits) {
      console.warn('[pulseAi.controller] blender limit exceeded after later retries');
      return sendBlenderLimitUnmet();
    }

    // CP-B2: checagem objetiva dos passos, sem nova tentativa (pulseCount sem
    // gelo/congelado sai; inverter o copo fora do Steel vai para o log).
    recipe = applyRecipeStepCheck(recipe, currentUser.blendiModel, '[pulseAi.controller]');

    if (usageReservation.mode === 'preview') {
      // Prévia: não grava no cache por usuário (senão a receita completa ficaria
      // acessível por outro caminho enquanto bloqueada). Se a entrega falhar, o
      // catch abaixo devolve a prévia do dia.
      const previewOutcome = await deliverLockedPreview({
        user: currentUser,
        conversationId: conversationContext.conversationId,
        userMessage: message,
        userSentAt: requestReceivedAt,
        recipe,
      });
      shouldRollbackUsage = false;
      return previewOutcome;
    }

    await persistConversationTurn({
      conversationId: conversationContext.conversationId,
      userId: currentUser.id,
      userMessage: message,
      userSentAt: requestReceivedAt,
      recipe,
    });

    await setInCache({
      cacheKey,
      userId: currentUser.id,
      model: currentUser.blendiModel,
      goal: currentUser.goal,
      language: effectiveLanguage,
      unitSystem: currentUser.unitSystem,
      weightGoal: currentUser.weightGoal,
      aiProvider: aiResponse.provider,
      aiModel: aiResponse.model,
      rawMessage: normalizedMessage,
      dietaryFlags: currentUser.dietaryPreferences,
      genericBlender: isGenericBlender(currentUser.blendiOwnership),
      alcoholTier: alcoholCacheTier(currentUser),
      response: {
        recipe,
        aiProvider: aiResponse.provider,
        aiModel: aiResponse.model,
      },
    });

    shouldRollbackUsage = false;

    const xpResult = await triggerPulseAiXP(currentUser.id, currentUser.timezone);
    triggerPulseAiMissionProgress(currentUser.id, currentUser.timezone);

    return successOutcome({
      recipe,
      fromCache: false,
      usageRemaining: usageReservation.mode === 'full' ? usageReservation.usageRemaining : 0,
      aiProvider: aiResponse.provider,
      aiModel: aiResponse.model,
      xpAwarded: xpResult.awarded ? xpResult.amount : 0,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      conversationId: String(conversationContext.conversationId),
      macrosValidated: recipe.macrosValidated ?? true,
    });
  } catch (error) {
    if (shouldRollbackUsage) {
      await rollbackPulseAiAccessReservation(currentUser, usageReservation);
      shouldRollbackUsage = false;
    }

    throw error;
  }
}

export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = pulseAiChatSchema.safeParse(req.body);

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'pulseai/invalid-message',
        message: 'Invalid Pulse AI message.',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const { message, language: requestedLanguage } = parsed.data;
    const normalizedMessage = normalizeMessageForCache(message);

    if (!normalizedMessage) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'pulseai/invalid-message',
        message: 'Invalid Pulse AI message.',
      });
      return;
    }

    const normalizedMessageHash = sha256(normalizedMessage);
    // Escopo por usuário + hash: mesma dimensão do cache de resposta, evita que
    // dois usuários diferentes enviando o mesmo texto colidam na mesma chave.
    const inFlightKey = `${userId}:${normalizedMessageHash}`;

    let requestPromise = inFlightRequests.get(inFlightKey);

    if (!requestPromise) {
      // CP-B1: teto de tempo de IA da requisição (todas as chamadas e novas
      // tentativas somadas); estourado, a chamada seguinte falha como IA
      // indisponível (503) e o uso volta pelos caminhos de hoje.
      requestPromise = runWithAiRequestBudget(AI_REQUEST_BUDGET_MS.pulseAiChat, () =>
        runPulseAiChat({
          userId,
          message,
          normalizedMessage,
          normalizedMessageHash,
          requestedLanguage,
        })
      ).finally(() => {
        inFlightRequests.delete(inFlightKey);
      });

      inFlightRequests.set(inFlightKey, requestPromise);
    }

    const outcome = await requestPromise;
    sendPulseAiChatOutcome(res, outcome);
  } catch (error) {
    next(error);
  }
}

export async function getUsage(
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

    const user = await findPulseAiUserProfile(userId);
    if (!user) {
      sendUserNotFound(res);
      return;
    }

    await resetDailyAiUsageIfNeeded(user);

    const currentUser = await findPulseAiUserProfile(userId);
    if (!currentUser) {
      sendUserNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        dailyAiUsage: currentUser.dailyAiUsage,
        isPro: currentUser.isPro,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function invalidateCache(
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

    const deletedCount = await invalidateUserCache(userId);

    res.status(200).json({
      success: true,
      data: {
        deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
}
// ─── Confirmação de idade para álcool (CP-B5) ────────────────────────────────

/**
 * POST /pulse-ai/age-confirmation — grava UMA vez a resposta à pergunta
 * "Tenho 21 anos ou mais". Não sobrescreve uma resposta já gravada (o filtro
 * do update exige o campo ausente): quem disse "Não" não vira 21+ tocando de
 * novo. Responde com o valor que ficou gravado. Não gasta uso do Pulse AI.
 */
export async function confirmAlcoholAge(
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

    const parsed = pulseAiAgeConfirmationSchema.safeParse(req.body);

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'pulseai/invalid-age-confirmation',
        message: 'Invalid age confirmation.',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    await UserModel.updateOne(
      { _id: userId, alcoholAgeConfirmed: { $exists: false } },
      { $set: { alcoholAgeConfirmed: parsed.data.isAdult, alcoholAgeConfirmedAt: new Date() } }
    ).exec();

    const user = await UserModel.findById(userId).select({ alcoholAgeConfirmed: 1 }).lean().exec();

    if (!user) {
      sendUserNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: { alcoholAgeConfirmed: user.alcoholAgeConfirmed === true },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Desbloqueio de prévia (CP-1.1.4a) ───────────────────────────────────────

const lockedPreviewContextSchema = z.object({
  conversationId: z.string().refine(value => mongoose.isValidObjectId(value)),
  userMessage: z.string().trim().min(1),
  userSentAt: z.string().datetime(),
});

function sendPreviewNotFound(res: Response): void {
  // Mesma resposta para id inválido, inexistente, expirado ou de outro usuário:
  // não revela que um id existe.
  sendErrorResponse(res, {
    statusCode: 404,
    code: PREVIEW_NOT_FOUND_CODE,
    message: 'Preview not found or expired.',
  });
}

// Troca o turno bloqueado pela receita completa. Se o turno bloqueado não
// existir mais, grava o turno inteiro — uma vez só: o previewId fica no turno
// e o filtro do $push impede duplicar em chamadas repetidas ou simultâneas.
async function persistUnlockedConversationTurn(params: {
  previewId: mongoose.Types.ObjectId;
  userId: string;
  recipe: PulseAiRecipe;
  context: unknown;
}): Promise<string | null> {
  const parsedContext = lockedPreviewContextSchema.safeParse(params.context);

  if (!parsedContext.success) {
    console.warn('[pulseAi.controller] locked preview without a valid conversation context', {
      previewId: String(params.previewId),
    });
    return null;
  }

  const { conversationId, userMessage, userSentAt } = parsedContext.data;

  const replaced = await ConversationModel.updateOne(
    {
      _id: conversationId,
      userId: params.userId,
      messages: { $elemMatch: { previewId: params.previewId, locked: true } },
    },
    {
      $set: {
        'messages.$[turn].content': params.recipe,
        'messages.$[turn].locked': false,
        lastRecipeName: toLastRecipeName(params.recipe.title),
      },
      $unset: {
        'messages.$[turn].previewExpiresAt': '',
      },
    },
    {
      arrayFilters: [{ 'turn.previewId': params.previewId }],
    }
  ).exec();

  if (replaced.matchedCount > 0) {
    return conversationId;
  }

  // matchedCount 0 aqui = o turno já tinha sido desbloqueado (chamada repetida)
  // ou a conversa não existe mais: nos dois casos não há o que gravar.
  await ConversationModel.updateOne(
    {
      _id: conversationId,
      userId: params.userId,
      'messages.previewId': { $ne: params.previewId },
    },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: userMessage, timestamp: new Date(userSentAt) },
            {
              role: 'assistant',
              content: params.recipe,
              timestamp: new Date(),
              previewId: params.previewId,
            },
          ],
        },
      },
      $set: {
        lastRecipeName: toLastRecipeName(params.recipe.title),
      },
    },
    {
      runValidators: true,
    }
  ).exec();

  return conversationId;
}

export async function unlockPreview(
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

    // Dono e validade no próprio filtro: prévia de outro usuário ou expirada
    // (o TTL do Mongo pode levar ~1 min para apagar) cai no mesmo 404.
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

    const parsedRecipe = pulseAiRecipeSchema.safeParse(preview.content);

    if (!parsedRecipe.success) {
      console.error('[pulseAi.controller] locked preview with an invalid recipe', { previewId });
      sendPreviewNotFound(res);
      return;
    }

    const conversationId = await persistUnlockedConversationTurn({
      previewId: previewObjectId,
      userId,
      recipe: parsedRecipe.data,
      context: preview.context,
    });

    // Sem XP e sem missão: o desbloqueio só entrega o que já foi gerado.
    res.status(200).json({
      success: true,
      data: {
        previewId,
        recipe: parsedRecipe.data,
        conversationId,
      },
    });
  } catch (error) {
    next(error);
  }
}
