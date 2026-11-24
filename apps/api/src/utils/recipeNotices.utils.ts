// apps/api/src/utils/recipeNotices.utils.ts
// CP-B5: marcações do backend para o card — ingredientes fora da dieta que a
// pessoa pediu (pelos índices que o validador liberou) e "versão sem álcool".
// Sempre recalculadas: nada disso vem da IA. Usado pelo Pulse AI e, desde o
// CP-B7, pelo Pantry Scanner (mesma função, sem segunda lógica).

import {
  RECIPE_DIET_OVERRIDE_MAX_ITEMS,
  RECIPE_MISSING_REQUEST_MAX_ITEMS,
  RECIPE_UNMET_TARGETS_MAX_ITEMS,
  type PulseAiRecipe,
  type RecipeTargetNutrient,
  type RecipeUnmetTarget,
} from '@blendi/shared';
import { BLENDER_LIMITS } from '@blendi/shared';

import type { BlendiModel } from '../models/User';
import { estimateRecipeVolumeMl } from './recipeVolume.utils';

export function withRequestNotices(
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

// ─── CP-B7: pedido que não entrou (item ou valor) ───────────────────────────

/**
 * Itens pedidos que a receita não conseguiu incluir (aviso "Não conseguimos
 * incluir: X"). Só o backend preenche; lista vazia tira o campo.
 */
export function withMissingRequestedIngredients(recipe: PulseAiRecipe, missing: readonly string[]): PulseAiRecipe {
  const { missingRequestedIngredients: _previous, ...rest } = recipe;
  void _previous;
  const seen = new Set<string>();
  const items = missing
    .map(item => item.trim())
    .filter(item => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RECIPE_MISSING_REQUEST_MAX_ITEMS);

  return items.length > 0 ? { ...rest, missingRequestedIngredients: items } : rest;
}

/** Valores pedidos não atingidos ("Chegamos a X (você pediu Y)"). Só o backend preenche. */
export function withUnmetTargets(recipe: PulseAiRecipe, unmet: readonly RecipeUnmetTarget[]): PulseAiRecipe {
  const { unmetTargets: _previous, ...rest } = recipe;
  void _previous;
  const items = unmet.slice(0, RECIPE_UNMET_TARGETS_MAX_ITEMS);

  return items.length > 0 ? { ...rest, unmetTargets: items } : rest;
}

export type RequestCheckOrigin = 'pulse_ai' | 'pantry';

interface RequestUnmetLogContext {
  origin: RequestCheckOrigin;
  /** Novas tentativas feitas para esta conferência. */
  attempts: number;
  provider?: string;
  model?: string;
}

/**
 * Evento de log "requested item unmet": a receita saiu com
 * missingRequestedIngredients. Só códigos e contagens — NUNCA o nome do
 * ingrediente, a mensagem, a receita ou dados do usuário. Para medir em
 * produção se a IA ainda erra (docs/gemini-costs.md).
 */
export function logRequestedItemUnmet(context: RequestUnmetLogContext & { count: number }): void {
  console.warn('[requestCheck] requested item unmet', {
    event: 'requested_item_unmet',
    origin: context.origin,
    type: 'ingredient',
    count: context.count,
    attempts: context.attempts,
    provider: context.provider ?? 'unknown',
    model: context.model ?? 'unknown',
  });
}

/** Evento de log "requested target unmet": um por nutriente não atingido. Mesmas regras do de cima. */
export function logRequestedTargetUnmet(context: RequestUnmetLogContext & { nutrients: readonly RecipeTargetNutrient[] }): void {
  for (const nutrient of context.nutrients) {
    console.warn('[requestCheck] requested target unmet', {
      event: 'requested_target_unmet',
      origin: context.origin,
      type: 'target',
      nutrient,
      count: context.nutrients.length,
      attempts: context.attempts,
      provider: context.provider ?? 'unknown',
      model: context.model ?? 'unknown',
    });
  }
}

// ─── CP-B8a: o capacityNotice só vale perto do limite do copo ───────────────

/**
 * O aviso do copo ("não coube") só é aceito quando o volume estimado da
 * receita está a pelo menos esta fração do limite do copo do usuário.
 * Abaixo disso a IA não tinha motivo físico para cortar o pedido.
 */
export const CAPACITY_NOTICE_MIN_VOLUME_PERCENT = 85;

/**
 * Itens sem medida ("1 pitada", "2 fatias") contam 0 no leitor de volume, que
 * então subestima a receita. Com algum item sem medida, o patamar é este
 * (mais baixo): o volume real é maior que o medido, mas não sabemos quanto.
 * Sem item sem medida vale o de cima. Um item sem medida nunca justifica o
 * aviso sozinho: abaixo deste patamar, o aviso cai.
 */
export const CAPACITY_NOTICE_MIN_VOLUME_PERCENT_WITH_UNMEASURED = 75;

export interface CapacityNoticeCheck {
  legitimate: boolean;
  /** Volume medido em % do limite do copo (arredondado). */
  volumePercent: number;
  unmeasured: number;
}

/**
 * Função única: o capacityNotice desta receita é legítimo? O mesmo leitor de
 * volume de sempre (estimateRecipeVolumeMl) contra o limite do copo do
 * modelo (contas 'other'/'none' gravam blendiModel 'Lite').
 */
export function checkCapacityNotice(
  recipe: Pick<PulseAiRecipe, 'ingredients' | 'capacityNotice'>,
  blendiModel: BlendiModel
): CapacityNoticeCheck {
  const { estimatedVolumeMl, unmeasured } = estimateRecipeVolumeMl(recipe.ingredients);
  const volumePercent = Math.round((estimatedVolumeMl / BLENDER_LIMITS[blendiModel].maxVolumeMl) * 100);
  const threshold = unmeasured.length > 0
    ? CAPACITY_NOTICE_MIN_VOLUME_PERCENT_WITH_UNMEASURED
    : CAPACITY_NOTICE_MIN_VOLUME_PERCENT;

  return {
    legitimate: Boolean(recipe.capacityNotice?.trim()) && volumePercent >= threshold,
    volumePercent,
    unmeasured: unmeasured.length,
  };
}

/**
 * CP-B7/CP-B8a: o motivo do pedido não ter entrado já está no card — a IA
 * ajustou a receita ao copo E o volume confirma (perto do limite). Só então
 * item e valor pedidos não são cobrados de novo nem viram um segundo aviso.
 */
export function hasLegitimateCapacityNotice(
  recipe: Pick<PulseAiRecipe, 'ingredients' | 'capacityNotice'>,
  blendiModel: BlendiModel
): boolean {
  return checkCapacityNotice(recipe, blendiModel).legitimate;
}

/**
 * Tira o capacityNotice que o volume não confirma (não chega ao app) e
 * registra o evento "capacity_notice_discarded" só com códigos e números.
 */
export function withVerifiedCapacityNotice(
  recipe: PulseAiRecipe,
  blendiModel: BlendiModel,
  meta: Omit<RequestUnmetLogContext, 'attempts'>
): PulseAiRecipe {
  if (!recipe.capacityNotice?.trim()) return recipe;

  const check = checkCapacityNotice(recipe, blendiModel);
  if (check.legitimate) return recipe;

  console.warn('[requestCheck] capacity notice discarded', {
    event: 'capacity_notice_discarded',
    origin: meta.origin,
    volumePercent: check.volumePercent,
    unmeasured: check.unmeasured,
    provider: meta.provider ?? 'unknown',
    model: meta.model ?? 'unknown',
  });

  const { capacityNotice: _discarded, ...rest } = recipe;
  void _discarded;
  return rest;
}

/**
 * CP-B7: aplica os avisos finais (item e valor pedidos) e registra o evento
 * de log de cada um. `missing` e `unmet` já vêm calculados pelo chamador.
 */
export function applyRequestCheckNotices(
  recipe: PulseAiRecipe,
  params: Omit<RequestUnmetLogContext, 'attempts'> & {
    blendiModel: BlendiModel;
    missing: readonly string[];
    unmet: readonly RecipeUnmetTarget[];
    itemAttempts: number;
    targetAttempts: number;
  }
): PulseAiRecipe {
  const meta = { origin: params.origin, provider: params.provider, model: params.model };
  // CP-B8a: o aviso do copo que o volume não confirma não chega ao app.
  const verified = withVerifiedCapacityNotice(recipe, params.blendiModel, meta);
  const withNotices = withUnmetTargets(withMissingRequestedIngredients(verified, params.missing), params.unmet);

  const missingCount = withNotices.missingRequestedIngredients?.length ?? 0;
  if (missingCount > 0) {
    logRequestedItemUnmet({ ...meta, count: missingCount, attempts: params.itemAttempts });
  }

  const unmetNutrients = (withNotices.unmetTargets ?? []).map(item => item.nutrient);
  if (unmetNutrients.length > 0) {
    logRequestedTargetUnmet({ ...meta, nutrients: unmetNutrients, attempts: params.targetAttempts });
  }

  return withNotices;
}
