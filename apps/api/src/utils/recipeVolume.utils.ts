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
// - O que não dá para medir (unidades: "1 banana", "1 scoop", "1 shot")
//   entra como 0 e fica listado em `unmeasured`.
//
// Resultado: um LIMITE INFERIOR do volume real. Um total acima do limite do
// copo é uma violação certa (sem falso positivo por item não medido); um
// total abaixo pode esconder itens não medidos — risco aceito para não
// bloquear receitas corretas por falta de unidade.

const UNIT_TO_ML: ReadonlyArray<readonly [RegExp, number]> = [
  // Ordem importa: frases mais longas primeiro.
  // CP-B2: o texto já chega sem acento (normalize), então "onça" vira
  // "onca" — antes a regex esperava "ç" e "onça fluida" nunca era lida.
  [/^(fl\.?\s*oz|fluid\s+ounces?|oncas?\s+fluidas?)\b/, 29.5735],
  [/^(colher(es)?\s+de\s+sopa|tablespoons?|tbsps?|tbs|cs)\b/, 14.787],
  [/^(colher(es)?\s+de\s+cha|colher(es)?\s+de\s+cafe|teaspoons?|tsps?|cc)\b/, 4.929],
  [/^(colher(es)?)\b/, 4.929],
  [/^(xicaras?|xic\.?|cups?)\b/, 236.6],
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

/** Volume em ml de um trecho "<número> <unidade>", ou null se não der para medir. */
function measure(text: string): number | null {
  const match = text.match(new RegExp(`${NUMBER_PATTERN.source}(?:\\s*[-–a]\\s*${NUMBER_PATTERN.source})?\\s*(.*)$`));
  if (!match) return null;

  const quantity = parseNumber(match[1]);
  if (quantity === null || quantity < 0) return null;

  // "1/4 de xícara", "2 colheres de sopa": o "de" entre número e unidade.
  const rest = (match[3] ?? '').replace(/^de\s+/, '');
  for (const [pattern, mlPerUnit] of UNIT_TO_ML) {
    if (pattern.test(rest)) {
      return quantity * mlPerUnit;
    }
  }
  return null;
}

/** Volume em ml de um `amount` da IA; null quando não é mensurável. */
export function estimateAmountVolumeMl(amount: string): number | null {
  const text = normalize(amount);
  if (!text) return null;

  // Medida entre parênteses prevalece ("1 scoop (30g)", "1 cup (240 ml)").
  for (const inner of text.match(/\(([^)]*)\)/g) ?? []) {
    const value = measure(inner.slice(1, -1).trim());
    if (value !== null) return value;
  }

  return measure(text.replace(/\([^)]*\)/g, ' ').trim());
}

export interface RecipeVolumeEstimate {
  /** Soma dos itens mensuráveis (limite inferior do volume real). */
  estimatedVolumeMl: number;
  /** `amount` dos itens que não deu para medir (contaram como 0). */
  unmeasured: string[];
}

export function estimateRecipeVolumeMl(ingredients: ReadonlyArray<{ amount: string }>): RecipeVolumeEstimate {
  let estimatedVolumeMl = 0;
  const unmeasured: string[] = [];

  for (const { amount } of ingredients) {
    const value = estimateAmountVolumeMl(amount);
    if (value === null) {
      unmeasured.push(amount);
    } else {
      estimatedVolumeMl += value;
    }
  }

  return { estimatedVolumeMl: Math.round(estimatedVolumeMl), unmeasured };
}
