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

//
// CP-B6: marcações por alérgeno (os 8 códigos de ALLERGY_CODE_VALUES, com o
// mesmo nome), conferidas pelas famílias de alergia do backend
// (apps/api/src/utils/allergyFamilies.utils.ts) no mesmo teste. `nuts`
// continua sendo a marcação do nut_free (preferência, inalterada); `peanut` e
// `tree_nuts` são das alergias — a decisão foi separar, não derivar, porque
// as regras são diferentes (ex.: granola sem amendoim é peanut-free, mas não
// nut-free).

import type { BlenderModel } from '../blenderLimits';
import type { AllergyCode } from '../schemas/allergies';
import { namesMentionAllergyItem } from '../schemas/allergies';
import type { DietaryPreference } from '../schemas/user';

export const HOME_RECIPE_CONTENT_VALUES = [
  'dairy',
  'animal',
  'nuts',
  'added_sugar',
  'ice',
  'peanut',
  'tree_nuts',
  'milk',
  'lactose',
  'soy',
  'wheat_gluten',
  'sesame',
  'egg',
] as const;
/**
 * - dairy: leite e derivados (inclui whey).
 * - animal: o que a regra vegana do backend barra além dos laticínios (mel,
 *   ovo, colágeno, proteína em pó/isolada sem origem vegetal declarada — por
 *   isso "Whey protein isolate" sai com dairy E animal).
 * - nuts: amendoim, castanhas e derivados (inclui granola comum).
 * - added_sugar: açúcar, mel, xarope, adoçante.
 * - ice: gelo (fruta congelada não conta).
 * - peanut, tree_nuts, milk, lactose, soy, wheat_gluten, sesame, egg (CP-B6):
 *   o que a família de cada alergia barra.
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

/** CP-B6: o que cada alergia comum proíbe (a marcação tem o nome do código). */
export const ALLERGY_FORBIDDEN_CONTENTS: Readonly<Record<AllergyCode, readonly HomeRecipeContent[]>> = {
  peanut: ['peanut'],
  tree_nuts: ['tree_nuts'],
  milk: ['milk'],
  lactose: ['lactose'],
  soy: ['soy'],
  wheat_gluten: ['wheat_gluten'],
  sesame: ['sesame'],
  egg: ['egg'],
};

/** CP-B6: alergias consideradas no filtro da Home. */
export interface HomeRecipeAllergyFilter {
  common: readonly AllergyCode[];
  custom: readonly string[];
}

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

/**
 * Receita da Home liberada para esta pessoa: nada que a dieta proíba e nada
 * com gelo no Lite. CP-B2: o filtro por proteína (Lite até 35 g) saiu junto
 * com o teto de proteína por modelo — o único limite físico é o volume.
 */
export function isHomeRecipeAllowed(
  recipe: { contains: readonly HomeRecipeContent[] },
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: HomeRecipeBlendiModel,
  allergies?: HomeRecipeAllergyFilter,
  ingredientNames?: readonly string[]
): boolean {
  return (
    isHomeRecipeCompatible(recipe.contains, dietaryPreferences, blendiModel) &&
    isHomeRecipeAllergySafe(recipe, allergies, ingredientNames)
  );
}

/**
 * CP-B6: receita sem nenhum alérgeno cadastrado. Alergia comum: pela
 * marcação `contains`. Item do campo livre: pelos nomes dos ingredientes (o
 * chamador passa en e pt-BR), com a normalização do shared. Falha segura:
 * com item livre e sem os nomes, a receita não aparece.
 */
export function isHomeRecipeAllergySafe(
  recipe: { contains: readonly HomeRecipeContent[] },
  allergies: HomeRecipeAllergyFilter | undefined,
  ingredientNames: readonly string[] | undefined
): boolean {
  if (!allergies) return true;

  const forbidden = new Set<HomeRecipeContent>(
    allergies.common.flatMap(code => ALLERGY_FORBIDDEN_CONTENTS[code] ?? [])
  );
  if (recipe.contains.some(content => forbidden.has(content))) return false;

  if (allergies.custom.length === 0) return true;
  if (!ingredientNames) return false;

  return !allergies.custom.some(item => namesMentionAllergyItem(ingredientNames, item));
}
