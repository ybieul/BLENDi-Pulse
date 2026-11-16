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
  it('Lite e Pro+ 400 ml (13,5 oz); Steel 600 ml (20,2 oz); proteína inalterada', () => {
    assert.deepEqual(BLENDER_LIMITS.Lite, { maxVolumeMl: 400, maxVolumeOz: 13.5, maxProteinGrams: 35 });
    assert.deepEqual(BLENDER_LIMITS.ProPlus, { maxVolumeMl: 400, maxVolumeOz: 13.5, maxProteinGrams: 45 });
    assert.deepEqual(BLENDER_LIMITS.Steel, { maxVolumeMl: 600, maxVolumeOz: 20.2, maxProteinGrams: 55 });
  });

  it('o oz mostrado, convertido de volta, nunca passa do limite em ml', () => {
    for (const limit of Object.values(BLENDER_LIMITS)) {
      assert.ok(limit.maxVolumeOz * ML_PER_US_FLUID_OUNCE <= limit.maxVolumeMl, JSON.stringify(limit));
      // e é o maior valor com uma casa decimal que respeita isso (arredondado para baixo)
      assert.ok((limit.maxVolumeOz + 0.1) * ML_PER_US_FLUID_OUNCE > limit.maxVolumeMl, JSON.stringify(limit));
    }
  });
});

describe('validateBlenderLimits', () => {
  const base = { macros: { protein: 30, carbs: 20, fat: 5, calories: 245 }, ingredients: [{ name: 'Milk', amount: '300 ml' }] };

  it('dentro dos dois limites', () => {
    assert.deepEqual(validateBlenderLimits(base, 'Lite'), { withinLimits: true });
  });

  it('exatamente no limite passa; 1 acima não', () => {
    assert.ok(validateBlenderLimits({ ...base, macros: { ...base.macros, protein: 35 } }, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits({ ...base, macros: { ...base.macros, protein: 35.5 } }, 'Lite').withinLimits);
    assert.ok(validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '400 ml' }] }, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '401 ml' }] }, 'Lite').withinLimits);
    assert.ok(validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '400 ml' }] }, 'ProPlus').withinLimits);
    assert.ok(!validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '401 ml' }] }, 'ProPlus').withinLimits);
    assert.ok(validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '600 ml' }] }, 'Steel').withinLimits);
    assert.ok(!validateBlenderLimits({ ...base, ingredients: [{ name: 'Milk', amount: '601 ml' }] }, 'Steel').withinLimits);
  });

  it('acusa proteína e volume juntos, e a mensagem de retry cita os dois', () => {
    const result = validateBlenderLimits(
      { macros: { protein: 40, carbs: 20, fat: 5, calories: 285 }, ingredients: [{ name: 'Milk', amount: '3 cups' }] },
      'Lite'
    );
    assert.equal(result.withinLimits, false);
    if (result.withinLimits) return;
    assert.deepEqual(result.violation, {
      protein: { declaredProtein: 40, maxProteinGrams: 35 },
      volume: { estimatedVolumeMl: 710, maxVolumeMl: 400, maxVolumeOz: 13.5 },
    });
    const message = buildBlenderLimitRetryMessage(result.violation);
    assert.match(message, /40g of protein/);
    assert.match(message, /about 710ml/);
  });

  it('cada modelo usa o próprio limite', () => {
    const recipe = { macros: { protein: 50, carbs: 20, fat: 5, calories: 325 }, ingredients: [{ name: 'Milk', amount: '600 ml' }] };
    assert.ok(!validateBlenderLimits(recipe, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits(recipe, 'ProPlus').withinLimits);
    assert.ok(validateBlenderLimits(recipe, 'Steel').withinLimits);
  });
});
