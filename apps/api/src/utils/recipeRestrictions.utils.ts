// apps/api/src/utils/recipeRestrictions.utils.ts
// CP-1.1.1c: validação determinística, no backend, das restrições do usuário
// sobre a receita JÁ GERADA pela IA (Pulse AI e Pantry Scanner).
//
// Por quê: a dieta (dietaryPreferences) e o "nunca gelo no Lite" entram no
// prompt, mas o prompt é probabilístico — no pentest do CP-1.1.1a, 2 de 12
// receitas nut_free vieram com leite de amêndoa. Para nut_free uma falha é
// reação alérgica. Esta função é a rede de segurança que NÃO depende da IA:
// diferente dos guardrails de proteína e de macros (que nunca bloqueiam), uma
// violação aqui faz o controller pedir um retry e, se persistir, barrar a
// receita.
//
// O que é conferido:
// - ingredients[].name — onde o ingrediente proibido aparece de fato.
// - steps[].text — os passos podem introduzir um ingrediente ("finalize com
//   mel") que não está na lista.
// - blendInstruction — também é instrução acionável mostrada ao usuário
//   ("adicione o gelo por último e bata"; "finalize com um fio de mel").
//   Mas, no teste ao vivo, a IA também usa esse campo para EXPLICAR a troca
//   quando o usuário pede o proibido ("como o seu Lite não deve ser usado com
//   gelo, esta receita usa fruta congelada") — e isso barrou uma receita
//   correta. Por isso a blendInstruction usa negação por frase (regra 7);
//   ingredientes e passos continuam estritos. Quando a IA de fato usa o
//   ingrediente proibido, ele aparece nos ingredientes e nos passos.
//
// O que NÃO é conferido (de propósito):
// - tip — costuma explicar a troca ("troquei a pasta de amendoim por
//   sementes de girassol") e daria falso positivo.
// - title — até o CP-B5 não era conferido (ex.: "Smoothie sem amendoim").
//   Pós CP-B5 passa a ser (ver o bloco "Título" abaixo).
//
// Como casa:
// 1. Normalização: minúsculas, sem acento (NFD), pontuação vira espaço.
//    O texto é cortado em segmentos em . , ; : ! ? e quebras de linha, para
//    que um qualificador de um item não "vaze" para o item vizinho
//    ("aveia, leite e banana" não vira "leite de aveia").
// 2. Palavra inteira: o texto vira uma lista de tokens e os termos são
//    comparados token a token — "ice" não casa com "rice", "mel" não casa
//    com "caramelo" nem "melão", "nut" não casa com "nutmeg" nem "coconut".
// 3. Singular e plural: cada token do texto gera candidatos de singular
//    (nuts→nut, nozes→noz, amendoins→amendoim, açúcares→açúcar,
//    berries→berry, limões→limão). Os termos são escritos no singular.
// 4. Exceções explícitas (por restrição) são mascaradas antes da busca —
//    ex.: "noz-moscada" não é oleaginosa.
// 5. Qualificadores vegetais: um termo de laticínio (leite, milk, iogurte,
//    manteiga, cream, queijo...) deixa de ser laticínio quando vem colado a
//    um qualificador vegetal — antes ("oat milk", "coconut cream"), depois
//    ("leite vegetal") ou depois de "de/do/da/of" ("leite de aveia",
//    "manteiga de cacau", "cream of coconut").
// 6. Negação: o termo é ignorado quando precedido de "sem", "without",
//    "sem adição de", "livre de", "não", "zero", "no added", "instead of",
//    "em vez de"... ou seguido de "free" ("nut-free", "sugar-free").
//    O "no" puro (en) só nega termos em inglês — em português "no" é
//    contração ("dissolva o cacau no leite") e não pode virar negação.
// 7. Só na blendInstruction: o termo também é ignorado quando a MESMA frase
//    (segmento) tem antes dele uma palavra de negação ("não", "sem",
//    "nunca", "evite", "not", "never", "without", "avoid", "instead"...).
//    Isso aceitaria "não esqueça de adicionar gelo" — risco aceito só neste
//    campo, porque o gelo de verdade também estaria nos ingredientes.
//
// Na dúvida, nut_free erra para o lado de bloquear (alergia). Nas demais
// restrições o objetivo é equilíbrio: um falso positivo custa um retry da
// IA ou um erro para o usuário.
//
// CP-B5 — pedido explícito (só Pulse AI, decisão do Gabriel): a pessoa pode
// furar a própria dieta pedindo um ingrediente na mensagem ATUAL. O backend
// não confia na IA para isso: roda estas MESMAS regras sobre o texto da
// mensagem atual (com a mesma normalização e negação: "sem whey" não libera)
// e só libera, em cada restrição de dieta, os termos que aparecem nela. Na
// receita, uma ocorrência proibida passa quando é um desses termos ou está
// colada a um deles no mesmo trecho ("Whey protein powder": "protein
// powder" encosta em "whey"). Gelo/congelado no Lite e álcool nunca são
// liberados por pedido. Mensagens anteriores e o histórico não entram.
//
// CP-B5 — álcool: 'no_alcohol' só fica ativa quando o controller pede
// (Pulse AI); o Pantry Scanner não muda. Ela também olha a tip (com negação
// por frase, como a blendInstruction): o app não sugere álcool nem na dica.
//
// Título (pós CP-B5): no lote 9 uma conta vegana recebeu uma receita vegana
// com "Whey" no título, puxado da mensagem anterior. O title passa pelas
// regras de dieta e pela lista de álcool ('no_alcohol'), com a mesma
// normalização e a mesma negação dos ingredientes ("Smoothie sem amendoim",
// "Peanut-free smoothie", "Piña Colada sem rum" passam). Sem a negação por
// frase da regra 7: o título é curto e conta como nome. Um termo fora da
// dieta só passa no título quando a mensagem atual o pediu E ele está num
// ingrediente desta receita que passou por esse pedido. Nome de drink
// ("Caipirinha", "Piña Colada") não está na lista e continua permitido na
// versão sem álcool. Gelo/congelado no Lite e o teto de álcool (21+) não
// olham o título (nada muda nessas regras).

import { RECIPE_MAX_ALCOHOL_GRAMS, type PulseAiRecipe } from '@blendi/shared';

import type { BlendiModel, DietaryPreference } from '../models/User';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

/**
 * Restrição de hardware: o BLENDi Lite não pode receber gelo nem nada
 * congelado (CP-B2, decisão do Jon). O id 'lite_no_ice' ficou o mesmo.
 */
export const LITE_NO_ICE_RESTRICTION = 'lite_no_ice' as const;

/** CP-B5: receita sem álcool (menor de 21, idade não confirmada ou álcool não pedido). */
export const NO_ALCOHOL_RESTRICTION = 'no_alcohol' as const;

/** CP-B5: álcool pedido por quem tem 21+, mas acima do teto ou sem alcoholGrams. */
export const ALCOHOL_LIMIT_RESTRICTION = 'alcohol_limit' as const;

export type RecipeRestriction =
  | DietaryPreference
  | typeof LITE_NO_ICE_RESTRICTION
  | typeof NO_ALCOHOL_RESTRICTION
  | typeof ALCOHOL_LIMIT_RESTRICTION;

export type RecipeRestrictionField = 'ingredient' | 'step' | 'blendInstruction' | 'tip' | 'title' | 'alcoholGrams';

export interface RecipeRestrictionViolation {
  restriction: RecipeRestriction;
  /** Termo canônico (normalizado) da lista que casou — ex.: "almond", "gelo". */
  term: string;
  field: RecipeRestrictionField;
  /** Índice do ingrediente ou do passo; ausente para blendInstruction. */
  index?: number;
}

export type RecipeRestrictionResult =
  | {
      compliant: true;
      /**
       * CP-B5: índices dos ingredientes que só passaram porque a mensagem
       * atual pediu (fora da dieta). Ausente quando nenhum.
       */
      dietOverrideIngredientIndexes?: number[];
    }
  | { compliant: false; violations: RecipeRestrictionViolation[] };

export type RestrictedRecipe = Pick<PulseAiRecipe, 'ingredients' | 'blendInstruction' | 'steps'> &
  Partial<Pick<PulseAiRecipe, 'tip' | 'alcoholGrams' | 'title'>>;

/** CP-B5: política de álcool desta receita (só Pulse AI passa). */
export type RecipeAlcoholPolicy = 'forbidden' | 'allowed';

export interface RecipeRestrictionOptions {
  /**
   * Texto da mensagem ATUAL da pessoa. Libera, nas restrições de dieta, só
   * os termos proibidos que ela pede explicitamente. Nunca o histórico.
   */
  explicitRequest?: string;
  /**
   * 'forbidden': nenhum ingrediente alcoólico (nem alcoholGrams > 0).
   * 'allowed': 21+ que pediu: álcool permitido, com alcoholGrams preenchido
   * e até RECIPE_MAX_ALCOHOL_GRAMS. Ausente: sem checagem de álcool (Pantry).
   */
  alcohol?: RecipeAlcoholPolicy;
}

// ─── Estrutura das listas ────────────────────────────────────────────────────

interface RestrictedTerm {
  /** Frase normalizada, no singular, sem acento. */
  phrase: string;
  /**
   * Tokens que, colados ao termo, o tornam permitido (qualificador vegetal
   * de um laticínio). Ver regra 5 do cabeçalho.
   */
  neutralizedBy?: readonly string[];
  /**
   * Quantos tokens antes do termo o qualificador pode estar (padrão 1, ou
   * seja, colado). A busca para em conjunção ("e", "and", "com", "with"...)
   * para não pegar o qualificador do item vizinho.
   */
  qualifierLookback?: number;
  /**
   * Frases que, coladas antes ou depois do termo, o tornam permitido
   * ("nut-free granola", "granola sem castanhas").
   */
  allowedWith?: { before?: readonly string[]; after?: readonly string[] };
  /**
   * Quantos tokens podem ficar entre a negação e o termo (padrão 0). CP-B2:
   * adjetivo depois do nome em pt — "sem fruta congelada", "não use banana
   * congelada" negam "congelada".
   */
  negationLookback?: number;
}

interface RestrictionRules {
  /** Termos em inglês. O "no" puro só nega estes. */
  en: readonly RestrictedTerm[];
  /** Termos em português. */
  pt: readonly RestrictedTerm[];
  /** Frases mascaradas antes da busca (nunca contam como violação). */
  exceptions: readonly string[];
}

function terms(phrases: readonly string[], neutralizedBy?: readonly string[]): RestrictedTerm[] {
  return phrases.map(phrase => ({ phrase, ...(neutralizedBy ? { neutralizedBy } : {}) }));
}

// ─── Qualificadores vegetais (regra 5) ───────────────────────────────────────

// Bases vegetais de "leite", "iogurte" e afins. Não inclui "chocolate",
// "banana" nem "morango": "chocolate milk", "banana milk" e "iogurte de
// morango" são laticínio.
const PLANT_BASE_QUALIFIERS = [
  'oat', 'aveia',
  'soy', 'soja',
  'coconut', 'coco',
  'almond', 'amendoa',
  'rice', 'arroz',
  'cashew', 'caju', 'castanha',
  'hazelnut', 'avela',
  'macadamia',
  'pistachio', 'pistache',
  'walnut', 'noz',
  'peanut', 'amendoim',
  'nut', 'seed', 'semente',
  'pea', 'ervilha',
  'hemp', 'canhamo',
  'flax', 'linhaca',
  'quinoa',
  'sesame', 'gergelim',
  'plant', 'plantbased', 'vegetal',
  'vegan', 'vegano', 'vegana',
  'dairyfree', 'nondairy',
] as const;

// "manteiga"/"butter" vegetais: as bases acima mais cacau e girassol
// ("manteiga de cacau", "cocoa butter", "sunflower seed butter").
const PLANT_BUTTER_QUALIFIERS = [
  ...PLANT_BASE_QUALIFIERS,
  'cocoa', 'cacau',
  'sunflower', 'girassol',
] as const;

// "cream"/"creme": sem avelã de propósito — "creme de avelã" do tipo Nutella
// leva leite em pó.
const PLANT_CREAM_QUALIFIERS = PLANT_BASE_QUALIFIERS.filter(
  qualifier => qualifier !== 'hazelnut' && qualifier !== 'avela'
);

// Sorvete comum É laticínio. Só os qualificadores explícitos de "não é
// laticínio" o liberam — "sorvete de coco" no Brasil costuma levar leite.
const EXPLICIT_NON_DAIRY_QUALIFIERS = [
  'plant', 'plantbased', 'vegetal',
  'vegan', 'vegano', 'vegana',
  'dairyfree', 'nondairy',
] as const;

// Kefir de água / water kefir não é laticínio.
const KEFIR_QUALIFIERS = [...PLANT_BASE_QUALIFIERS, 'water', 'agua'] as const;

// Origem vegetal declarada da proteína em pó (vegan). Sem isso, "protein
// powder" pode ser whey ou caseína. Inclui as formas flexionadas de
// vegan/plant e o cânhamo (proteína vegetal comum).
const PLANT_PROTEIN_QUALIFIERS = [
  'plant', 'plantbased', 'vegetal',
  'vegan', 'vegano', 'vegana',
  'pea', 'ervilha',
  'soy', 'soja',
  'rice', 'arroz',
  'hemp', 'canhamo',
] as const;

// Até 2 tokens antes: "pea vanilla protein powder", "vegan unflavored protein powder".
const PLANT_PROTEIN_LOOKBACK = 2;

// Granola costuma levar castanhas; só é permitida quando o nome diz que não
// leva. "sem amendoim"/"peanut-free" não basta (ainda pode ter castanhas).
const NUT_FREE_GRANOLA_BEFORE = ['nut free', 'tree nut free'] as const;
const NUT_FREE_GRANOLA_AFTER = [
  'nut free',
  'without nut',
  'free of nut',
  'sem castanha',
  'sem oleaginosa',
  'sem noz',
  'livre de castanha',
  'livre de oleaginosa',
  'isenta de castanha',
  'isenta de oleaginosa',
] as const;

// ─── Listas por restrição ────────────────────────────────────────────────────

/**
 * Laticínios (dairy_free). Também é a base do vegan.
 * Permitido (exceções/qualificadores): leite de aveia, soja, coco, amêndoa,
 * arroz, "leite vegetal"; manteiga de cacau; pasta/manteiga de amendoim;
 * creme de coco ("creme" sozinho em pt não é termo: "bata até virar um
 * creme"). Proibido: sorvete comum, leite sem lactose (ainda é leite),
 * chocolate ao leite, leite condensado, doce de leite, whey, caseína, ghee.
 */
const DAIRY_RULES: RestrictionRules = {
  en: [
    ...terms(['milk', 'milkshake', 'buttermilk', 'milk powder'], PLANT_BASE_QUALIFIERS),
    ...terms(['yogurt', 'yoghurt', 'skyr'], PLANT_BASE_QUALIFIERS),
    ...terms(['cheese', 'ricotta', 'mascarpone', 'cottage'], PLANT_BASE_QUALIFIERS),
    ...terms(['butter'], PLANT_BUTTER_QUALIFIERS),
    ...terms(['cream', 'half and half'], PLANT_CREAM_QUALIFIERS),
    ...terms(['kefir'], KEFIR_QUALIFIERS),
    ...terms(['icecream', 'gelato', 'frozen yogurt'], EXPLICIT_NON_DAIRY_QUALIFIERS),
    ...terms(['whey', 'casein', 'ghee', 'lactose', 'dulce de leche']),
  ],
  pt: [
    ...terms(['leite', 'leite em po'], PLANT_BASE_QUALIFIERS),
    ...terms(['iogurte', 'coalhada'], PLANT_BASE_QUALIFIERS),
    ...terms(['queijo', 'requeijao', 'ricota'], PLANT_BASE_QUALIFIERS),
    ...terms(['manteiga'], PLANT_BUTTER_QUALIFIERS),
    ...terms(['nata', 'chantilly', 'chantili'], PLANT_CREAM_QUALIFIERS),
    ...terms(['sorvete'], EXPLICIT_NON_DAIRY_QUALIFIERS),
    ...terms(['caseina', 'soro de leite']),
  ],
  exceptions: [
    'cream of tartar',
    'cremor tartaro',
  ],
};

/**
 * Oleaginosas (nut_free) — erra para o lado de bloquear.
 * Inclui amendoim (não é castanha botanicamente, mas é a alergia mais
 * comum e o prompt o lista), todas as castanhas e derivados (leite de
 * amêndoa, pasta de amendoim, praliné, marzipã, Nutella, paçoca).
 *
 * Coco NÃO é oleaginosa aqui — mesma decisão do prompt (que não lista coco)
 * e da orientação de 2025 do FDA, que tirou o coco da lista de "tree nuts".
 * Por isso "noz-de-coco" é exceção.
 *
 * Exceções: noz-moscada (especiaria); caju a fruta (suco/polpa de caju —
 * "caju" sozinho não é termo, só "castanha de caju"/"cashew"); "cashew
 * apple/fruit/juice". "sem amendoim", "nut-free", "peanut-free" são negação.
 *
 * Granola (CP-1.1.1d): costuma ter castanhas, então é violação, a não ser
 * que o nome diga que não tem ("nut-free granola", "granola sem castanhas",
 * "granola sem oleaginosas"). "Peanut-free granola" e "granola sem
 * amendoim" continuam barradas — não dizem nada sobre as castanhas.
 */
const NUT_RULES: RestrictionRules = {
  en: [
    ...terms(['granola']).map(term => ({
      ...term,
      allowedWith: { before: NUT_FREE_GRANOLA_BEFORE, after: NUT_FREE_GRANOLA_AFTER },
    })),
    ...terms([
    'nut',
    'peanut',
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'hazelnut',
    'pistachio',
    'macadamia',
    'chestnut',
    'praline',
    'marzipan',
    'nutella',
    'gianduja',
    'gianduia',
    'trail mix',
    ]),
  ],
  pt: terms([
    'amendoim',
    'amendoa',
    'castanha',
    'noz',
    'avela',
    'pistache',
    'oleaginosa',
    'marzipa',
    'pacoca',
  ]),
  exceptions: [
    'noz moscada',
    'noz de coco',
    'cashew apple',
    'cashew fruit',
    'cashew juice',
    'cashew pulp',
  ],
};

/**
 * Vegan: tudo de DAIRY_RULES, mais ovo/clara/gema, mel e produtos de
 * abelha, colágeno, gelatina, albumina. Whey e caseína já vêm dos
 * laticínios. Proteína vegetal ("pea protein", "proteína vegetal") não é
 * termo e passa.
 *
 * Proteína em pó (CP-1.1.1d): "protein powder", "protein isolate",
 * "proteína em pó", "pó de proteína" e "proteína isolada" sem origem
 * vegetal declarada são violação (podem ser whey ou caseína). Com o
 * qualificador (até 2 palavras antes, ou logo depois: "pea protein powder",
 * "vegan vanilla protein powder", "proteína em pó de ervilha", "proteína
 * em pó vegetal") continuam permitidas.
 */
const VEGAN_RULES: RestrictionRules = {
  en: [
    ...DAIRY_RULES.en,
    ...terms(['protein powder', 'protein isolate'], PLANT_PROTEIN_QUALIFIERS).map(term => ({
      ...term,
      qualifierLookback: PLANT_PROTEIN_LOOKBACK,
    })),
    ...terms([
      'egg',
      'egg white',
      'yolk',
      'honey',
      'honeycomb',
      'bee pollen',
      'royal jelly',
      'propolis',
      'collagen',
      'gelatin',
      'gelatine',
      'albumin',
    ]),
  ],
  pt: [
    ...DAIRY_RULES.pt,
    ...terms(['proteina em po', 'po de proteina', 'proteina isolada'], PLANT_PROTEIN_QUALIFIERS).map(
      term => ({ ...term, qualifierLookback: PLANT_PROTEIN_LOOKBACK })
    ),
    ...terms([
      'ovo',
      'clara',
      'gema',
      'mel',
      'polen',
      'geleia real',
      'propolis',
      'colageno',
      'gelatina',
      'albumina',
    ]),
  ],
  exceptions: [
    ...DAIRY_RULES.exceptions,
    // "mel de agave" é nome popular do néctar de agave (vegetal).
    'mel de agave',
  ],
};

/**
 * Sem açúcar adicionado (no_added_sugar) — o que o prompt proíbe: açúcar,
 * mel, xaropes (maple, agave, chocolate), adoçantes (inclusive os sem
 * caloria, como stevia) e ingredientes adoçados. Fruta inteira (e tâmara,
 * fruta seca) é permitida e não está na lista.
 *
 * Não é violação: "sem açúcar", "sugar-free", "no added sugar",
 * "unsweetened", "sem adoçar", "não adoçado", "açúcar natural da fruta",
 * "naturally sweetened". "caramelo" e "chocolate" sozinhos também não
 * entram (podem ser sabor/aroma); "calda" e "syrup" sim.
 */
const NO_ADDED_SUGAR_RULES: RestrictionRules = {
  en: terms([
    'sugar',
    'honey',
    'honeycomb',
    'syrup',
    'maple',
    'agave',
    'molasses',
    'sweetener',
    'stevia',
    'sucralose',
    'aspartame',
    'saccharin',
    'xylitol',
    'erythritol',
    'allulose',
    'monk fruit',
    'sweetened',
    'condensed milk',
    'dulce de leche',
    'caramel sauce',
    'chocolate sauce',
    'cane juice',
    'glucose',
    'dextrose',
    'nutella',
  ]),
  pt: terms([
    'acucar',
    'mel',
    'xarope',
    'calda',
    'melado',
    'melaco',
    'rapadura',
    'adocante',
    'estevia',
    'xilitol',
    'eritritol',
    'adocado',
    'adocada',
    'acucarado',
    'acucarada',
    'leite condensado',
    'doce de leite',
    'achocolatado',
    'glicose',
  ]),
  exceptions: [
    'natural sugar',
    'naturally occurring sugar',
    'naturally sweet',
    'naturally sweetened',
    'sweetened only with fruit',
    'sweetened with fruit',
    'acucar natural',
    'acucar natural da fruta',
    'adocado naturalmente',
    'adocada naturalmente',
    'naturalmente adocado',
    'naturalmente adocada',
    'adocado com fruta',
    'adocada com fruta',
  ],
};

/** Termos de gelo (en e pt-BR). Ver LITE_ICE_RULES. */
export const LITE_ICE_TERMS = { en: ['ice'], pt: ['gelo'] } as const;

/**
 * Termos de ingrediente congelado (CP-B2). "congelados/congeladas" e
 * "frozen fruits" caem pelo singular; "congele"/"congelar"/"freeze" pegam a
 * instrução de congelar um ingrediente antes de bater. "descongelado",
 * "congelador" e "freezer" são outros tokens e não casam.
 */
export const LITE_FROZEN_TERMS = {
  en: ['frozen', 'freeze'],
  pt: ['congelado', 'congelada', 'congele', 'congelar'],
} as const;

/** Negação a até 1 token de distância (o nome entre a negação e o adjetivo). */
const FROZEN_NEGATION_LOOKBACK = 1;

function frozenTerms(phrases: readonly string[]): RestrictedTerm[] {
  return phrases.map(phrase => ({ phrase, negationLookback: FROZEN_NEGATION_LOOKBACK }));
}

/**
 * Gelo e congelados no BLENDi Lite (inclui contas "Other or older model" e
 * "No BLENDi yet", que gravam blendiModel "Lite").
 *
 * Histórico: até o CP-B1 era "só gelo: fruta congelada continua permitida".
 * CP-B2: o Jon confirmou que o Lite NÃO pode receber nada congelado (fruta
 * congelada, iogurte congelado...) — os termos de congelado entraram aqui,
 * com a mesma nova tentativa e o mesmo bloqueio do gelo.
 *
 * Decisões (mantidas):
 * - "ice cream" vira um token só ("icecream") antes da busca: sorvete não é
 *   gelo (para dairy_free/vegan continua sendo laticínio).
 * - "iced coffee", "iced tea", "café gelado", "água gelada": NÃO são gelo —
 *   são bebidas frias; "iced"/"gelado" são tokens diferentes de "ice"/"gelo".
 * - "ice-cold water": NÃO é gelo (exceção "ice cold").
 * - "ice water", "água com gelo", "gelo de café", "coffee ice cubes",
 *   "serve over ice": SÃO gelo — cubos congelados vão para o copo ou para o
 *   jarro, e o brief proíbe sugerir gelo ao Lite.
 * - "sem gelo", "without ice", "no ice needed": negação, não é violação.
 * - "sem fruta congelada", "without frozen fruit": negação (congelado aceita
 *   1 token entre a negação e o termo).
 * - A blendInstruction continua com negação por frase (regra 7).
 */
const LITE_ICE_RULES: RestrictionRules = {
  en: [...terms(LITE_ICE_TERMS.en), ...frozenTerms(LITE_FROZEN_TERMS.en)],
  pt: [...terms(LITE_ICE_TERMS.pt), ...frozenTerms(LITE_FROZEN_TERMS.pt)],
  exceptions: ['ice cold'],
};

// "sem álcool", "non-alcoholic", "virgin": a versão sem álcool não é violação.
const NON_ALCOHOLIC_BEFORE = ['non alcoholic', 'nonalcoholic', 'alcohol free', 'virgin', 'zero alcohol'] as const;
const NON_ALCOHOLIC_AFTER = [
  'sem alcool',
  'zero alcool',
  'nao alcoolico',
  'nao alcoolica',
  'zero',
  '0',
  'alcohol free',
  'non alcoholic',
] as const;

function alcoholTerms(phrases: readonly string[]): RestrictedTerm[] {
  return phrases.map(phrase => ({
    phrase,
    allowedWith: { before: NON_ALCOHOLIC_BEFORE, after: NON_ALCOHOLIC_AFTER },
  }));
}

/**
 * CP-B5 — bebida alcoólica na receita (rede de segurança do backend; o
 * PEDIDO de álcool é detectado pela IA, não por lista). Destilados, vinhos,
 * cervejas e licores comuns em drinks, en e pt-BR. Aroma/extrato/essência
 * de rum é exceção (sabor, sem álcool relevante); "vinagre de vinho"/"wine
 * vinegar" também. Gengibre ("ginger" ≠ "gin") e "vinagre" são outros
 * tokens e não casam. "sake" fica só em pt ("saquê"): em inglês, "for the
 * sake of" daria falso positivo.
 */
const ALCOHOL_RULES: RestrictionRules = {
  en: alcoholTerms([
    'alcohol',
    'alcoholic',
    'rum',
    'vodka',
    'gin',
    'tequila',
    'mezcal',
    'whisky',
    'whiskey',
    'bourbon',
    'scotch',
    'brandy',
    'cognac',
    'cachaca',
    'pisco',
    'soju',
    'liqueur',
    'schnapps',
    'absinthe',
    'amaretto',
    'kahlua',
    'baileys',
    'cointreau',
    'triple sec',
    'curacao',
    'vermouth',
    'aperol',
    'campari',
    'wine',
    'champagne',
    'prosecco',
    'beer',
    'lager',
    'stout',
    'hard cider',
    'hard seltzer',
    'liquor',
  ]),
  pt: alcoholTerms([
    'alcool',
    'alcoolico',
    'alcoolica',
    'cachaca',
    'pinga',
    'aguardente',
    'conhaque',
    'licor',
    'vinho',
    'espumante',
    'champanhe',
    'cerveja',
    'chope',
    'chopp',
    'sidra',
    'saque',
    'vermute',
    'destilado',
    'absinto',
  ]),
  exceptions: [
    'rum extract',
    'rum flavoring',
    'rum flavor',
    'extrato de rum',
    'essencia de rum',
    'aroma de rum',
    'wine vinegar',
    'vinagre de vinho',
    'alcohol free',
    'sem alcool',
    'zero alcool',
    'non alcoholic',
    'nonalcoholic',
  ],
};

const RULES_BY_RESTRICTION: Record<RecipeRestriction, RestrictionRules> = {
  dairy_free: DAIRY_RULES,
  nut_free: NUT_RULES,
  vegan: VEGAN_RULES,
  no_added_sugar: NO_ADDED_SUGAR_RULES,
  lite_no_ice: LITE_ICE_RULES,
  no_alcohol: ALCOHOL_RULES,
  // Mesmos termos: com álcool permitido, serve para saber se a receita tem álcool.
  alcohol_limit: ALCOHOL_RULES,
};

// Ordem fixa: nut_free primeiro (alergia), igual ao prompt.
const RESTRICTION_ORDER: readonly RecipeRestriction[] = [
  'nut_free',
  'vegan',
  'dairy_free',
  'no_added_sugar',
  LITE_NO_ICE_RESTRICTION,
  NO_ALCOHOL_RESTRICTION,
  ALCOHOL_LIMIT_RESTRICTION,
];

/** CP-B5: restrições que o pedido explícito da mensagem atual pode furar (só a dieta). */
const OVERRIDABLE_RESTRICTIONS: ReadonlySet<RecipeRestriction> = new Set<RecipeRestriction>([
  'nut_free',
  'vegan',
  'dairy_free',
  'no_added_sugar',
]);

/** Pós CP-B5: restrições conferidas também no título (dieta e álcool proibido). */
const TITLE_RESTRICTIONS: ReadonlySet<RecipeRestriction> = new Set<RecipeRestriction>([
  ...OVERRIDABLE_RESTRICTIONS,
  NO_ALCOHOL_RESTRICTION,
]);

// ─── Negação (regra 6) ───────────────────────────────────────────────────────

// Frases que, imediatamente antes do termo, o negam.
const NEGATION_PREFIXES: readonly string[] = [
  // pt
  'sem',
  'sem adicao de',
  'sem adicionar',
  'sem usar',
  'livre de',
  'isento de',
  'isenta de',
  'nao',
  'nao use',
  'nao usar',
  'nao adicione',
  'nao adicionar',
  'nao coloque',
  'nao precisa de',
  'nao precisa',
  'dispensa',
  'dispensa o',
  'dispensa a',
  'zero',
  'em vez de',
  'em vez do',
  'em vez da',
  'ao inves de',
  'ao inves do',
  'ao inves da',
  'no lugar de',
  'no lugar do',
  'no lugar da',
  // Frases que explicam a exclusão ("substituímos o gelo por fruta
  // congelada", "o Lite não tritura gelo"). Lista explícita de propósito:
  // uma janela genérica ("não" até N palavras antes) deixaria passar
  // "não esqueça de adicionar gelo".
  'substitui',
  'substituimos',
  'substituindo',
  'substitua',
  'substituir',
  'troque',
  'trocamos',
  'trocando',
  'trocar',
  'evite',
  'evitar',
  'evitamos',
  'evitando',
  'nao inclui',
  'nao inclua',
  'nao leva',
  'nao processa',
  'nao tritura',
  'nao suporta',
  'nao aguenta',
  'nao foi feito para',
  'nao foi projetado para',
  'nao e indicado para',
  'nao recomendamos',
  'nao recomenda',
  // CP-B5: negação típica da mensagem da pessoa ("não quero whey") — o
  // pedido explícito passa pelas mesmas regras e não pode liberar o que ela
  // recusou.
  'nao quero',
  'nao gosto de',
  'nao pode ter',
  'nada de',
  // en
  'without',
  'without adding',
  'without any',
  'no added',
  'free of',
  'do not add',
  'do not use',
  'dont add',
  'dont use',
  'don t add',
  'don t use',
  'never add',
  'no need for',
  'instead of',
  'in place of',
  'rather than',
  'replace',
  'replaced',
  'replacing',
  'swap',
  'swapped',
  'swapping',
  'avoid',
  'avoiding',
  'skip',
  'skipped',
  'omit',
  'omitted',
  'cannot crush',
  'can t crush',
  'cannot handle',
  'can t handle',
  'does not handle',
  'doesn t handle',
  'not designed for',
  'not built for',
  'don t want',
  'dont want',
  'do not want',
  'no more',
];

// Artigos que podem ficar entre a negação e o termo ("sem o gelo",
// "avoid the ice", "substituímos o gelo").
const NEGATION_ARTICLES = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'the', 'any']);

// "no" puro só nega termo em inglês (em pt é contração de "em + o").
const EN_ONLY_NEGATION_PREFIXES: readonly string[] = ['no'];

// Frases que, imediatamente depois do termo, o negam ("nut-free",
// "sugar free", "ice is not needed", "gelo não é necessário").
const NEGATION_SUFFIXES: readonly string[] = [
  'free',
  'not needed',
  'is not needed',
  'isn t needed',
  'not required',
  'is not required',
  'nao e necessario',
  'nao e necessaria',
  'nao e preciso',
];

// Conectores entre termo e qualificador ("leite DE aveia", "cream OF coconut").
const QUALIFIER_CONNECTORS = new Set(['de', 'do', 'da', 'of']);

// Compostos juntados num token só antes da busca.
const COMPOUND_TOKENS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['ice', 'cream'], 'icecream'],
  [['dairy', 'free'], 'dairyfree'],
  [['non', 'dairy'], 'nondairy'],
  [['plant', 'based'], 'plantbased'],
];

// ─── Normalização e tokenização ──────────────────────────────────────────────

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Corta o texto em segmentos e cada segmento em tokens normalizados. */
export function tokenizeSegments(text: string): string[][] {
  return stripAccents(text)
    .toLowerCase()
    .split(/[.,;:!?\n\r•|]+/)
    .map(segment => mergeCompounds(
      segment
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
    ))
    .filter(tokens => tokens.length > 0);
}

function mergeCompounds(tokens: string[]): string[] {
  const merged: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const compound = COMPOUND_TOKENS.find(([parts]) => (
      parts.every((part, offset) => tokens[i + offset] === part)
    ));

    if (compound) {
      merged.push(compound[1]);
      i += compound[0].length - 1;
    } else {
      merged.push(tokens[i]);
    }
  }

  return merged;
}

/** Candidatos de singular de um token (en e pt). Inclui o próprio token. */
function singularCandidates(token: string): string[] {
  const candidates = [token];

  if (token.length < 4) {
    return candidates;
  }

  const replaceSuffix = (suffix: string, replacement: string) => {
    if (token.endsWith(suffix)) {
      candidates.push(token.slice(0, -suffix.length) + replacement);
    }
  };

  replaceSuffix('s', '');
  replaceSuffix('es', '');
  replaceSuffix('ies', 'y');
  replaceSuffix('oes', 'ao');
  replaceSuffix('aes', 'ao');
  replaceSuffix('ais', 'al');
  replaceSuffix('eis', 'el');
  replaceSuffix('ois', 'ol');
  replaceSuffix('ns', 'm');

  return candidates;
}

function tokenMatches(textToken: string, termToken: string): boolean {
  return textToken === termToken || singularCandidates(textToken).includes(termToken);
}

function phraseTokens(phrase: string): string[] {
  return tokenizeSegments(phrase)[0] ?? [];
}

function matchesAt(tokens: readonly string[], start: number, phrase: readonly string[]): boolean {
  if (start < 0 || start + phrase.length > tokens.length) {
    return false;
  }

  return phrase.every((termToken, offset) => tokenMatches(tokens[start + offset], termToken));
}

function endsWithPhrase(tokens: readonly string[], end: number, phrase: readonly string[]): boolean {
  return matchesAt(tokens, end - phrase.length, phrase);
}

/**
 * CP-B3: tokens de uma frase com a MESMA normalização do validador (sem
 * acento, minúsculas, compostos). Usado pela tabela de pesos típicos
 * (ingredientWeights.utils.ts) para não ter uma segunda lógica de texto.
 */
export function compilePhrase(phrase: string): string[] {
  return phraseTokens(phrase);
}

export interface PhraseOccurrence {
  tokens: readonly string[];
  start: number;
  /** Índice logo depois do último token da frase. */
  end: number;
}

/**
 * CP-B3: onde a frase (já compilada) aparece nos segmentos de
 * tokenizeSegments, com o casamento de singular/plural do validador
 * ("morangos" casa com "morango", "berries" com "berry").
 */
export function findPhraseOccurrences(
  segments: readonly (readonly string[])[],
  phrase: readonly string[]
): PhraseOccurrence[] {
  if (phrase.length === 0) return [];
  const occurrences: PhraseOccurrence[] = [];
  for (const tokens of segments) {
    for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
      if (matchesAt(tokens, start, phrase)) {
        occurrences.push({ tokens, start, end: start + phrase.length });
      }
    }
  }
  return occurrences;
}

// ─── Regras compiladas ───────────────────────────────────────────────────────

interface CompiledTerm {
  negationLookback: number;
  canonical: string;
  tokens: string[];
  isEnglish: boolean;
  neutralizedBy?: readonly string[];
  qualifierLookback: number;
  allowedBefore: string[][];
  allowedAfter: string[][];
}

interface CompiledRules {
  terms: CompiledTerm[];
  exceptions: string[][];
}

function compileRules(rules: RestrictionRules): CompiledRules {
  const compile = (term: RestrictedTerm, isEnglish: boolean): CompiledTerm => ({
    canonical: term.phrase,
    tokens: phraseTokens(term.phrase),
    isEnglish,
    ...(term.neutralizedBy ? { neutralizedBy: term.neutralizedBy } : {}),
    qualifierLookback: term.qualifierLookback ?? 1,
    negationLookback: term.negationLookback ?? 0,
    allowedBefore: (term.allowedWith?.before ?? []).map(phraseTokens),
    allowedAfter: (term.allowedWith?.after ?? []).map(phraseTokens),
  });

  return {
    // Frases mais longas primeiro: "leite em po" reporta antes de "leite".
    terms: [
      ...rules.en.map(term => compile(term, true)),
      ...rules.pt.map(term => compile(term, false)),
    ].sort((a, b) => b.tokens.length - a.tokens.length),
    exceptions: rules.exceptions.map(phraseTokens),
  };
}

const COMPILED_RULES: Record<RecipeRestriction, CompiledRules> = {
  dairy_free: compileRules(RULES_BY_RESTRICTION.dairy_free),
  nut_free: compileRules(RULES_BY_RESTRICTION.nut_free),
  vegan: compileRules(RULES_BY_RESTRICTION.vegan),
  no_added_sugar: compileRules(RULES_BY_RESTRICTION.no_added_sugar),
  lite_no_ice: compileRules(RULES_BY_RESTRICTION.lite_no_ice),
  no_alcohol: compileRules(RULES_BY_RESTRICTION.no_alcohol),
  alcohol_limit: compileRules(RULES_BY_RESTRICTION.alcohol_limit),
};

const COMPILED_NEGATION_PREFIXES = NEGATION_PREFIXES.map(phraseTokens);
const COMPILED_EN_ONLY_NEGATION_PREFIXES = EN_ONLY_NEGATION_PREFIXES.map(phraseTokens);
const COMPILED_NEGATION_SUFFIXES = NEGATION_SUFFIXES.map(phraseTokens);

// ─── Casamento ───────────────────────────────────────────────────────────────

function maskExceptions(tokens: readonly string[], exceptions: readonly string[][]): boolean[] {
  const masked = tokens.map(() => false);

  for (const exception of exceptions) {
    for (let start = 0; start < tokens.length; start += 1) {
      if (matchesAt(tokens, start, exception)) {
        for (let offset = 0; offset < exception.length; offset += 1) {
          masked[start + offset] = true;
        }
      }
    }
  }

  return masked;
}

function isNegated(tokens: readonly string[], start: number, end: number, term: CompiledTerm): boolean {
  const prefixes = term.isEnglish
    ? [...COMPILED_NEGATION_PREFIXES, ...COMPILED_EN_ONLY_NEGATION_PREFIXES]
    : COMPILED_NEGATION_PREFIXES;

  // Onde a negação pode terminar: colada ao termo ou, com negationLookback,
  // até N tokens antes (sem atravessar conjunção). Um artigo entre a
  // negação e o termo/nome é aceito ("sem o gelo", "sem a fruta congelada").
  const prefixEnds: number[] = [];
  for (let gap = 0; gap <= term.negationLookback; gap += 1) {
    const end = start - gap;
    if (gap > 0 && QUALIFIER_STOP_TOKENS.has(tokens[end] ?? '')) break;
    prefixEnds.push(end);
    if (NEGATION_ARTICLES.has(tokens[end - 1] ?? '')) prefixEnds.push(end - 1);
  }

  if (prefixEnds.some(prefixEnd => prefixes.some(prefix => endsWithPhrase(tokens, prefixEnd, prefix)))) {
    return true;
  }

  return COMPILED_NEGATION_SUFFIXES.some(suffix => matchesAt(tokens, end, suffix));
}

function isQualifier(token: string | undefined, qualifiers: readonly string[]): boolean {
  return token !== undefined && qualifiers.some(qualifier => tokenMatches(token, qualifier));
}

// Conjunções que encerram a busca do qualificador para trás.
const QUALIFIER_STOP_TOKENS = new Set(['and', 'or', 'with', 'plus', 'e', 'ou', 'com', 'mais']);

/** "nut-free granola", "granola sem castanhas". */
function isAllowedByAdjacentPhrase(
  tokens: readonly string[],
  start: number,
  end: number,
  term: CompiledTerm
): boolean {
  return (
    term.allowedBefore.some(phrase => endsWithPhrase(tokens, start, phrase)) ||
    term.allowedAfter.some(phrase => matchesAt(tokens, end, phrase))
  );
}

function isNeutralized(tokens: readonly string[], start: number, end: number, term: CompiledTerm): boolean {
  if (isAllowedByAdjacentPhrase(tokens, start, end, term)) {
    return true;
  }

  const qualifiers = term.neutralizedBy;

  if (!qualifiers) {
    return false;
  }

  // "oat milk", "unsweetened almond milk", "coconut cream"; com lookback
  // maior, "pea vanilla protein powder" (para na conjunção: "soy milk and
  // protein powder" não libera a proteína).
  for (let offset = 1; offset <= term.qualifierLookback; offset += 1) {
    const token = tokens[start - offset];
    if (token === undefined || QUALIFIER_STOP_TOKENS.has(token)) break;
    if (isQualifier(token, qualifiers)) return true;
  }

  // "leite vegetal", "iogurte vegano"
  if (isQualifier(tokens[end], qualifiers)) {
    return true;
  }

  // "leite de aveia", "manteiga de cacau", "cream of coconut"
  return (
    tokens[end] !== undefined &&
    QUALIFIER_CONNECTORS.has(tokens[end]) &&
    isQualifier(tokens[end + 1], qualifiers)
  );
}

/** Primeiro termo proibido encontrado no texto, ou null. */
// Regra 7: palavras de negação que valem para a frase inteira (só na
// blendInstruction). Sem o "no" puro — em pt é contração ("no copo").
// "t" é o que sobra de "don't", "can't", "shouldn't" após a normalização.
const SENTENCE_NEGATION_CUES = new Set([
  'nao', 'sem', 'nunca', 'jamais', 'evite', 'evitar', 'evitando',
  'substituimos', 'substitui', 'substituindo', 'vez', 'lugar', 'inves',
  'not', 'never', 'without', 'avoid', 'avoiding', 'instead', 'cannot', 't',
  'replace', 'replaced', 'replacing', 'swap', 'swapped',
]);

function hasSentenceNegationBefore(tokens: readonly string[], start: number): boolean {
  return tokens.slice(0, start).some(token => SENTENCE_NEGATION_CUES.has(token));
}

interface ViolatingOccurrence {
  canonical: string;
  segment: readonly string[];
  start: number;
  end: number;
}

/** Todas as ocorrências proibidas do texto, na ordem de busca (termos mais longos primeiro). */
function findViolatingOccurrences(
  text: string,
  rules: CompiledRules,
  { sentenceNegation }: { sentenceNegation: boolean }
): ViolatingOccurrence[] {
  const occurrences: ViolatingOccurrence[] = [];

  for (const tokens of tokenizeSegments(text)) {
    const masked = maskExceptions(tokens, rules.exceptions);

    for (const term of rules.terms) {
      for (let start = 0; start + term.tokens.length <= tokens.length; start += 1) {
        const end = start + term.tokens.length;

        if (!matchesAt(tokens, start, term.tokens)) continue;
        if (masked.slice(start, end).some(Boolean)) continue;
        if (isNegated(tokens, start, end, term)) continue;
        if (sentenceNegation && hasSentenceNegationBefore(tokens, start)) continue;
        if (isNeutralized(tokens, start, end, term)) continue;

        occurrences.push({ canonical: term.canonical, segment: tokens, start, end });
      }
    }
  }

  return occurrences;
}

/** Primeiro termo proibido encontrado no texto, ou null. */
function findViolatingTerm(
  text: string,
  rules: CompiledRules,
  options: { sentenceNegation: boolean }
): string | null {
  return findViolatingOccurrences(text, rules, options)[0]?.canonical ?? null;
}

// ─── Pedido explícito (CP-B5) ────────────────────────────────────────────────

/** Até quantos tokens de distância uma ocorrência "encosta" num termo pedido. */
const EXPLICIT_REQUEST_ADJACENCY_GAP = 1;

/**
 * Termos proibidos de cada restrição de dieta que a mensagem atual pede
 * explicitamente (mesma normalização e negação do validador).
 */
function explicitlyRequestedTerms(
  explicitRequest: string | undefined,
  restriction: RecipeRestriction
): ReadonlySet<string> {
  if (!explicitRequest?.trim() || !OVERRIDABLE_RESTRICTIONS.has(restriction)) {
    return new Set();
  }

  return new Set(
    findViolatingOccurrences(explicitRequest, COMPILED_RULES[restriction], { sentenceNegation: false })
      .map(occurrence => occurrence.canonical)
  );
}

/**
 * A ocorrência é o ingrediente pedido: é um termo pedido, ou encosta (até
 * 1 token, sem atravessar conjunção) num termo pedido do mesmo trecho.
 */
function isCoveredByRequest(
  occurrence: ViolatingOccurrence,
  requested: readonly ViolatingOccurrence[]
): boolean {
  return requested.some(other => {
    if (other.segment !== occurrence.segment) return false;
    if (other.start < occurrence.end && occurrence.start < other.end) return true;

    const [left, right] = other.start < occurrence.start ? [other, occurrence] : [occurrence, other];
    const between = occurrence.segment.slice(left.end, right.start);

    return (
      between.length <= EXPLICIT_REQUEST_ADJACENCY_GAP &&
      !between.some(token => QUALIFIER_STOP_TOKENS.has(token))
    );
  });
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Restrições que valem para este usuário, em ordem fixa (nut_free primeiro). */
export function getActiveRecipeRestrictions(
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: BlendiModel,
  alcohol?: RecipeAlcoholPolicy
): RecipeRestriction[] {
  const active = new Set<RecipeRestriction>(dietaryPreferences);

  if (blendiModel === 'Lite') {
    active.add(LITE_NO_ICE_RESTRICTION);
  }

  if (alcohol === 'forbidden') {
    active.add(NO_ALCOHOL_RESTRICTION);
  } else if (alcohol === 'allowed') {
    active.add(ALCOHOL_LIMIT_RESTRICTION);
  }

  return RESTRICTION_ORDER.filter(restriction => active.has(restriction));
}

function positiveAlcoholGrams(recipe: RestrictedRecipe): number {
  const grams = recipe.alcoholGrams;
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0 ? grams : 0;
}

/**
 * Função pura: confere ingredientes, passos e blendInstruction contra a dieta
 * e o modelo do BLENDi; a tip só para o álcool (CP-B5); o title só para a
 * dieta e o álcool proibido (pós CP-B5).
 * Usuário sem dieta, fora do Lite e sem política de álcool: sempre conforme,
 * sem nenhuma busca.
 *
 * CP-B5: `options.explicitRequest` (texto da mensagem atual) libera, só nas
 * restrições de dieta, os ingredientes pedidos nela; `options.alcohol` liga
 * a checagem de álcool (Pulse AI).
 */
export function validateRecipeRestrictions(
  recipe: RestrictedRecipe,
  dietaryPreferences: readonly DietaryPreference[],
  blendiModel: BlendiModel,
  options: RecipeRestrictionOptions = {}
): RecipeRestrictionResult {
  const restrictions = getActiveRecipeRestrictions(dietaryPreferences, blendiModel, options.alcohol);

  if (restrictions.length === 0) {
    return { compliant: true };
  }

  const fields: Array<{ field: RecipeRestrictionField; index?: number; text: string }> = [
    ...recipe.ingredients.map((ingredient, index) => ({
      field: 'ingredient' as const,
      index,
      text: ingredient.name,
    })),
    ...(recipe.steps ?? []).map((step, index) => ({
      field: 'step' as const,
      index,
      text: step.text,
    })),
    { field: 'blendInstruction', text: recipe.blendInstruction },
  ];

  const violations: RecipeRestrictionViolation[] = [];
  const overriddenIngredients = new Set<number>();

  for (const restriction of restrictions) {
    const rules = COMPILED_RULES[restriction];

    if (restriction === ALCOHOL_LIMIT_RESTRICTION) {
      violations.push(...findAlcoholLimitViolations(recipe, fields, rules));
      continue;
    }

    const requestedTerms = explicitlyRequestedTerms(options.explicitRequest, restriction);
    const restrictionFields = restriction === NO_ALCOHOL_RESTRICTION && recipe.tip?.trim()
      ? [...fields, { field: 'tip' as const, text: recipe.tip }]
      : fields;

    // Termos fora da dieta que entraram de fato num ingrediente pelo pedido.
    const overriddenTerms = new Set<string>();

    for (const { field, index, text } of restrictionFields) {
      const occurrences = findViolatingOccurrences(text, rules, {
        sentenceNegation: field === 'blendInstruction' || field === 'tip',
      });
      const requested = occurrences.filter(occurrence => requestedTerms.has(occurrence.canonical));
      const blocking = occurrences.find(occurrence => !isCoveredByRequest(occurrence, requested));

      if (blocking) {
        violations.push({
          restriction,
          term: blocking.canonical,
          field,
          ...(index !== undefined ? { index } : {}),
        });
      } else if (occurrences.length > 0 && field === 'ingredient' && index !== undefined) {
        overriddenIngredients.add(index);
        for (const occurrence of requested) overriddenTerms.add(occurrence.canonical);
      }
    }

    // Título: o termo fora da dieta só passa se foi pedido E está na receita.
    if (TITLE_RESTRICTIONS.has(restriction) && recipe.title?.trim()) {
      const occurrences = findViolatingOccurrences(recipe.title, rules, { sentenceNegation: false });
      const requested = occurrences.filter(occurrence => (
        requestedTerms.has(occurrence.canonical) && overriddenTerms.has(occurrence.canonical)
      ));
      const blocking = occurrences.find(occurrence => !isCoveredByRequest(occurrence, requested));

      if (blocking) {
        violations.push({ restriction, term: blocking.canonical, field: 'title' });
      }
    }

    // Álcool: o número declarado também conta, mesmo sem nome alcoólico.
    if (restriction === NO_ALCOHOL_RESTRICTION && positiveAlcoholGrams(recipe) > 0) {
      violations.push({ restriction, term: 'alcoholGrams', field: 'alcoholGrams' });
    }
  }

  if (violations.length > 0) {
    return { compliant: false, violations };
  }

  return overriddenIngredients.size > 0
    ? { compliant: true, dietOverrideIngredientIndexes: [...overriddenIngredients].sort((a, b) => a - b) }
    : { compliant: true };
}

/**
 * 21+ que pediu: a receita com álcool precisa declarar alcoholGrams (entra
 * nas calorias) e ficar no teto de uma dose normal de drink.
 */
function findAlcoholLimitViolations(
  recipe: RestrictedRecipe,
  fields: ReadonlyArray<{ field: RecipeRestrictionField; index?: number; text: string }>,
  rules: CompiledRules
): RecipeRestrictionViolation[] {
  const grams = positiveAlcoholGrams(recipe);

  if (grams > RECIPE_MAX_ALCOHOL_GRAMS) {
    return [{ restriction: ALCOHOL_LIMIT_RESTRICTION, term: 'alcoholGrams', field: 'alcoholGrams' }];
  }

  const alcoholicIngredient = fields.find(({ field, text }) => (
    field === 'ingredient' && findViolatingTerm(text, rules, { sentenceNegation: false }) !== null
  ));

  if (alcoholicIngredient && grams === 0) {
    return [{
      restriction: ALCOHOL_LIMIT_RESTRICTION,
      term: 'alcoholGrams',
      field: 'alcoholGrams',
    }];
  }

  return [];
}

/** CP-B5: o texto cita bebida alcoólica (mesmas regras da checagem de álcool). */
export function mentionsAlcohol(text: string): boolean {
  return findViolatingTerm(text, COMPILED_RULES.no_alcohol, { sentenceNegation: false }) !== null;
}

/**
 * CP-B2: o texto cita gelo ou ingrediente congelado (mesmas regras do Lite:
 * negação, "ice cream", "iced coffee"...). Usado pela checagem objetiva dos
 * passos (recipeSteps.utils.ts) para saber se a receita tem o que pede
 * pulseCount.
 */
export function mentionsIceOrFrozen(text: string): boolean {
  return findViolatingTerm(text, COMPILED_RULES.lite_no_ice, { sentenceNegation: false }) !== null;
}

/** CP-B2: o termo canônico de uma violação lite_no_ice é de gelo (não de congelado). */
export function isIceTerm(term: string): boolean {
  return (LITE_ICE_TERMS.en as readonly string[]).includes(term) || (LITE_ICE_TERMS.pt as readonly string[]).includes(term);
}

/** Versão para log: só restrição, termo e campo — sem texto da receita nem usuário. */
export function summarizeRestrictionViolations(
  violations: readonly RecipeRestrictionViolation[]
): Array<Pick<RecipeRestrictionViolation, 'restriction' | 'term' | 'field'>> {
  return violations.map(({ restriction, term, field }) => ({ restriction, term, field }));
}

const RESTRICTION_LABELS: Record<RecipeRestriction, string> = {
  nut_free: 'nut-free',
  vegan: 'vegan',
  dairy_free: 'dairy-free',
  no_added_sugar: 'no added sugar',
  lite_no_ice: 'no ice and no frozen ingredients (the BLENDi Lite cannot blend ice or anything frozen)',
  no_alcohol: 'no alcohol (make the alcohol-free version of the drink, keep the same flavor, set alcoholGrams to 0 and never mention alcohol in the tip)',
  alcohol_limit: `alcohol only at a regular single-drink amount, at most ${RECIPE_MAX_ALCOHOL_GRAMS} g of pure alcohol, with the grams of pure alcohol filled in the alcoholGrams field and counted at 7 kcal per gram in the calories`,
};

// CP-B3: conta sem BLENDi (mesmas regras do Lite, texto sem marca nem modelo).
const GENERIC_BLENDER_RESTRICTION_LABELS: Partial<Record<RecipeRestriction, string>> = {
  lite_no_ice: 'no ice and no frozen ingredients (this blender cannot blend ice or anything frozen)',
};

function describeViolationLocation(
  recipe: RestrictedRecipe,
  violation: RecipeRestrictionViolation
): string {
  if (violation.field === 'ingredient' && violation.index !== undefined) {
    const name = recipe.ingredients[violation.index]?.name ?? '';
    return `the ingredient "${name}"`;
  }

  if (violation.field === 'step' && violation.index !== undefined) {
    return `step ${violation.index + 1}`;
  }

  if (violation.field === 'tip') {
    return 'the tip';
  }

  if (violation.field === 'title') {
    return 'the title';
  }

  if (violation.field === 'alcoholGrams') {
    return 'the alcoholGrams field';
  }

  return 'the blend instruction';
}

/**
 * Mensagem de retry no mesmo estilo de buildProteinGuardrailRetryMessage:
 * diz o que violou qual restrição e pede uma substituição compatível.
 * Pede um único objeto JSON — o Pantry também refaz uma receita por vez.
 */
export function buildRecipeRestrictionRetryMessage(
  recipe: RestrictedRecipe,
  violations: readonly RecipeRestrictionViolation[],
  options: { genericBlender?: boolean } = {}
): string {
  const labelOf = (restriction: RecipeRestriction) => (
    (options.genericBlender ? GENERIC_BLENDER_RESTRICTION_LABELS[restriction] : undefined)
      ?? RESTRICTION_LABELS[restriction]
  );
  const details = violations.map(violation => (
    `${describeViolationLocation(recipe, violation)} uses "${violation.term}", which violates the ${labelOf(violation.restriction)} restriction`
  ));

  const hints = [...new Set(violations.flatMap(violation => {
    const hint = RETRY_HINTS_BY_TERM[violation.term];
    return hint ? [hint] : [];
  }))];

  // Pós CP-B5: o título também é conferido; a mensagem diz o que trocar.
  if (violations.some(violation => violation.field === 'title')) {
    hints.push(
      violations.some(violation => violation.field === 'title' && violation.restriction === NO_ALCOHOL_RESTRICTION)
        ? `${TITLE_RETRY_HINT} ${TITLE_ALCOHOL_RETRY_HINT}`
        : TITLE_RETRY_HINT
    );
  }

  return [
    `Your previous response violated the user's mandatory restrictions: ${details.join('; ')}.`,
    ...hints,
    'Replace every violating ingredient with a compatible substitute and remove those items from the steps and the blend instruction. Keep every restriction active.',
    'Then return only the corrected recipe as a single JSON object, in the same format and language, with recalculated macros.',
  ].join(' ');
}

const TITLE_RETRY_HINT =
  'Rename the title so it names only ingredients that are in this recipe, never an ingredient from earlier messages or from the recent blends.';

const TITLE_ALCOHOL_RETRY_HINT =
  'In this alcohol-free recipe the title may keep the drink name (for example caipirinha or piña colada) but never names a spirit, wine, beer or liqueur.';

const VEGAN_PROTEIN_HINT =
  'For the vegan restriction, a protein powder must name its plant source in the ingredient name (for example "pea protein powder", "soy protein isolate" or "proteína vegetal de ervilha em pó"); a protein powder without a declared plant source may be whey or casein and is not allowed.';

const NUT_FREE_GRANOLA_HINT =
  'For the nut-free restriction, regular granola usually contains nuts: either remove it or name it explicitly as nut-free granola (for example "nut-free granola" or "granola sem castanhas").';

// Termos canônicos (ver VEGAN_RULES e NUT_RULES) que pedem uma orientação
// extra no retry, além de "troque o ingrediente".
const RETRY_HINTS_BY_TERM: Record<string, string> = {
  'protein powder': VEGAN_PROTEIN_HINT,
  'protein isolate': VEGAN_PROTEIN_HINT,
  'proteina em po': VEGAN_PROTEIN_HINT,
  'po de proteina': VEGAN_PROTEIN_HINT,
  'proteina isolada': VEGAN_PROTEIN_HINT,
  granola: NUT_FREE_GRANOLA_HINT,
};
