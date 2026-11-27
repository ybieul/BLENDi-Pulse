// apps/api/src/utils/recipeVolume.utils.ts
// CP-1.1.9 — estimativa do volume de uma receita da IA a partir do texto livre
// de `amount` ("30g", "200ml", "1 cup", "1/2 xícara", "1 scoop (30g)",
// "8 fl oz", "2 colheres de sopa"...), para validar o limite físico do copo.
//
// Regras:
// - Sólidos: 1 g conta como 1 ml (mesma convenção das receitas fixas da Home
//   e da instrução dada à IA no prompt).
// - Medidas caseiras em medidas americanas (cup 236,6 ml, tbsp 14,8 ml, tsp
//   4,9 ml); "colher" sem tipo conta como de chá (a menor).
// - Quando o texto traz uma medida entre parênteses ("1 scoop (30g)"), ela
//   prevalece — é a mais precisa.
// - Faixa ("2-3 tbsp") usa o menor valor.
// - O que não dá para medir entra como 0 e fica listado em `unmeasured`.
//
// - CP-B3: quantidade em xícara ou colher (de sopa, de chá) de um ingrediente
//   da tabela de pesos típicos (ingredientWeights.utils.ts: folhas, frutas em
//   pedaços, aveia, pós, sementes, pastas, iogurte) conta os gramas típicos
//   (1 g = 1 ml), não a medida cheia: "1 cup spinach" = 30 ml, como "30 g de
//   espinafre". Líquidos e o que não está na tabela contam a medida.
//
// - CP-A: quantidade só com número, sem medida ("1 banana", "2 tâmaras",
//   "1 unidade média" de banana, "1/4 de abacate", "1 talo de aipo", "1
//   punhado de espinafre", "1 scoop" de proteína, "1 dose de espresso"),
//   conta o peso típico de 1 unidade da tabela por unidade
//   (ingredientWeights.utils.ts, USDA, tamanho médio). Sem casar com a tabela,
//   continua contando 0. É o mesmo leitor para a IA (Pulse AI e Pantry) e
//   para medir as receitas da Home.
//
// - CP-A (ajustes 7 e 8): "fluid oz" é lido como onça fluida; concentrado
//   líquido ("tart cherry concentrate") conta pela medida, como líquido, e não
//   como a fruta do nome (ver CONCENTRATE_INGREDIENT_TERMS).
//
// Resultado: um LIMITE INFERIOR do volume real. Um total acima do limite do
// copo é uma violação certa (sem falso positivo por item não medido); um
// total abaixo pode esconder itens não medidos — risco aceito para não
// bloquear receitas corretas por falta de unidade.

import { ML_PER_US_FLUID_OUNCE } from '@blendi/shared';
import { findTypicalIngredientWeight, findUnitIngredientWeight } from './ingredientWeights.utils';

/** Medidas caseiras que podem usar o peso típico do ingrediente (CP-B3). */
type HouseholdMeasure = 'cup' | 'tbsp' | 'tsp';

/** Fração da xícara de cada medida caseira (colher de sopa = 1/16; de chá = 1/48). */
const CUP_FRACTION: Record<HouseholdMeasure, number> = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48 };

const UNIT_TO_ML: ReadonlyArray<readonly [RegExp, number, HouseholdMeasure?]> = [
  // Ordem importa: frases mais longas primeiro.
  // CP-B2: o texto já chega sem acento (normalize), então "onça" vira
  // "onca" — antes a regex esperava "ç" e "onça fluida" nunca era lida.
  // CP-A (ajuste 7): "fluid oz" também ("8 fluid oz" contava 0).
  [/^(fl\.?\s*oz|fluid\s+(?:ounces?|oz)|oncas?\s+fluidas?)\b/, ML_PER_US_FLUID_OUNCE],
  [/^(colher(es)?\s+de\s+sopa|tablespoons?|tbsps?|tbs|cs)\b/, 14.787, 'tbsp'],
  [/^(colher(es)?\s+de\s+cha|colher(es)?\s+de\s+cafe|teaspoons?|tsps?|cc)\b/, 4.929, 'tsp'],
  [/^(colher(es)?)\b/, 4.929, 'tsp'],
  [/^(xicaras?|xic\.?|cups?)\b/, 236.6, 'cup'],
  [/^(mililitros?|millilit(er|re)s?|ml)\b/, 1],
  [/^(centilitros?|cl)\b/, 10],
  [/^(decilitros?|dl)\b/, 100],
  [/^(litros?|lit(er|re)s?|l)\b/, 1000],
  [/^(miligramas?|milligrams?|mg)\b/, 0.001],
  [/^(quilogramas?|quilos?|kilograms?|kgs?)\b/, 1000],
  [/^(gramas?|grams?|gr|g)\b/, 1],
  [/^(oncas?|ounces?|oz)\b/, 28.35],
  [/^(libras?|pounds?|lbs?)\b/, 453.6],
];

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
};

// número: "1", "1.5", "1,5", "1/2", "1 1/2", "½", "1½"
// Ordem: misto e fração antes do decimal (senão "1/2" vira "1").
const NUMBER_PATTERN = /(\d+\s+\d+\/\d+|\d+\/\d+|\d*[¼½¾⅓⅔⅛]|\d+(?:[.,]\d+)?)/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // "1 colher (sopa)" = "1 colher de sopa": o tipo da colher entre
    // parênteses não é uma medida e não pode ser descartado (CP-B2).
    .replace(/\b(colher(?:es)?)\s*\((sopa|cha|cafe)\)/g, '$1 de $2');
}

function parseNumber(raw: string): number | null {
  const value = raw.trim();
  const unicode = value.match(/^(\d*)([¼½¾⅓⅔⅛])$/);
  if (unicode) {
    return (unicode[1] ? Number(unicode[1]) : 0) + UNICODE_FRACTIONS[unicode[2]];
  }
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  }
  const decimal = Number(value.replace(',', '.'));
  return Number.isFinite(decimal) ? decimal : null;
}

/**
 * Volume em ml de um trecho "<número> <unidade>", ou null se não der para
 * medir. Com `gramsPerCup` (peso típico do ingrediente), xícara e colher
 * contam os gramas (1 g = 1 ml) em vez da medida. Sem unidade de medida, o
 * número conta unidades do item da tabela por unidade (CP-A), achado no resto
 * do texto e no nome do ingrediente.
 */
function measure(text: string, gramsPerCup: number | null, ingredientName: string): number | null {
  const match = text.match(new RegExp(`${NUMBER_PATTERN.source}(?:\\s*[-–a]\\s*${NUMBER_PATTERN.source})?\\s*(.*)$`));
  if (!match) return null;

  const quantity = parseNumber(match[1]);
  if (quantity === null || quantity < 0) return null;

  // "1/4 de xícara", "2 colheres de sopa": o "de" entre número e unidade.
  const rest = (match[3] ?? '').replace(/^de\s+/, '');
  for (const [pattern, mlPerUnit, household] of UNIT_TO_ML) {
    if (pattern.test(rest)) {
      return household && gramsPerCup !== null
        ? quantity * gramsPerCup * CUP_FRACTION[household]
        : quantity * mlPerUnit;
    }
  }

  const unitWeight = findUnitIngredientWeight(rest, ingredientName);
  return unitWeight ? quantity * unitWeight.gramsPerUnit : null;
}

/**
 * Volume em ml de um `amount` da IA; null quando não é mensurável. Sem o
 * nome do ingrediente, xícara e colher contam a medida cheia, e a contagem
 * por unidade só usa o que estiver no próprio `amount` ("2 kiwis").
 */
export function estimateAmountVolumeMl(amount: string, ingredientName?: string): number | null {
  const text = normalize(amount);
  if (!text) return null;

  const gramsPerCup = ingredientName ? findTypicalIngredientWeight(ingredientName)?.gramsPerCup ?? null : null;

  // Medida entre parênteses prevalece ("1 scoop (30g)", "1 cup (240 ml)").
  for (const inner of text.match(/\(([^)]*)\)/g) ?? []) {
    const value = measure(inner.slice(1, -1).trim(), gramsPerCup, ingredientName ?? '');
    if (value !== null) return value;
  }

  return measure(text.replace(/\([^)]*\)/g, ' ').trim(), gramsPerCup, ingredientName ?? '');
}

/** CP-B3: volume em ml de um ingrediente (nome + quantidade); null quando não é mensurável. */
export function estimateIngredientVolumeMl(ingredient: { name: string; amount: string }): number | null {
  return estimateAmountVolumeMl(ingredient.amount, ingredient.name);
}

export interface RecipeVolumeEstimate {
  /** Soma dos itens mensuráveis (limite inferior do volume real). */
  estimatedVolumeMl: number;
  /** `amount` dos itens que não deu para medir (contaram como 0). */
  unmeasured: string[];
}

export function estimateRecipeVolumeMl(
  ingredients: ReadonlyArray<{ name: string; amount: string }>
): RecipeVolumeEstimate {
  let estimatedVolumeMl = 0;
  const unmeasured: string[] = [];

  for (const ingredient of ingredients) {
    const value = estimateIngredientVolumeMl(ingredient);
    if (value === null) {
      unmeasured.push(ingredient.amount);
    } else {
      estimatedVolumeMl += value;
    }
  }

  return { estimatedVolumeMl: Math.round(estimatedVolumeMl), unmeasured };
}
