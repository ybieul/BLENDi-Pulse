// CP-B6b — vegan e dairy_free passam a usar a MESMA lista de chocolate das
// alergias a leite e lactose (CP-B6a): chocolate com leite provável barra,
// cacau/amargo/70%+/vegano/sem leite passam; "sem lactose" não libera.
// Regras de dieta continuam furáveis pelo pedido explícito da mensagem atual
// — mas "chocolate" sozinho ("sabor chocolate") não é pedido de chocolate com
// leite, e não pesa no título.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { USER_GOAL_VALUES, isHomeRecipeAllowed } from '@blendi/shared';

import { buildAllergyRestrictions, findAllergensInName } from './allergyFamilies.utils';
import { validateRecipeRestrictions, type RestrictedRecipe } from './recipeRestrictions.utils';
import type { DietaryPreference } from '../models/User';

const BLOCKED = [
  'Chocolate', 'Chocolate em pó', 'Chocolate powder', 'Milk chocolate', 'Chocolate ao leite',
  'Chocolate branco', 'White chocolate', 'Chocolate meio amargo', 'Semisweet chocolate',
  'Gotas de chocolate', 'Chocolate chips', 'Calda de chocolate', 'Chocolate syrup', 'Achocolatado',
  'Hot chocolate mix', 'Hot cocoa mix', 'Chocolate drink mix', 'Nescau', 'Toddy', 'Nesquik',
  'Bombom', 'Trufa de chocolate', 'Ganache',
];
const FREE = [
  'Cacau', 'Cacau em pó', 'Cacao', 'Cocoa powder', 'Nibs de cacau', 'Cacao nibs', 'Chocolate amargo',
  'Dark chocolate', 'Chocolate 70%', 'Chocolate 85% cacau', '70% dark chocolate', 'Chocolate vegano',
  'Vegan chocolate', 'Chocolate sem leite', 'Dairy-free chocolate', 'Unsweetened chocolate',
];

function recipe(name: string, extra: Partial<RestrictedRecipe> = {}): RestrictedRecipe {
  return { ingredients: [{ name, amount: '20 g' }], steps: [{ text: 'Bata tudo.' }], blendInstruction: 'Bata por 30 segundos.', ...extra };
}

function blocked(name: string, diet: DietaryPreference): boolean {
  return !validateRecipeRestrictions(recipe(name), [diet], 'ProPlus').compliant;
}

describe('CP-B6b — chocolate em vegan e dairy_free', () => {
  for (const diet of ['vegan', 'dairy_free'] as const) {
    it(`${diet}: cada termo da lista barra`, () => {
      assert.deepEqual(BLOCKED.filter(name => !blocked(name, diet)), []);
    });
    it(`${diet}: cacau, amargo, 70%+, vegano e sem leite passam`, () => {
      assert.deepEqual(FREE.filter(name => blocked(name, diet)), []);
    });
    it(`${diet}: "sem lactose" não libera o chocolate`, () => {
      assert.equal(blocked('Chocolate sem lactose', diet), true);
      assert.equal(blocked('Lactose-free chocolate', diet), true);
    });
  }

  it('a lista é a mesma das alergias: o que barra na dieta barra na alergia a leite, e vice-versa', () => {
    const milk = { common: ['milk' as const], custom: [] };
    for (const name of [...BLOCKED, ...FREE]) {
      assert.equal(findAllergensInName(name, milk).common.length > 0, blocked(name, 'dairy_free'), name);
    }
  });

  it('nut_free, no_added_sugar e sem dieta: nada muda', () => {
    for (const name of BLOCKED) {
      assert.equal(validateRecipeRestrictions(recipe(name), [], 'ProPlus').compliant, true, name);
      assert.equal(validateRecipeRestrictions(recipe(name), ['nut_free'], 'ProPlus').compliant, true, name);
    }
  });

  it('"sabor chocolate" não fura a dieta: "Chocolate" barra, "Cacau em pó" passa', () => {
    const options = { explicitRequest: 'shake sabor chocolate' };
    assert.equal(validateRecipeRestrictions(recipe('Chocolate'), ['vegan'], 'ProPlus', options).compliant, false);
    assert.equal(validateRecipeRestrictions(recipe('Cacau em pó'), ['vegan'], 'ProPlus', options).compliant, true);
  });

  it('pedido nomeando o chocolate com leite fura a dieta, com dietOverrideIngredientIndexes', () => {
    for (const [message, name] of [
      ['hoje quero com chocolate ao leite', 'Chocolate ao leite'],
      ['with milk chocolate today', 'Milk chocolate'],
      ['quero com chocolate branco', 'Chocolate branco'],
      ['com achocolatado', 'Achocolatado'],
    ] as const) {
      const result = validateRecipeRestrictions(recipe(name), ['vegan'], 'ProPlus', { explicitRequest: message });
      assert.deepEqual(result, { compliant: true, dietOverrideIngredientIndexes: [0] }, message);
    }
  });

  it('título "Shake de chocolate" passa; o chocolate do ingrediente é que é conferido', () => {
    const titled = recipe('Cacau em pó', { title: 'Shake de chocolate' });
    assert.equal(validateRecipeRestrictions(titled, ['vegan'], 'ProPlus').compliant, true);
    assert.equal(validateRecipeRestrictions(titled, ['dairy_free'], 'ProPlus').compliant, true);
  });

  it('alergias do CP-B6/B6a: nada muda (lactose ainda liberada por "sem lactose")', () => {
    const lactose = buildAllergyRestrictions({ common: ['lactose'], custom: [] });
    assert.equal(validateRecipeRestrictions(recipe('Chocolate sem lactose'), [], 'ProPlus', { allergies: lactose }).compliant, true);
  });
});

describe('CP-B6b — Home: receitas compatíveis por goal', () => {
  it('contagem para vegan e dairy_free (marcação dairy/animal inalterada)', async () => {
    // O teste de marcação (homeRecipeMarkings.test.ts) confere cada receita com o validador;
    // aqui só a contagem de referência, carregada do mesmo arquivo de dados.
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const dataModule = (await import(pathToFileURL(path.resolve(__dirname, '../../../mobile/src/components/home/dailyRecipes.data.ts')).href)) as {
      DAILY_RECIPES: Record<string, Array<{ contains: readonly string[] }>>;
    };
    const counts = Object.fromEntries(USER_GOAL_VALUES.map(goal => [goal, {
      vegan: dataModule.DAILY_RECIPES[goal].filter(r => isHomeRecipeAllowed(r as never, ['vegan'], 'ProPlus')).length,
      dairy_free: dataModule.DAILY_RECIPES[goal].filter(r => isHomeRecipeAllowed(r as never, ['dairy_free'], 'ProPlus')).length,
    }]));
    // Mesmas contagens de antes do CP-B6b: nenhuma receita da Home usa chocolate (só cacau).
    assert.deepEqual(counts, {
      Muscle: { vegan: 3, dairy_free: 3 },
      Wellness: { vegan: 2, dairy_free: 2 },
      Energy: { vegan: 6, dairy_free: 7 },
      Recovery: { vegan: 4, dairy_free: 4 },
      WeightLoss: { vegan: 8, dairy_free: 9 },
    });
  });
});
