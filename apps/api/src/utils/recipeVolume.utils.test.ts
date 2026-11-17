// CP-1.1.9 — estimativa de volume das receitas da IA e validação do limite
// físico (proteína + volume), incluindo entradas adversariais.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BLENDER_LIMITS, ML_PER_US_FLUID_OUNCE } from '@blendi/shared';

import { buildBlenderLimitRetryMessage, validateBlenderLimits } from './blenderGuardrail.utils';
import { estimateAmountVolumeMl, estimateRecipeVolumeMl } from './recipeVolume.utils';

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

  it('unidades sem medida devolvem null', () => {
    for (const amount of ['1 scoop', '1 medium', '2 kiwis', '1 large banana', '1 green apple', '1 shot', 'a pinch', '', 'to taste']) {
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
      estimateRecipeVolumeMl([{ amount: '1 banana' }, { amount: '250 ml' }, { amount: '1 scoop (30g)' }]),
      { estimatedVolumeMl: 280, unmeasured: ['1 banana'] }
    );
  });

  it('entradas hostis não quebram nem inflam o total', () => {
    const hostile = [
      { amount: '1e9 ml' }, // notação científica: lê só "1"... e não "e9 ml"
      { amount: '-500 ml' },
      { amount: '9'.repeat(5000) },
      { amount: '((((((((((' },
      { amount: '1/0 cup' },
      { amount: 'NaN ml' },
      { amount: '\u0000‮200 ml' },
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
      volume: { estimatedVolumeMl: 710, maxVolumeMl: 400, maxVolumeOz: 13.5 },
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
