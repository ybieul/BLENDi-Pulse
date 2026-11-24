// apps/api/src/utils/requestedTargets.utils.ts
// CP-B7 — valores pedidos (proteína, carboidrato, gordura e calorias) na
// mensagem atual do Pulse AI ou no "Algum pedido?" do Pantry Scanner, e a
// conferência contra os macros declarados da receita (os mesmos da
// conferência 4/4/9 + álcool).
//
// Por quê: no lote 13 "com 30 g de proteína" saiu com 19,8 g e sem aviso
// (capacityNotice vazio). O valor pedido era obrigatório só pelo prompt.
//
// Tipos de pedido (en e pt-BR, número inteiro ou decimal com vírgula ou ponto):
// - exato: "30 g de proteína", "30 gramas de proteína", "protein 30 g",
//   "400 kcal", "400 calorias", "50g carbs" → ±TARGET_TOLERANCE_PERCENT;
// - mínimo: "pelo menos 30 g", "no mínimo", "at least", "30 g ou mais",
//   "mais de", "more than";
// - máximo: "até 300 kcal", "no máximo", "at most", "under 300 kcal",
//   "menos de", "less than", "up to";
// - faixa: "entre 20 e 30 g", "20-30 g", "de 20 a 30 g", "between 20 and 30 g".
// "30 g de proteína em pó"/"30 g protein powder" é quantidade de ingrediente,
// não valor pedido. Sem número ("rico em proteína", "low carb") não conta.
//
// A normalização de caracteres é a do validador (normalizeForMatching: sem
// acento, minúsculas); os números precisam da vírgula e do ponto, que o
// tokenizador do validador usa para cortar o texto.

import type {
  DietaryPreference,
  RecipeTargetKind,
  RecipeTargetNutrient,
  RecipeTargetSuggestion,
  RecipeUnmetTarget,
  PulseAiRecipe,
} from '@blendi/shared';

import { normalizeForMatching } from './recipeRestrictions.utils';

/** Tolerância do valor pedido (constante única dos dois recursos). */
export const TARGET_TOLERANCE_PERCENT = 10;

/** Novas tentativas quando o valor pedido não foi atingido. */
export const REQUESTED_TARGET_MAX_RETRIES = 1;

export interface RequestedTarget {
  nutrient: RecipeTargetNutrient;
  kind: RecipeTargetKind;
  /** Exato, mínimo ou máximo; na faixa, o mínimo. */
  value: number;
  /** Só na faixa. */
  max?: number;
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const GRAM_UNIT = String.raw`(?:g|gr|grs|gramas?|grams?)\b`;
const KCAL_UNIT = String.raw`(?:kcals?|calorias?|calories|calorie|cal)\b`;

const NUTRIENT_WORDS: Record<Exclude<RecipeTargetNutrient, 'calories'>, readonly string[]> = {
  protein: ['proteinas?', 'proteins?', 'prot'],
  carbs: ['carboidratos?', 'carbohydrates?', 'carbos?', 'carbs?', 'hidratos? de carbono'],
  fat: ['gorduras?', 'fats?', 'lipidios?'],
};

// "30 g de proteína em pó" é ingrediente, não valor pedido.
const NOT_A_TARGET_AFTER = String.raw`(?!\s*(?:em\s+po|powder|isolad[ao]|isolate|concentrad[ao]|concentrate|vegetal|de\s+soro|de\s+ervilha|de\s+soja|de\s+arroz|bars?|barras?|shakes?)\b)`;

const MIN_PREFIX = String.raw`(?:pelo\s+menos|no\s+minimo|minimo\s+de|at\s+least|minimum\s+of|minimum|min|mais\s+de|more\s+than|over|acima\s+de|above|no\s+less\s+than)`;
const MAX_PREFIX = String.raw`(?:ate|no\s+maximo|maximo\s+de|at\s+most|maximum\s+of|maximum|max|under|menos\s+de|less\s+than|below|abaixo\s+de|up\s+to|no\s+more\s+than|nao\s+mais\s+que|not\s+more\s+than)`;
const MIN_SUFFIX = String.raw`(?:\+|ou\s+mais|or\s+more|no\s+minimo|at\s+least|minimo)`;
const MAX_SUFFIX = String.raw`(?:ou\s+menos|or\s+less|no\s+maximo|at\s+most|maximo|max)`;
const SUFFIX = String.raw`(?:\s*(?:${MIN_SUFFIX}|${MAX_SUFFIX})(?![a-z]))`;

// Faixa: "entre 20 e 30", "between 20 and 30", "de 20 a 30", "20-30", "20 a 30", "20 to 30".
const RANGE = String.raw`(?:\b(?:entre|between)\s+${NUMBER}\s*(?:${GRAM_UNIT}|${KCAL_UNIT})?\s*(?:e|and|a|-|–|to)\s*${NUMBER}|(?:\b(?:de|from)\s+)?${NUMBER}\s*(?:-|–|\ba\b|\bto\b)\s*${NUMBER})`;
const AMOUNT = String.raw`(?:\b(?:${MIN_PREFIX}|${MAX_PREFIX})\s+)?(?:${RANGE}|${NUMBER})`;

function nutrientAlternation(prefix: string): string {
  return Object.entries(NUTRIENT_WORDS)
    .map(([nutrient, words]) => `(?<${prefix}${nutrient}>${words.join('|')})`)
    .join('|');
}

// A: "<valor> g (de) <nutriente>"; B: "<nutriente> (:|de) <valor> g"; C: "<valor> kcal".
// Uma regex só, varrida da esquerda para a direita: um trecho nunca conta duas vezes.
const TARGET_PATTERN = new RegExp(
  [
    String.raw`(?<a>${AMOUNT}\s*${GRAM_UNIT}(?<aSuffix>${SUFFIX})?\s*(?:de\s+|of\s+)?\b(?:${nutrientAlternation('a_')})\b${NOT_A_TARGET_AFTER}(?<aSuffix2>${SUFFIX})?)`,
    String.raw`(?<b>\b(?:${nutrientAlternation('b_')})\b\s*(?::|=|\bde\b|\bof\b)?\s*${AMOUNT}\s*${GRAM_UNIT}(?<bSuffix>${SUFFIX})?)`,
    String.raw`(?<c>${AMOUNT}\s*${KCAL_UNIT}(?<cSuffix>${SUFFIX})?)`,
  ].join('|'),
  'g'
);

// Lê de novo o trecho casado para separar prefixo e números.
const AMOUNT_DETAIL = new RegExp(
  String.raw`(?:\b(?<prefix>${MIN_PREFIX}|${MAX_PREFIX})\s+)?(?:\b(?:entre|between)\s+(?<r1>${NUMBER})\s*(?:${GRAM_UNIT}|${KCAL_UNIT})?\s*(?:e|and|a|-|–|to)\s*(?<r2>${NUMBER})|(?:\b(?:de|from)\s+)?(?<r3>${NUMBER})\s*(?:-|–|\ba\b|\bto\b)\s*(?<r4>${NUMBER})|(?<single>${NUMBER}))`
);
const MIN_PREFIX_ONLY = new RegExp(String.raw`^${MIN_PREFIX}$`);
const MIN_SUFFIX_ONLY = new RegExp(String.raw`^\s*${MIN_SUFFIX}$`);

function parseNumber(raw: string, nutrient: RecipeTargetNutrient): number {
  // "1.000 kcal" / "1,200 kcal": separador de milhar só nas calorias.
  if (nutrient === 'calories' && /^\d{1,2}[.,]\d{3}$/.test(raw)) {
    return Number(raw.replace(/[.,]/, ''));
  }
  return Number(raw.replace(',', '.'));
}

const MAX_SANE_VALUE: Record<RecipeTargetNutrient, number> = { protein: 300, carbs: 500, fat: 300, calories: 5000 };

function nutrientOfMatch(groups: Record<string, string | undefined>): RecipeTargetNutrient {
  if (groups.c !== undefined) return 'calories';
  for (const nutrient of ['protein', 'carbs', 'fat'] as const) {
    if (groups[`a_${nutrient}`] !== undefined || groups[`b_${nutrient}`] !== undefined) return nutrient;
  }
  return 'protein';
}

/**
 * Valores pedidos no texto, no máximo um por nutriente (o primeiro). Texto
 * vazio ou sem valor: lista vazia.
 */
export function parseRequestedTargets(text: string | undefined): RequestedTarget[] {
  if (!text?.trim()) return [];

  const normalized = normalizeForMatching(text);
  const targets: RequestedTarget[] = [];

  for (const match of normalized.matchAll(TARGET_PATTERN)) {
    const groups = match.groups ?? {};
    const nutrient = nutrientOfMatch(groups);
    if (targets.some(target => target.nutrient === nutrient)) continue;

    const detail = AMOUNT_DETAIL.exec(match[0])?.groups;
    if (!detail) continue;

    const suffix = groups.aSuffix ?? groups.aSuffix2 ?? groups.bSuffix ?? groups.cSuffix;
    const rangeLow = detail.r1 ?? detail.r3;
    const rangeHigh = detail.r2 ?? detail.r4;

    let target: RequestedTarget;
    if (rangeLow !== undefined && rangeHigh !== undefined) {
      const low = parseNumber(rangeLow, nutrient);
      const high = parseNumber(rangeHigh, nutrient);
      target = { nutrient, kind: 'range', value: Math.min(low, high), max: Math.max(low, high) };
    } else {
      const value = parseNumber(detail.single ?? '', nutrient);
      const prefix = detail.prefix;
      const kind: RecipeTargetKind = prefix
        ? MIN_PREFIX_ONLY.test(prefix) ? 'min' : 'max'
        : suffix
          ? MIN_SUFFIX_ONLY.test(suffix) ? 'min' : 'max'
          : 'exact';
      target = { nutrient, kind, value };
    }

    const values = [target.value, ...(target.max !== undefined ? [target.max] : [])];
    if (values.every(value => Number.isFinite(value) && value > 0 && value <= MAX_SANE_VALUE[nutrient])) {
      targets.push(target);
    }
  }

  return targets;
}

// ─── Conferência ─────────────────────────────────────────────────────────────

const TOLERANCE = TARGET_TOLERANCE_PERCENT / 100;

export function isTargetMet(target: RequestedTarget, delivered: number): boolean {
  switch (target.kind) {
    case 'exact':
      return Math.abs(delivered - target.value) <= target.value * TOLERANCE;
    case 'min':
      return delivered >= target.value * (1 - TOLERANCE);
    case 'max':
      return delivered <= target.value * (1 + TOLERANCE);
    case 'range':
      return delivered >= target.value * (1 - TOLERANCE) && delivered <= (target.max ?? target.value) * (1 + TOLERANCE);
  }
}

/** Ficou abaixo do pedido (para a sugestão e a dica da nova tentativa). */
export function isBelowTarget(target: RequestedTarget, delivered: number): boolean {
  return delivered < target.value;
}

/** Valores pedidos que a receita não atingiu (macros declarados). */
export function findUnmetTargets(
  recipe: Pick<PulseAiRecipe, 'macros'>,
  targets: readonly RequestedTarget[]
): RecipeUnmetTarget[] {
  return targets.flatMap(target => {
    const delivered = recipe.macros[target.nutrient];
    if (isTargetMet(target, delivered)) return [];
    return [{
      nutrient: target.nutrient,
      kind: target.kind,
      requested: target.value,
      ...(target.max !== undefined ? { requestedMax: target.max } : {}),
      delivered,
    }];
  });
}

// ─── Sugestão (Pantry) ───────────────────────────────────────────────────────

/**
 * Sugestão simples quando o valor ficou abaixo do pedido, respeitando a dieta
 * (vegano/sem lactose → proteína vegetal; sem oleaginosas → sem pasta de
 * amendoim). Acima do pedido: nenhuma (adicionar não ajuda).
 */
export function suggestionForUnmetTarget(
  unmet: RecipeUnmetTarget,
  dietaryPreferences: readonly DietaryPreference[]
): RecipeTargetSuggestion | undefined {
  if (unmet.delivered >= unmet.requested) return undefined;

  const plantOnly = dietaryPreferences.includes('vegan') || dietaryPreferences.includes('dairy_free');
  const nutFree = dietaryPreferences.includes('nut_free');

  switch (unmet.nutrient) {
    case 'protein':
      return plantOnly ? 'plant_protein_powder' : 'whey_or_protein_powder';
    case 'carbs':
      return 'oats_or_banana';
    case 'fat':
      return nutFree ? 'avocado_or_chia' : 'peanut_butter';
    case 'calories':
      return nutFree ? 'oats_or_banana' : 'oats_or_peanut_butter';
  }
}

// ─── Nova tentativa ──────────────────────────────────────────────────────────

const UNIT: Record<RecipeTargetNutrient, string> = { protein: 'g', carbs: 'g', fat: 'g', calories: 'kcal' };
const NUTRIENT_LABEL: Record<RecipeTargetNutrient, string> = {
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  calories: 'calories',
};

function describeRequest(unmet: RecipeUnmetTarget): string {
  const unit = UNIT[unmet.nutrient];
  switch (unmet.kind) {
    case 'exact':
      return `${unmet.requested} ${unit}`;
    case 'min':
      return `at least ${unmet.requested} ${unit}`;
    case 'max':
      return `at most ${unmet.requested} ${unit}`;
    case 'range':
      return `between ${unmet.requested} and ${unmet.requestedMax ?? unmet.requested} ${unit}`;
  }
}

function hintFor(unmet: RecipeUnmetTarget, dietaryPreferences: readonly DietaryPreference[]): string {
  const below = unmet.delivered < unmet.requested;
  const plantOnly = dietaryPreferences.includes('vegan') || dietaryPreferences.includes('dairy_free');
  const nutFree = dietaryPreferences.includes('nut_free');

  if (!below) {
    switch (unmet.nutrient) {
      case 'protein': return 'reduce the protein-rich ingredients';
      case 'carbs': return 'reduce fruit, oats, honey and other sugary or starchy ingredients';
      case 'fat': return 'reduce nut butter, nuts, seeds, avocado and full-fat dairy';
      case 'calories': return 'reduce the quantities or swap to lighter ingredients';
    }
  }

  switch (unmet.nutrient) {
    case 'protein':
      return plantOnly
        ? 'add or increase plant protein powder or another plant protein source'
        : 'add or increase protein powder (whey or plant protein) or Greek yogurt';
    case 'carbs':
      return 'add or increase oats or fruit such as banana';
    case 'fat':
      return nutFree ? 'add or increase avocado or seeds such as chia' : 'add or increase peanut butter, nuts, seeds or avocado';
    case 'calories':
      return nutFree
        ? 'increase the quantities or add a more caloric allowed ingredient such as oats or banana'
        : 'increase the quantities or add a more caloric allowed ingredient such as oats, banana or peanut butter';
  }
}

/** Mensagem da nova tentativa: valor pedido × entregue, com dicas (respeitando dieta e volume). */
export function buildRequestedTargetsRetryMessage(
  unmet: readonly RecipeUnmetTarget[],
  options: { dietaryPreferences: readonly DietaryPreference[]; format: 'object' | 'pantry' }
): string {
  const details = unmet.map(item => (
    `the user asked for ${describeRequest(item)} of ${NUTRIENT_LABEL[item.nutrient]} and the recipe has ${item.delivered} ${UNIT[item.nutrient]} (${hintFor(item, options.dietaryPreferences)})`
  ));

  return [
    `Your previous recipe does not meet the nutrient values the user asked for: ${details.join('; ')}.`,
    `Adjust the ingredients and quantities so each value is within ${TARGET_TOLERANCE_PERCENT}% of what was asked, and calculate the macros from the real ingredient quantities.`,
    options.format === 'pantry'
      ? 'Use only the available ingredients, the required items and the liquid rules of this conversation.'
      : 'Use only ingredients allowed by the dietary restrictions, unless the current message asked for them.',
    'Keep every ingredient the user asked for and stay within the cup volume. If the value cannot fit the cup, build the closest recipe that fits and fill capacityNotice.',
    options.format === 'object'
      ? 'Then return only the corrected recipe as a single JSON object, in the same format and language.'
      : 'Return the corrected recipe.',
  ].join(' ');
}
