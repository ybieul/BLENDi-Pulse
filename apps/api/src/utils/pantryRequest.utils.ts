// apps/api/src/utils/pantryRequest.utils.ts
// CP-B5.4 — Pantry Scanner em duas etapas: o que a pessoa confirmou na tela
// (marcados, adicionados à mão, líquido e pedido) e as conferências
// determinísticas sobre as receitas geradas.
//
// Nenhuma segunda lógica de texto: tudo usa a normalização do validador de
// restrições (recipeRestrictions.utils.ts) — acentos, minúsculas, compostos,
// singular/plural, exceções e negação.
// - Bebida alcoólica: a MESMA lista do validador (findAlcoholMentions), com
//   os falsos amigos ("ginger beer", "cerveja sem álcool", "essência de rum").
// - Líquido na foto: lista curta de líquidos de base compilada com
//   compileTermList (a visão não informa isso).
// - Item presente na receita: os tokens do item (sem número, unidade e
//   conectivo) aparecem todos num mesmo ingrediente, com singular/plural.

import type { PulseAiRecipe } from '@blendi/shared';

import {
  compilePhrase,
  compileTermList,
  findAlcoholMentions,
  findPhraseOccurrences,
  findTermMentions,
  tokenizeSegments,
} from './recipeRestrictions.utils';
import { isPlainWater } from './recipeWater.utils';

// ─── Bebida alcoólica ────────────────────────────────────────────────────────

/** O nome cita bebida alcoólica (lista do validador, sem negação). */
export function isAlcoholicItemName(name: string): boolean {
  return findAlcoholMentions(name).some(mention => !mention.negated);
}

// ─── Líquido na foto ─────────────────────────────────────────────────────────

/**
 * Líquidos que servem de base para um blend. Iogurte não conta (fica grosso
 * sem líquido — CP-B2) e bebida alcoólica também não (é opcional e só 21+).
 * CP-B7a: bebidas com gás (refrigerante, água tônica, ginger beer, cerveja
 * sem álcool) também não: não são base de blend.
 * Exceções: leite condensado/em pó, chocolate ao leite, doce de leite.
 */
const PHOTO_LIQUID_TERMS = compileTermList({
  en: [
    'water',
    'milk',
    'soymilk',
    'juice',
    'kefir',
    'beverage',
    'lemonade',
    'kombucha',
    'nectar',
    'sports drink',
    'coconut water',
  ],
  pt: ['agua', 'leite', 'suco', 'bebida', 'limonada', 'nectar', 'isotonico', 'agua de coco'],
  exceptions: [
    'condensed milk',
    'milk powder',
    'powdered milk',
    'dry milk',
    'milk chocolate',
    'leite condensado',
    'leite em po',
    'chocolate ao leite',
    'doce de leite',
    // CP-B7a: água tônica não é base de blend (amarga e com gás). Refrigerante,
    // ginger beer e cerveja sem álcool nem estão na lista: com gás, também
    // não contam — a tela pergunta o líquido.
    'tonic water',
    'agua tonica',
  ],
});

export function isPhotoLiquidName(name: string): boolean {
  return (
    !isAlcoholicItemName(name) &&
    findTermMentions(name, PHOTO_LIQUID_TERMS).some(mention => !mention.negated)
  );
}

export function hasPhotoLiquid(ingredients: ReadonlyArray<{ name: string }>): boolean {
  return ingredients.some(ingredient => isPhotoLiquidName(ingredient.name));
}

// ─── Item presente na receita ────────────────────────────────────────────────

// Não identificam o ingrediente: conectivos, artigos e unidades de medida.
const NON_IDENTIFYING_TOKENS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'com', 'e', 'o', 'a', 'os', 'as', 'um', 'uma',
  'of', 'the', 'with', 'and', 'an', 'in',
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'fl', 'cup', 'cups', 'tbsp', 'tsp', 'scoop', 'scoops',
  'xicara', 'xicaras', 'colher', 'colheres', 'sopa', 'cha', 'grama', 'gramas', 'unidade', 'unidades',
]);

/** Tokens que identificam o item ("2 colheres de pasta de amendoim" → pasta, amendoim). */
export function identifyingTokens(item: string): string[] {
  return compilePhrase(item).filter(token => !NON_IDENTIFYING_TOKENS.has(token) && !/^\d+$/.test(token));
}

// Singular/plural nos dois sentidos ("bananas" pedido, "Banana" na receita).
function tokensMatch(a: string, b: string): boolean {
  return findPhraseOccurrences([[a]], [b]).length > 0 || findPhraseOccurrences([[b]], [a]).length > 0;
}

/** O nome do ingrediente contém todos os tokens que identificam o item. */
export function ingredientNameMatchesItem(ingredientName: string, item: string): boolean {
  const wanted = identifyingTokens(item);

  if (wanted.length === 0) {
    return false;
  }

  const nameTokens = tokenizeSegments(ingredientName).flat();
  return wanted.every(token => nameTokens.some(nameToken => tokensMatch(nameToken, token)));
}

/** Itens pedidos que não aparecem em nenhum ingrediente da receita. */
export function findMissingItems(
  recipe: Pick<PulseAiRecipe, 'ingredients'>,
  items: readonly string[]
): string[] {
  return items.filter(item => (
    identifyingTokens(item).length > 0 &&
    !recipe.ingredients.some(ingredient => ingredientNameMatchesItem(ingredient.name, item))
  ));
}

/**
 * Itens desmarcados que entraram na receita. Um ingrediente que também casa
 * com algo permitido (marcado, adicionado, líquido escolhido) não conta:
 * "Leite" desmarcado × "Leite de aveia" marcado.
 */
export function findUnselectedItemsUsed(
  recipe: Pick<PulseAiRecipe, 'ingredients'>,
  unselected: readonly string[],
  allowed: readonly string[]
): string[] {
  return unselected.filter(item => recipe.ingredients.some(ingredient => (
    ingredientNameMatchesItem(ingredient.name, item) &&
    !allowed.some(allowedItem => ingredientNameMatchesItem(ingredient.name, allowedItem))
  )));
}

/** A receita usa água pura (mesma definição da marcação de água fora da foto). */
export function recipeUsesPlainWater(recipe: Pick<PulseAiRecipe, 'ingredients'>): boolean {
  return recipe.ingredients.some(ingredient => isPlainWater(ingredient.name));
}
