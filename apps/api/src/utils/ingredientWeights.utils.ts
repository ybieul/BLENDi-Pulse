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
