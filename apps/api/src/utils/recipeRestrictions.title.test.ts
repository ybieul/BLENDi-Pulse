// Pós CP-B5 — título conferido: as mesmas regras de dieta (listas,
// normalização, negação) e a lista de bebidas alcoólicas. No lote 9 uma
// conta vegana recebeu uma receita vegana com "Whey" no título, puxado da
// mensagem anterior.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BlendiModel, DietaryPreference } from '../models/User';
import {
  buildRecipeRestrictionRetryMessage,
  validateRecipeRestrictions,
  type RecipeRestrictionOptions,
  type RestrictedRecipe,
} from './recipeRestrictions.utils';

function recipeOf(title: string, names: string[]): RestrictedRecipe {
  return {
    title,
    ingredients: names.map(name => ({ name, amount: '1' })),
    blendInstruction: 'Bata por 40 segundos.',
  };
}

function check(
  title: string,
  names: string[],
  diet: DietaryPreference[],
  options: RecipeRestrictionOptions = {},
  model: BlendiModel = 'ProPlus'
) {
  return validateRecipeRestrictions(recipeOf(title, names), diet, model, options);
}

const VEGAN_SHAKE = ['Banana', 'Aveia em flocos', 'Proteína vegetal de ervilha', 'Leite de aveia'];

describe('título — dieta', () => {
  it('vegana, sem pedido: "Whey" no título de receita vegana é barrado (lote 9)', () => {
    assert.deepEqual(check('Shake de Banana com Aveia e Whey', VEGAN_SHAKE, ['vegan'], { explicitRequest: 'shake com banana' }), {
      compliant: false,
      violations: [{ restriction: 'vegan', term: 'whey', field: 'title' }],
    });
  });

  it('vegana que pediu whey e recebeu whey: o título com whey passa, com o aviso no ingrediente', () => {
    assert.deepEqual(
      check('Shake de Morango com Whey', ['Whey protein', 'Morango', 'Leite de aveia'], ['vegan'], {
        explicitRequest: 'hoje quero com whey',
      }),
      { compliant: true, dietOverrideIngredientIndexes: [0] }
    );
  });

  it('pedido sem o ingrediente na receita: o título não pode citar whey', () => {
    assert.deepEqual(check('Shake com Whey', VEGAN_SHAKE, ['vegan'], { explicitRequest: 'hoje quero com whey' }), {
      compliant: false,
      violations: [{ restriction: 'vegan', term: 'whey', field: 'title' }],
    });
  });

  it('o pedido libera só o termo pedido: mel no título continua barrado', () => {
    const result = check('Shake de Whey com Mel', ['Whey protein', 'Banana'], ['vegan'], {
      explicitRequest: 'quero com whey',
    });
    assert.deepEqual(result, {
      compliant: false,
      violations: [{ restriction: 'vegan', term: 'mel', field: 'title' }],
    });
  });

  it('negação no pedido não libera: "sem whey" e o título com whey é barrado', () => {
    assert.equal(check('Shake com Whey', ['Whey protein'], ['vegan'], { explicitRequest: 'shake sem whey' }).compliant, false);
  });

  for (const title of [
    'Smoothie sem amendoim',
    'Peanut-free smoothie',
    'Peanut free smoothie',
    'Smoothie livre de castanhas',
    'Nut-Free Banana Shake',
  ]) {
    it(`nut_free: "${title}" passa (negação "sem"/"-free"/"livre de")`, () => {
      assert.deepEqual(check(title, ['Banana', 'Sementes de girassol'], ['nut_free']), { compliant: true });
    });
  }

  it('nut_free: "Smoothie de Amendoim" é barrado', () => {
    assert.deepEqual(check('Smoothie de Amendoim', ['Banana'], ['nut_free']), {
      compliant: false,
      violations: [{ restriction: 'nut_free', term: 'amendoim', field: 'title' }],
    });
  });

  it('qualificador vegetal vale no título como nos ingredientes', () => {
    assert.deepEqual(check('Shake de Leite de Coco e Manteiga de Cacau', ['Leite de coco'], ['vegan', 'dairy_free']), {
      compliant: true,
    });
    assert.deepEqual(check('Sugar-Free Berry Smoothie', ['Morango'], ['no_added_sugar']), { compliant: true });
  });

  it('Pantry (sem pedido): o título passa a ser conferido na dieta; álcool continua fora', () => {
    assert.deepEqual(check('Smoothie com Whey', ['Banana'], ['vegan']), {
      compliant: false,
      violations: [{ restriction: 'vegan', term: 'whey', field: 'title' }],
    });
    assert.deepEqual(check('Banana com Rum', ['Banana'], []), { compliant: true });
  });

  it('Lite: gelo/congelado no título não é conferido (regra do Lite sem mudança)', () => {
    assert.deepEqual(check('Frozen Berry Smoothie', ['Morango fresco'], [], {}, 'Lite'), { compliant: true });
  });
});

describe('título — álcool', () => {
  const VIRGIN = ['Morango', 'Limão', 'Água com gás'];

  for (const title of [
    'Caipirinha de Morango',
    'Piña Colada',
    'Mojito de Limão',
    'Virgin Piña Colada',
    'Caipirinha de Morango sem Álcool',
    'Caipirinha de Morango sem Cachaça',
    'Rum-free Piña Colada',
    'Non-alcoholic Mojito',
  ]) {
    it(`versão sem álcool: "${title}" passa (nome de drink, negação)`, () => {
      assert.deepEqual(check(title, VIRGIN, [], { alcohol: 'forbidden' }), { compliant: true });
    });
  }

  for (const [title, term] of [
    ['Caipirinha de Morango com Cachaça', 'cachaca'],
    ['Rum Shake', 'rum'],
    ['Shake com Rum', 'rum'],
    ['Piña Colada with Rum', 'rum'],
  ] as const) {
    it(`versão sem álcool: "${title}" é barrado`, () => {
      assert.deepEqual(check(title, VIRGIN, [], { alcohol: 'forbidden' }), {
        compliant: false,
        violations: [{ restriction: 'no_alcohol', term, field: 'title' }],
      });
    });
  }

  it('o pedido explícito nunca libera álcool no título', () => {
    assert.equal(
      check('Caipirinha com Cachaça', VIRGIN, [], { alcohol: 'forbidden', explicitRequest: 'caipirinha com cachaça' }).compliant,
      false
    );
  });

  it('21+ que pediu: "Caipirinha com Cachaça" passa (o teto não olha o título)', () => {
    const recipe = { ...recipeOf('Caipirinha com Cachaça', ['Cachaça', 'Limão']), alcoholGrams: 16 };
    assert.deepEqual(validateRecipeRestrictions(recipe, [], 'ProPlus', { alcohol: 'allowed' }), { compliant: true });
  });
});

describe('título — mensagem da nova tentativa', () => {
  it('diz que o título é o problema e pede um título só com ingredientes da receita', () => {
    const recipe = recipeOf('Shake com Whey', VEGAN_SHAKE);
    const result = validateRecipeRestrictions(recipe, ['vegan'], 'ProPlus');
    assert.equal(result.compliant, false);
    if (result.compliant) return;

    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.match(message, /the title uses "whey", which violates the vegan restriction/);
    assert.match(message, /Rename the title so it names only ingredients that are in this recipe/);
    assert.doesNotMatch(message, /drink name/);
  });

  it('álcool no título: pode manter o nome do drink, nunca o destilado', () => {
    const recipe = recipeOf('Caipirinha com Cachaça', ['Morango', 'Limão']);
    const result = validateRecipeRestrictions(recipe, [], 'ProPlus', { alcohol: 'forbidden' });
    assert.equal(result.compliant, false);
    if (result.compliant) return;

    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.match(message, /may keep the drink name/);
  });

  it('sem violação no título: a mensagem é a de antes (sem a linha do título)', () => {
    const recipe = recipeOf('Shake', ['Whey protein']);
    const result = validateRecipeRestrictions(recipe, ['vegan'], 'ProPlus');
    assert.equal(result.compliant, false);
    if (result.compliant) return;

    assert.doesNotMatch(buildRecipeRestrictionRetryMessage(recipe, result.violations), /title/);
  });
});
