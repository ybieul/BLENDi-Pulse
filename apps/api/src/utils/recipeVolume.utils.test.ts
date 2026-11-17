// CP-1.1.9 — estimativa de volume das receitas da IA e validação do limite
// físico (proteína + volume), incluindo entradas adversariais.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BLENDER_LIMITS, ML_PER_US_FLUID_OUNCE } from '@blendi/shared';

import { buildBlenderLimitRetryMessage, validateBlenderLimits } from './blenderGuardrail.utils';
import { UNIT_WEIGHTS, findUnitIngredientWeight } from './ingredientWeights.utils';
import { estimateAmountVolumeMl, estimateIngredientVolumeMl, estimateRecipeVolumeMl } from './recipeVolume.utils';

function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 0.5, `${actual} ≈ ${expected}`);
}

describe('estimateAmountVolumeMl — unidades', () => {
  const cases: Array<[string, number]> = [
    ['30g', 30], ['100 g', 100], ['40 gramas', 40], ['1 kg', 1000],
    ['200ml', 200], ['200 mL', 200], ['0.25 l', 250], ['1 litro', 1000], ['1,5 L', 1500],
    ['1 cup', 236.6], ['1/2 cup', 118.3], ['1 1/2 cups', 354.9], ['½ xícara', 118.3], ['1,5 xícara', 354.9],
    ['1 tbsp', 14.8], ['2 colheres de sopa', 29.6], ['1 tsp', 4.9], ['1 colher de chá', 4.9], ['1 colher', 4.9],
    ['8 fl oz', 236.6], ['1 oz', 28.35], ['1 lb', 453.6],
    ['1 scoop (30g)', 30], ['1 tbsp (12g)', 12], ['1 cup (240 ml)', 240],
    ['2-3 tbsp', 29.6], ['3 a 4 colheres de sopa', 44.4],
  ];
  for (const [amount, expected] of cases) {
    it(`"${amount}" ≈ ${expected} ml`, () => close(estimateAmountVolumeMl(amount), expected));
  }

  it('unidades sem medida e sem item da tabela por unidade devolvem null', () => {
    // CP-A: "2 kiwis", "1 large banana" e "1 green apple" passaram a contar
    // (ver o bloco "itens por unidade" abaixo).
    for (const amount of ['1 scoop', '1 medium', '1 shot', '1 dose', 'a pinch', '', 'to taste']) {
      assert.equal(estimateAmountVolumeMl(amount), null, amount);
    }
  });

  it('palavras que começam como unidade não viram unidade ("1 large", "2 grapefruits", "1 cupcake")', () => {
    for (const amount of ['1 large', '2 grapefruits', '1 cupcake', '1 lime', '3 mlk']) {
      assert.equal(estimateAmountVolumeMl(amount), null, amount);
    }
  });
});

describe('estimateRecipeVolumeMl — limite inferior', () => {
  it('soma o que dá para medir e lista o resto', () => {
    assert.deepEqual(
      estimateRecipeVolumeMl([{ name: '', amount: '1 lime' }, { name: '', amount: '250 ml' }, { name: '', amount: '1 scoop (30g)' }]),
      { estimatedVolumeMl: 280, unmeasured: ['1 lime'] }
    );
  });

  it('entradas hostis não quebram nem inflam o total', () => {
    const hostile = [
      { name: '', amount: '1e9 ml' }, // notação científica: lê só "1"... e não "e9 ml"
      { name: '', amount: '-500 ml' },
      { name: '', amount: '9'.repeat(5000) },
      { name: '', amount: '((((((((((' },
      { name: '', amount: '1/0 cup' },
      { name: '', amount: 'NaN ml' },
      { name: '', amount: '\u0000‮200 ml' },
    ];
    const started = Date.now();
    const { estimatedVolumeMl } = estimateRecipeVolumeMl(hostile);
    assert.ok(Number.isFinite(estimatedVolumeMl));
    assert.ok(Date.now() - started < 200, 'sem backtracking catastrófico');
  });

  it('texto gigante com muitos parênteses termina rápido', () => {
    const started = Date.now();
    estimateAmountVolumeMl(`${'(1 '.repeat(20000)}g)`);
    estimateAmountVolumeMl(`1 ${'a '.repeat(20000)}`);
    assert.ok(Date.now() - started < 500);
  });
});

describe('BLENDER_LIMITS — ml é a fonte da verdade, oz derivado para baixo', () => {
  // CP-B2: o teto de proteína (maxProteinGrams) saiu; só o volume.
  it('Lite e Pro+ 400 ml (13,5 oz); Steel 600 ml (20,2 oz); sem teto de proteína', () => {
    assert.deepEqual(BLENDER_LIMITS.Lite, { maxVolumeMl: 400, maxVolumeOz: 13.5 });
    assert.deepEqual(BLENDER_LIMITS.ProPlus, { maxVolumeMl: 400, maxVolumeOz: 13.5 });
    assert.deepEqual(BLENDER_LIMITS.Steel, { maxVolumeMl: 600, maxVolumeOz: 20.2 });
  });

  it('o oz mostrado, convertido de volta, nunca passa do limite em ml', () => {
    for (const limit of Object.values(BLENDER_LIMITS)) {
      assert.ok(limit.maxVolumeOz * ML_PER_US_FLUID_OUNCE <= limit.maxVolumeMl, JSON.stringify(limit));
      // e é o maior valor com uma casa decimal que respeita isso (arredondado para baixo)
      assert.ok((limit.maxVolumeOz + 0.1) * ML_PER_US_FLUID_OUNCE > limit.maxVolumeMl, JSON.stringify(limit));
    }
  });
});

describe('estimateAmountVolumeMl — frações e unidades em pt-BR (CP-B2)', () => {
  const cases: Array<[string, number]> = [
    ['1/4 cup', 59.15],
    ['1/3 cup', 78.87],
    ['1/2 cup', 118.3],
    ['2/3 cup', 157.73],
    ['3/4 cup', 177.45],
    ['1 1/2 cups', 354.9],
    ['1/3 de xícara', 78.87],
    ['1/4 de xícara', 59.15],
    ['3/4 de xícara', 177.45],
    ['1 1/2 xícara', 354.9],
    ['½ xícara', 118.3],
    ['1 colher de sopa', 14.79],
    ['2 colheres de sopa', 29.57],
    ['1/2 colher (sopa)', 7.39],
    ['1 colher de chá', 4.93],
    ['2 colheres (chá)', 9.86],
    ['8 fl oz', 236.59],
    ['8 onças fluidas', 236.59],
    ['1 onça fluida', 29.57],
    ['2 onças', 56.7],
    ['2 oz', 56.7],
    ['1 tbsp', 14.79],
    ['1/2 tsp', 2.46],
  ];

  for (const [amount, expected] of cases) {
    it(`"${amount}" ≈ ${expected} ml`, () => {
      const value = estimateAmountVolumeMl(amount);
      assert.ok(value !== null, `não leu "${amount}"`);
      assert.ok(Math.abs(value - expected) < 0.05, `"${amount}" → ${value}`);
    });
  }
});

describe('validateBlenderLimits — só o volume (CP-B2)', () => {
  const base = { ingredients: [{ name: 'Milk', amount: '300 ml' }] };

  it('dentro do limite', () => {
    assert.deepEqual(validateBlenderLimits(base, 'Lite'), { withinLimits: true });
  });

  it('exatamente no limite passa; 1 acima não', () => {
    assert.ok(validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '400 ml' }] }, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '401 ml' }] }, 'Lite').withinLimits);
    assert.ok(validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '400 ml' }] }, 'ProPlus').withinLimits);
    assert.ok(!validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '401 ml' }] }, 'ProPlus').withinLimits);
    assert.ok(validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '600 ml' }] }, 'Steel').withinLimits);
    assert.ok(!validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '601 ml' }] }, 'Steel').withinLimits);
  });

  it('70 g de proteína com volume dentro do copo passa no Lite (3 scoops de whey + 300 ml de leite)', () => {
    const recipe = {
      macros: { protein: 70, carbs: 25, fat: 8, calories: 452 },
      ingredients: [
        { name: 'Whey protein isolate', amount: '90 g' },
        { name: 'Milk', amount: '300 ml' },
      ],
    };
    assert.deepEqual(validateBlenderLimits(recipe, 'Lite'), { withinLimits: true });
  });

  it('acima do volume: só o volume na violação, e a mensagem pede o mesmo título e o capacityNotice', () => {
    const result = validateBlenderLimits({ ingredients: [{ name: 'Milk', amount: '3 cups' }] }, 'Lite');
    assert.equal(result.withinLimits, false);
    if (result.withinLimits) return;
    assert.deepEqual(result.violation, {
      volume: { model: 'Lite', estimatedVolumeMl: 710, maxVolumeMl: 400, maxVolumeOz: 13.5 },
    });
    const message = buildBlenderLimitRetryMessage(result.violation);
    assert.match(message, /about 710ml/);
    assert.match(message, /same title/);
    assert.match(message, /compact, mini, small, compacto or pequeno/);
    assert.match(message, /capacityNotice/);
    assert.doesNotMatch(message, /protein guardrail|g of protein|maximum allowed/i);
    assert.match(message, /about 90% of the limit \(around 360ml\)/);
  });

  it('cada modelo usa o próprio limite', () => {
    const recipe = { ingredients: [{ name: 'Milk', amount: '600 ml' }] };
    assert.ok(!validateBlenderLimits(recipe, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits(recipe, 'ProPlus').withinLimits);
    assert.ok(validateBlenderLimits(recipe, 'Steel').withinLimits);
  });
});

describe('CP-A — itens por unidade (tabela USDA, tamanho médio)', () => {
  const amountOnly: Array<[string, number]> = [
    ['1 medium banana', 118], ['1 banana', 118], ['2 bananas', 236], ['1/2 banana', 59], ['½ banana', 59],
    ['1 1/2 bananas', 177], ['1 large banana', 118], ['2 ripe bananas', 236],
    ['1 kiwi', 69], ['2 kiwis', 138], ['1 orange', 131], ['1 laranja', 131],
    ['1 maçã média', 182], ['1 green apple', 182], ['1 pera', 178], ['1 medium pear', 178], ['1 pêssego', 150],
    ['1 cenoura média', 61], ['1 medium carrot', 61], ['2 tâmaras', 48], ['3 dates', 72],
    ['1/4 de abacate', 50.25], ['1/4 avocado', 50.25],
    ['1 talo de aipo', 40], ['1 stalk celery', 40], ['1 celery stalk', 40],
    ['1 punhado de espinafre', 30], ['1 punhado de couve', 30], ['1 handful spinach', 30], ['1 handful of kale', 30],
    ['1 dose de espresso', 30], ['1 espresso shot', 30], ['2 shots of espresso', 60],
  ];
  for (const [amount, expected] of amountOnly) {
    it(`"${amount}" ≈ ${expected} ml`, () => close(estimateAmountVolumeMl(amount), expected));
  }

  // Nome e quantidade separados, como nas receitas da Home e da IA.
  const withName: Array<[string, string, number]> = [
    ['Banana', '1 unidade média', 118],
    ['Banana', '1 medium', 118],
    ['Frozen banana', '1', 118],
    ['Banana madura', '1 1/2', 177],
    ['Tâmaras', '2', 48],
    ['Dates', '2', 48],
    ['Kiwi', '2', 138],
    ['Kiwis', '3 units', 207],
    ['Green apple', '1 medium', 182],
    ['Maçã verde', '1 unidade média', 182],
    ['Avocado', '1/4 fruit', 50.25],
    ['Abacate', '1/4 fruta', 50.25],
    ['Celery', '1 stalk', 40],
    ['Aipo', '1 talo', 40],
    ['Spinach', '1 handful', 30],
    ['Couve', '1 punhado', 30],
    ['Whey protein', '1 scoop', 30],
    ['Whey protein', '1 dose', 30],
    ['Chocolate whey protein', '1 scoop', 30],
    ['Plant protein powder', '1 scoop', 30],
    ['Proteína vegetal em pó', '1 dose', 30],
    ['Espresso shot', '1', 30],
    ['Dose de espresso', '1', 30],
  ];
  for (const [name, amount, expected] of withName) {
    it(`"${amount}" de "${name}" ≈ ${expected} ml`, () => close(estimateIngredientVolumeMl({ name, amount }), expected));
  }

  it('medida de peso ou volume continua valendo antes da unidade ("1 medium (140g)", "100 g de banana")', () => {
    close(estimateIngredientVolumeMl({ name: 'Kiwi', amount: '2 medium (140g)' }), 140);
    close(estimateIngredientVolumeMl({ name: 'Banana', amount: '100 g' }), 100);
    close(estimateIngredientVolumeMl({ name: 'Banana', amount: '1 cup' }), 150);
  });

  it('sem casar com a tabela, continua contando 0 (null)', () => {
    const cases: Array<[string, string]> = [
      ['Lime', '1'], ['Strawberries', '6 units'], ['Ice cubes', '4'], ['Ginger', '1 piece'],
      ['', '1 scoop'], ['Cacao powder', '1 scoop'], ['Spinach', '1'], ['Espinafre', '4 folhas'],
      ['Celery', '1'], ['Banana', '2 slices'], ['Banana', '1 lata'], ['Banana milk', '1'],
      ['Leite de banana', '1 unidade'], ['Couve-flor', '1 punhado'], ['Coffee', '1 cup (240 ml) brewed'],
    ];
    for (const [name, amount] of cases) {
      const value = estimateIngredientVolumeMl({ name, amount });
      if (name === 'Coffee') {
        assert.equal(value, 240, 'medida entre parênteses');
        continue;
      }
      assert.equal(value, null, `"${amount}" de "${name}" → ${value}`);
    }
  });

  it('a unidade exigida decide: "1 dose" de proteína é o scoop; "1 dose de pó de maca" não é maçã', () => {
    assert.equal(findUnitIngredientWeight('dose', 'Proteína de banana')?.id, 'protein_powder');
    assert.equal(findUnitIngredientWeight('dose de po de maca', ''), null);
    assert.equal(findUnitIngredientWeight('', 'Maçã')?.id, 'apple');
  });

  it('um peso por constante, todos positivos', () => {
    for (const [key, value] of Object.entries(UNIT_WEIGHTS)) {
      assert.ok(Number.isFinite(value) && value > 0, key);
    }
  });

  it('estimateRecipeVolumeMl soma as unidades e só lista o que não casou', () => {
    assert.deepEqual(
      estimateRecipeVolumeMl([
        { name: 'Whey protein', amount: '1 scoop' },
        { name: 'Banana', amount: '1 medium' },
        { name: 'Almond milk', amount: '250ml' },
        { name: 'Lime', amount: '1' },
      ]),
      { estimatedVolumeMl: 398, unmeasured: ['1'] }
    );
  });

  it('entrada longa com muitas palavras termina rápido', () => {
    const started = Date.now();
    estimateIngredientVolumeMl({ name: 'banana '.repeat(5000), amount: `1 ${'medium '.repeat(5000)}` });
    assert.ok(Date.now() - started < 1000);
  });
});

describe('CP-A — "fluid oz" e concentrados líquidos (ajustes 7 e 8)', () => {
  const fluidOz: Array<[string, number]> = [
    ['8 fluid oz', 236.6], ['4 fluid oz', 118.3], ['1 fluid oz', 29.6],
    ['8 fl oz', 236.6], ['8 fluid ounces', 236.6], ['1 fluid ounce', 29.6],
  ];
  for (const [amount, expected] of fluidOz) {
    it(`"${amount}" ≈ ${expected} ml`, () => close(estimateAmountVolumeMl(amount), expected));
  }

  it('"fluid oz" no nome + quantidade da IA (o caso do lote da auditoria)', () => {
    close(estimateIngredientVolumeMl({ name: 'Almond milk', amount: '8 fluid oz' }), 236.6);
    close(estimateIngredientVolumeMl({ name: 'Coffee', amount: '4 fluid oz' }), 118.3);
  });

  it('concentrado de cereja conta a medida (líquido), não a cereja em pedaços', () => {
    const cases: Array<[string, string, number]> = [
      ['Unsweetened tart cherry concentrate', '2 tbsp', 29.6],
      ['Concentrado de cereja ácida sem açúcar', '2 colher(es) de sopa', 29.6],
      ['Tart cherry concentrate', '1/4 cup', 59.2],
      ['Concentrado de suco de uva', '1 colher de sopa', 14.8],
      ['Maple syrup', '1 tbsp', 14.8],
      ['Xarope de agave', '1 colher de sopa', 14.8],
    ];
    for (const [name, amount, expected] of cases) close(estimateIngredientVolumeMl({ name, amount }), expected);
    // Antes do ajuste 8, o nome casava com "cherry" (154 g/xícara): 2 tbsp = 19,3 ml.
    assert.ok((estimateIngredientVolumeMl({ name: 'Cherries', amount: '2 tbsp' }) ?? 0) < 20);
  });

  it('"whey protein concentrate" continua sendo pó (scoop e xícara pelo peso típico)', () => {
    close(estimateIngredientVolumeMl({ name: 'Whey protein concentrate', amount: '1 scoop' }), 30);
    close(estimateIngredientVolumeMl({ name: 'Whey protein concentrate', amount: '1/3 cup' }), 30);
    close(estimateIngredientVolumeMl({ name: 'Whey protein concentrado', amount: '1 dose' }), 30);
  });
});
