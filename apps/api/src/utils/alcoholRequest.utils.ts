// apps/api/src/utils/alcoholRequest.utils.ts
// CP-B5.2: detecção MISTA do pedido de álcool e ingredientes que definem um
// drink clássico (só Pulse AI).
//
// Até o CP-B5.1 quem decidia se a mensagem pedia álcool era só a IA
// (alcoholRequested). No lote 10, "piña colada sem álcool" / "virgin piña
// colada" saiu true em 8 de 10 respostas de quem não tem 21+, e "piña colada
// sem gelo" saiu false 4 vezes em pt-BR. Decisão do Gabriel: o código decide
// os casos óbvios; a IA decide só quando a mensagem tem apenas o nome de um
// drink. Isso substitui, de propósito, a regra "sem lista de palavras para
// detectar o pedido" dos CPs anteriores.
//
// Nenhuma lógica de texto nova: tudo passa pela normalização e pela negação
// do validador (recipeRestrictions.utils.ts — acentos, singular/plural,
// compostos, exceções, "sem"/"without"/"não quero"...). A lista de bebidas
// alcoólicas é a MESMA da checagem de álcool da receita (CP-B5), com os
// mesmos falsos amigos ("essência de rum", "cerveja sem álcool", "vinagre de
// vinho", "gengibre"/"ginger", "sake" só em pt).

import {
  compileTermList,
  findAlcoholMentions,
  findTermMentions,
  type CompiledTermList,
} from './recipeRestrictions.utils';

/**
 * 'yes': a mensagem pede álcool (o código decidiu).
 * 'no': a mensagem não pede álcool, ou pede a versão sem álcool (o código decidiu).
 * 'ai': só o nome de um drink que normalmente leva álcool — vale o
 * alcoholRequested da IA.
 */
export type AlcoholRequestDecision = 'yes' | 'no' | 'ai';

// ─── Tabelas (constantes únicas) ─────────────────────────────────────────────

/**
 * Pedido explícito da versão sem álcool. Vence tudo, inclusive bebida citada
 * ("vodka ... sem álcool" → 'no'). "virgem"/"virgin" de óleo e azeite
 * ("óleo de coco virgem", "extra virgin olive oil") são exceção.
 */
const ALCOHOL_FREE_REQUEST_TERMS = {
  en: [
    'non alcoholic',
    'nonalcoholic',
    'alcohol free',
    'no alcohol',
    'zero alcohol',
    'without alcohol',
    'booze free',
    'zero proof',
    'virgin',
    'mocktail',
  ],
  pt: [
    'sem alcool',
    'zero alcool',
    'alcool zero',
    'livre de alcool',
    'isento de alcool',
    'isenta de alcool',
    // "sem nenhum álcool": o "sem" negaria o "nenhum álcool"; a frase inteira entra.
    'nenhum alcool',
    'sem nenhum alcool',
    'sem bebida alcoolica',
    'nenhuma bebida alcoolica',
    'sem nenhuma bebida alcoolica',
    'nao alcoolico',
    'nao alcoolica',
    'virgem',
  ],
  exceptions: [
    'extra virgin',
    'virgin coconut',
    'virgin olive',
    'virgin oil',
    'extra virgem',
    'virgem extra',
    'coco virgem',
    'oleo virgem',
    'azeite virgem',
  ],
} as const;

/**
 * Pedido genérico de álcool que não está na lista de bebidas do CP-B5
 * ("alcohol"/"álcool"/"alcoólico" já estão lá: "com álcool" já é 'yes').
 */
const GENERIC_ALCOHOL_REQUEST_TERMS = {
  en: ['boozy', 'spiked'],
  pt: ['batizado', 'batizada'],
} as const;

/**
 * Termos GENÉRICOS da lista de bebidas do CP-B5. Negados ("nada de álcool",
 * "não alcoólico", "without any alcohol") são pedido da versão sem álcool.
 */
const GENERIC_ALCOHOL_TERMS: ReadonlySet<string> = new Set([
  'alcohol',
  'alcoholic',
  'liquor',
  'alcool',
  'alcoolico',
  'alcoolica',
  'destilado',
]);

/** Ingredientes que definem um drink, com sinônimos en e pt-BR. */
export const DRINK_DEFINING_INGREDIENTS = {
  lime: { label: 'lime', en: ['lime', 'lime juice', 'lemon'], pt: ['limao', 'lima', 'suco de limao'] },
  pineapple: { label: 'pineapple', en: ['pineapple'], pt: ['abacaxi', 'ananas'] },
  coconut: {
    label: 'coconut',
    en: ['coconut', 'coconut milk', 'coconut cream'],
    pt: ['coco', 'leite de coco', 'creme de coco'],
  },
  mint: { label: 'mint', en: ['mint'], pt: ['hortela', 'menta'] },
} as const;

export type DrinkDefiningIngredient = keyof typeof DRINK_DEFINING_INGREDIENTS;

interface ClassicDrink {
  /** Nome usado nos logs e no prompt. */
  label: string;
  /** Nomes normalizados (sem acento), iguais em en e pt-BR. */
  names: readonly string[];
  /** Ingredientes que a receita precisa trazer (Tarefa 2). Vazio: só detecção. */
  defining: readonly DrinkDefiningIngredient[];
}

/**
 * Drinks que normalmente levam álcool, sem nomear o destilado. Citado sem
 * negação (e sem bebida alcoólica, pedido genérico nem pedido sem álcool),
 * a decisão fica com a IA ('ai'). Os que têm `defining` também entram na
 * conferência de ingredientes. Destilado no nome ("tequila sunrise", "pisco
 * sour", "gin tônica") já é 'yes' pela lista do CP-B5 e não precisa estar aqui.
 * Fora de propósito: "batida" (em pt também é "batido no liquidificador") e
 * "drink" (em en é verbo e "protein drink").
 */
export const CLASSIC_ALCOHOLIC_DRINKS: readonly ClassicDrink[] = [
  { label: 'caipirinha', names: ['caipirinha'], defining: ['lime'] },
  { label: 'caipiroska', names: ['caipiroska', 'caipivodka'], defining: ['lime'] },
  { label: 'piña colada', names: ['pina colada', 'pinacolada'], defining: ['pineapple', 'coconut'] },
  { label: 'mojito', names: ['mojito'], defining: ['mint', 'lime'] },
  { label: 'margarita', names: ['margarita'], defining: ['lime'] },
  { label: 'daiquiri', names: ['daiquiri'], defining: ['lime'] },
  { label: 'sangria', names: ['sangria'], defining: [] },
  { label: 'cosmopolitan', names: ['cosmopolitan'], defining: [] },
  { label: 'negroni', names: ['negroni'], defining: [] },
  { label: 'spritz', names: ['spritz'], defining: [] },
  { label: 'mimosa', names: ['mimosa'], defining: [] },
  { label: 'bellini', names: ['bellini'], defining: [] },
  { label: 'martini', names: ['martini'], defining: [] },
  { label: 'cuba libre', names: ['cuba libre'], defining: [] },
  { label: 'moscow mule', names: ['moscow mule'], defining: [] },
  { label: 'mai tai', names: ['mai tai'], defining: [] },
  { label: 'bloody mary', names: ['bloody mary'], defining: [] },
  { label: 'michelada', names: ['michelada'], defining: [] },
  { label: 'irish coffee', names: ['irish coffee'], defining: [] },
  { label: 'eggnog', names: ['eggnog'], defining: [] },
  { label: 'white russian', names: ['white russian'], defining: [] },
  { label: 'long island', names: ['long island'], defining: [] },
  { label: 'sex on the beach', names: ['sex on the beach'], defining: [] },
  { label: 'cocktail', names: ['cocktail', 'coquetel', 'drinque'], defining: [] },
];

// ─── Listas compiladas (mesma normalização e negação do validador) ───────────

const COMPILED_ALCOHOL_FREE_REQUEST = compileTermList(ALCOHOL_FREE_REQUEST_TERMS);
const COMPILED_GENERIC_ALCOHOL_REQUEST = compileTermList(GENERIC_ALCOHOL_REQUEST_TERMS);

const DRINK_BY_NAME = new Map<string, ClassicDrink>(
  CLASSIC_ALCOHOLIC_DRINKS.flatMap(drink => drink.names.map(name => [name, drink] as const))
);

// Nomes de drink nos dois idiomas (iguais): ficam na lista 'pt' para que o
// "no" puro do inglês não os negue em português ("no mojito" = "em o mojito").
const COMPILED_DRINK_NAMES = compileTermList({ en: [], pt: [...DRINK_BY_NAME.keys()] });

const COMPILED_DEFINING_INGREDIENTS = Object.fromEntries(
  (Object.keys(DRINK_DEFINING_INGREDIENTS) as DrinkDefiningIngredient[]).map(id => [
    id,
    compileTermList(DRINK_DEFINING_INGREDIENTS[id]),
  ])
) as Record<DrinkDefiningIngredient, CompiledTermList>;

function hasMention(text: string, list: CompiledTermList, negated: boolean): boolean {
  return findTermMentions(text, list).some(mention => mention.negated === negated);
}

/** Drinks clássicos citados sem negação no texto, na ordem da tabela. */
function namedClassicDrinks(text: string): ClassicDrink[] {
  const named = new Set(
    findTermMentions(text, COMPILED_DRINK_NAMES)
      .filter(mention => !mention.negated)
      .flatMap(mention => {
        const drink = DRINK_BY_NAME.get(mention.term);
        return drink ? [drink] : [];
      })
  );

  return CLASSIC_ALCOHOLIC_DRINKS.filter(drink => named.has(drink));
}

// ─── Tarefa 1: detecção mista ────────────────────────────────────────────────

/**
 * Decide, só pela mensagem ATUAL, se ela pede álcool. Ordem:
 * 1. pedido da versão sem álcool ("sem álcool", "virgin", "mocktail"...) ou
 *    termo genérico de álcool negado ("nada de álcool") → 'no' (vence tudo);
 * 2. bebida alcoólica da lista do CP-B5 citada sem negação ("com vodka",
 *    "rum shake", "cerveja", "com álcool") → 'yes'. Uma bebida negada ao lado
 *    de outra citada é troca de destilado ("caipirinha com vodka em vez de
 *    cachaça") e continua 'yes';
 * 3. pedido genérico ("boozy", "spiked", "batizado") → 'yes';
 * 4. só bebida negada ("caipirinha sem cachaça", "mojito without rum",
 *    "shake sem cachaça") → 'no': quem nega o destilado pede a versão sem
 *    álcool, mesmo citando o drink;
 * 5. nome de drink clássico citado sem negação → 'ai';
 * 6. nada disso → 'no'.
 */
export function detectAlcoholRequest(message: string): AlcoholRequestDecision {
  if (!message.trim()) return 'no';

  const alcoholMentions = findAlcoholMentions(message);
  const negatedGeneric = alcoholMentions.some(
    mention => mention.negated && GENERIC_ALCOHOL_TERMS.has(mention.term)
  );

  if (hasMention(message, COMPILED_ALCOHOL_FREE_REQUEST, false) || negatedGeneric) {
    return 'no';
  }

  if (alcoholMentions.some(mention => !mention.negated)) {
    return 'yes';
  }

  if (hasMention(message, COMPILED_GENERIC_ALCOHOL_REQUEST, false)) {
    return 'yes';
  }

  if (alcoholMentions.length > 0) {
    return 'no';
  }

  return namedClassicDrinks(message).length > 0 ? 'ai' : 'no';
}

// ─── Tarefa 2: ingredientes que definem o drink ──────────────────────────────

export interface MissingDrinkIngredients {
  /** Drink citado na mensagem. */
  drink: string;
  /** Ingredientes que definem o drink e faltam na receita. */
  missing: DrinkDefiningIngredient[];
}

/**
 * Drinks clássicos citados na mensagem atual cuja receita não traz algum
 * ingrediente que os define. Um ingrediente que a própria mensagem nega
 * ("caipirinha sem limão") não é cobrado. Só os nomes dos ingredientes da
 * receita contam (com a negação do validador).
 */
export function findMissingDrinkIngredients(
  message: string,
  ingredientNames: readonly string[]
): MissingDrinkIngredients[] {
  const drinks = namedClassicDrinks(message).filter(drink => drink.defining.length > 0);
  if (drinks.length === 0) return [];

  const result: MissingDrinkIngredients[] = [];

  for (const drink of drinks) {
    const missing = drink.defining.filter(id => {
      const list = COMPILED_DEFINING_INGREDIENTS[id];
      if (hasMention(message, list, true)) return false;
      return !ingredientNames.some(name => hasMention(name, list, false));
    });

    if (missing.length > 0) {
      result.push({ drink: drink.label, missing });
    }
  }

  return result;
}

function joinEnglish(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Uma linha do prompt (chat) gerada da mesma tabela da conferência. */
export function describeDrinkDefiningIngredients(): string {
  const entries = CLASSIC_ALCOHOLIC_DRINKS
    .filter(drink => drink.defining.length > 0)
    .map(drink => `${drink.label}: ${joinEnglish(drink.defining.map(id => DRINK_DEFINING_INGREDIENTS[id].label))}`);

  return `- Drinks and the ingredients that define them, which must be in the ingredients list whenever the current message names the drink, in every version (with or without alcohol, and in any flavor: a strawberry caipirinha still has lime): ${entries.join('; ')}. Leave one out only when the current message itself refuses it (for example "caipirinha without lime").`;
}

/** Mensagem da nova tentativa quando falta um ingrediente que define o drink. */
export function buildDrinkIngredientsRetryMessage(missing: readonly MissingDrinkIngredients[]): string {
  const details = missing.map(({ drink, missing: ids }) => (
    `a ${drink} needs ${joinEnglish(ids.map(id => DRINK_DEFINING_INGREDIENTS[id].label))}`
  ));

  return [
    `Your previous response is missing ingredients that define the drink the user asked for: ${details.join('; ')}.`,
    'Add them to the ingredients list (in the response language), keep everything else the current message asked for and every rule of this conversation, and adjust the other amounts so the recipe still fits.',
    'Then return only the corrected recipe as a single JSON object, in the same format and language, with recalculated macros.',
  ].join(' ');
}
