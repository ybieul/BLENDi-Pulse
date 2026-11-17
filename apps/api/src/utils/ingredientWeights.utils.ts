// apps/api/src/utils/ingredientWeights.utils.ts
// CP-B3 — peso típico de ingredientes medidos em xícara ou colher, para o
// leitor de volume (recipeVolume.utils.ts) contar o mesmo volume no métrico e
// no imperial.
//
// Por quê: o leitor conta 1 g de sólido como 1 ml. No métrico a IA escreve
// "30 g de espinafre" (30 ml); no imperial escreve "1 cup spinach", que
// contava a xícara cheia (236,6 ml) para os mesmos ~30 g de folhas. No teste
// ao vivo do CP-B2, 9-10 de 14 pedidos imperiais tinham nova tentativa por
// volume, contra 3 de 23 no métrico.
//
// Regra: quantidade em xícara, colher de sopa ou de chá + nome que casa com
// esta tabela → conta os gramas típicos (1 g = 1 ml). Sem casar, conta o
// volume da medida, como antes. Líquidos NÃO entram: um nome com termo de
// líquido (leite, água, suco, bebida...) nunca usa a tabela — "leite de
// aveia" não é aveia, "suco de morango" não é morango.
//
// Fonte: USDA FoodData Central (SR Legacy, medidas caseiras "1 cup"), salvo
// onde indicado. Colher de sopa = 1/16 da xícara; colher de chá = 1/48.
//
// Casamento do nome: a mesma normalização do validador de dieta
// (recipeRestrictions.utils.ts: tokens, sem acento, singular/plural), por
// palavra inteira; "banana congelada" e "morangos frescos" casam com o item
// base. Se o nome casa com mais de um item ("iogurte de morango"), vale o
// MAIOR peso — o mais perto da conta antiga pela xícara cheia, que nunca
// libera volume a mais por causa de um nome composto.

import { compilePhrase, findPhraseOccurrences, tokenizeSegments } from './recipeRestrictions.utils';

export interface TypicalIngredientWeight {
  /** Identificador estável (logs e testes). */
  id: string;
  /** Gramas em 1 xícara americana (236,6 ml). */
  gramsPerCup: number;
  /** Nomes em inglês e em pt-BR, no singular. */
  names: readonly string[];
  /** Palavras que, logo depois do nome, fazem dele outro ingrediente ("couve-flor"). */
  notFollowedBy?: readonly string[];
}

export const TYPICAL_INGREDIENT_WEIGHTS: readonly TypicalIngredientWeight[] = [
  // Folhas (cruas, picadas ou soltas).
  { id: 'spinach', gramsPerCup: 30, names: ['spinach', 'baby spinach', 'espinafre'] },
  { id: 'kale', gramsPerCup: 67, names: ['kale', 'couve', 'couve manteiga'], notFollowedBy: ['flor'] },
  { id: 'lettuce', gramsPerCup: 47, names: ['lettuce', 'romaine', 'alface'] },
  { id: 'arugula', gramsPerCup: 20, names: ['arugula', 'rocket', 'rucula'] },
  // Frutas em pedaços (frescas ou congeladas).
  { id: 'strawberry', gramsPerCup: 152, names: ['strawberry', 'morango'] },
  { id: 'blueberry', gramsPerCup: 148, names: ['blueberry', 'mirtilo'] },
  { id: 'raspberry', gramsPerCup: 123, names: ['raspberry', 'framboesa'] },
  { id: 'blackberry', gramsPerCup: 144, names: ['blackberry', 'amora'] },
  // Média de morango, mirtilo, framboesa e amora.
  {
    id: 'mixed_berries',
    gramsPerCup: 142,
    names: ['mixed berry', 'berry', 'fruta vermelha', 'fruta silvestre', 'frutas do bosque'],
  },
  { id: 'mango', gramsPerCup: 165, names: ['mango', 'manga'] },
  { id: 'pineapple', gramsPerCup: 165, names: ['pineapple', 'abacaxi'] },
  { id: 'papaya', gramsPerCup: 145, names: ['papaya', 'mamao', 'papaia'] },
  { id: 'banana', gramsPerCup: 150, names: ['banana'] },
  { id: 'watermelon', gramsPerCup: 152, names: ['watermelon', 'melancia'] },
  { id: 'grape', gramsPerCup: 151, names: ['grape', 'uva'] },
  { id: 'peach', gramsPerCup: 154, names: ['peach', 'pessego'] },
  { id: 'cherry', gramsPerCup: 154, names: ['cherry', 'cereja'] },
  // Aveia em flocos, crua.
  { id: 'oats', gramsPerCup: 81, names: ['oat', 'oatmeal', 'aveia'] },
  // Pós. Proteína: sem medida na USDA — rótulo típico, 1 scoop ≈ 30 g ≈ 1/3
  // de xícara. Matcha: rótulo típico, 1 colher de chá ≈ 2 g.
  { id: 'protein_powder', gramsPerCup: 90, names: ['protein', 'whey', 'proteina'] },
  { id: 'cocoa', gramsPerCup: 86, names: ['cocoa', 'cacao', 'cacau'] },
  { id: 'matcha', gramsPerCup: 96, names: ['matcha'] },
  // Sementes. Chia: rótulo típico, 1 colher de sopa ≈ 10 g. Linhaça: USDA, inteira.
  { id: 'chia', gramsPerCup: 160, names: ['chia'] },
  { id: 'flaxseed', gramsPerCup: 168, names: ['flax', 'flaxseed', 'linseed', 'linhaca'] },
  // Pastas (USDA: 2 colheres de sopa = 32 g).
  {
    id: 'nut_butter',
    gramsPerCup: 256,
    names: [
      'peanut butter', 'almond butter', 'cashew butter', 'nut butter',
      'pasta de amendoim', 'manteiga de amendoim', 'pasta de amendoa', 'pasta de castanha',
      'pasta de caju', 'creme de amendoim',
    ],
  },
  // Iogurte natural.
  { id: 'yogurt', gramsPerCup: 245, names: ['yogurt', 'yoghurt', 'skyr', 'iogurte'] },
];

/**
 * Termos de líquido: o nome que tiver um deles nunca usa a tabela e conta
 * pelo volume da medida. Polpa e purê também (densidade de líquido). Um nome
 * com "pó"/"powder" não é líquido ("chá verde em pó", "milk protein powder").
 */
export const LIQUID_INGREDIENT_TERMS: readonly string[] = [
  'milk', 'water', 'juice', 'coffee', 'espresso', 'tea', 'kefir', 'beverage', 'drink', 'nectar',
  'kombucha', 'soda', 'pulp', 'puree', 'syrup',
  'leite', 'agua', 'suco', 'cafe', 'cha', 'bebida', 'polpa', 'xarope', 'refrigerante',
];

export const POWDER_INGREDIENT_TERMS: readonly string[] = ['powder', 'po'];

interface CompiledWeight {
  entry: TypicalIngredientWeight;
  phrases: string[][];
  notFollowedBy: ReadonlySet<string>;
}

const COMPILED_WEIGHTS: readonly CompiledWeight[] = TYPICAL_INGREDIENT_WEIGHTS.map(entry => ({
  entry,
  phrases: entry.names.map(compilePhrase),
  notFollowedBy: new Set(entry.notFollowedBy ?? []),
}));

const COMPILED_LIQUID_TERMS = LIQUID_INGREDIENT_TERMS.map(compilePhrase);
const COMPILED_POWDER_TERMS = POWDER_INGREDIENT_TERMS.map(compilePhrase);

function hasAnyTerm(segments: readonly string[][], terms: readonly string[][]): boolean {
  return terms.some(term => findPhraseOccurrences(segments, term).length > 0);
}

/**
 * Item da tabela para o nome do ingrediente, ou null (líquido, nome vazio ou
 * fora da tabela). Com mais de um item no nome, o de maior peso.
 */
export function findTypicalIngredientWeight(name: string): TypicalIngredientWeight | null {
  const segments = tokenizeSegments(name);
  if (segments.length === 0) return null;

  if (hasAnyTerm(segments, COMPILED_LIQUID_TERMS) && !hasAnyTerm(segments, COMPILED_POWDER_TERMS)) {
    return null;
  }

  let best: TypicalIngredientWeight | null = null;
  for (const { entry, phrases, notFollowedBy } of COMPILED_WEIGHTS) {
    const matches = phrases.some(phrase => findPhraseOccurrences(segments, phrase).some(
      ({ tokens, end }) => !notFollowedBy.has(tokens[end] ?? '')
    ));
    if (matches && (best === null || entry.gramsPerCup > best.gramsPerCup)) {
      best = entry;
    }
  }
  return best;
}

// ─── CP-A: itens contados por unidade ────────────────────────────────────────
//
// "1 banana", "2 tâmaras", "1 scoop", "1 talo de aipo" não têm medida de peso
// nem de volume: até o CP-A contavam 0 no leitor. Agora, quando o número vem
// com um nome desta tabela, conta o peso típico de 1 unidade (1 g = 1 ml).
//
// Fonte: USDA FoodData Central, SR Legacy (abril/2018), medidas caseiras do
// próprio alimento; tamanho MÉDIO quando há tamanhos ("1 large banana" conta
// como média: o leitor continua sendo um limite inferior). Pó por scoop/dose e
// punhado de folhas não têm medida na USDA — ver cada constante.

/** Gramas (ml, no espresso) de 1 unidade. Uma constante por item, com a fonte. */
export const UNIT_WEIGHTS = {
  /** USDA 09040 Bananas, raw — 1 medium (7" a 7-7/8") = 118 g. */
  bananaMedium: 118,
  /** USDA 09421 Dates, medjool — 1 date, pitted = 24 g (a deglet noor, 09087, tem 7,1 g; vale a maior). */
  date: 24,
  /** USDA 09148 Kiwifruit, green, raw — 1 fruit (2" dia) = 69 g. */
  kiwi: 69,
  /** USDA 09200 Oranges, raw, all commercial varieties — 1 fruit (2-5/8" dia) = 131 g. */
  orange: 131,
  /** USDA 09003 Apples, raw, with skin — 1 medium (3" dia) = 182 g. */
  appleMedium: 182,
  /** USDA 09252 Pears, raw — 1 medium = 178 g. */
  pearMedium: 178,
  /** USDA 09236 Peaches, yellow, raw — 1 medium (2-2/3" dia) = 150 g. */
  peachMedium: 150,
  /** USDA 11124 Carrots, raw — 1 medium = 61 g. */
  carrotMedium: 61,
  /** USDA 09037 Avocados, raw, all commercial varieties — 1 avocado = 201 g ("1/4" = 50 g). */
  avocado: 201,
  /** USDA 11143 Celery, raw — 1 stalk, medium (7-1/2" a 8") = 40 g. */
  celeryStalkMedium: 40,
  /**
   * Punhado de folhas: sem medida na USDA. Vale 1 xícara de espinafre cru
   * (USDA 11457, 1 cup = 30 g), o mesmo valor já escrito na receita da Home
   * WeightLoss17 ("1 handful (30g) Spinach").
   */
  leafyGreensHandful: 30,
  /** Pó proteico, 1 scoop/dose: sem medida na USDA — rótulo típico, 30 g (o mesmo do protein_powder acima). */
  proteinPowderScoop: 30,
  /** USDA 14210 Beverages, coffee, brewed, espresso — 1 fl oz = 29,6 g; 1 dose ≈ 30 ml. */
  espressoShotMl: 30,
} as const;

/**
 * Palavra de unidade que o item exige. 'count' = só o número e o nome
 * ("2 kiwis", "1 unidade média de banana"); as outras exigem a palavra
 * ("1 punhado de espinafre": "1 espinafre" não é uma quantidade).
 */
export type UnitKind = 'count' | 'handful' | 'stalk' | 'scoop' | 'shot';

export interface UnitIngredientWeight {
  /** Identificador estável (logs e testes). */
  id: string;
  /** Gramas de 1 unidade (ml, nos líquidos). */
  gramsPerUnit: number;
  /** Nomes em inglês e em pt-BR, no singular. */
  names: readonly string[];
  unit: UnitKind;
  /** Líquido medido por dose (espresso): aceita nome com termo de líquido. */
  liquid?: boolean;
  /** Palavras que, logo depois do nome, fazem dele outro ingrediente. */
  notFollowedBy?: readonly string[];
}

export const UNIT_INGREDIENT_WEIGHTS: readonly UnitIngredientWeight[] = [
  { id: 'banana', gramsPerUnit: UNIT_WEIGHTS.bananaMedium, names: ['banana'], unit: 'count' },
  { id: 'date', gramsPerUnit: UNIT_WEIGHTS.date, names: ['date', 'tamara'], unit: 'count' },
  { id: 'kiwi', gramsPerUnit: UNIT_WEIGHTS.kiwi, names: ['kiwi', 'kiwifruit'], unit: 'count' },
  { id: 'orange', gramsPerUnit: UNIT_WEIGHTS.orange, names: ['orange', 'laranja'], unit: 'count' },
  // "maca" sem acento também é o nome da raiz em pó (maca peruana): ela não
  // está nesta tabela por unidade e vem em colher, que tem outra regra.
  { id: 'apple', gramsPerUnit: UNIT_WEIGHTS.appleMedium, names: ['apple', 'maca'], unit: 'count' },
  { id: 'pear', gramsPerUnit: UNIT_WEIGHTS.pearMedium, names: ['pear', 'pera'], unit: 'count' },
  { id: 'peach', gramsPerUnit: UNIT_WEIGHTS.peachMedium, names: ['peach', 'pessego'], unit: 'count' },
  { id: 'carrot', gramsPerUnit: UNIT_WEIGHTS.carrotMedium, names: ['carrot', 'cenoura'], unit: 'count' },
  { id: 'avocado', gramsPerUnit: UNIT_WEIGHTS.avocado, names: ['avocado', 'abacate'], unit: 'count' },
  { id: 'celery', gramsPerUnit: UNIT_WEIGHTS.celeryStalkMedium, names: ['celery', 'aipo', 'salsao'], unit: 'stalk' },
  {
    id: 'leafy_greens',
    gramsPerUnit: UNIT_WEIGHTS.leafyGreensHandful,
    names: [
      'spinach', 'baby spinach', 'kale', 'lettuce', 'romaine', 'arugula', 'greens', 'leafy greens',
      'espinafre', 'couve', 'alface', 'rucula', 'folha', 'folhas verdes',
    ],
    unit: 'handful',
    notFollowedBy: ['flor'],
  },
  {
    id: 'protein_powder',
    gramsPerUnit: UNIT_WEIGHTS.proteinPowderScoop,
    names: ['protein', 'whey', 'casein', 'proteina', 'caseina', 'albumina'],
    unit: 'scoop',
  },
  {
    id: 'espresso',
    gramsPerUnit: UNIT_WEIGHTS.espressoShotMl,
    names: ['espresso', 'expresso', 'cafe espresso', 'cafe expresso'],
    unit: 'shot',
    liquid: true,
  },
];

/** Palavras de cada unidade ('count' não exige palavra, mas aceita estas). */
const UNIT_KIND_WORDS: Record<UnitKind, readonly string[]> = {
  count: ['unit', 'unidade', 'un', 'und', 'whole', 'inteiro', 'inteira', 'fruit', 'fruta', 'piece', 'pedaco'],
  handful: ['handful', 'punhado', 'mao cheia', 'mao'],
  stalk: ['stalk', 'rib', 'talo'],
  scoop: ['scoop', 'dose', 'medida', 'medidor'],
  shot: ['shot', 'dose'],
};

/**
 * O que mais pode aparecer no texto da quantidade ("1 medium", "2 ripe",
 * "1/4 de abacate"). Uma palavra fora desta lista (ex.: "2 slices", "1 lata")
 * faz o item não casar: conta 0, como antes, em vez de contar a fruta inteira.
 */
const UNIT_AMOUNT_EXTRA_WORDS: readonly string[] = [
  // tamanho (todos contam como médio)
  'small', 'medium', 'large', 'extra large', 'pequeno', 'pequena', 'medio', 'media', 'grande',
  // cor da variedade ("1 green apple", "1 maçã verde")
  'green', 'red', 'yellow', 'verde', 'vermelha', 'vermelho', 'amarela', 'amarelo',
  // ligação
  'of', 'a', 'an', 'de', 'da', 'do',
  // estado ou preparo
  'ripe', 'fresh', 'frozen', 'pitted', 'peeled', 'chopped', 'sliced', 'cut',
  'madura', 'maduro', 'fresca', 'fresco', 'congelada', 'congelado', 'sem caroco', 'descascada',
  'descascado', 'picada', 'picado', 'cortada', 'cortado', 'em pedaco',
];

interface CompiledUnitWeight {
  entry: UnitIngredientWeight;
  phrases: string[][];
  unitWords: string[][];
  allowedInAmount: string[][];
  notFollowedBy: ReadonlySet<string>;
}

const COMPILED_EXTRA_WORDS = UNIT_AMOUNT_EXTRA_WORDS.map(compilePhrase);
const COMPILED_COUNT_WORDS = UNIT_KIND_WORDS.count.map(compilePhrase);

const COMPILED_UNIT_WEIGHTS: readonly CompiledUnitWeight[] = UNIT_INGREDIENT_WEIGHTS.map(entry => {
  const phrases = entry.names.map(compilePhrase);
  const unitWords = entry.unit === 'count' ? [] : UNIT_KIND_WORDS[entry.unit].map(compilePhrase);
  return {
    entry,
    phrases,
    unitWords,
    allowedInAmount: [...phrases, ...unitWords, ...COMPILED_COUNT_WORDS, ...COMPILED_EXTRA_WORDS],
    notFollowedBy: new Set(entry.notFollowedBy ?? []),
  };
});

/** Todos os tokens do texto estão cobertos por alguma das frases. */
function allTokensCovered(segments: readonly string[][], phrases: readonly string[][]): boolean {
  return segments.every(tokens => {
    const covered = tokens.map(() => false);
    for (const phrase of phrases) {
      for (const { start, end } of findPhraseOccurrences([tokens], phrase)) {
        for (let index = start; index < end; index += 1) covered[index] = true;
      }
    }
    return covered.every(Boolean);
  });
}

/**
 * CP-A: item da tabela por unidade para uma quantidade sem medida. `amountRest`
 * é o texto da quantidade depois do número ("medium", "unidade média",
 * "de abacate", "" em "2"); `name`, o nome do ingrediente. Devolve null
 * quando nada casa, quando falta a palavra de unidade exigida ("1 espinafre")
 * ou quando a quantidade tem uma palavra que muda a conta ("2 slices").
 *
 * Com mais de um item: o que exige palavra de unidade vence o contado só pelo
 * nome ("1 dose de proteína de banana" = 1 dose); depois, o de maior peso.
 */
export function findUnitIngredientWeight(amountRest: string, name = ''): UnitIngredientWeight | null {
  const segments = tokenizeSegments(`${amountRest} ${name}`);
  if (segments.length === 0) return null;

  const isLiquid = hasAnyTerm(segments, COMPILED_LIQUID_TERMS) && !hasAnyTerm(segments, COMPILED_POWDER_TERMS);

  let best: CompiledUnitWeight | null = null;
  for (const compiled of COMPILED_UNIT_WEIGHTS) {
    const { entry, phrases, unitWords, notFollowedBy } = compiled;
    if (isLiquid && !entry.liquid) continue;
    const named = phrases.some(phrase => findPhraseOccurrences(segments, phrase).some(
      ({ tokens, end }) => !notFollowedBy.has(tokens[end] ?? '')
    ));
    if (!named) continue;
    if (entry.unit !== 'count' && !hasAnyTerm(segments, unitWords)) continue;

    const better = best === null
      || (entry.unit !== 'count' && best.entry.unit === 'count')
      || ((entry.unit === 'count') === (best.entry.unit === 'count') && entry.gramsPerUnit > best.entry.gramsPerUnit);
    if (better) best = compiled;
  }
  if (best === null) return null;

  return allTokensCovered(tokenizeSegments(amountRest), best.allowedInAmount) ? best.entry : null;
}
