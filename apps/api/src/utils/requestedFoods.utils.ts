// apps/api/src/utils/requestedFoods.utils.ts
// CP-B7 — alimentos pedidos explicitamente na mensagem atual (Pulse AI) ou no
// "Algum pedido?" (Pantry Scanner), e a conferência deles na receita.
//
// Por quê: até o CP-B7 o ingrediente pedido na mensagem era obrigatório só
// pelo prompt (seção "Explicit request", CP-B5). Nos testes a IA obedeceu,
// mas não havia garantia. Agora o backend confere e, se faltar, pede de novo
// (até REQUESTED_ITEM_MAX_RETRIES) e, se ainda faltar, avisa no card
// (missingRequestedIngredients) — nunca bloqueia.
//
// Vocabulário: montado a partir das tabelas que já existem — pesos típicos e
// por unidade (ingredientWeights.utils.ts), ingredientes que definem drinks
// (alcoholRequest.utils.ts), listas do validador de dieta e de álcool
// (recipeRestrictions.utils.ts) — mais uma lista curta de itens comuns de
// shake que não estão em nenhuma delas (canela, açaí, maracujá...).
//
// Nenhuma lógica de texto nova: a extração e a conferência usam
// compileTermList/findTermOccurrences do validador (acentos, minúsculas,
// singular/plural, compostos, exceções e negação: "sem banana" não conta).
//
// Não conta como pedido:
// - alimento negado ("sem banana", "no banana", "em vez de leite");
// - categoria genérica ("alguma fruta", "verduras", "castanhas", "folhas
//   verdes"): nenhuma dessas palavras está no vocabulário. Exceção decidida
//   no CP-B7: "frutas vermelhas"/"berries" pede uma fruta vermelha
//   qualquer (morango, mirtilo, framboesa, amora, cereja ou cranberry
//   atendem);
// - "proteína"/"protein" sozinho (é nutriente: "30 g de proteína"); "whey",
//   "proteína em pó" e afins contam;
// - item de mensagens anteriores ou do histórico (só o texto passado aqui).
//
// Sabor pedido conta como o ingrediente que dá o sabor (mapa pequeno de
// sinônimos): baunilha → extrato ou proteína sabor baunilha; chocolate →
// cacau ou chocolate; café → café ou espresso.

import { DRINK_DEFINING_INGREDIENTS } from './alcoholRequest.utils';
import { TYPICAL_INGREDIENT_WEIGHTS, UNIT_INGREDIENT_WEIGHTS } from './ingredientWeights.utils';
import {
  compileTermList,
  findAlcoholOccurrences,
  findTermMentions,
  findTermOccurrences,
  type CompiledTermList,
  type TermOccurrence,
} from './recipeRestrictions.utils';
import type { BlendiModel } from '../models/User';

/**
 * Novas tentativas quando falta um item pedido (Pulse AI: alimento da
 * mensagem; Pantry: item adicionado à mão ou alimento do pedido). Constante
 * única dos dois recursos.
 */
export const REQUESTED_ITEM_MAX_RETRIES = 2;

export type RequestedFoodKind = 'food' | 'ice' | 'alcohol';

export interface RequestedFood {
  /** Grupo do vocabulário (dedupe e conferência). */
  id: string;
  /** O termo como a pessoa escreveu, com acento quando conhecido ("morango", "limão"). */
  display: string;
  kind: RequestedFoodKind;
}

interface FoodGroup {
  id: string;
  kind: RequestedFoodKind;
  /** Termos que, citados no pedido, contam como pedir este grupo. */
  request: readonly string[];
  /** Termos que, no nome de um ingrediente da receita, atendem ao pedido (além de `request`). */
  satisfiedBy?: readonly string[];
  /** Frases que, no nome do ingrediente, NÃO atendem ao grupo ("Castanha de caju" não é a fruta caju). */
  notSatisfiedBy?: readonly string[];
}

// ─── Vocabulário (a partir das tabelas existentes) ───────────────────────────

const weightNames = (id: string): readonly string[] =>
  TYPICAL_INGREDIENT_WEIGHTS.find(entry => entry.id === id)?.names ?? [];
const unitNames = (id: string): readonly string[] =>
  UNIT_INGREDIENT_WEIGHTS.find(entry => entry.id === id)?.names ?? [];
const drinkNames = (id: keyof typeof DRINK_DEFINING_INGREDIENTS): readonly string[] => [
  ...DRINK_DEFINING_INGREDIENTS[id].en,
  ...DRINK_DEFINING_INGREDIENTS[id].pt,
];

function unique(...lists: ReadonlyArray<readonly string[]>): string[] {
  return [...new Set(lists.flat())];
}

const RED_FRUIT_NAMES = unique(
  weightNames('strawberry'),
  weightNames('blueberry'),
  weightNames('raspberry'),
  weightNames('blackberry'),
  weightNames('cherry'),
  drinkNames('cranberry'),
);

/** Proteína em pó: o nome na receita costuma ser "Whey", "Proteína vegetal", "Protein powder". */
const PROTEIN_POWDER_SATISFIED_BY = unique(unitNames('protein_powder'), ['protein', 'proteina']);

// Em inglês "date" também é encontro/data ("shake for date night"): só
// "tâmara"/"medjool" contam como pedido; na receita, "dates" atende.
const DATE_REQUEST_NAMES = unitNames('date').filter(name => name !== 'date');

/**
 * CP-B8a — alimentos comuns no Brasil e nos EUA que não estavam em nenhuma
 * tabela (en e pt-BR, no singular, sem acento: a normalização do validador
 * cuida de plural e acento). Itens que já existiam (pêssego, toranja,
 * melancia, uva, kiwi, mamão, cenoura, couve, rúcula, alface, aipo,
 * granola, linhaça, castanhas, amêndoa, nozes, avelã, macadâmia, kefir,
 * ricota, leite de coco, tâmara, matcha, gengibre, hortelã...) não são
 * repetidos. Deixados fora por risco de falso amigo: "salsa" (molho/dança —
 * vale "salsinha"), "cará" ("cara, faz um shake"), "panela" (rapadura em
 * espanhol, panela em pt), "cravo" sozinho (flor), "batata" sozinha,
 * "cebola", "pimenta" genérica, "corn" sozinho, "jelly" (gelatina em en-US)
 * e marcas (Nescau, Ovomaltine, Ninho).
 */
const EXTRA_FOOD_GROUPS: readonly FoodGroup[] = [
  // Frutas
  { id: 'jabuticaba', kind: 'food', request: ['jabuticaba'] },
  { id: 'cashew_fruit', kind: 'food', request: ['caju', 'cashew apple', 'cashew fruit'], notSatisfiedBy: ['castanha de caju'] },
  { id: 'acerola', kind: 'food', request: ['acerola', 'barbados cherry'] },
  { id: 'cupuacu', kind: 'food', request: ['cupuacu'] },
  { id: 'dragon_fruit', kind: 'food', request: ['pitaya', 'pitahaya', 'dragon fruit'] },
  { id: 'star_fruit', kind: 'food', request: ['carambola', 'star fruit', 'starfruit'] },
  { id: 'fig', kind: 'food', request: ['fig', 'figo'] },
  { id: 'persimmon', kind: 'food', request: ['persimmon', 'caqui'] },
  { id: 'lychee', kind: 'food', request: ['lychee', 'litchi', 'lichia'] },
  { id: 'soursop', kind: 'food', request: ['soursop', 'graviola'] },
  { id: 'plum', kind: 'food', request: ['plum', 'prune', 'ameixa', 'ameixa seca'] },
  { id: 'nectarine', kind: 'food', request: ['nectarine', 'nectarina'] },
  { id: 'apricot', kind: 'food', request: ['apricot', 'damasco'] },
  { id: 'pomegranate', kind: 'food', request: ['pomegranate', 'roma'] },
  { id: 'tangerine', kind: 'food', request: ['tangerine', 'mandarin', 'clementine', 'tangerina', 'mexerica', 'bergamota', 'ponkan'] },
  { id: 'jackfruit', kind: 'food', request: ['jackfruit', 'jaca'] },
  { id: 'currant', kind: 'food', request: ['currant', 'gooseberry', 'groselha', 'cassis'] },
  { id: 'raisin', kind: 'food', request: ['raisin', 'uva passa'] },
  { id: 'goji', kind: 'food', request: ['goji', 'goji berry'] },
  { id: 'physalis', kind: 'food', request: ['physalis', 'golden berry', 'goldenberry'] },
  { id: 'tamarind', kind: 'food', request: ['tamarind', 'tamarindo'] },
  { id: 'pitanga', kind: 'food', request: ['pitanga', 'surinam cherry'] },
  { id: 'umbu', kind: 'food', request: ['umbu'] },
  { id: 'loquat', kind: 'food', request: ['loquat', 'nespera'] },
  { id: 'quince', kind: 'food', request: ['quince', 'marmelo'] },
  { id: 'rhubarb', kind: 'food', request: ['rhubarb', 'ruibarbo'] },
  { id: 'plantain', kind: 'food', request: ['plantain', 'banana da terra'] },
  // Verduras, legumes, ervas e chás
  { id: 'zucchini', kind: 'food', request: ['zucchini', 'courgette', 'abobrinha'] },
  { id: 'sweet_potato', kind: 'food', request: ['sweet potato', 'batata doce'] },
  { id: 'arracacha', kind: 'food', request: ['arracacha', 'mandioquinha', 'batata baroa'] },
  { id: 'yam', kind: 'food', request: ['yam', 'inhame'] },
  { id: 'broccoli', kind: 'food', request: ['broccoli', 'brocolis'] },
  { id: 'cauliflower', kind: 'food', request: ['cauliflower', 'couve flor'] },
  { id: 'watercress', kind: 'food', request: ['watercress', 'agriao'] },
  { id: 'cabbage', kind: 'food', request: ['cabbage', 'repolho'] },
  { id: 'chard', kind: 'food', request: ['chard', 'swiss chard', 'acelga'] },
  { id: 'chayote', kind: 'food', request: ['chayote', 'chuchu'] },
  { id: 'parsley', kind: 'food', request: ['parsley', 'salsinha'] },
  { id: 'cilantro', kind: 'food', request: ['cilantro', 'coriander', 'coentro'] },
  { id: 'basil', kind: 'food', request: ['basil', 'manjericao'] },
  { id: 'fennel', kind: 'food', request: ['fennel', 'erva doce'] },
  { id: 'garlic', kind: 'food', request: ['garlic', 'alho'] },
  { id: 'cayenne', kind: 'food', request: ['cayenne', 'pimenta caiena'] },
  { id: 'green_tea', kind: 'food', request: ['green tea', 'cha verde'] },
  { id: 'hibiscus', kind: 'food', request: ['hibiscus', 'hibisco'] },
  { id: 'yerba_mate', kind: 'food', request: ['yerba mate', 'erva mate', 'cha mate'] },
  { id: 'guarana', kind: 'food', request: ['guarana'] },
  { id: 'kombucha', kind: 'food', request: ['kombucha'] },
  // Grãos, farinhas e fibras
  { id: 'quinoa', kind: 'food', request: ['quinoa'] },
  { id: 'oat_bran', kind: 'food', request: ['oat bran', 'farelo de aveia'] },
  { id: 'amaranth', kind: 'food', request: ['amaranth', 'amaranto'] },
  { id: 'tapioca', kind: 'food', request: ['tapioca'] },
  { id: 'psyllium', kind: 'food', request: ['psyllium'] },
  { id: 'corn_flakes', kind: 'food', request: ['corn flakes', 'cornflakes', 'flocos de milho', 'sucrilhos'] },
  { id: 'muesli', kind: 'food', request: ['muesli', 'musli'] },
  { id: 'wheat_germ', kind: 'food', request: ['wheat germ', 'germen de trigo'] },
  // Oleaginosas e sementes
  { id: 'pumpkin_seed', kind: 'food', request: ['pumpkin seed', 'pepita', 'semente de abobora'] },
  { id: 'sesame', kind: 'food', request: ['sesame', 'tahini', 'tahine', 'gergelim'] },
  { id: 'sunflower_seed', kind: 'food', request: ['sunflower seed', 'semente de girassol', 'girassol'] },
  { id: 'hemp_seed', kind: 'food', request: ['hemp seed', 'hemp', 'semente de canhamo', 'canhamo'] },
  { id: 'pecan', kind: 'food', request: ['pecan', 'noz peca'] },
  { id: 'baru', kind: 'food', request: ['baru', 'castanha de baru'] },
  // Laticínios e similares
  { id: 'condensed_milk', kind: 'food', request: ['condensed milk', 'leite condensado'] },
  { id: 'milk_powder', kind: 'food', request: ['milk powder', 'powdered milk', 'leite em po'] },
  { id: 'ice_cream', kind: 'food', request: ['ice cream', 'gelato', 'sorvete'] },
  // Congelado: segue a regra do gelo (não cobrado no Lite, que não pode receber congelado).
  { id: 'frozen_yogurt', kind: 'ice', request: ['frozen yogurt', 'iogurte congelado'] },
  { id: 'soy', kind: 'food', request: ['soy', 'soya', 'soja'] },
  { id: 'whipped_cream', kind: 'food', request: ['whipped cream', 'chantilly', 'chantili'] },
  { id: 'fermented_milk', kind: 'food', request: ['leite fermentado', 'fermented milk'] },
  // Outros (doces, especiarias, suplementos)
  { id: 'dulce_de_leche', kind: 'food', request: ['dulce de leche', 'doce de leite'] },
  { id: 'molasses', kind: 'food', request: ['molasses', 'melado', 'melaco'] },
  { id: 'rapadura', kind: 'food', request: ['rapadura'] },
  { id: 'brown_sugar', kind: 'food', request: ['brown sugar', 'acucar mascavo', 'mascavo', 'demerara'] },
  { id: 'coconut_sugar', kind: 'food', request: ['coconut sugar', 'acucar de coco'] },
  { id: 'xylitol', kind: 'food', request: ['xylitol', 'xilitol'] },
  { id: 'erythritol', kind: 'food', request: ['erythritol', 'eritritol'] },
  { id: 'caramel', kind: 'food', request: ['caramel', 'caramelo'] },
  { id: 'nutmeg', kind: 'food', request: ['nutmeg', 'noz moscada'] },
  { id: 'cardamom', kind: 'food', request: ['cardamom', 'cardamomo'] },
  { id: 'clove', kind: 'food', request: ['clove', 'cravo da india'] },
  { id: 'maca_root', kind: 'food', request: ['maca root', 'maca powder', 'maca peruana'] },
  { id: 'spirulina', kind: 'food', request: ['spirulina', 'espirulina'] },
  { id: 'creatine', kind: 'food', request: ['creatine', 'creatina'] },
  { id: 'jam', kind: 'food', request: ['jam', 'geleia', 'fruit preserve'] },
  { id: 'nutella', kind: 'food', request: ['nutella', 'creme de avela', 'hazelnut spread'] },
  { id: 'pacoca', kind: 'food', request: ['pacoca'] },
];

const FOOD_GROUPS: readonly FoodGroup[] = [
  // Pesos típicos (ingredientWeights.utils.ts) e por unidade.
  { id: 'spinach', kind: 'food', request: weightNames('spinach') },
  { id: 'kale', kind: 'food', request: weightNames('kale'), notSatisfiedBy: ['couve flor'] },
  { id: 'lettuce', kind: 'food', request: weightNames('lettuce') },
  { id: 'arugula', kind: 'food', request: weightNames('arugula') },
  { id: 'strawberry', kind: 'food', request: weightNames('strawberry') },
  { id: 'blueberry', kind: 'food', request: weightNames('blueberry') },
  { id: 'raspberry', kind: 'food', request: weightNames('raspberry') },
  { id: 'blackberry', kind: 'food', request: weightNames('blackberry') },
  { id: 'red_fruits', kind: 'food', request: weightNames('mixed_berries'), satisfiedBy: RED_FRUIT_NAMES },
  { id: 'mango', kind: 'food', request: weightNames('mango') },
  { id: 'pineapple', kind: 'food', request: unique(weightNames('pineapple'), drinkNames('pineapple')) },
  { id: 'papaya', kind: 'food', request: weightNames('papaya') },
  { id: 'banana', kind: 'food', request: unique(weightNames('banana'), unitNames('banana')) },
  { id: 'watermelon', kind: 'food', request: weightNames('watermelon') },
  { id: 'grape', kind: 'food', request: weightNames('grape'), notSatisfiedBy: ['uva passa'] },
  { id: 'peach', kind: 'food', request: unique(weightNames('peach'), unitNames('peach'), drinkNames('peach')) },
  { id: 'cherry', kind: 'food', request: weightNames('cherry') },
  { id: 'oats', kind: 'food', request: weightNames('oats') },
  {
    id: 'protein_powder',
    kind: 'food',
    request: [
      'protein powder', 'protein isolate', 'plant protein', 'pea protein', 'casein',
      'proteina em po', 'po de proteina', 'proteina isolada', 'proteina vegetal', 'proteina de ervilha',
      'caseina', 'albumina',
    ],
    satisfiedBy: PROTEIN_POWDER_SATISFIED_BY,
  },
  // "whey" é um pedido específico: proteína vegetal não atende.
  { id: 'whey', kind: 'food', request: ['whey'] },
  { id: 'cocoa', kind: 'food', request: unique(weightNames('cocoa'), ['cacao nibs', 'nibs de cacau']) },
  { id: 'matcha', kind: 'food', request: weightNames('matcha') },
  { id: 'chia', kind: 'food', request: weightNames('chia') },
  { id: 'flaxseed', kind: 'food', request: weightNames('flaxseed') },
  { id: 'nut_butter', kind: 'food', request: weightNames('nut_butter') },
  { id: 'yogurt', kind: 'food', request: unique(weightNames('yogurt'), ['coalhada']) },
  { id: 'date', kind: 'food', request: [...DATE_REQUEST_NAMES, 'medjool'], satisfiedBy: unitNames('date') },
  { id: 'kiwi', kind: 'food', request: unitNames('kiwi') },
  { id: 'orange', kind: 'food', request: unique(unitNames('orange'), drinkNames('orange')) },
  { id: 'apple', kind: 'food', request: unitNames('apple'), notSatisfiedBy: ['maca peruana'] },
  { id: 'pear', kind: 'food', request: unitNames('pear') },
  { id: 'carrot', kind: 'food', request: unitNames('carrot') },
  { id: 'avocado', kind: 'food', request: unitNames('avocado') },
  { id: 'celery', kind: 'food', request: unitNames('celery') },
  // Ingredientes que definem drinks (alcoholRequest.utils.ts). Em pt "limão"
  // é lime e lemon: um grupo só.
  { id: 'lime_lemon', kind: 'food', request: unique(drinkNames('lime'), drinkNames('lemon')) },
  { id: 'coconut', kind: 'food', request: drinkNames('coconut') },
  { id: 'mint', kind: 'food', request: drinkNames('mint') },
  { id: 'ginger', kind: 'food', request: drinkNames('ginger') },
  { id: 'cranberry', kind: 'food', request: drinkNames('cranberry') },
  { id: 'grapefruit', kind: 'food', request: drinkNames('grapefruit') },
  { id: 'tomato', kind: 'food', request: drinkNames('tomato') },
  // Café é ingrediente e sabor ("sabor café").
  { id: 'coffee', kind: 'food', request: unique(drinkNames('coffee'), unitNames('espresso')) },
  // "creme" sozinho não conta em pt ("bata até virar um creme"), como no validador.
  {
    id: 'milk',
    kind: 'food',
    request: ['milk', 'cream', 'half and half', 'leite', 'creme de leite', 'nata'],
    satisfiedBy: ['creme', 'beverage', 'bebida'],
    notSatisfiedBy: ['leite condensado', 'condensed milk', 'leite em po', 'milk powder', 'powdered milk'],
  },
  // Listas do validador (oleaginosas, veganos, açúcar).
  { id: 'peanut', kind: 'food', request: ['peanut', 'amendoim'] },
  { id: 'almond', kind: 'food', request: ['almond', 'amendoa'] },
  { id: 'cashew', kind: 'food', request: ['cashew', 'castanha de caju'] },
  { id: 'brazil_nut', kind: 'food', request: ['brazil nut', 'castanha do para', 'castanha do brasil'] },
  { id: 'walnut', kind: 'food', request: ['walnut', 'noz'], notSatisfiedBy: ['noz moscada', 'noz peca'] },
  { id: 'hazelnut', kind: 'food', request: ['hazelnut', 'avela'] },
  { id: 'pistachio', kind: 'food', request: ['pistachio', 'pistache'] },
  { id: 'macadamia', kind: 'food', request: ['macadamia'] },
  { id: 'granola', kind: 'food', request: ['granola'] },
  { id: 'honey', kind: 'food', request: ['honey', 'mel'] },
  { id: 'agave', kind: 'food', request: ['agave', 'mel de agave', 'xarope de agave'] },
  { id: 'maple', kind: 'food', request: ['maple', 'maple syrup', 'xarope de bordo'] },
  { id: 'egg', kind: 'food', request: ['egg', 'egg white', 'ovo', 'clara de ovo'] },
  { id: 'collagen', kind: 'food', request: ['collagen', 'colageno'] },
  { id: 'kefir', kind: 'food', request: ['kefir'] },
  { id: 'cheese', kind: 'food', request: ['cheese', 'cottage', 'ricotta', 'cream cheese', 'mascarpone', 'queijo', 'ricota', 'requeijao'] },
  { id: 'sugar', kind: 'food', request: ['sugar', 'acucar'] },
  { id: 'stevia', kind: 'food', request: ['stevia', 'estevia'] },
  {
    id: 'sweetener',
    kind: 'food',
    request: ['sweetener', 'adocante'],
    satisfiedBy: ['stevia', 'estevia', 'sucralose', 'xylitol', 'xilitol', 'erythritol', 'eritritol', 'monk fruit'],
  },
  // Sabores (mapa pequeno): o sabor é atendido pelo ingrediente que o dá.
  { id: 'vanilla', kind: 'food', request: ['vanilla', 'baunilha'] },
  {
    id: 'chocolate',
    kind: 'food',
    request: ['chocolate', 'achocolatado'],
    satisfiedBy: ['cocoa', 'cacao', 'cacau', 'nibs'],
  },
  // Itens comuns de shake fora das tabelas acima.
  { id: 'cinnamon', kind: 'food', request: ['cinnamon', 'canela'] },
  { id: 'acai', kind: 'food', request: ['acai'] },
  { id: 'passion_fruit', kind: 'food', request: ['passion fruit', 'maracuja'] },
  { id: 'melon', kind: 'food', request: ['melon', 'cantaloupe', 'honeydew', 'melao'] },
  { id: 'guava', kind: 'food', request: ['guava', 'goiaba'] },
  { id: 'beet', kind: 'food', request: ['beet', 'beetroot', 'beterraba'] },
  { id: 'cucumber', kind: 'food', request: ['cucumber', 'pepino'] },
  { id: 'pumpkin', kind: 'food', request: ['pumpkin', 'abobora'], notSatisfiedBy: ['semente de abobora', 'pumpkin seed'] },
  { id: 'turmeric', kind: 'food', request: ['turmeric', 'curcuma', 'acafrao'] },
  { id: 'tofu', kind: 'food', request: ['tofu'] },
  { id: 'water', kind: 'food', request: ['water', 'agua'] },
  // Gelo: cobrado só fora do Lite (no Lite ele nunca entra; o validador barra).
  { id: 'ice', kind: 'ice', request: ['ice', 'gelo'] },
  // CP-B8a: vocabulário ampliado (EXTRA_FOOD_GROUPS, abaixo).
  ...EXTRA_FOOD_GROUPS,
];

/** Frases que contêm um termo do vocabulário mas são outra coisa. */
const FOOD_EXCEPTIONS = [
  'couve flor',
  'noz moscada',
  'noz de coco',
  'ice cold',
  'mel de agave',
  // "shake para o café da manhã" não pede café.
  'cafe da manha',
];

// Termo → grupo. Um termo pertence a um grupo só (o primeiro da lista).
const GROUP_BY_TERM = new Map<string, FoodGroup>();
for (const group of FOOD_GROUPS) {
  for (const term of group.request) {
    if (!GROUP_BY_TERM.has(term)) GROUP_BY_TERM.set(term, group);
  }
}

// Todos os termos na lista 'en' do validador: assim o "no" puro também nega
// ("no banana, please"). Em pt o "no" é contração ("no copo"): uma negação a
// mais só deixa de cobrar um item (nunca cobra o que não foi pedido).
const COMPILED_REQUEST_TERMS = compileTermList({
  en: [...GROUP_BY_TERM.keys()],
  pt: [],
  exceptions: FOOD_EXCEPTIONS.filter(exception => !GROUP_BY_TERM.has(exception)),
});

const COMPILED_SATISFIED_BY = new Map<string, CompiledTermList>(
  FOOD_GROUPS.map(group => [
    group.id,
    compileTermList({ en: unique(group.request, group.satisfiedBy ?? []), pt: [], exceptions: group.notSatisfiedBy ?? [] }),
  ])
);

// Termos genéricos de álcool não são uma bebida específica ("com álcool").
const GENERIC_ALCOHOL_TERMS = new Set(['alcohol', 'alcoholic', 'liquor', 'alcool', 'alcoolico', 'alcoolica', 'destilado']);

// Sinônimos de bebida alcoólica (pt): cachaça = pinga = aguardente.
const ALCOHOL_SYNONYMS: ReadonlyArray<readonly string[]> = [
  ['cachaca', 'pinga', 'aguardente'],
  ['champagne', 'champanhe', 'espumante', 'prosecco'],
  ['beer', 'cerveja', 'chope', 'chopp', 'lager'],
  ['wine', 'vinho'],
  ['liqueur', 'licor'],
];

// Como mostrar o termo no aviso (o vocabulário é sem acento).
const DISPLAY_TERMS: Readonly<Record<string, string>> = {
  rucula: 'rúcula',
  mamao: 'mamão',
  pessego: 'pêssego',
  linhaca: 'linhaça',
  tamara: 'tâmara',
  maca: 'maçã',
  salsao: 'salsão',
  limao: 'limão',
  'limao siciliano': 'limão-siciliano',
  'suco de limao': 'suco de limão',
  hortela: 'hortelã',
  ananas: 'ananás',
  cafe: 'café',
  amendoa: 'amêndoa',
  'castanha do para': 'castanha-do-pará',
  avela: 'avelã',
  colageno: 'colágeno',
  requeijao: 'requeijão',
  acucar: 'açúcar',
  adocante: 'adoçante',
  acai: 'açaí',
  maracuja: 'maracujá',
  melao: 'melão',
  abobora: 'abóbora',
  curcuma: 'cúrcuma',
  acafrao: 'açafrão',
  agua: 'água',
  'proteina em po': 'proteína em pó',
  'po de proteina': 'pó de proteína',
  'proteina isolada': 'proteína isolada',
  'proteina vegetal': 'proteína vegetal',
  'proteina de ervilha': 'proteína de ervilha',
  caseina: 'caseína',
  'fruta vermelha': 'frutas vermelhas',
  'fruta silvestre': 'frutas silvestres',
  berry: 'berries',
  'mixed berry': 'mixed berries',
  cachaca: 'cachaça',
  saque: 'saquê',
  curacao: 'curaçao',
  // CP-B8a
  cupuacu: 'cupuaçu',
  roma: 'romã',
  nespera: 'nêspera',
  brocolis: 'brócolis',
  agriao: 'agrião',
  manjericao: 'manjericão',
  'cha verde': 'chá verde',
  'cha mate': 'chá-mate',
  'erva mate': 'erva-mate',
  'erva doce': 'erva-doce',
  guarana: 'guaraná',
  'germen de trigo': 'gérmen de trigo',
  'semente de abobora': 'semente de abóbora',
  'semente de canhamo': 'semente de cânhamo',
  canhamo: 'cânhamo',
  'noz peca': 'noz-pecã',
  'leite em po': 'leite em pó',
  melaco: 'melaço',
  'acucar mascavo': 'açúcar mascavo',
  'acucar de coco': 'açúcar de coco',
  'noz moscada': 'noz-moscada',
  'cravo da india': 'cravo-da-índia',
  'creme de avela': 'creme de avelã',
  pacoca: 'paçoca',
  'couve flor': 'couve-flor',
  'batata doce': 'batata-doce',
  'banana da terra': 'banana-da-terra',
  'uva passa': 'uva-passa',
};

function displayTerm(term: string): string {
  return DISPLAY_TERMS[term] ?? term;
}

// ─── Extração ────────────────────────────────────────────────────────────────

/** A ocorrência está dentro de outra maior ("amendoim" em "pasta de amendoim"). */
function isInsideLonger(occurrence: TermOccurrence, all: readonly TermOccurrence[]): boolean {
  return all.some(other => (
    other !== occurrence &&
    other.segment === occurrence.segment &&
    other.start <= occurrence.start &&
    occurrence.end <= other.end &&
    other.end - other.start > occurrence.end - occurrence.start
  ));
}

/**
 * Alimentos e bebidas pedidos no texto (sem negação), um por grupo, na ordem
 * em que aparecem. Bebida alcoólica específica entra como 'alcohol' (quem
 * decide se é cobrada é o chamador, pela política de álcool).
 */
export function extractRequestedFoods(text: string): RequestedFood[] {
  if (!text.trim()) return [];

  const foodOccurrences = findTermOccurrences(text, COMPILED_REQUEST_TERMS).filter(occurrence => !occurrence.negated);
  const alcoholOccurrences = findAlcoholOccurrences(text).filter(
    occurrence => !occurrence.negated && !GENERIC_ALCOHOL_TERMS.has(occurrence.term)
  );

  const candidates = [
    ...foodOccurrences
      .filter(occurrence => !isInsideLonger(occurrence, foodOccurrences))
      .flatMap(occurrence => {
        const group = GROUP_BY_TERM.get(occurrence.term);
        return group ? [{ occurrence, id: group.id, kind: group.kind }] : [];
      }),
    ...alcoholOccurrences.map(occurrence => ({
      occurrence,
      id: `alcohol:${alcoholSynonymKey(occurrence.term)}`,
      kind: 'alcohol' as const,
    })),
  ].sort((a, b) => a.occurrence.segment - b.occurrence.segment || a.occurrence.start - b.occurrence.start);

  const seen = new Set<string>();
  const foods: RequestedFood[] = [];
  for (const { occurrence, id, kind } of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    foods.push({ id, display: displayTerm(occurrence.term), kind });
  }
  return foods;
}

function alcoholSynonymKey(term: string): string {
  return ALCOHOL_SYNONYMS.find(group => group.includes(term))?.[0] ?? term;
}

/**
 * Os pedidos que a receita PRECISA trazer. Não são cobrados:
 * - gelo no Lite (nunca entra; a regra do hardware já avisa);
 * - bebida alcoólica quando o álcool não é permitido (menor de 21, "Não" ou
 *   pedido decidido como sem álcool): a versão sem álcool vale.
 */
export function requiredRequestedFoods(
  foods: readonly RequestedFood[],
  context: { blendiModel: BlendiModel; alcoholAllowed: boolean }
): RequestedFood[] {
  return foods.filter(food => {
    if (food.kind === 'ice') return context.blendiModel !== 'Lite';
    if (food.kind === 'alcohol') return context.alcoholAllowed;
    return true;
  });
}

// ─── Conferência na receita ──────────────────────────────────────────────────

/** O nome do ingrediente atende ao pedido (mesmo em outro idioma: "Greek yogurt" atende "iogurte"). */
export function ingredientSatisfiesRequestedFood(name: string, food: RequestedFood): boolean {
  return nameSatisfies(name, food);
}

function nameSatisfies(name: string, food: RequestedFood): boolean {
  if (food.kind === 'alcohol') {
    const key = food.id.slice('alcohol:'.length);
    return findAlcoholOccurrences(name).some(
      occurrence => !occurrence.negated && alcoholSynonymKey(occurrence.term) === key
    );
  }

  const list = COMPILED_SATISFIED_BY.get(food.id);
  return list !== undefined && findTermMentions(name, list).some(mention => !mention.negated);
}

/**
 * Pedidos que nenhum ingrediente da receita atende (mesma normalização; o
 * nome digitado entre parênteses conta: "Morango (strawberry)").
 */
export function findMissingRequestedFoods(
  ingredientNames: readonly string[],
  foods: readonly RequestedFood[]
): RequestedFood[] {
  return foods.filter(food => !ingredientNames.some(name => nameSatisfies(name, food)));
}

/** Mensagem da nova tentativa quando falta alimento pedido (só termos do vocabulário, nunca texto livre). */
export function buildRequestedFoodsRetryMessage(
  missing: readonly string[],
  format: 'object' | 'pantry'
): string {
  return [
    `Your previous recipe is missing ingredients the user explicitly asked for: ${JSON.stringify(missing)}.`,
    'Every requested ingredient must be in the ingredients list, in the requested amount when one is given, or a sensible amount for one serving otherwise. A requested flavor is a real ingredient that gives that flavor (for example vanilla extract, cocoa powder or coffee).',
    'Write the ingredient name in the response language; when it differs from what the user typed, add the typed name in parentheses, for example "Morango (strawberry)".',
    'Keep everything else the user asked for and every rule of this conversation (cup volume, dietary restrictions, alcohol), and adjust the other amounts so the recipe still fits.',
    format === 'object'
      ? 'Then return only the corrected recipe as a single JSON object, in the same format and language, with recalculated macros.'
      : 'Return the corrected recipe with the macros recalculated from the new quantities.',
  ].join(' ');
}
