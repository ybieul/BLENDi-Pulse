// packages/shared/src/utils/homeRecipeCompatibility.ts
// CP-1.1.9 — compatibilidade das receitas fixas da Home com a dieta e o
// modelo do BLENDi.
//
// Cada receita da Home (apps/mobile/src/components/home/dailyRecipes.data.ts)
// declara explicitamente o que contém (`contains`). O app filtra só por essa
// marcação — nunca por busca de texto em tempo de execução. A marcação é
// conferida em teste pelas MESMAS regras que o backend aplica nas receitas da
// IA (validateRecipeRestrictions, apps/api/src/utils/recipeRestrictions.utils.ts):
// apps/api/src/utils/homeRecipeMarkings.test.ts.

import { BLENDER_LIMITS, type BlenderModel } from '../blenderLimits';
import type { DietaryPreference } from '../schemas/user';

export const HOME_RECIPE_CONTENT_VALUES = ['dairy', 'animal', 'nuts', 'added_sugar', 'ice'] as const;
/**
 * - dairy: leite e derivados (inclui whey).
 * - animal: o que a regra vegana do backend barra além dos laticínios (mel,
 *   ovo, colágeno, proteína em pó/isolada sem origem vegetal declarada — por
 *   isso "Whey protein isolate" sai com dairy E animal).
 * - nuts: amendoim, castanhas e derivados (inclui granola comum).
 * - added_sugar: açúcar, mel, xarope, adoçante.
 * - ice: gelo (fruta congelada não conta).
 */
export type HomeRecipeContent = (typeof HOME_RECIPE_CONTENT_VALUES)[number];

/** O que cada dieta proíbe. vegan = laticínio + qualquer outro item animal. */
export const DIETARY_PREFERENCE_FORBIDDEN_CONTENTS: Readonly<
  Record<DietaryPreference, readonly HomeRecipeContent[]>
> = {
  dairy_free: ['dairy'],
  vegan: ['dairy', 'animal'],
  nut_free: ['nuts'],
  no_added_sugar: ['added_sugar'],
};

/** O BLENDi Lite (e as contas "outro modelo"/"sem BLENDi", gravadas como Lite) não recebe gelo. */
export const LITE_FORBIDDEN_CONTENTS: readonly HomeRecipeContent[] = ['ice'];

export type HomeRecipeBlendiModel = BlenderModel;

/** Conteúdos proibidos para esta combinação de dieta e modelo. */
export function getForbiddenHomeRecipeContents(
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: HomeRecipeBlendiModel
): Set<HomeRecipeContent> {
  const forbidden = new Set<HomeRecipeContent>(blendiModel === 'Lite' ? LITE_FORBIDDEN_CONTENTS : []);

  for (const preference of dietaryPreferences) {
    for (const content of DIETARY_PREFERENCE_FORBIDDEN_CONTENTS[preference] ?? []) {
      forbidden.add(content);
    }
  }

  return forbidden;
}

export function isHomeRecipeCompatible(
  contains: readonly HomeRecipeContent[],
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: HomeRecipeBlendiModel
): boolean {
  const forbidden = getForbiddenHomeRecipeContents(dietaryPreferences, blendiModel);
  return !contains.some(content => forbidden.has(content));
}

/** Proteína da receita dentro do limite físico do modelo (BLENDER_LIMITS). */
export function fitsBlenderProteinLimit(protein: number, blendiModel: HomeRecipeBlendiModel): boolean {
  return protein <= BLENDER_LIMITS[blendiModel].maxProteinGrams;
}

/**
 * Receita da Home liberada para esta pessoa: nada que a dieta proíba, nada
 * com gelo no Lite e proteína dentro do limite do modelo (Lite: 35 g).
 */
export function isHomeRecipeAllowed(
  recipe: { contains: readonly HomeRecipeContent[]; protein: number },
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: HomeRecipeBlendiModel
): boolean {
  return (
    isHomeRecipeCompatible(recipe.contains, dietaryPreferences, blendiModel) &&
    fitsBlenderProteinLimit(recipe.protein, blendiModel)
  );
}
