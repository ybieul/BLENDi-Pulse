// apps/api/src/utils/recipeNotices.utils.ts
// CP-B5: marcações do backend para o card — ingredientes fora da dieta que a
// pessoa pediu (pelos índices que o validador liberou) e "versão sem álcool".
// Sempre recalculadas: nada disso vem da IA. Usado pelo Pulse AI e, desde o
// CP-B5.4, pelo Pantry Scanner (mesma função, sem segunda lógica).

import { RECIPE_DIET_OVERRIDE_MAX_ITEMS, type PulseAiRecipe } from '@blendi/shared';

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
