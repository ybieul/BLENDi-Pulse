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
// CP-B5.3 (lote 11: os 5 erros foram a IA marcando false em "piña colada sem
// gelo" e "mojito"): coquetel que sempre leva álcool é decidido pelo código
// ('yes'); a IA decide só nomes ambíguos ("batida", "ponche", "eggnog",
// "drink" em pt-BR) e nomes de coquetel que também são palavra comum sem
// contexto de bebida ("mimosa", "manhattan"). Drinks famosos sem álcool
// ("shirley temple") nunca são 'yes' por si.
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
import type { UserLocale } from '../models/User';

/**
 * 'yes': a mensagem pede álcool (o código decidiu).
 * 'no': a mensagem não pede álcool, ou pede a versão sem álcool (o código decidiu).
 * 'ai': só um nome ambíguo de drink (pode ou não levar álcool) — vale o
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

/**
 * Ingredientes que definem um drink, com sinônimos en e pt-BR. Só
 * ingredientes simples e inequívocos de liquidificador. "lime" (caipirinha,
 * mojito...) aceita "lemon" desde o CP-B5.2; "lemon" (tom collins, lemon
 * drop) aceita "lime" — em pt os dois são "limão".
 */
export const DRINK_DEFINING_INGREDIENTS = {
  lime: { label: 'lime', en: ['lime', 'lime juice', 'lemon'], pt: ['limao', 'lima', 'suco de limao'] },
  pineapple: { label: 'pineapple', en: ['pineapple'], pt: ['abacaxi', 'ananas'] },
  coconut: {
    label: 'coconut',
    en: ['coconut', 'coconut milk', 'coconut cream'],
    pt: ['coco', 'leite de coco', 'creme de coco'],
  },
  mint: { label: 'mint', en: ['mint'], pt: ['hortela', 'menta'] },
  lemon: { label: 'lemon', en: ['lemon', 'lemon juice', 'lime'], pt: ['limao', 'limao siciliano', 'lima', 'suco de limao'] },
  // "ginger beer"/"ginger ale" contêm "ginger" e contam.
  ginger: { label: 'ginger', en: ['ginger'], pt: ['gengibre'] },
  cranberry: { label: 'cranberry', en: ['cranberry'], pt: ['oxicoco'] },
  grapefruit: { label: 'grapefruit', en: ['grapefruit'], pt: ['toranja'] },
  tomato: { label: 'tomato', en: ['tomato'], pt: ['tomate'] },
  // "coffee liqueur"/"licor de café" contêm "coffee"/"café" e contam.
  coffee: { label: 'coffee', en: ['coffee', 'espresso', 'cold brew'], pt: ['cafe', 'expresso'] },
  milk: { label: 'milk or cream', en: ['milk', 'cream', 'half and half'], pt: ['leite', 'creme', 'creme de leite', 'nata'] },
  orange: { label: 'orange', en: ['orange'], pt: ['laranja'] },
  peach: { label: 'peach', en: ['peach'], pt: ['pessego'] },
} as const;

export type DrinkDefiningIngredient = keyof typeof DRINK_DEFINING_INGREDIENTS;

interface AlcoholicCocktail {
  /** Nome usado nos logs e no prompt. */
  label: string;
  /** Nomes normalizados (sem acento), iguais em en e pt-BR. Citados → 'yes'. */
  names: readonly string[];
  /**
   * Nomes que também são palavra comum, lugar, nome de pessoa ou outra
   * comida ("manhattan", "painkiller", "old fashioned oats"). Só contam como
   * o coquetel colados a "drink"/"drinque"/"cocktail"/"coquetel" (antes ou
   * depois, com ou sem "de") ou depois de "frozen" → 'yes'. Sozinhos → 'ai'.
   */
  contextNames?: readonly string[];
  /** Ingredientes que a receita precisa trazer. Vazio: só detecção. */
  defining: readonly DrinkDefiningIngredient[];
}

/**
 * CP-B5.3 — coquetéis que SEMPRE levam álcool: citados sem negação, o código
 * decide 'yes' (a IA não decide mais). Lote 11: a IA marcou false em
 * "piña colada sem gelo" e "mojito". Os 6 primeiros são os do CP-B5.2, na
 * mesma ordem (a linha do prompt começa igual). Destilado no nome
 * ("tequila sunrise", "gin fizz", "aperol spritz") já é 'yes' pela lista de
 * bebidas do CP-B5; os que estão aqui também, por clareza.
 *
 * Falsos positivos: "margarita" e "martini" contam sozinhos ("Martini" também
 * é marca de vermute), com a exceção da pizza margarita; os nomes de risco
 * maior ficam em `contextNames` (ver COCKTAIL_NAME_EXCEPTIONS e
 * DRINK_CONTEXT_TERMS).
 */
export const ALWAYS_ALCOHOLIC_COCKTAILS: readonly AlcoholicCocktail[] = [
  { label: 'caipirinha', names: ['caipirinha'], defining: ['lime'] },
  { label: 'caipiroska', names: ['caipiroska', 'caipirosca', 'caipivodka'], defining: ['lime'] },
  { label: 'piña colada', names: ['pina colada', 'pinacolada'], defining: ['pineapple', 'coconut'] },
  { label: 'mojito', names: ['mojito'], defining: ['mint', 'lime'] },
  { label: 'margarita', names: ['margarita'], defining: ['lime'] },
  { label: 'daiquiri', names: ['daiquiri'], defining: ['lime'] },
  { label: 'quentão', names: ['quentao'], defining: ['ginger'] },
  { label: 'moscow mule', names: ['moscow mule'], defining: ['lime', 'ginger'] },
  { label: 'cosmopolitan', names: ['cosmopolitan'], defining: ['cranberry', 'lime'] },
  { label: 'mai tai', names: ['mai tai'], defining: ['lime'] },
  { label: 'paloma', names: [], contextNames: ['paloma'], defining: ['grapefruit'] },
  { label: 'mint julep', names: ['mint julep'], defining: ['mint'] },
  { label: 'tom collins', names: ['tom collins'], defining: ['lemon'] },
  { label: 'lemon drop', names: [], contextNames: ['lemon drop'], defining: ['lemon'] },
  { label: 'bloody mary', names: ['bloody mary'], defining: ['tomato'] },
  { label: 'white russian', names: ['white russian'], defining: ['coffee', 'milk'] },
  { label: 'mudslide', names: [], contextNames: ['mudslide'], defining: ['coffee', 'milk'] },
  { label: 'espresso martini', names: ['espresso martini', 'expresso martini'], defining: ['coffee'] },
  { label: 'mimosa', names: [], contextNames: ['mimosa'], defining: ['orange'] },
  { label: 'bellini', names: ['bellini'], defining: ['peach'] },
  // Sangria: "fruta (qualquer)" não cabe numa lista simples de sinônimos.
  { label: 'sangria', names: ['sangria'], defining: [] },
  { label: 'martini', names: ['martini'], defining: [] },
  { label: 'old fashioned', names: [], contextNames: ['old fashioned'], defining: [] },
  { label: 'manhattan', names: [], contextNames: ['manhattan'], defining: [] },
  { label: 'negroni', names: ['negroni'], defining: [] },
  { label: 'long island', names: ['long island iced tea', 'long island ice tea'], contextNames: ['long island'], defining: [] },
  { label: 'spritz', names: ['aperol spritz'], contextNames: ['spritz'], defining: [] },
  { label: 'cuba libre', names: ['cuba libre'], defining: [] },
  { label: 'hurricane', names: [], contextNames: ['hurricane'], defining: [] },
  { label: 'painkiller', names: [], contextNames: ['painkiller'], defining: [] },
  { label: 'sidecar', names: [], contextNames: ['sidecar'], defining: [] },
  { label: 'gin fizz', names: ['gin fizz'], defining: [] },
  { label: 'sex on the beach', names: ['sex on the beach'], defining: [] },
  { label: 'michelada', names: ['michelada'], defining: [] },
];

/**
 * Palavras que, coladas a um nome de risco (`contextNames`), mostram que é o
 * coquetel: "drink de mimosa", "paloma cocktail", "coquetel manhattan".
 * "frozen" só antes do nome ("frozen paloma"; "old fashioned frozen yogurt" não).
 */
const DRINK_CONTEXT_TERMS = ['drink', 'drinque', 'cocktail', 'coquetel'] as const;
const DRINK_CONTEXT_PREFIX_ONLY = ['frozen'] as const;

/** Frases em que o nome do coquetel é outra coisa (comida). Nunca contam. */
const COCKTAIL_NAME_EXCEPTIONS = [
  'pizza margarita',
  'margarita pizza',
  'pizza de margarita',
  'old fashioned oat',
  'old fashioned oatmeal',
  'old fashioned rolled oat',
  'spritz cookie',
  'spritz biscuit',
] as const;

/**
 * Nomes ambíguos (podem ou não levar álcool): sem outro sinal, a decisão fica
 * com a IA ('ai'). "drink" só conta em pt-BR: em inglês é verbo ("drink
 * within 30 minutes") e "protein drink". "irish coffee" segue com a IA como
 * no CP-B5.2 (também é sabor de café/creamer). "fruit cocktail"/"shrimp
 * cocktail" são comida.
 */
export const AMBIGUOUS_DRINK_NAMES = {
  en: ['eggnog', 'punch', 'cocktail', 'irish coffee'],
  pt: ['batida', 'ponche', 'coquetel', 'drinque'],
  ptBrOnly: ['drink'],
  exceptions: ['fruit cocktail', 'shrimp cocktail'],
} as const;

/**
 * Drinks famosos SEM álcool: nunca 'yes' por si. Sem outro sinal de álcool →
 * 'no' (vencem os nomes ambíguos: "drink shirley temple" → 'no'). Com bebida
 * alcoólica ou coquetel na mensagem, vale o outro sinal.
 */
export const ALCOHOL_FREE_FAMOUS_DRINKS = {
  en: ['shirley temple', 'arnold palmer', 'roy rogers', 'virgin mary'],
  pt: ['limonada suica'],
} as const;

// ─── Listas compiladas (mesma normalização e negação do validador) ───────────

const COMPILED_ALCOHOL_FREE_REQUEST = compileTermList(ALCOHOL_FREE_REQUEST_TERMS);
const COMPILED_GENERIC_ALCOHOL_REQUEST = compileTermList(GENERIC_ALCOHOL_REQUEST_TERMS);

function contextPhrases(name: string): string[] {
  return [
    ...DRINK_CONTEXT_TERMS.flatMap(context => [`${context} ${name}`, `${name} ${context}`, `${context} de ${name}`]),
    ...DRINK_CONTEXT_PREFIX_ONLY.map(context => `${context} ${name}`),
  ];
}

// Frase (nome ou nome de risco com contexto) → coquetel.
const COCKTAIL_BY_PHRASE = new Map<string, AlcoholicCocktail>(
  ALWAYS_ALCOHOLIC_COCKTAILS.flatMap(cocktail => [
    ...cocktail.names,
    ...(cocktail.contextNames ?? []).flatMap(contextPhrases),
  ].map(phrase => [phrase, cocktail] as const))
);

// Nomes de drink nos dois idiomas (iguais). Em pt-BR ficam na lista 'pt'
// para que o "no" puro não os negue ("no mojito" = "em o mojito"); em inglês,
// na lista 'en' ("no mojito, please" é negação). Sem idioma: como em pt-BR.
const COCKTAIL_PHRASES = [...COCKTAIL_BY_PHRASE.keys()];
const COMPILED_COCKTAIL_NAMES = compileTermList({ en: [], pt: COCKTAIL_PHRASES, exceptions: COCKTAIL_NAME_EXCEPTIONS });
const COMPILED_COCKTAIL_NAMES_EN = compileTermList({ en: COCKTAIL_PHRASES, pt: [], exceptions: COCKTAIL_NAME_EXCEPTIONS });

// Nomes de risco sozinhos (sem contexto): 'ai'.
const COMPILED_RISKY_COCKTAIL_NAMES = compileTermList({
  en: [],
  pt: ALWAYS_ALCOHOLIC_COCKTAILS.flatMap(cocktail => cocktail.contextNames ?? []),
  exceptions: COCKTAIL_NAME_EXCEPTIONS,
});

const COMPILED_AMBIGUOUS_DRINK_NAMES = compileTermList(AMBIGUOUS_DRINK_NAMES);
const COMPILED_AMBIGUOUS_DRINK_NAMES_PT_BR = compileTermList({
  en: AMBIGUOUS_DRINK_NAMES.en,
  pt: [...AMBIGUOUS_DRINK_NAMES.pt, ...AMBIGUOUS_DRINK_NAMES.ptBrOnly],
  exceptions: AMBIGUOUS_DRINK_NAMES.exceptions,
});

const COMPILED_ALCOHOL_FREE_FAMOUS_DRINKS = compileTermList(ALCOHOL_FREE_FAMOUS_DRINKS);

const COMPILED_DEFINING_INGREDIENTS = Object.fromEntries(
  (Object.keys(DRINK_DEFINING_INGREDIENTS) as DrinkDefiningIngredient[]).map(id => [
    id,
    compileTermList(DRINK_DEFINING_INGREDIENTS[id]),
  ])
) as Record<DrinkDefiningIngredient, CompiledTermList>;

function hasMention(text: string, list: CompiledTermList, negated: boolean): boolean {
  return findTermMentions(text, list).some(mention => mention.negated === negated);
}

/**
 * Coquetéis citados sem negação no texto (nome, ou nome de risco com
 * contexto de bebida), na ordem da tabela.
 */
function namedCocktails(text: string, language: UserLocale | undefined): AlcoholicCocktail[] {
  const list = language === 'en' ? COMPILED_COCKTAIL_NAMES_EN : COMPILED_COCKTAIL_NAMES;
  const named = new Set(
    findTermMentions(text, list)
      .filter(mention => !mention.negated)
      .flatMap(mention => {
        const cocktail = COCKTAIL_BY_PHRASE.get(mention.term);
        return cocktail ? [cocktail] : [];
      })
  );

  return ALWAYS_ALCOHOLIC_COCKTAILS.filter(cocktail => named.has(cocktail));
}

// ─── Detecção mista ──────────────────────────────────────────────────────────

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
 *    álcool, mesmo citando o drink (é a versão sem álcool vencendo);
 * 5. coquetel que sempre leva álcool (ALWAYS_ALCOHOLIC_COCKTAILS) citado sem
 *    negação → 'yes' (CP-B5.3);
 * 6. drink famoso sem álcool ("shirley temple", "limonada suíça") → 'no';
 * 7. nome ambíguo ("batida", "ponche", "eggnog", "drink" em pt-BR) ou nome
 *    de coquetel de risco sem contexto ("mimosa", "manhattan") → 'ai';
 * 8. nada disso → 'no'.
 *
 * `language` é o idioma do pedido (o mesmo do prompt): muda o "drink" e o
 * "no" puro antes do nome do coquetel (negação só em inglês).
 */
export function detectAlcoholRequest(message: string, language?: UserLocale): AlcoholRequestDecision {
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

  if (namedCocktails(message, language).length > 0) {
    return 'yes';
  }

  if (hasMention(message, COMPILED_ALCOHOL_FREE_FAMOUS_DRINKS, false)) {
    return 'no';
  }

  const ambiguous = language === 'pt-BR' ? COMPILED_AMBIGUOUS_DRINK_NAMES_PT_BR : COMPILED_AMBIGUOUS_DRINK_NAMES;

  if (hasMention(message, ambiguous, false) || hasMention(message, COMPILED_RISKY_COCKTAIL_NAMES, false)) {
    return 'ai';
  }

  return 'no';
}

// ─── Ingredientes que definem o drink ────────────────────────────────────────

export interface MissingDrinkIngredients {
  /** Drink citado na mensagem. */
  drink: string;
  /** Ingredientes que definem o drink e faltam na receita. */
  missing: DrinkDefiningIngredient[];
}

/**
 * Coquetéis citados na mensagem atual (com e sem álcool) cuja receita não
 * traz algum ingrediente que os define. Um nome de risco só conta com
 * contexto de bebida ("drink de mimosa"). Um ingrediente que a própria
 * mensagem nega ("caipirinha sem limão") não é cobrado. Só os nomes dos
 * ingredientes da receita contam (com a negação do validador).
 */
export function findMissingDrinkIngredients(
  message: string,
  ingredientNames: readonly string[],
  language?: UserLocale
): MissingDrinkIngredients[] {
  const drinks = namedCocktails(message, language).filter(drink => drink.defining.length > 0);
  if (drinks.length === 0) return [];

  const result: MissingDrinkIngredients[] = [];

  for (const drink of drinks) {
    const missing = drink.defining.filter(id => {
      const list = COMPILED_DEFINING_INGREDIENTS[id];
      if (hasMention(message, list, true)) return false;
      return !ingredientNames.some(name => hasMention(name, list, false));
    });

    if (missing.length > 0) {
      result.push({ drink: drink.label, missing: [...missing] });
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
  const entries = ALWAYS_ALCOHOLIC_COCKTAILS
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
