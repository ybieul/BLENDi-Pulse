// apps/api/src/utils/allergyFamilies.utils.ts
// CP-B6 — famílias de alérgenos (constante única) e tudo que o backend
// precisa para proteger quem cadastrou alergia: as restrições para o
// validador, o que a mensagem NOMEIA (pede confirmação), o que ela só
// IMPLICA (prato/produto que normalmente leva o alérgeno: receita sem ele e
// sugestão), o que um nome de ingrediente contém (Pantry) e o aviso da aveia.
//
// Nenhuma lógica de texto nova: tudo passa pelo motor do validador
// (recipeRestrictions.utils.ts — acentos, singular/plural, compostos,
// exceções, qualificadores, frases permitidas e negação: "sem amendoim" não
// nomeia amendoim).
//
// ─── As listas (en e pt-BR; documentação pedida no CP-B6) ────────────────────
// milk (alergia à PROTEÍNA do leite): todo laticínio, inclusive os "sem
//   lactose" — leite, leite em pó, leite condensado, creme de leite, doce de
//   leite (prato), whey (qualquer), caseína, soro de leite, iogurte, skyr,
//   coalhada, kefir (o de água não), queijo (todos), requeijão, ricota,
//   cottage, cream cheese, mascarpone, manteiga, ghee, nata, chantilly,
//   cream/half and half, sorvete/ice cream/gelato (o vegetal declarado não),
//   milkshake e brigadeiro (pratos) e proteína em pó sem origem vegetal
//   declarada (pode ser whey ou caseína, como na regra vegana). Bebidas
//   vegetais ("leite de aveia/amêndoas/coco/soja", "manteiga de cacau",
//   "creme de coco") NÃO são leite: mesmos qualificadores dos laticínios.
// lactose: leite, leite em pó, leite condensado, iogurte, coalhada, kefir,
//   sorvete, creme de leite/cream/nata/chantilly, queijos frescos (ricota,
//   cottage, cream cheese, requeijão, mascarpone, queijo minas) e queijo sem
//   tipo, whey concentrado/sem tipo, doce de leite, milkshake e brigadeiro.
//   LIBERADOS: tudo que diz "sem lactose"/"zero lactose"/"lactose-free"/
//   "deslactosado", whey isolado ("whey isolado", "whey protein isolate"),
//   queijos curados (parmesão/parmesan, grana padano, pecorino, "curado",
//   "maturado", "aged"), manteiga e ghee.
// peanut: amendoim/peanut (pasta, manteiga, óleo, farinha de amendoim...),
//   groundnut, "oleaginosas" (no Brasil inclui o amendoim), mix de
//   oleaginosas/mixed nuts, nut butter sem tipo, trail mix; paçoca e pé de
//   moleque (pratos); granola comum (só bloqueia: ver abaixo).
// tree_nuts: amêndoa, castanha (qualquer: de caju, do pará, portuguesa...),
//   noz, noz-pecã, avelã, pistache, macadâmia, baru, pinoli/pine nut,
//   chestnut, nut/nuts (en, genérico), oleaginosa, trail mix, e leites/pastas
//   delas; praliné, marzipã, creme de avelã/Nutella/gianduia e pesto
//   (pratos); granola comum (só bloqueia). NÃO são castanhas: coco (leite,
//   creme, água, açúcar de coco, "noz-de-coco"), noz-moscada, caju a fruta
//   (suco/polpa; "caju" sozinho não é termo) e castanha-d'água/water
//   chestnut (tubérculo).
// soy: soja/soy/soya/soybean, leite/bebida/proteína de soja, tofu,
//   edamame, missô/miso, tempeh, shoyu, lecitina de soja.
// wheat_gluten: trigo/wheat (farinha, farelo, gérmen, fibra), cevada/barley,
//   centeio/rye, malte/malt/maltado, espelta/spelt, sêmola/semolina,
//   cuscuz marroquino/de trigo, couscous, bulgur/trigo para quibe, seitan,
//   triticale, kamut, glúten como ingrediente, farinha/flour sem tipo
//   (farinha de aveia, arroz, milho, mandioca, coco, amêndoa, grão-de-bico...
//   não), farinha láctea; pratos/produtos: pão, biscoito/bolacha/cookie/
//   cracker/wafer, brownie, cheesecake, cereal matinal, corn flakes/flocos
//   de milho/sucrilhos (levam malte de cevada), muesli e Ovomaltine; granola
//   comum (só bloqueia). Decisão do CP-B6: cereal matinal, corn flakes e
//   muesli BLOQUEIAM (malte/trigo na maioria das marcas), salvo "sem
//   glúten"/"gluten-free". AVEIA NÃO É BLOQUEADA (nem farelo, farinha ou leite
//   de aveia): o card mostra "Use aveia certificada sem glúten". Trigo
//   sarraceno/buckwheat não é trigo.
// sesame: gergelim/sesame (óleo, semente), tahine/tahini e halva (pratos),
//   gomásio.
// egg: ovo/egg, clara/egg white, gema/yolk, albumina/albumin, maionese/
//   mayonnaise; gemada/eggnog e merengue/meringue (pratos).
//
// Granola comum: costuma ter castanhas, às vezes amendoim, e muitas vezes
// trigo/malte ou aveia contaminada. Bloqueia nas três alergias, salvo quando
// o nome diz que não leva ("granola sem glúten", "nut-free granola",
// "granola sem amendoim"). Não nomeia nem implica alergia (não pede
// confirmação nem gera sugestão): o validador troca na nova tentativa.
//
// Campo livre: cada item vira o grupo do vocabulário do CP-B8a quando o
// item inteiro é um alimento conhecido (sinônimos en/pt: "kiwi", "morango"
// → strawberry...) ou, senão, o próprio texto normalizado (ex.: "camarão").

import {
  ALLERGY_CODE_VALUES,
  hasAllergies,
  isSameAllergyItem,
  normalizeMatchText,
  normalizeUserAllergies,
  type AllergenSelection,
  type AllergyCode,
  type PulseAiRecipe,
  type RecipeAllergySuggestion,
  type UserAllergies,
} from '@blendi/shared';

import {
  DAIRY_RULES,
  EXPLICIT_NON_DAIRY_QUALIFIERS,
  KEFIR_QUALIFIERS,
  NUT_FREE_GRANOLA_AFTER,
  NUT_FREE_GRANOLA_BEFORE,
  PLANT_BASE_QUALIFIERS,
  PLANT_CREAM_QUALIFIERS,
  PLANT_PROTEIN_LOOKBACK,
  PLANT_PROTEIN_QUALIFIERS,
  chocolateTerms,
  compileRestrictionRules,
  compileTermList,
  findTermOccurrences,
  mentionsTermList,
  terms,
  type AllergyRestriction,
  type CompiledTermList,
  type RestrictedTerm,
  type RestrictionRules,
} from './recipeRestrictions.utils';
import { foodGroupTermsForItem } from './requestedFoods.utils';

type Language = 'en' | 'pt-BR';

// ─── Qualificadores ──────────────────────────────────────────────────────────

const LACTOSE_FREE_BEFORE = ['lactose free', 'zero lactose', 'no lactose', 'sem lactose'] as const;
const LACTOSE_FREE_AFTER = [
  'sem lactose',
  'zero lactose',
  'lactose free',
  'livre de lactose',
  'isento de lactose',
  'isenta de lactose',
  'deslactosado',
  'deslactosada',
  'without lactose',
  'no lactose',
] as const;

const WHEY_ISOLATE_AFTER = [
  ...LACTOSE_FREE_AFTER,
  'isolate',
  'protein isolate',
  'isolado',
  'isolada',
  'protein isolado',
  'proteina isolada',
] as const;

const AGED_CHEESE_BEFORE = ['parmesan', 'parmigiano', 'grana padano', 'pecorino', 'aged', 'hard', ...LACTOSE_FREE_BEFORE] as const;
const AGED_CHEESE_AFTER = [
  'parmesao',
  'parmesan',
  'parmigiano',
  'grana padano',
  'pecorino',
  'curado',
  'curada',
  'maturado',
  'maturada',
  ...LACTOSE_FREE_AFTER,
] as const;

const GLUTEN_FREE_BEFORE = ['gluten free', 'sem gluten'] as const;
const GLUTEN_FREE_AFTER = ['gluten free', 'sem gluten', 'livre de gluten', 'isento de gluten', 'isenta de gluten'] as const;

// Farinha/flour de outra origem não é trigo ("farinha de aveia", "almond flour").
const NON_WHEAT_FLOUR_QUALIFIERS = [
  'oat', 'aveia',
  'rice', 'arroz',
  'corn', 'milho', 'fuba',
  'cassava', 'mandioca', 'tapioca',
  'coconut', 'coco',
  'almond', 'amendoa',
  'peanut', 'amendoim',
  'chickpea', 'grao',
  'banana',
  'buckwheat', 'sarraceno',
  'quinoa', 'chia', 'linhaca', 'flax', 'flaxseed',
  'castanha', 'cashew', 'hazelnut', 'avela',
  'potato', 'batata',
  'glutenfree',
] as const;

const PEANUT_FREE_GRANOLA_BEFORE = ['peanut free', 'nut free'] as const;
const PEANUT_FREE_GRANOLA_AFTER = [
  'peanut free',
  'nut free',
  'without peanut',
  'sem amendoim',
  'livre de amendoim',
  'sem oleaginosa',
  'livre de oleaginosa',
] as const;

// Até 3 palavras entre o termo e a frase que o libera ("Iogurte grego natural
// zero lactose"), sem atravessar "e"/"com" (regra do validador).
const ALLOWED_PHRASE_GAP = 3;

function withAllowed(list: RestrictedTerm[], before: readonly string[], after: readonly string[]): RestrictedTerm[] {
  return list.map(term => ({
    ...term,
    allowedWith: {
      before: [...(term.allowedWith?.before ?? []), ...before],
      after: [...(term.allowedWith?.after ?? []), ...after],
      gap: ALLOWED_PHRASE_GAP,
    },
  }));
}

// Proteína em pó com fonte declarada que não é leite: vegetal (regra vegana)
// ou animal não láctea ("Egg white protein powder", colágeno, carne).
const NON_DAIRY_PROTEIN_QUALIFIERS = [
  ...PLANT_PROTEIN_QUALIFIERS,
  'egg', 'ovo', 'clara', 'albumin', 'albumina',
  'collagen', 'colageno',
  'beef', 'carne',
] as const;

function nonDairyProteinTerms(phrases: readonly string[]): RestrictedTerm[] {
  return terms(phrases, NON_DAIRY_PROTEIN_QUALIFIERS).map(term => ({ ...term, qualifierLookback: PLANT_PROTEIN_LOOKBACK }));
}

// ─── Famílias (termos que NOMEIAM o alérgeno) ────────────────────────────────

const MILK_RULES: RestrictionRules = {
  en: [...DAIRY_RULES.en, ...nonDairyProteinTerms(['protein powder', 'protein isolate']), ...terms(['curd', 'paneer', 'labneh'])],
  pt: [...DAIRY_RULES.pt, ...nonDairyProteinTerms(['proteina em po', 'po de proteina', 'proteina isolada'])],
  exceptions: [...DAIRY_RULES.exceptions],
};

const LACTOSE_RULES: RestrictionRules = {
  en: [
    ...withAllowed(terms(['milk', 'buttermilk', 'milk powder'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['yogurt', 'yoghurt', 'skyr'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['kefir'], KEFIR_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['icecream', 'gelato', 'frozen yogurt'], EXPLICIT_NON_DAIRY_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['ricotta', 'cottage', 'mascarpone', 'cream cheese'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['cheese'], PLANT_BASE_QUALIFIERS), AGED_CHEESE_BEFORE, AGED_CHEESE_AFTER),
    ...withAllowed(terms(['cream', 'half and half'], PLANT_CREAM_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['whey']), ['isolate', ...LACTOSE_FREE_BEFORE], WHEY_ISOLATE_AFTER),
    ...terms(['lactose']),
  ],
  pt: [
    ...withAllowed(terms(['leite', 'leite em po'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['iogurte', 'coalhada'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['sorvete'], EXPLICIT_NON_DAIRY_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['ricota', 'requeijao', 'queijo minas', 'queijo fresco'], PLANT_BASE_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['queijo'], PLANT_BASE_QUALIFIERS), AGED_CHEESE_BEFORE, AGED_CHEESE_AFTER),
    ...withAllowed(terms(['nata', 'chantilly', 'chantili'], PLANT_CREAM_QUALIFIERS), LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
    ...withAllowed(terms(['soro de leite']), [], WHEY_ISOLATE_AFTER),
  ],
  exceptions: [...DAIRY_RULES.exceptions],
};

const PEANUT_RULES: RestrictionRules = {
  en: terms(['peanut', 'groundnut', 'mixed nut', 'nut butter', 'trail mix']),
  pt: terms(['amendoim', 'oleaginosa']),
  exceptions: [],
};

const TREE_NUT_RULES: RestrictionRules = {
  en: terms([
    'nut',
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'hazelnut',
    'pistachio',
    'macadamia',
    'brazil nut',
    'pine nut',
    'chestnut',
    'baru',
    'pinoli',
    'pignoli',
    'trail mix',
  ]),
  pt: terms(['amendoa', 'castanha', 'noz', 'avela', 'pistache', 'oleaginosa']),
  exceptions: [
    'noz moscada',
    'noz de coco',
    'cashew apple',
    'cashew fruit',
    'cashew juice',
    'cashew pulp',
    'water chestnut',
    'castanha d agua',
    'castanha de agua',
  ],
};

const SOY_RULES: RestrictionRules = {
  en: terms(['soy', 'soya', 'soybean', 'tofu', 'edamame', 'miso', 'tempeh']),
  pt: terms(['soja', 'misso', 'shoyu']),
  exceptions: [],
};

const WHEAT_GLUTEN_RULES: RestrictionRules = {
  en: [
    ...terms([
      'wheat',
      'barley',
      'rye',
      'malt',
      'malted',
      'spelt',
      'semolina',
      'couscous',
      'bulgur',
      'seitan',
      'triticale',
      'kamut',
      'farina',
    ]),
    ...terms(['gluten']),
    ...terms(['flour'], NON_WHEAT_FLOUR_QUALIFIERS),
  ],
  pt: [
    ...terms([
      'trigo',
      'cevada',
      'centeio',
      'malte',
      'maltado',
      'maltada',
      'espelta',
      'semola',
      'cuscuz marroquino',
      'farinha lactea',
    ]),
    ...terms(['farinha'], NON_WHEAT_FLOUR_QUALIFIERS),
  ],
  exceptions: ['trigo sarraceno', 'trigo mourisco'],
};

const SESAME_RULES: RestrictionRules = {
  en: terms(['sesame']),
  pt: terms(['gergelim', 'gomasio']),
  exceptions: [],
};

const EGG_RULES: RestrictionRules = {
  en: terms(['egg', 'egg white', 'yolk', 'albumin', 'mayonnaise', 'mayo']),
  pt: terms(['ovo', 'clara', 'gema', 'albumina', 'maionese']),
  exceptions: [],
};

const NAMING_RULES: Record<AllergyCode, RestrictionRules> = {
  peanut: PEANUT_RULES,
  tree_nuts: TREE_NUT_RULES,
  milk: MILK_RULES,
  lactose: LACTOSE_RULES,
  soy: SOY_RULES,
  wheat_gluten: WHEAT_GLUTEN_RULES,
  sesame: SESAME_RULES,
  egg: EGG_RULES,
};

// Só bloqueiam na receita (não nomeiam nem implicam): granola comum.
const BLOCK_ONLY_TERMS: Partial<Record<AllergyCode, RestrictedTerm[]>> = {
  peanut: withAllowed(terms(['granola']), PEANUT_FREE_GRANOLA_BEFORE, PEANUT_FREE_GRANOLA_AFTER),
  tree_nuts: withAllowed(terms(['granola']), NUT_FREE_GRANOLA_BEFORE, NUT_FREE_GRANOLA_AFTER),
  wheat_gluten: withAllowed(terms(['granola']), GLUTEN_FREE_BEFORE, GLUTEN_FREE_AFTER),
};

// Chocolate (correção do CP-B6): chocolate comum, ao leite, branco e
// achocolatado quase sempre levam leite. Como a proteína em pó sem origem
// declarada, na dúvida protege — leite e lactose. Só bloqueia: não nomeia o
// alérgeno (não pede confirmação; "chocolate ao leite"/"milk chocolate"
// pedem pela palavra "leite"/"milk"), não implica (sem sugestão), não entra
// no título (a lista do título é a que nomeia: "Shake de chocolate" passa) e
// não impede cobrar o sabor pedido ("sabor chocolate" continua atendido por
// cacau ou chocolate amargo, mapa do CP-B8).
//
// Libera (frase COLADA ao "chocolate", sem distância: "chocolate meio
// amargo" não é liberado pelo "amargo"): amargo, dark, 70% ou mais (70–100),
// vegano/vegan, sem leite, dairy-free/non-dairy/plant-based, unsweetened
// (chocolate 100% de culinária). Cacau, cacao, cocoa e nibs nunca foram
// termos e continuam livres. Na lactose, também "sem lactose"/"lactose-free".
// Decisão: chocolate meio amargo/semisweet/bittersweet BLOQUEIA (muitas
// marcas levam leite).
// Lista e frases que liberam: `chocolateTerms`/`MILK_CHOCOLATE_TERMS` no
// validador (recipeRestrictions.utils.ts), a mesma usada por vegan e
// dairy_free (CP-B6b).

// Bloqueiam na receita mas não tiram o pedido da conferência do CP-B8.
const NON_REQUEST_BLOCKING_TERMS: Partial<Record<AllergyCode, RestrictedTerm[]>> = {
  milk: chocolateTerms([], []),
  lactose: chocolateTerms(LACTOSE_FREE_BEFORE, LACTOSE_FREE_AFTER),
};

// ─── Pratos/produtos que normalmente levam o alérgeno (tabela única) ─────────

interface AllergenDish {
  /** Frases (sem acento, singular) que citam o prato, en e pt juntas. */
  phrases: readonly string[];
  allergens: readonly AllergyCode[];
  display: Readonly<Record<Language, string>>;
  /** Frases ao lado que dizem que o prato NÃO leva o alérgeno ("cereal sem glúten"). */
  allowedWith?: { before: readonly string[]; after: readonly string[] };
}

/**
 * Pedido com o prato, sem nomear o alérgeno → receita sem ele e sugestão
 * "Quer com X?". Os pratos também entram na família de cada alérgeno (a
 * receita não pode trazê-los), mas não contam como "nomear".
 */
export const ALLERGEN_DISHES: readonly AllergenDish[] = [
  { phrases: ['pacoca'], allergens: ['peanut'], display: { en: 'Paçoca', 'pt-BR': 'Paçoca' } },
  { phrases: ['pe de moleque'], allergens: ['peanut'], display: { en: 'Pé de moleque', 'pt-BR': 'Pé de moleque' } },
  {
    phrases: ['nutella', 'creme de avela', 'hazelnut spread', 'chocolate hazelnut spread', 'gianduia', 'gianduja'],
    allergens: ['tree_nuts', 'milk'],
    display: { en: 'Hazelnut spread', 'pt-BR': 'Creme de avelã' },
  },
  { phrases: ['pesto'], allergens: ['tree_nuts', 'milk'], display: { en: 'Pesto', 'pt-BR': 'Pesto' } },
  { phrases: ['marzipan', 'marzipa'], allergens: ['tree_nuts'], display: { en: 'Marzipan', 'pt-BR': 'Marzipã' } },
  { phrases: ['praline'], allergens: ['tree_nuts'], display: { en: 'Praline', 'pt-BR': 'Praliné' } },
  { phrases: ['tahini', 'tahine', 'tahina'], allergens: ['sesame'], display: { en: 'Tahini', 'pt-BR': 'Tahine' } },
  { phrases: ['halva', 'halvah', 'halawa'], allergens: ['sesame'], display: { en: 'Halva', 'pt-BR': 'Halva' } },
  {
    phrases: ['doce de leite', 'dulce de leche'],
    allergens: ['milk', 'lactose'],
    display: { en: 'Dulce de leche', 'pt-BR': 'Doce de leite' },
  },
  { phrases: ['brigadeiro'], allergens: ['milk', 'lactose'], display: { en: 'Brigadeiro', 'pt-BR': 'Brigadeiro' } },
  { phrases: ['milkshake'], allergens: ['milk', 'lactose'], display: { en: 'Milkshake', 'pt-BR': 'Milkshake' } },
  { phrases: ['eggnog', 'gemada'], allergens: ['egg'], display: { en: 'Eggnog', 'pt-BR': 'Gemada' } },
  { phrases: ['meringue', 'merengue'], allergens: ['egg'], display: { en: 'Meringue', 'pt-BR': 'Merengue' } },
  {
    phrases: ['ovomaltine', 'ovaltine'],
    allergens: ['wheat_gluten', 'milk', 'lactose'],
    display: { en: 'Ovaltine', 'pt-BR': 'Ovomaltine' },
  },
  {
    phrases: ['cookie', 'biscuit', 'cracker', 'wafer', 'biscoito', 'bolacha'],
    allergens: ['wheat_gluten'],
    display: { en: 'Cookies', 'pt-BR': 'Biscoito' },
    allowedWith: { before: GLUTEN_FREE_BEFORE, after: GLUTEN_FREE_AFTER },
  },
  {
    phrases: ['bread', 'pao'],
    allergens: ['wheat_gluten'],
    display: { en: 'Bread', 'pt-BR': 'Pão' },
    // "pão de queijo" é de polvilho (sem trigo).
    allowedWith: { before: GLUTEN_FREE_BEFORE, after: [...GLUTEN_FREE_AFTER, 'de queijo'] },
  },
  { phrases: ['brownie'], allergens: ['wheat_gluten', 'egg', 'milk'], display: { en: 'Brownie', 'pt-BR': 'Brownie' } },
  {
    phrases: ['cheesecake'],
    allergens: ['milk', 'lactose', 'egg', 'wheat_gluten'],
    display: { en: 'Cheesecake', 'pt-BR': 'Cheesecake' },
  },
  {
    phrases: ['cereal', 'corn flake', 'cornflake', 'flocos de milho', 'sucrilho', 'muesli', 'musli'],
    allergens: ['wheat_gluten'],
    display: { en: 'Breakfast cereal', 'pt-BR': 'Cereal matinal' },
    allowedWith: { before: GLUTEN_FREE_BEFORE, after: GLUTEN_FREE_AFTER },
  },
];

const ALL_DISH_PHRASES = [...new Set(ALLERGEN_DISHES.flatMap(dish => dish.phrases))];

function dishTerms(code: AllergyCode): RestrictedTerm[] {
  return ALLERGEN_DISHES.filter(dish => dish.allergens.includes(code)).flatMap(dish => (
    dish.allowedWith
      ? withAllowed(terms(dish.phrases), dish.allowedWith.before, dish.allowedWith.after)
      : terms(dish.phrases)
  ));
}

// ─── Listas compiladas ───────────────────────────────────────────────────────

/** Família completa: o que a receita não pode ter (nome + pratos + só-bloqueio). */
const FAMILY_LISTS: Record<AllergyCode, CompiledTermList> = Object.fromEntries(
  ALLERGY_CODE_VALUES.map(code => [
    code,
    compileRestrictionRules({
      en: [
        ...NAMING_RULES[code].en,
        ...dishTerms(code),
        ...(BLOCK_ONLY_TERMS[code] ?? []),
        ...(NON_REQUEST_BLOCKING_TERMS[code] ?? []),
      ],
      pt: NAMING_RULES[code].pt,
      exceptions: NAMING_RULES[code].exceptions,
    }),
  ])
) as Record<AllergyCode, CompiledTermList>;

/**
 * Família sem o chocolate: o que tira um alimento pedido da conferência do
 * CP-B8 (alérgeno pedido e não confirmado não é cobrado). "Chocolate" pedido
 * continua cobrado — cacau ou chocolate amargo atendem.
 */
const REQUEST_FILTER_LISTS: Record<AllergyCode, CompiledTermList> = Object.fromEntries(
  ALLERGY_CODE_VALUES.map(code => [
    code,
    compileRestrictionRules({
      en: [...NAMING_RULES[code].en, ...dishTerms(code), ...(BLOCK_ONLY_TERMS[code] ?? [])],
      pt: NAMING_RULES[code].pt,
      exceptions: NAMING_RULES[code].exceptions,
    }),
  ])
) as Record<AllergyCode, CompiledTermList>;

/**
 * O que NOMEIA o alérgeno numa mensagem: a família sem os pratos e sem o
 * só-bloqueio. Os pratos ficam mascarados ("doce de leite" não nomeia
 * "leite"; "creme de avelã" não nomeia "avelã").
 */
const NAMING_LISTS: Record<AllergyCode, CompiledTermList> = Object.fromEntries(
  ALLERGY_CODE_VALUES.map(code => [
    code,
    compileRestrictionRules({
      en: NAMING_RULES[code].en,
      pt: NAMING_RULES[code].pt,
      exceptions: [...NAMING_RULES[code].exceptions, ...ALL_DISH_PHRASES],
    }),
  ])
) as Record<AllergyCode, CompiledTermList>;

const DISH_LISTS = ALLERGEN_DISHES.map(dish => ({
  dish,
  list: compileRestrictionRules({
    en: dish.allowedWith ? withAllowed(terms(dish.phrases), dish.allowedWith.before, dish.allowedWith.after) : terms(dish.phrases),
    pt: [],
    exceptions: [],
  }),
}));

// Aveia (CP-B6): não bloqueia por trigo/glúten, mas pede o aviso.
const OAT_TERMS = compileTermList({ en: ['oat', 'oatmeal', 'oat bran', 'porridge'], pt: ['aveia'] });

function customList(item: string): CompiledTermList {
  const group = foodGroupTermsForItem(item);
  const own = normalizeMatchText(item);
  return compileTermList({
    en: [...new Set([...(group?.terms ?? []), ...(own ? [own] : [])])],
    pt: [],
    exceptions: group?.exceptions ?? [],
  });
}

// ─── Rótulos para a IA (en) ──────────────────────────────────────────────────

const PROMPT_LABELS: Record<AllergyCode, string> = {
  peanut: 'peanuts (and anything made from peanuts)',
  tree_nuts: 'tree nuts (almonds, cashews, Brazil nuts, walnuts, pecans, hazelnuts, pistachios, macadamias, pine nuts, baru) and anything made from them; coconut is allowed',
  milk: "cow's milk protein: every dairy product, including lactose-free ones (milk, whey of any kind, casein, yogurt, cheese, butter, ghee, cream, ice cream, kefir) and protein powders without a declared plant source; plant-based beverages are allowed",
  lactose: 'lactose: milk, yogurt, kefir, ice cream, cream, fresh cheeses and whey concentrate, unless labeled lactose-free; whey isolate, aged cheeses (such as parmesan), butter and ghee are allowed',
  soy: 'soy (soy milk, tofu, soy protein, edamame, miso, soy sauce, soy lecithin)',
  wheat_gluten: 'wheat and gluten (wheat, barley, rye, malt, spelt, semolina, couscous, bread, cookies, regular granola and breakfast cereals); oats are allowed',
  sesame: 'sesame (seeds, oil, tahini, halva)',
  egg: 'eggs (whole egg, egg white, yolk, albumin, mayonnaise, meringue)',
};

// ─── Chaves (código ou item livre) ───────────────────────────────────────────

const CUSTOM_KEY_PREFIX = 'custom:';

export function customAllergyKey(item: string): string {
  return `${CUSTOM_KEY_PREFIX}${item}`;
}

/** Alergias como vieram do banco (conta antiga sem o campo = sem alergia). */
export const readUserAllergies = normalizeUserAllergies;

export const hasAnyAllergy = hasAllergies;

/** Só o que está cadastrado (itens livres pela normalização; devolve como cadastrado). */
export function intersectWithProfile(selection: Partial<AllergenSelection> | undefined, profile: UserAllergies): AllergenSelection {
  return {
    common: profile.common.filter(code => selection?.common?.includes(code)),
    custom: profile.custom.filter(item => selection?.custom?.some(other => isSameAllergyItem(item, other))),
  };
}

export function intersectSelections(a: AllergenSelection, b: AllergenSelection): AllergenSelection {
  return {
    common: a.common.filter(code => b.common.includes(code)),
    custom: a.custom.filter(item => b.custom.some(other => isSameAllergyItem(item, other))),
  };
}

export function subtractSelection(a: AllergenSelection, b: AllergenSelection): AllergenSelection {
  return {
    common: a.common.filter(code => !b.common.includes(code)),
    custom: a.custom.filter(item => !b.custom.some(other => isSameAllergyItem(item, other))),
  };
}

export function isEmptySelection(selection: AllergenSelection): boolean {
  return selection.common.length === 0 && selection.custom.length === 0;
}

/** Chaves do validador → seleção (na ordem do cadastro). */
export function keysToSelection(keys: readonly string[], profile: UserAllergies): AllergenSelection {
  return {
    common: profile.common.filter(code => keys.includes(code)),
    custom: profile.custom.filter(item => keys.includes(customAllergyKey(item))),
  };
}

// ─── Restrições para o validador ─────────────────────────────────────────────

/**
 * Uma restrição por alergia cadastrada; liberadas só as da confirmação
 * desta requisição (já conferida pelo chamador contra o que foi citado).
 */
export function buildAllergyRestrictions(
  profile: UserAllergies,
  overridden: AllergenSelection = { common: [], custom: [] }
): AllergyRestriction[] {
  return [
    ...profile.common.map(code => ({
      key: code,
      label: PROMPT_LABELS[code],
      list: FAMILY_LISTS[code],
      titleList: NAMING_LISTS[code],
      requestList: REQUEST_FILTER_LISTS[code],
      overridden: overridden.common.includes(code),
    })),
    ...profile.custom.map(item => ({
      key: customAllergyKey(item),
      label: item,
      list: customList(item),
      overridden: overridden.custom.some(other => isSameAllergyItem(item, other)),
    })),
  ];
}

/** O texto cita algum alérgeno ainda proibido (para não cobrar alimento pedido que é alérgeno). */
export function mentionsForbiddenAllergen(text: string, restrictions: readonly AllergyRestriction[]): boolean {
  return restrictions.some(
    restriction => !restriction.overridden && mentionsTermList(text, restriction.requestList ?? restriction.list)
  );
}

// ─── O que a mensagem nomeia / implica ───────────────────────────────────────

export interface AllergenMentions {
  /** Citados sem negação. */
  named: AllergenSelection;
  /** Citados só com negação ("sem amendoim"). */
  negated: AllergenSelection;
}

function scanSelection(
  text: string,
  profile: UserAllergies,
  listFor: (code: AllergyCode) => CompiledTermList
): AllergenMentions {
  const named: AllergenSelection = { common: [], custom: [] };
  const negated: AllergenSelection = { common: [], custom: [] };
  if (!text.trim()) return { named, negated };

  const classify = (occurrences: ReturnType<typeof findTermOccurrences>) => ({
    positive: occurrences.some(occurrence => !occurrence.negated),
    negative: occurrences.length > 0 && occurrences.every(occurrence => occurrence.negated),
  });

  for (const code of profile.common) {
    const { positive, negative } = classify(findTermOccurrences(text, listFor(code)));
    if (positive) named.common.push(code);
    else if (negative) negated.common.push(code);
  }

  for (const item of profile.custom) {
    const { positive, negative } = classify(findTermOccurrences(text, customList(item)));
    if (positive) named.custom.push(item);
    else if (negative) negated.custom.push(item);
  }

  return { named, negated };
}

/**
 * Alérgenos cadastrados que a mensagem NOMEIA (mesma normalização e negação
 * do validador; "sem amendoim" não conta; prato não conta).
 */
export function findNamedAllergens(text: string, profile: UserAllergies): AllergenMentions {
  return scanSelection(text, profile, code => NAMING_LISTS[code]);
}

/** Alérgenos cadastrados que um NOME de ingrediente contém (família completa: "Paçoca" é amendoim). */
export function findAllergensInName(name: string, profile: UserAllergies): AllergenSelection {
  return scanSelection(name, profile, code => FAMILY_LISTS[code]).named;
}

/**
 * Prato/produto citado (sem negação) que normalmente leva um alérgeno
 * cadastrado que a mensagem NÃO nomeou nem negou nem teve resposta na folha.
 * O primeiro na ordem do texto. null quando nenhum.
 */
export function findImpliedAllergenDish(
  text: string,
  profile: UserAllergies,
  exclude: AllergenSelection,
  language: Language
): RecipeAllergySuggestion | null {
  if (profile.common.length === 0 || !text.trim()) return null;

  const candidates = DISH_LISTS.flatMap(({ dish, list }) => {
    const first = findTermOccurrences(text, list).find(occurrence => !occurrence.negated);
    if (!first) return [];
    const allergens = dish.allergens.filter(code => profile.common.includes(code) && !exclude.common.includes(code));
    return allergens.length > 0 ? [{ dish, allergens, first }] : [];
  }).sort((a, b) => a.first.segment - b.first.segment || a.first.start - b.first.start);

  const chosen = candidates[0];
  return chosen
    ? { dish: chosen.dish.display[language], allergens: ALLERGY_CODE_VALUES.filter(code => chosen.allergens.includes(code)) }
    : null;
}

// ─── Aviso da aveia ──────────────────────────────────────────────────────────

/** Alergia a trigo/glúten e algum ingrediente com aveia (inclui farelo, farinha e leite de aveia). */
export function needsGlutenFreeOatsNotice(recipe: Pick<PulseAiRecipe, 'ingredients'>, profile: UserAllergies): boolean {
  return profile.common.includes('wheat_gluten') && recipe.ingredients.some(ingredient => mentionsTermList(ingredient.name, OAT_TERMS));
}

// ─── Marcações da receita (só o backend preenche) ────────────────────────────

/**
 * Tira o que a IA possa ter mandado e põe o que o backend decidiu: alérgenos
 * confirmados que a receita contém, sugestão de prato e aviso da aveia.
 */
export function withAllergyNotices(
  recipe: PulseAiRecipe,
  params: {
    profile: UserAllergies;
    overrideKeys: readonly string[];
    suggestion: RecipeAllergySuggestion | null;
  }
): PulseAiRecipe {
  const {
    allergyOverride: _previousOverride,
    allergySuggestion: _previousSuggestion,
    glutenFreeOatsNotice: _previousOats,
    ...rest
  } = recipe;
  void _previousOverride;
  void _previousSuggestion;
  void _previousOats;

  const override = keysToSelection(params.overrideKeys, params.profile);
  const oats = needsGlutenFreeOatsNotice(recipe, params.profile);

  return {
    ...rest,
    ...(!isEmptySelection(override) ? { allergyOverride: override } : {}),
    ...(params.suggestion ? { allergySuggestion: params.suggestion } : {}),
    ...(oats ? { glutenFreeOatsNotice: true } : {}),
  };
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

export interface PromptAllergyContext {
  /** Códigos ainda proibidos (filtram os exemplos fixos do prompt). */
  forbiddenCodes: AllergyCode[];
  /** Rótulos (en) das alergias ainda proibidas: códigos e itens livres. */
  forbidden: string[];
  /** Rótulos confirmados na hora para esta requisição. */
  confirmed: string[];
  /** Rótulos citados e recusados na folha. */
  declined: string[];
  /** Prato pedido que normalmente leva alérgeno (feito sem). */
  impliedDish?: { dish: string; allergens: string[] };
  /** Alergia a trigo/glúten: aveia continua permitida. */
  oatsAllowed: boolean;
  /** Alergia a leite ou lactose ainda proibida: sabor chocolate vem de cacau/amargo. */
  chocolateFromCocoa: boolean;
}

function labelsOf(selection: AllergenSelection): string[] {
  return [...selection.common.map(code => PROMPT_LABELS[code]), ...selection.custom];
}

export function buildPromptAllergyContext(params: {
  profile: UserAllergies;
  confirmed: AllergenSelection;
  declined: AllergenSelection;
  suggestion: RecipeAllergySuggestion | null;
}): PromptAllergyContext | undefined {
  if (!hasAnyAllergy(params.profile)) return undefined;

  const forbidden = subtractSelection(params.profile, params.confirmed);
  return {
    forbiddenCodes: forbidden.common,
    forbidden: labelsOf(forbidden),
    confirmed: labelsOf(intersectSelections(params.profile, params.confirmed)),
    declined: labelsOf(intersectSelections(params.profile, params.declined)),
    ...(params.suggestion
      ? {
          impliedDish: {
            dish: params.suggestion.dish,
            allergens: params.suggestion.allergens.map(code => PROMPT_LABELS[code]),
          },
        }
      : {}),
    oatsAllowed: params.profile.common.includes('wheat_gluten') && !params.confirmed.common.includes('wheat_gluten'),
    chocolateFromCocoa: forbidden.common.includes('milk') || forbidden.common.includes('lactose'),
  };
}

/** Hash estável das alergias e da escolha desta requisição (chave do cache da IA). */
export function allergyCacheParts(params: {
  profile: UserAllergies;
  confirmed: AllergenSelection;
  declined: AllergenSelection;
}): string[] {
  if (!hasAnyAllergy(params.profile)) return [];
  const norm = (selection: AllergenSelection) => [
    ...selection.common,
    ...selection.custom.map(item => customAllergyKey(normalizeMatchText(item))),
  ].sort();

  return [
    `a=${norm(params.profile).join(',')}`,
    `c=${norm(intersectSelections(params.profile, params.confirmed)).join(',')}`,
    `d=${norm(intersectSelections(params.profile, params.declined)).join(',')}`,
  ];
}

// ─── Resolução do pedido (Pulse AI e Pantry) ─────────────────────────────────

export interface AllergyRequestResolution {
  profile: UserAllergies;
  /** Citados/escolhidos e cadastrados, ainda sem resposta na folha: pedir confirmação. */
  unresolved: AllergenSelection;
  /** Confirmados na folha para esta requisição (e de fato citados/escolhidos). */
  confirmed: AllergenSelection;
  /** Citados e recusados na folha ("Não, fazer sem"). */
  declined: AllergenSelection;
  /** Prato pedido que normalmente leva alérgeno não citado (receita sem ele). */
  suggestion: RecipeAllergySuggestion | null;
  /** Restrições para o validador (só as confirmadas liberadas). */
  restrictions: AllergyRestriction[];
}

function union(...selections: readonly AllergenSelection[]): AllergenSelection {
  return {
    common: ALLERGY_CODE_VALUES.filter(code => selections.some(selection => selection.common.includes(code))),
    custom: selections
      .flatMap(selection => selection.custom)
      .filter((item, index, all) => all.findIndex(other => isSameAllergyItem(other, item)) === index),
  };
}

/**
 * Função única da decisão: `requested` é o que a mensagem/o pedido cita
 * (nomeado) e `chosen` o que a pessoa escolheu como ingrediente (Pantry:
 * item marcado ou adicionado). Só isso pode ser confirmado; o que o app
 * mandar a mais é ignorado. Histórico nunca entra (o chamador só passa o
 * texto atual).
 */
export function resolveAllergyRequest(params: {
  profile: UserAllergies;
  /** Texto atual (mensagem do Pulse AI ou "Algum pedido?"). */
  text: string;
  /** Pantry: alérgenos dos itens marcados e adicionados. */
  chosen?: AllergenSelection;
  override?: Partial<AllergenSelection>;
  declined?: Partial<AllergenSelection>;
  language: Language;
}): AllergyRequestResolution {
  const { profile } = params;
  const empty: AllergenSelection = { common: [], custom: [] };

  if (!hasAnyAllergy(profile)) {
    return { profile, unresolved: empty, confirmed: empty, declined: empty, suggestion: null, restrictions: [] };
  }

  const mentions = findNamedAllergens(params.text, profile);
  const chosen = params.chosen ?? empty;
  const citable = union(mentions.named, chosen);

  const confirmed = intersectSelections(intersectWithProfile(params.override, profile), citable);
  // Item escolhido não pode ser "recusado" (o app desmarca/remove); só o texto.
  const declined = subtractSelection(
    intersectSelections(intersectWithProfile(params.declined, profile), mentions.named),
    union(confirmed, chosen)
  );
  const unresolved = subtractSelection(subtractSelection(citable, confirmed), declined);

  const suggestion = findImpliedAllergenDish(
    params.text,
    profile,
    union(citable, mentions.negated, declined),
    params.language
  );

  return {
    profile,
    unresolved,
    confirmed,
    declined,
    suggestion,
    restrictions: buildAllergyRestrictions(profile, confirmed),
  };
}

/** Códigos ainda proibidos nesta requisição (filtram sugestões e exemplos). */
export function forbiddenAllergyCodes(resolution: Pick<AllergyRequestResolution, 'profile' | 'confirmed'>): AllergyCode[] {
  return resolution.profile.common.filter(code => !resolution.confirmed.common.includes(code));
}
