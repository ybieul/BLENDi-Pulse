// apps/api/src/utils/recipeWater.utils.ts
// CP-B2 — Pantry Scanner: água é o único ingrediente permitido fora da foto.
// Aqui se decide se uma receita usa água que não estava entre os
// ingredientes detectados (usesWaterNotInPhoto), para o app avisar no card.
//
// "Água" é água pura (com ou sem gás, gelada, filtrada...). Não contam: água
// de coco, água tônica, kefir de água, melancia/watermelon (outro token).

import type { PulseAiRecipe } from '@blendi/shared';

const WATER_TOKENS = new Set(['water', 'agua', 'aguas', 'waters']);
const NOT_PLAIN_WATER_TOKENS = new Set([
  'coconut', 'coco', 'tonic', 'tonica', 'kefir', 'rose', 'rosas', 'flor', 'flores', 'flower',
]);

function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isPlainWater(name: string): boolean {
  const words = tokens(name);
  return words.some(word => WATER_TOKENS.has(word)) && !words.some(word => NOT_PLAIN_WATER_TOKENS.has(word));
}

export function usesWaterNotInPhoto(
  recipe: Pick<PulseAiRecipe, 'ingredients'>,
  detectedIngredients: ReadonlyArray<{ name: string }>
): boolean {
  const recipeUsesWater = recipe.ingredients.some(ingredient => isPlainWater(ingredient.name));
  const photoHasWater = detectedIngredients.some(ingredient => isPlainWater(ingredient.name));

  return recipeUsesWater && !photoHasWater;
}

/** Marca (ou desmarca) a receita do Pantry — o campo só aparece quando é true. */
export function markWaterNotInPhoto(
  recipe: PulseAiRecipe,
  detectedIngredients: ReadonlyArray<{ name: string }>
): PulseAiRecipe {
  const { usesWaterNotInPhoto: _previous, ...rest } = recipe;
  void _previous;

  return usesWaterNotInPhoto(recipe, detectedIngredients) ? { ...rest, usesWaterNotInPhoto: true } : rest;
}
