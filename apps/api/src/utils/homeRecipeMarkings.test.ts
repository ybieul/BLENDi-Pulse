// CP-1.1.9 — marcação `contains` das receitas fixas da Home conferida pelas
// MESMAS regras que o backend aplica nas receitas da IA.
//
// Para cada uma das 100 receitas (apps/mobile/src/components/home/
// dailyRecipes.data.ts), monta o PulseAiRecipe que o app monta ao tocar em
// "Preparar" (nomes dos ingredientes, passos e blendInstruction em inglês) e
// roda validateRecipeRestrictions dieta a dieta, e com o Lite para o gelo. A
// marcação esperada sai do resultado:
//   dairy       ← dairy_free violada
//   animal      ← vegan violada por um termo que não é laticínio (mel, ovo...)
//   nuts        ← nut_free violada
//   added_sugar ← no_added_sugar violada
//   ice         ← Lite violado (sem dieta)
//   peanut, tree_nuts, milk, lactose, soy, wheat_gluten, sesame, egg
//               ← CP-B6: a família da alergia (allergyFamilies.utils.ts)
//                 violada, com a mesma marcação em en e em pt-BR
// e precisa ser IGUAL à marcação declarada. Não existe uma segunda lista de
// palavras: o app só lê a marcação.
//
// O arquivo de dados não importa nada de React Native (só tipos), por isso é
// carregado aqui por import dinâmico — fora do grafo do tsc do backend.
//
// Também confere as 20 receitas do WeightLoss: macros somados ingrediente a
// ingrediente (tabela abaixo), volume dentro do Lite (CP-B2: sem teto de proteína), 180-320 kcal,
// sem gelo nem açúcar adicionado, e a variedade mínima para o filtro.
//
// CP-A: trava as regras das 100 receitas (bloco "regras das 100 receitas"):
// volume ≤ 400 ml no leitor do backend, nada barrado no Lite (congelado ou
// gelo), passos sem "BLENDi", kcal a ±10% de 4/4/9, nenhum par com os mesmos
// ingredientes, mesma quantidade em en e pt-BR e pelo menos 2 receitas
// veganas e 2 sem laticínios por goal.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  ALLERGY_CODE_VALUES,
  ALLERGY_FORBIDDEN_CONTENTS,
  DIETARY_PREFERENCE_FORBIDDEN_CONTENTS,
  isHomeRecipeAllowed,
  type AllergyCode,
  HOME_RECIPE_CONTENT_VALUES,
  USER_GOAL_VALUES,
  type HomeRecipeContent,
} from '@blendi/shared';

import { NUTRITION_REFERENCE_TABLE } from '../config/nutritionReference.config';
import { BLENDER_LIMITS } from '../config/pricing.config';
import type { DietaryPreference } from '../models/User';
import { buildAllergyRestrictions } from './allergyFamilies.utils';
import { isIceTerm, tokenizeSegments, validateRecipeRestrictions, type RestrictedRecipe } from './recipeRestrictions.utils';
import { estimateIngredientVolumeMl, estimateRecipeVolumeMl } from './recipeVolume.utils';

const MOBILE_SRC = path.resolve(__dirname, '../../../mobile/src');

interface HomeRecipe {
  nameKey: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  contains: readonly HomeRecipeContent[];
  ingredients: Array<{ nameKey: string; amountKey: string }>;
  steps: Array<{ textKey: string; pulseCount?: number }>;
}

let DAILY_RECIPES: Record<string, HomeRecipe[]>;
let BLEND_INSTRUCTION_KEY: string;
const en = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/en.json'), 'utf8')) as Record<string, unknown>;

function translate(key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
  assert.equal(typeof value, 'string', `chave sem texto em en.json: ${key}`);
  return value as string;
}

before(async () => {
  const dataModulePath = path.join(MOBILE_SRC, 'components/home/dailyRecipes.data.ts');
  const dataModule = (await import(pathToFileURL(dataModulePath).href)) as {
    DAILY_RECIPES: Record<string, HomeRecipe[]>;
    DAILY_RECIPE_BLEND_INSTRUCTION_KEY: string;
  };
  DAILY_RECIPES = dataModule.DAILY_RECIPES;
  BLEND_INSTRUCTION_KEY = dataModule.DAILY_RECIPE_BLEND_INSTRUCTION_KEY;
});

function toRestrictedRecipe(recipe: HomeRecipe): RestrictedRecipe {
  return {
    ingredients: recipe.ingredients.map(ingredient => ({
      name: translate(ingredient.nameKey),
      amount: translate(ingredient.amountKey),
    })),
    steps: recipe.steps.map(step => ({ text: translate(step.textKey) })),
    blendInstruction: translate(BLEND_INSTRUCTION_KEY),
  };
}

function violatedTerms(recipe: RestrictedRecipe, diets: DietaryPreference[], model: 'Lite' | 'ProPlus'): string[] {
  const result = validateRecipeRestrictions(recipe, diets, model);
  return result.compliant ? [] : result.violations.map(violation => violation.term);
}

/** CP-B6: a família da alergia barra a receita. */
function allergyBlocked(recipe: RestrictedRecipe, code: AllergyCode): boolean {
  return !validateRecipeRestrictions(recipe, [], 'ProPlus', {
    allergies: buildAllergyRestrictions({ common: [code], custom: [] }),
  }).compliant;
}

function liteIceBlocked(recipe: RestrictedRecipe): boolean {
  return violatedTerms(recipe, [], 'Lite').some(isIceTerm);
}

/** Marcação que as regras do backend dão para a receita. */
function deriveContains(recipe: HomeRecipe): HomeRecipeContent[] {
  const restricted = toRestrictedRecipe(recipe);
  const dairyTerms = violatedTerms(restricted, ['dairy_free'], 'ProPlus');
  const veganTerms = violatedTerms(restricted, ['vegan'], 'ProPlus');
  const derived = new Set<HomeRecipeContent>();

  if (dairyTerms.length > 0) derived.add('dairy');
  if (veganTerms.some(term => !dairyTerms.includes(term))) derived.add('animal');
  if (violatedTerms(restricted, ['nut_free'], 'ProPlus').length > 0) derived.add('nuts');
  if (violatedTerms(restricted, ['no_added_sugar'], 'ProPlus').length > 0) derived.add('added_sugar');
  // A marcação 'ice' da Home é só gelo. O Lite também barra congelado, mas
  // desde o CP-A nenhuma receita da Home tem congelado (ver "regras das 100").
  if (liteIceBlocked(restricted)) derived.add('ice');
  // CP-B6: uma marcação por alergia comum, com o nome do código.
  for (const code of ALLERGY_CODE_VALUES) {
    if (allergyBlocked(restricted, code)) derived.add(code);
  }

  return HOME_RECIPE_CONTENT_VALUES.filter(content => derived.has(content));
}

describe('receitas da Home — marcação conferida pelas regras do backend', () => {
  it('há 20 receitas para cada um dos 5 goals', () => {
    assert.deepEqual(Object.keys(DAILY_RECIPES).sort(), [...USER_GOAL_VALUES].sort());
    for (const goal of USER_GOAL_VALUES) {
      assert.equal(DAILY_RECIPES[goal].length, 20, goal);
    }
  });

  it('a marcação de cada uma das 100 receitas bate com validateRecipeRestrictions', () => {
    const mismatches: string[] = [];
    for (const goal of USER_GOAL_VALUES) {
      for (const recipe of DAILY_RECIPES[goal]) {
        const declared = HOME_RECIPE_CONTENT_VALUES.filter(content => recipe.contains.includes(content));
        const derived = deriveContains(recipe);
        if (JSON.stringify(declared) !== JSON.stringify(derived)) {
          mismatches.push(`${recipe.nameKey}: declarada ${JSON.stringify(declared)}, regras ${JSON.stringify(derived)}`);
        }
      }
    }
    assert.deepEqual(mismatches, []);
  });

  it('cada dieta proíbe exatamente o que a regra dela no backend barra', () => {
    // Garante que a tabela do shared (DIETARY_PREFERENCE_FORBIDDEN_CONTENTS) e
    // a derivação acima falam da mesma coisa: uma receita compatível pela
    // marcação nunca é barrada pelo validador, e vice-versa.
    for (const goal of USER_GOAL_VALUES) {
      for (const recipe of DAILY_RECIPES[goal]) {
        const restricted = toRestrictedRecipe(recipe);
        for (const diet of Object.keys(DIETARY_PREFERENCE_FORBIDDEN_CONTENTS) as DietaryPreference[]) {
          const blockedByMarking = DIETARY_PREFERENCE_FORBIDDEN_CONTENTS[diet].some(content =>
            recipe.contains.includes(content)
          );
          const blockedByBackend = !validateRecipeRestrictions(restricted, [diet], 'ProPlus').compliant;
          assert.equal(blockedByMarking, blockedByBackend, `${recipe.nameKey} × ${diet}`);
        }
        const iceBlocked = liteIceBlocked(restricted);
        assert.equal(recipe.contains.includes('ice'), iceBlocked, `${recipe.nameKey} × Lite`);
      }
    }
  });
});

// ─── CP-B6: alergias ──────────────────────────────────────────────────────────

describe('receitas da Home — alergias (CP-B6)', () => {
  const ptBR = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/pt-BR.json'), 'utf8')) as Record<string, unknown>;
  const translatePt = (key: string) => String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ptBR));
  const toRestrictedRecipePt = (recipe: HomeRecipe): RestrictedRecipe => ({
    ingredients: recipe.ingredients.map(ingredient => ({ name: translatePt(ingredient.nameKey), amount: translatePt(ingredient.amountKey) })),
    steps: recipe.steps.map(step => ({ text: translatePt(step.textKey) })),
    blendInstruction: translatePt(BLEND_INSTRUCTION_KEY),
  });

  it('cada alergia comum proíbe exatamente o que a família dela barra (en e pt-BR)', () => {
    const problems: string[] = [];
    for (const goal of USER_GOAL_VALUES) {
      for (const recipe of DAILY_RECIPES[goal]) {
        for (const code of ALLERGY_CODE_VALUES) {
          const blockedByMarking = ALLERGY_FORBIDDEN_CONTENTS[code].some(content => recipe.contains.includes(content));
          const blockedEn = allergyBlocked(toRestrictedRecipe(recipe), code);
          const blockedPt = allergyBlocked(toRestrictedRecipePt(recipe), code);
          if (blockedByMarking !== blockedEn || blockedEn !== blockedPt) {
            problems.push(`${recipe.nameKey} × ${code}: marcação ${blockedByMarking}, en ${blockedEn}, pt-BR ${blockedPt}`);
          }
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it('todo goal tem ao menos uma receita compatível com cada alergia comum (sem precisar do fallback)', () => {
    const counts: Record<string, Record<string, number>> = {};
    for (const goal of USER_GOAL_VALUES) {
      counts[goal] = {};
      for (const code of ALLERGY_CODE_VALUES) {
        counts[goal][code] = DAILY_RECIPES[goal].filter(recipe =>
          isHomeRecipeAllowed(recipe, [], 'ProPlus', { common: [code], custom: [] })
        ).length;
        assert.ok(counts[goal][code] > 0, `${goal} × ${code}`);
      }
    }
    // Contagem de referência (CP-B6): muda só se as receitas mudarem.
    assert.deepEqual(counts, {
      Muscle: { peanut: 16, tree_nuts: 17, milk: 3, lactose: 3, soy: 18, wheat_gluten: 19, sesame: 20, egg: 20 },
      Wellness: { peanut: 20, tree_nuts: 20, milk: 2, lactose: 2, soy: 18, wheat_gluten: 20, sesame: 20, egg: 20 },
      Energy: { peanut: 18, tree_nuts: 18, milk: 7, lactose: 7, soy: 19, wheat_gluten: 19, sesame: 20, egg: 20 },
      Recovery: { peanut: 20, tree_nuts: 20, milk: 4, lactose: 4, soy: 19, wheat_gluten: 20, sesame: 20, egg: 20 },
      WeightLoss: { peanut: 20, tree_nuts: 16, milk: 9, lactose: 12, soy: 16, wheat_gluten: 20, sesame: 20, egg: 19 },
    });
  });

  it('item do campo livre esconde a receita pelos nomes dos ingredientes (en e pt-BR)', () => {
    const recipe = DAILY_RECIPES.WeightLoss.find(item => item.nameKey === 'home.dailyRecipeWeightLoss09Name');
    assert.ok(recipe);
    const names = recipe.ingredients.flatMap(ingredient => [translate(ingredient.nameKey), translatePt(ingredient.nameKey)]);
    // "Raspberries" / "Framboesas": o item em qualquer número e idioma escrito.
    assert.equal(isHomeRecipeAllowed(recipe, [], 'ProPlus', { common: [], custom: ['framboesa'] }, names), false);
    assert.equal(isHomeRecipeAllowed(recipe, [], 'ProPlus', { common: [], custom: ['raspberry'] }, names), false);
    assert.equal(isHomeRecipeAllowed(recipe, [], 'ProPlus', { common: [], custom: ['kiwi'] }, names), true);
    // Falha segura: item livre sem os nomes → a receita não aparece.
    assert.equal(isHomeRecipeAllowed(recipe, [], 'ProPlus', { common: [], custom: ['kiwi'] }), false);
  });
});

// ─── CP-A: o mesmo leitor de volume da IA mede as receitas da Home ───────────

describe('receitas da Home — leitor de volume (CP-A)', () => {
  it('mede todos os ingredientes das 100 receitas, com o mesmo volume em en e pt-BR', () => {
    // O limite de 400 ml é conferido no bloco "regras das 100 receitas".
    const ptBR = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/pt-BR.json'), 'utf8')) as Record<string, unknown>;
    const translatePt = (key: string) => String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ptBR));
    const problems: string[] = [];
    for (const goal of USER_GOAL_VALUES) {
      for (const recipe of DAILY_RECIPES[goal]) {
        const en = estimateRecipeVolumeMl(recipe.ingredients.map(i => ({ name: translate(i.nameKey), amount: translate(i.amountKey) })));
        const pt = estimateRecipeVolumeMl(recipe.ingredients.map(i => ({ name: translatePt(i.nameKey), amount: translatePt(i.amountKey) })));
        if (en.unmeasured.length > 0) problems.push(`${recipe.nameKey} en sem medida: ${en.unmeasured.join(', ')}`);
        if (pt.unmeasured.length > 0) problems.push(`${recipe.nameKey} pt-BR sem medida: ${pt.unmeasured.join(', ')}`);
        if (en.estimatedVolumeMl !== pt.estimatedVolumeMl) {
          problems.push(`${recipe.nameKey}: en ${en.estimatedVolumeMl} ml × pt-BR ${pt.estimatedVolumeMl} ml`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });
});

// ─── WeightLoss: macros ingrediente a ingrediente ─────────────────────────────

interface Nutrition {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  fiber: number;
  source: string;
}

function fromBackendTable(name: string, fiber: number, fiberSource: string): Nutrition {
  const entry = NUTRITION_REFERENCE_TABLE.find(item => item.name === name);
  assert.ok(entry, `fora da tabela do backend: ${name}`);
  return {
    protein: entry.proteinPer100g,
    carbs: entry.carbsPer100g,
    fat: entry.fatPer100g,
    calories: entry.caloriesPer100g,
    fiber,
    source: `nutritionReference.config.ts: ${name}${fiberSource ? ` (fibra: ${fiberSource})` : ''}`,
  };
}

// Por 100 g / 100 ml. Itens da tabela do backend vêm de lá; os demais, do
// USDA FoodData Central (SR Legacy), com o NDB number.
function nutritionTable(): Record<string, Nutrition> {
  return {
    whey: fromBackendTable('Whey protein isolate', 0, ''),
    plant: fromBackendTable('Plant protein powder', 0, ''),
    eggWhite: fromBackendTable('Egg white protein powder', 0, ''),
    greek: fromBackendTable('Nonfat Greek yogurt', 0, ''),
    // CP-A: "Milk"/"Leite" sem tipo, referência única 2%.
    milk: { protein: 3.3, carbs: 4.8, fat: 1.98, calories: 50, fiber: 0, source: 'USDA 01079 Milk, reduced fat, fluid, 2% milkfat' },
    almond: fromBackendTable('Unsweetened almond milk', 0, ''),
    oatMilk: fromBackendTable('Oat milk', 0, ''),
    strawberry: fromBackendTable('Strawberry', 2.0, 'USDA 09316'),
    blueberry: fromBackendTable('Blueberry', 2.4, 'USDA 09050'),
    mango: fromBackendTable('Mango', 1.6, 'USDA 09176'),
    banana: fromBackendTable('Ripe banana', 2.6, 'USDA 09040'),
    spinach: fromBackendTable('Raw spinach', 2.2, 'USDA 11457'),
    oats: fromBackendTable('Rolled oats', 10.1, 'USDA 08120'),
    water: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0, source: '-' },
    soy: { protein: 2.86, carbs: 1.74, fat: 1.61, calories: 33, fiber: 0.4, source: 'USDA 16222 Soymilk, unsweetened' },
    raspberry: { protein: 1.2, carbs: 11.94, fat: 0.65, calories: 52, fiber: 6.5, source: 'USDA 09302 Raspberries, raw' },
    blackberry: { protein: 1.39, carbs: 9.61, fat: 0.49, calories: 43, fiber: 5.3, source: 'USDA 09042 Blackberries, raw' },
    tofu: { protein: 6.9, carbs: 2.4, fat: 2.7, calories: 62, fiber: 0.1, source: 'USDA 16162 Tofu, silken, firm' },
    chia: { protein: 16.54, carbs: 42.12, fat: 30.74, calories: 486, fiber: 34.4, source: 'USDA 12006 Chia seeds, dried' },
    flax: { protein: 18.29, carbs: 28.88, fat: 42.16, calories: 534, fiber: 27.3, source: 'USDA 12220 Flaxseed' },
    cocoa: { protein: 19.6, carbs: 57.9, fat: 13.7, calories: 228, fiber: 37, source: 'USDA 19165 Cocoa, dry powder, unsweetened' },
    kiwi: { protein: 1.14, carbs: 14.66, fat: 0.52, calories: 61, fiber: 3.0, source: 'USDA 09148 Kiwifruit, green, raw' },
    pineapple: { protein: 0.54, carbs: 13.12, fat: 0.12, calories: 50, fiber: 1.4, source: 'USDA 09266 Pineapple, raw' },
    peach: { protein: 0.91, carbs: 9.54, fat: 0.25, calories: 39, fiber: 1.5, source: 'USDA 09236 Peaches, raw' },
    cherry: { protein: 1.06, carbs: 16.01, fat: 0.2, calories: 63, fiber: 2.1, source: 'USDA 09070 Cherries, sweet, raw' },
    pumpkin: { protein: 1.1, carbs: 8.09, fat: 0.28, calories: 34, fiber: 2.9, source: 'USDA 11424 Pumpkin, canned, without salt' },
    cottage: { protein: 12.39, carbs: 2.72, fat: 1.02, calories: 72, fiber: 0, source: 'USDA 01016 Cottage cheese, lowfat 1%' },
    pear: { protein: 0.36, carbs: 15.23, fat: 0.14, calories: 57, fiber: 3.1, source: 'USDA 09252 Pears, raw' },
  };
}

/**
 * Quantidades (g ou ml) de cada ingrediente, na ordem da receita. Volume =
 * soma de g + ml (1 g ≈ 1 ml, conservador: pó e fruta picada ocupam menos
 * depois de batidos).
 */
const WEIGHT_LOSS_INGREDIENTS: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
  [['whey', 30], ['raspberry', 125], ['milk', 200]],
  [['plant', 30], ['strawberry', 150], ['soy', 200]],
  [['greek', 200], ['blueberry', 100], ['chia', 12]],
  [['plant', 30], ['cocoa', 10], ['soy', 250]],
  [['cottage', 150], ['peach', 150], ['milk', 100]],
  [['plant', 30], ['kiwi', 140], ['water', 230]],
  [['whey', 30], ['pineapple', 150], ['water', 220]],
  [['greek', 150], ['strawberry', 150], ['oats', 20]],
  [['eggWhite', 30], ['raspberry', 125], ['oatMilk', 220]],
  [['whey', 30], ['cherry', 120], ['almond', 250]],
  [['greek', 200], ['pumpkin', 100], ['milk', 100]],
  [['tofu', 200], ['blueberry', 100], ['soy', 100]],
  [['plant', 30], ['blackberry', 120], ['oatMilk', 250]],
  [['whey', 30], ['pear', 150], ['almond', 220]],
  [['plant', 30], ['pumpkin', 120], ['almond', 250]],
  [['plant', 30], ['banana', 100], ['water', 250]],
  [['tofu', 180], ['pineapple', 150], ['spinach', 30]],
  [['greek', 200], ['cherry', 100], ['milk', 100]],
  [['cottage', 150], ['mango', 120], ['almond', 130]],
  [['greek', 170], ['peach', 150], ['flax', 10]],
];

const WEIGHT_LOSS_CALORIES = { min: 180, max: 320 } as const;
const WEIGHT_LOSS_MIN_FIBER_GRAMS = 1.5;
/** Proteína alta para as calorias: pelo menos 25% das kcal vêm da proteína. */
const WEIGHT_LOSS_MIN_PROTEIN_CALORIE_SHARE = 0.25;
const WEIGHT_LOSS_MIN_RECIPES_PER_DIET = 6;

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

describe('receitas da Home — as 20 do WeightLoss', () => {
  const table = nutritionTable();
  const lite = BLENDER_LIMITS.Lite;

  it('3 ingredientes e 4 passos, com texto em en e pt-BR', () => {
    const ptBR = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/pt-BR.json'), 'utf8')) as Record<string, unknown>;
    for (const recipe of DAILY_RECIPES.WeightLoss) {
      assert.equal(recipe.ingredients.length, 3, recipe.nameKey);
      assert.equal(recipe.steps.length, 4, recipe.nameKey);
      const keys = [recipe.nameKey, ...recipe.ingredients.flatMap(i => [i.nameKey, i.amountKey]), ...recipe.steps.map(s => s.textKey)];
      for (const key of keys) {
        translate(key);
        const pt = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ptBR);
        assert.equal(typeof pt, 'string', `sem pt-BR: ${key}`);
      }
    }
  });

  it('macros declarados = soma ingrediente a ingrediente; volume, kcal e fibra dentro dos limites', () => {
    assert.equal(WEIGHT_LOSS_INGREDIENTS.length, DAILY_RECIPES.WeightLoss.length);
    DAILY_RECIPES.WeightLoss.forEach((recipe, index) => {
      const sum = { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0, volume: 0 };
      for (const [ref, quantity] of WEIGHT_LOSS_INGREDIENTS[index]) {
        const item = table[ref];
        assert.ok(item, `ingrediente sem tabela: ${ref}`);
        sum.protein += (item.protein * quantity) / 100;
        sum.carbs += (item.carbs * quantity) / 100;
        sum.fat += (item.fat * quantity) / 100;
        sum.calories += (item.calories * quantity) / 100;
        sum.fiber += (item.fiber * quantity) / 100;
        sum.volume += quantity;
      }

      assert.equal(recipe.protein, roundHalfUp(sum.protein), `${recipe.nameKey} proteína`);
      assert.equal(recipe.carbs, roundHalfUp(sum.carbs), `${recipe.nameKey} carboidratos`);
      assert.equal(recipe.fat, roundHalfUp(sum.fat), `${recipe.nameKey} gordura`);
      assert.equal(recipe.calories, roundHalfUp(sum.calories), `${recipe.nameKey} kcal`);

      assert.ok(sum.volume <= lite.maxVolumeMl, `${recipe.nameKey} volume ${sum.volume}`);
      assert.ok(
        recipe.calories >= WEIGHT_LOSS_CALORIES.min && recipe.calories <= WEIGHT_LOSS_CALORIES.max,
        `${recipe.nameKey} kcal ${recipe.calories}`
      );
      assert.ok(sum.fiber >= WEIGHT_LOSS_MIN_FIBER_GRAMS, `${recipe.nameKey} fibra ${sum.fiber}`);
      assert.ok(
        (recipe.protein * 4) / recipe.calories >= WEIGHT_LOSS_MIN_PROTEIN_CALORIE_SHARE,
        `${recipe.nameKey} proteína/kcal`
      );
    });
  });

  it('sem gelo e sem açúcar adicionado (marcação e validador do backend)', () => {
    for (const recipe of DAILY_RECIPES.WeightLoss) {
      assert.ok(!recipe.contains.includes('ice'), recipe.nameKey);
      assert.ok(!recipe.contains.includes('added_sugar'), recipe.nameKey);
      const restricted = toRestrictedRecipe(recipe);
      assert.ok(validateRecipeRestrictions(restricted, ['no_added_sugar'], 'ProPlus').compliant, recipe.nameKey);
      assert.ok(!liteIceBlocked(restricted), recipe.nameKey);
    }
  });

  it(`variedade: pelo menos ${WEIGHT_LOSS_MIN_RECIPES_PER_DIET} veganas e ${WEIGHT_LOSS_MIN_RECIPES_PER_DIET} sem laticínios e sem castanhas`, () => {
    const vegan = DAILY_RECIPES.WeightLoss.filter(r => !r.contains.includes('dairy') && !r.contains.includes('animal'));
    const dairyAndNutFree = DAILY_RECIPES.WeightLoss.filter(r => !r.contains.includes('dairy') && !r.contains.includes('nuts'));
    assert.ok(vegan.length >= WEIGHT_LOSS_MIN_RECIPES_PER_DIET, `veganas: ${vegan.length}`);
    assert.ok(dairyAndNutFree.length >= WEIGHT_LOSS_MIN_RECIPES_PER_DIET, `sem laticínio e castanha: ${dairyAndNutFree.length}`);

    const bases = new Set(WEIGHT_LOSS_INGREDIENTS.map(ingredients => ingredients[ingredients.length - 1][0]));
    const proteins = new Set(WEIGHT_LOSS_INGREDIENTS.map(ingredients => ingredients[0][0]));
    for (const base of ['water', 'soy', 'milk']) assert.ok(bases.has(base), `base ${base}`);
    for (const protein of ['whey', 'plant', 'greek', 'tofu']) assert.ok(proteins.has(protein), `proteína ${protein}`);
  });

  it('nomes sem promessa de resultado', () => {
    const promise = /\b(slim|burn|fat|lean|detox|loss|lose|skinny|shred)\b|emagre|seca|queima|perca|perder/i;
    const ptBR = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/pt-BR.json'), 'utf8')) as Record<string, unknown>;
    for (const recipe of DAILY_RECIPES.WeightLoss) {
      const pt = recipe.nameKey.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ptBR);
      assert.ok(!promise.test(translate(recipe.nameKey)), translate(recipe.nameKey));
      assert.ok(!promise.test(String(pt)), String(pt));
    }
  });
});

// ─── CP-A: regras das 100 receitas ────────────────────────────────────────────
//
// Travam o que a proposta aprovada (docs/proposals/cp-a-receitas-home.md)
// aplicou, para que uma receita nova ou alterada não volte a quebrar as regras.

const ptBRMessages = JSON.parse(readFileSync(path.join(MOBILE_SRC, 'locales/pt-BR.json'), 'utf8')) as Record<string, unknown>;

function translatePt(key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ptBRMessages);
  assert.equal(typeof value, 'string', `chave sem texto em pt-BR.json: ${key}`);
  return value as string;
}

function allRecipes(): Array<{ goal: string; recipe: HomeRecipe }> {
  return USER_GOAL_VALUES.flatMap(goal => DAILY_RECIPES[goal].map(recipe => ({ goal, recipe })));
}

/** Menor copo entre os modelos (hoje 400 ml, Lite e Pro+): a receita cabe em qualquer um. */
const SMALLEST_CUP_ML = Math.min(...Object.values(BLENDER_LIMITS).map(limit => limit.maxVolumeMl));
const CALORIE_TOLERANCE = 0.1;
const MIN_RECIPES_PER_GOAL_AND_DIET = 2;

/** Nome do ingrediente normalizado (sem acento, minúsculas, singular), para comparar conjuntos. */
function ingredientIdentity(name: string): string {
  return tokenizeSegments(name).map(tokens => tokens.join(' ')).join(' ');
}

describe('receitas da Home — regras das 100 receitas (CP-A)', () => {
  it(`volume até ${SMALLEST_CUP_ML} ml no leitor do backend (textos em inglês), sem item sem medida`, () => {
    assert.equal(SMALLEST_CUP_ML, 400);
    const problems: string[] = [];
    for (const { recipe } of allRecipes()) {
      const { estimatedVolumeMl, unmeasured } = estimateRecipeVolumeMl(
        recipe.ingredients.map(i => ({ name: translate(i.nameKey), amount: translate(i.amountKey) }))
      );
      if (estimatedVolumeMl > SMALLEST_CUP_ML) problems.push(`${recipe.nameKey}: ${estimatedVolumeMl} ml`);
      if (unmeasured.length > 0) problems.push(`${recipe.nameKey} sem medida: ${unmeasured.join(', ')}`);
    }
    assert.deepEqual(problems, []);
  });

  it('nenhum ingrediente nem passo barrado no Lite pelo validador (congelado ou gelo)', () => {
    const problems: string[] = [];
    for (const { recipe } of allRecipes()) {
      const result = validateRecipeRestrictions(toRestrictedRecipe(recipe), [], 'Lite');
      if (!result.compliant) problems.push(`${recipe.nameKey}: ${result.violations.map(v => v.term).join(', ')}`);
    }
    assert.deepEqual(problems, []);
  });

  it('passos com texto neutro: nenhum "BLENDi" em en nem em pt-BR', () => {
    const problems: string[] = [];
    for (const { recipe } of allRecipes()) {
      for (const step of recipe.steps) {
        for (const text of [translate(step.textKey), translatePt(step.textKey)]) {
          if (/blendi/i.test(text)) problems.push(`${step.textKey}: ${text}`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it(`kcal declarada a ±${CALORIE_TOLERANCE * 100}% da conta 4/4/9`, () => {
    const problems: string[] = [];
    for (const { recipe } of allRecipes()) {
      const fromMacros = recipe.protein * 4 + recipe.carbs * 4 + recipe.fat * 9;
      if (Math.abs(recipe.calories - fromMacros) > fromMacros * CALORIE_TOLERANCE) {
        problems.push(`${recipe.nameKey}: ${recipe.calories} kcal × 4/4/9 ${fromMacros} kcal`);
      }
    }
    assert.deepEqual(problems, []);
  });

  it('nenhum par de receitas com o mesmo conjunto de ingredientes (ignorando quantidades)', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const { recipe } of allRecipes()) {
      const identity = recipe.ingredients.map(i => ingredientIdentity(translate(i.nameKey))).sort().join(' + ');
      const other = seen.get(identity);
      if (other) duplicates.push(`${other} = ${recipe.nameKey} (${identity})`);
      else seen.set(identity, recipe.nameKey);
    }
    assert.deepEqual(duplicates, []);
  });

  it('mesma quantidade em en e pt-BR para cada ingrediente (mesmos números, medida equivalente)', () => {
    const problems: string[] = [];
    const numbers = (text: string) => text.match(/\d+(?:[.,/]\d+)?/g) ?? [];
    for (const { recipe } of allRecipes()) {
      for (const ingredient of recipe.ingredients) {
        const enItem = { name: translate(ingredient.nameKey), amount: translate(ingredient.amountKey) };
        const ptItem = { name: translatePt(ingredient.nameKey), amount: translatePt(ingredient.amountKey) };
        const sameNumbers = JSON.stringify(numbers(enItem.amount)) === JSON.stringify(numbers(ptItem.amount));
        const enMl = estimateIngredientVolumeMl(enItem);
        const ptMl = estimateIngredientVolumeMl(ptItem);
        if (!sameNumbers || enMl === null || ptMl === null || Math.abs(enMl - ptMl) > 0.01) {
          problems.push(`${ingredient.amountKey}: "${enItem.amount}" (${enMl} ml) × "${ptItem.amount}" (${ptMl} ml)`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it(`cada goal tem pelo menos ${MIN_RECIPES_PER_GOAL_AND_DIET} receitas veganas e ${MIN_RECIPES_PER_GOAL_AND_DIET} sem laticínios`, () => {
    const compatible = (recipe: HomeRecipe, diet: DietaryPreference) =>
      !DIETARY_PREFERENCE_FORBIDDEN_CONTENTS[diet].some(content => recipe.contains.includes(content));
    for (const goal of USER_GOAL_VALUES) {
      for (const diet of ['vegan', 'dairy_free'] as const) {
        const count = DAILY_RECIPES[goal].filter(recipe => compatible(recipe, diet)).length;
        assert.ok(count >= MIN_RECIPES_PER_GOAL_AND_DIET, `${goal} × ${diet}: ${count}`);
      }
    }
  });
});
