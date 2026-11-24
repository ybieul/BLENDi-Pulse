// CP-B7 — valores pedidos: leitura (en e pt-BR, exato/mínimo/máximo/faixa,
// vírgula e ponto), conferência com ±10%, sugestão do Pantry pela dieta.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TARGET_TOLERANCE_PERCENT,
  findUnmetTargets,
  isTargetMet,
  parseRequestedTargets,
  suggestionForUnmetTarget,
  type RequestedTarget,
} from './requestedTargets.utils';

function parse(text: string) {
  return parseRequestedTargets(text);
}

describe('CP-B7 — leitura dos valores pedidos', () => {
  it('exato, pt-BR e en, com e sem espaço, gramas por extenso, kcal e calorias', () => {
    const cases: Array<[string, RequestedTarget]> = [
      ['shake com 30 g de proteína', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['30g de proteina', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['30 gramas de proteína', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['protein 30 g', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['proteína: 30g', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['a shake with 30 grams of protein', { nutrient: 'protein', kind: 'exact', value: 30 }],
      ['400 kcal', { nutrient: 'calories', kind: 'exact', value: 400 }],
      ['400 calorias', { nutrient: 'calories', kind: 'exact', value: 400 }],
      ['400 calories', { nutrient: 'calories', kind: 'exact', value: 400 }],
      ['50g carbs', { nutrient: 'carbs', kind: 'exact', value: 50 }],
      ['50 g de carbo', { nutrient: 'carbs', kind: 'exact', value: 50 }],
      ['50 g de carboidratos', { nutrient: 'carbs', kind: 'exact', value: 50 }],
      ['15 g de gordura', { nutrient: 'fat', kind: 'exact', value: 15 }],
      ['15g fat', { nutrient: 'fat', kind: 'exact', value: 15 }],
    ];
    for (const [text, expected] of cases) {
      assert.deepEqual(parse(text), [expected], text);
    }
  });

  it('decimal com vírgula e com ponto; milhar só nas calorias', () => {
    assert.deepEqual(parse('27,5 g de proteína'), [{ nutrient: 'protein', kind: 'exact', value: 27.5 }]);
    assert.deepEqual(parse('27.5g protein'), [{ nutrient: 'protein', kind: 'exact', value: 27.5 }]);
    assert.deepEqual(parse('shake de 1.200 kcal'), [{ nutrient: 'calories', kind: 'exact', value: 1200 }]);
  });

  it('mínimo: "pelo menos", "no mínimo", "at least", "ou mais", "+"', () => {
    for (const text of ['pelo menos 30 g de proteína', 'no mínimo 30 g de proteína', 'at least 30g of protein', '30 g ou mais de proteína', '30 g de proteína ou mais', '30g+ protein', 'mais de 30 g de proteína']) {
      assert.deepEqual(parse(text), [{ nutrient: 'protein', kind: 'min', value: 30 }], text);
    }
  });

  it('máximo: "até", "no máximo", "at most", "under", "menos de", "up to"', () => {
    for (const text of ['até 300 kcal', 'no máximo 300 kcal', 'at most 300 kcal', 'under 300 kcal', 'menos de 300 calorias', 'up to 300 calories', '300 kcal ou menos']) {
      assert.deepEqual(parse(text), [{ nutrient: 'calories', kind: 'max', value: 300 }], text);
    }
    assert.deepEqual(parse('menos de 10 g de gordura'), [{ nutrient: 'fat', kind: 'max', value: 10 }]);
  });

  it('faixa: "entre 20 e 30 g", "20-30 g", "de 20 a 30 g", "between 300 and 400 calories"', () => {
    assert.deepEqual(parse('entre 20 e 30 g de proteína'), [{ nutrient: 'protein', kind: 'range', value: 20, max: 30 }]);
    assert.deepEqual(parse('20-30 g protein'), [{ nutrient: 'protein', kind: 'range', value: 20, max: 30 }]);
    assert.deepEqual(parse('de 20 a 30 g de carboidratos'), [{ nutrient: 'carbs', kind: 'range', value: 20, max: 30 }]);
    assert.deepEqual(parse('between 300 and 400 calories'), [{ nutrient: 'calories', kind: 'range', value: 300, max: 400 }]);
  });

  it('vários nutrientes na mesma frase, um por nutriente, sem reaproveitar trecho', () => {
    assert.deepEqual(parse('at least 30g of protein and under 400 kcal'), [
      { nutrient: 'protein', kind: 'min', value: 30 },
      { nutrient: 'calories', kind: 'max', value: 400 },
    ]);
    assert.deepEqual(parse('30 g de proteína 40 g de carbo'), [
      { nutrient: 'protein', kind: 'exact', value: 30 },
      { nutrient: 'carbs', kind: 'exact', value: 40 },
    ]);
  });

  it('não é valor pedido: quantidade de ingrediente, sem número, palavra que contém "até"', () => {
    assert.deepEqual(parse('shake com 30 g de proteína em pó'), []);
    assert.deepEqual(parse('30g protein powder'), []);
    assert.deepEqual(parse('30 g de whey'), []);
    assert.deepEqual(parse('rico em proteína, low carb'), []);
    assert.deepEqual(parse('1 banana e 2 colheres de aveia'), []);
    assert.deepEqual(parse('abacate 300 kcal'), [{ nutrient: 'calories', kind: 'exact', value: 300 }]);
    assert.deepEqual(parse(''), []);
    assert.deepEqual(parseRequestedTargets(undefined), []);
  });
});

describe('CP-B7 — conferência com ±10%', () => {
  it('tolerância é constante única de 10%', () => {
    assert.equal(TARGET_TOLERANCE_PERCENT, 10);
  });

  it('exato: 30 pedido, 27,5 passa; 19,8 não', () => {
    const target: RequestedTarget = { nutrient: 'protein', kind: 'exact', value: 30 };
    assert.equal(isTargetMet(target, 27.5), true);
    assert.equal(isTargetMet(target, 33), true);
    assert.equal(isTargetMet(target, 19.8), false);
    assert.equal(isTargetMet(target, 34), false);
  });

  it('mínimo, máximo e faixa', () => {
    assert.equal(isTargetMet({ nutrient: 'protein', kind: 'min', value: 30 }, 27), true);
    assert.equal(isTargetMet({ nutrient: 'protein', kind: 'min', value: 30 }, 26.9), false);
    assert.equal(isTargetMet({ nutrient: 'calories', kind: 'max', value: 250 }, 275), true);
    assert.equal(isTargetMet({ nutrient: 'calories', kind: 'max', value: 250 }, 276), false);
    assert.equal(isTargetMet({ nutrient: 'protein', kind: 'range', value: 20, max: 30 }, 25), true);
    assert.equal(isTargetMet({ nutrient: 'protein', kind: 'range', value: 20, max: 30 }, 34), false);
  });

  it('findUnmetTargets confere os macros declarados', () => {
    const recipe = { macros: { protein: 19.8, carbs: 30, fat: 5, calories: 244 } };
    assert.deepEqual(
      findUnmetTargets(recipe, [{ nutrient: 'protein', kind: 'exact', value: 30 }, { nutrient: 'calories', kind: 'max', value: 300 }]),
      [{ nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8 }]
    );
    assert.deepEqual(
      findUnmetTargets(recipe, [{ nutrient: 'carbs', kind: 'range', value: 40, max: 50 }]),
      [{ nutrient: 'carbs', kind: 'range', requested: 40, requestedMax: 50, delivered: 30 }]
    );
  });
});

describe('CP-B7 — sugestão do Pantry respeita a dieta', () => {
  const below = (nutrient: 'protein' | 'carbs' | 'fat' | 'calories') => ({ nutrient, kind: 'exact' as const, requested: 30, delivered: 10 });

  it('proteína: whey ou proteína em pó; vegano/sem lactose → proteína vegetal', () => {
    assert.equal(suggestionForUnmetTarget(below('protein'), []), 'whey_or_protein_powder');
    assert.equal(suggestionForUnmetTarget(below('protein'), ['vegan']), 'plant_protein_powder');
    assert.equal(suggestionForUnmetTarget(below('protein'), ['dairy_free']), 'plant_protein_powder');
  });

  it('carboidrato, gordura e kcal; sem oleaginosas troca a pasta de amendoim', () => {
    assert.equal(suggestionForUnmetTarget(below('carbs'), []), 'oats_or_banana');
    assert.equal(suggestionForUnmetTarget(below('fat'), []), 'peanut_butter');
    assert.equal(suggestionForUnmetTarget(below('fat'), ['nut_free']), 'avocado_or_chia');
    assert.equal(suggestionForUnmetTarget(below('calories'), []), 'oats_or_peanut_butter');
    assert.equal(suggestionForUnmetTarget(below('calories'), ['nut_free']), 'oats_or_banana');
  });

  it('acima do pedido: sem sugestão (adicionar não ajuda)', () => {
    assert.equal(suggestionForUnmetTarget({ nutrient: 'calories', kind: 'max', requested: 250, delivered: 320 }, []), undefined);
  });
});
