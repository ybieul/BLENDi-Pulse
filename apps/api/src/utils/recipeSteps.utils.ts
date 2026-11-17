// apps/api/src/utils/recipeSteps.utils.ts
// CP-B2 — checagem objetiva dos passos da receita da IA (Pulse AI e Pantry),
// sem nova tentativa:
// - pulseCount só faz sentido com gelo ou ingrediente congelado. Se nenhum
//   ingrediente da receita é gelo/congelado, o pulseCount sai de todos os
//   passos (o texto do passo fica como está).
// - Inverter o copo só vale para o Steel. Fora dele, a menção nos passos ou
//   na blendInstruction é registrada no log (só o campo e o índice, nunca o
//   texto) — o prompt é quem proíbe; aqui é só observação.

import type { PulseAiRecipe } from '@blendi/shared';

import type { BlendiModel } from '../models/User';
import { mentionsIceOrFrozen } from './recipeRestrictions.utils';

// Sem acento e em minúsculas (ver normalizeForInvertCheck).
const INVERT_CUP_PATTERNS: readonly RegExp[] = [
  /\binvert\w*/, // invert, inverted, inverta, inverter, invertido
  /\bupside[\s-]+down\b/,
  /\bflip\w*\s+(?:the\s+|your\s+)?(?:cup|bottle|blender|jar)\b/,
  /\bturn\s+(?:the\s+|your\s+)?(?:cup|bottle|blender|jar)\s+over\b/,
  /\bde\s+cabeca\s+para\s+baixo\b/,
  /\bvir(?:e|ar)\s+o\s+copo\b/,
];

function normalizeForInvertCheck(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function mentionsInvertingCup(text: string): boolean {
  const normalized = normalizeForInvertCheck(text);
  return INVERT_CUP_PATTERNS.some(pattern => pattern.test(normalized));
}

export interface RecipeStepCheckReport {
  /** Quantos passos perderam o pulseCount. */
  removedPulseCounts: number;
  /** Onde a receita cita inverter o copo fora do Steel (sem o texto). */
  invertMentions: Array<{ field: 'step' | 'blendInstruction'; index?: number }>;
}

export interface RecipeStepCheckResult {
  recipe: PulseAiRecipe;
  report: RecipeStepCheckReport;
}

export function checkRecipeSteps(recipe: PulseAiRecipe, blendiModel: BlendiModel): RecipeStepCheckResult {
  const steps = recipe.steps ?? [];
  const hasIceOrFrozen = recipe.ingredients.some(ingredient => mentionsIceOrFrozen(ingredient.name));

  let removedPulseCounts = 0;
  const checkedSteps = steps.map(step => {
    if (step.pulseCount === undefined || hasIceOrFrozen) {
      return step;
    }

    removedPulseCounts += 1;
    return { text: step.text };
  });

  const invertMentions: RecipeStepCheckReport['invertMentions'] = [];
  if (blendiModel !== 'Steel') {
    steps.forEach((step, index) => {
      if (mentionsInvertingCup(step.text)) invertMentions.push({ field: 'step', index });
    });
    if (mentionsInvertingCup(recipe.blendInstruction)) invertMentions.push({ field: 'blendInstruction' });
  }

  return {
    recipe: removedPulseCounts > 0 ? { ...recipe, steps: checkedSteps } : recipe,
    report: { removedPulseCounts, invertMentions },
  };
}

/** Aplica a checagem e registra no log o que foi feito (sem texto da receita). */
export function applyRecipeStepCheck(
  recipe: PulseAiRecipe,
  blendiModel: BlendiModel,
  logPrefix: string
): PulseAiRecipe {
  const { recipe: checked, report } = checkRecipeSteps(recipe, blendiModel);

  if (report.removedPulseCounts > 0) {
    console.info(`${logPrefix} pulseCount removed from steps without ice or frozen ingredients`, {
      removedPulseCounts: report.removedPulseCounts,
    });
  }

  if (report.invertMentions.length > 0) {
    console.warn(`${logPrefix} recipe mentions inverting the cup outside the Steel`, {
      blendiModel,
      locations: report.invertMentions,
    });
  }

  return checked;
}
