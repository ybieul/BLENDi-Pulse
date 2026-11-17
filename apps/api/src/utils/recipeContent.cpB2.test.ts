// CP-B2 — utilitários do conteúdo das receitas: checagem objetiva dos passos
// (pulseCount sem gelo/congelado; inverter fora do Steel), água fora da foto
// no Pantry, saneamento do capacityNotice e do usesWaterNotInPhoto vindos da
// IA, e o schema do shared (capacityNotice opcional, saneado, com máximo).
// Também confere que o validador de dieta barra nomes em pt-BR (a visão
// agora devolve os ingredientes no idioma da conta).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  RECIPE_CAPACITY_NOTICE_MAX_LENGTH,
  createFavoriteSchema,
  pulseAiRecipeSchema,
  toPulseAiRecipePreview,
  type PulseAiRecipe,
} from '@blendi/shared';

import { prepareAiRecipePayload, truncateCapacityNotice } from './aiRecipePayload.utils';
import { validateRecipeRestrictions } from './recipeRestrictions.utils';
import { applyRecipeStepCheck, checkRecipeSteps, mentionsInvertingCup } from './recipeSteps.utils';
import { isPlainWater, markWaterNotInPhoto, usesWaterNotInPhoto } from './recipeWater.utils';

function recipe(overrides: Partial<PulseAiRecipe> = {}): PulseAiRecipe {
  return {
    title: 'Morango com Aveia',
    ingredients: [
      { name: 'Morango', amount: '150 g' },
      { name: 'Leite', amount: '200 ml' },
    ],
    macros: { protein: 10, carbs: 30, fat: 5, calories: 205 },
    prepTimeSeconds: 120,
    blendInstruction: 'Bata por 40 segundos.',
    hasSubstitutes: false,
    steps: [
      { text: 'Coloque o leite no copo.' },
      { text: 'Adicione o morango.', pulseCount: 5 },
      { text: 'Bata até ficar homogêneo.' },
    ],
    ...overrides,
  };
}

describe('CP-B2 — checagem objetiva dos passos', () => {
  it('pulseCount removido quando não há gelo nem congelado nos ingredientes', () => {
    const { recipe: checked, report } = checkRecipeSteps(recipe(), 'ProPlus');
    assert.equal(report.removedPulseCounts, 1);
    assert.deepEqual(checked.steps?.map(step => step.pulseCount), [undefined, undefined, undefined]);
    assert.equal(checked.steps?.[1].text, 'Adicione o morango.');
  });

  it('pulseCount mantido com gelo ou congelado (en e pt-BR)', () => {
    for (const name of ['Gelo', 'Ice cubes', 'Banana congelada', 'Frozen mango', 'Morangos congelados']) {
      const withFrozen = recipe({ ingredients: [{ name, amount: '100 g' }, { name: 'Leite', amount: '200 ml' }] });
      const { recipe: checked, report } = checkRecipeSteps(withFrozen, 'Steel');
      assert.equal(report.removedPulseCounts, 0, name);
      assert.equal(checked, withFrozen, name);
    }
  });

  it('"sem gelo" no nome não conta como gelo; receita sem pulseCount fica igual', () => {
    const { report } = checkRecipeSteps(recipe({ ingredients: [{ name: 'Café gelado sem gelo', amount: '200 ml' }] }), 'ProPlus');
    assert.equal(report.removedPulseCounts, 1);
    const plain = recipe({ steps: [{ text: 'Bata.' }] });
    assert.equal(checkRecipeSteps(plain, 'ProPlus').recipe, plain);
  });

  it('inverter o copo fora do Steel é só registrado (sem texto), nunca alterado', () => {
    const invert = recipe({
      blendInstruction: 'Inverta o copo e bata.',
      steps: [{ text: 'Turn the cup upside down.' }, { text: 'Bata.' }, { text: 'Vire o copo e encaixe a base.' }],
    });
    const lite = checkRecipeSteps(invert, 'Lite');
    assert.deepEqual(lite.report.invertMentions, [
      { field: 'step', index: 0 },
      { field: 'step', index: 2 },
      { field: 'blendInstruction' },
    ]);
    assert.equal(lite.recipe.blendInstruction, 'Inverta o copo e bata.');
    assert.deepEqual(checkRecipeSteps(invert, 'ProPlus').report.invertMentions.length, 3);
    assert.deepEqual(checkRecipeSteps(invert, 'Steel').report.invertMentions, []);

    const info = mock.method(console, 'warn', () => undefined);
    try {
      applyRecipeStepCheck(invert, 'Lite', '[test]');
      assert.equal(info.mock.callCount(), 1);
      assert.ok(!JSON.stringify(info.mock.calls[0].arguments).includes('Inverta'));
    } finally {
      info.mock.restore();
    }
  });

  it('frases de inverter reconhecidas (en e pt-BR), sem falso positivo em "inverno"', () => {
    for (const text of ['Invert the BLENDi Lite', 'Inverta o copo', 'flip the cup', 'de cabeça para baixo', 'turn the bottle over', 'vire o copo']) {
      assert.ok(mentionsInvertingCup(text), text);
    }
    for (const text of ['Smoothie de inverno', 'Blend for 30 seconds', 'Vire a página']) {
      assert.ok(!mentionsInvertingCup(text), text);
    }
  });
});

describe('CP-B2 — Pantry: água fora da foto', () => {
  it('água pura (en/pt) conta; água de coco, tônica e melancia não', () => {
    for (const name of ['Água', 'Água filtrada', 'Water', 'Cold water', 'Água com gás']) assert.ok(isPlainWater(name), name);
    for (const name of ['Água de coco', 'Coconut water', 'Água tônica', 'Watermelon', 'Melancia', 'Kefir de água']) {
      assert.ok(!isPlainWater(name), name);
    }
  });

  it('marca só quando a receita usa água e a foto não tinha água', () => {
    const withWater = recipe({ ingredients: [{ name: 'Iogurte', amount: '150 g' }, { name: 'Água', amount: '150 ml' }] });
    assert.equal(usesWaterNotInPhoto(withWater, [{ name: 'Iogurte' }, { name: 'Morango' }]), true);
    assert.equal(usesWaterNotInPhoto(withWater, [{ name: 'Iogurte' }, { name: 'Garrafa de água' }]), false);
    assert.equal(usesWaterNotInPhoto(recipe(), [{ name: 'Iogurte' }]), false);

    assert.equal(markWaterNotInPhoto(withWater, [{ name: 'Iogurte' }]).usesWaterNotInPhoto, true);
    const unmarked = markWaterNotInPhoto({ ...recipe(), usesWaterNotInPhoto: true }, [{ name: 'Leite' }]);
    assert.ok(!('usesWaterNotInPhoto' in unmarked));
  });
});

describe('CP-B2 — capacityNotice e usesWaterNotInPhoto vindos da IA', () => {
  it('schema: opcional, saneado (trim), vazio = ausente, com tamanho máximo', () => {
    const base = recipe();
    assert.equal(pulseAiRecipeSchema.parse(base).capacityNotice, undefined);
    assert.equal(pulseAiRecipeSchema.parse({ ...base, capacityNotice: '  Ajustado ao copo.  ' }).capacityNotice, 'Ajustado ao copo.');
    assert.equal(pulseAiRecipeSchema.parse({ ...base, capacityNotice: '   ' }).capacityNotice, undefined);
    assert.ok(pulseAiRecipeSchema.safeParse({ ...base, capacityNotice: 'x'.repeat(RECIPE_CAPACITY_NOTICE_MAX_LENGTH) }).success);
    assert.ok(!pulseAiRecipeSchema.safeParse({ ...base, capacityNotice: 'x'.repeat(RECIPE_CAPACITY_NOTICE_MAX_LENGTH + 1) }).success);
    assert.ok(!pulseAiRecipeSchema.safeParse({ ...base, capacityNotice: 42 }).success);
  });

  it('a prévia bloqueada (só macros) não leva o capacityNotice nem o aviso de água', () => {
    const preview = toPulseAiRecipePreview({ ...recipe(), capacityNotice: 'Ajustado.', usesWaterNotInPhoto: true });
    assert.deepEqual(Object.keys(preview), ['macros']);
  });

  it('favoritar uma receita com capacityNotice continua válido (o favorito guarda os campos de sempre)', () => {
    const withNotice = { ...recipe(), capacityNotice: 'Ajustado ao copo.' };
    const parsed = createFavoriteSchema.safeParse({
      recipeName: withNotice.title,
      ingredients: withNotice.ingredients,
      protein: withNotice.macros.protein,
      carbs: withNotice.macros.carbs,
      fat: withNotice.macros.fat,
      calories: withNotice.macros.calories,
      prepTimeSeconds: withNotice.prepTimeSeconds,
      blendInstruction: withNotice.blendInstruction,
      hasSubstitutes: withNotice.hasSubstitutes,
    });
    assert.ok(parsed.success);
  });

  it('aviso longo da IA é cortado no último espaço com reticências (não invalida a receita)', () => {
    const long = `${'palavra '.repeat(60)}fim`;
    const cut = truncateCapacityNotice(long);
    assert.ok(cut.length <= RECIPE_CAPACITY_NOTICE_MAX_LENGTH);
    assert.ok(cut.endsWith('palavra…'));
    const prepared = prepareAiRecipePayload({ ...recipe(), capacityNotice: long });
    assert.ok(pulseAiRecipeSchema.safeParse(prepared).success);
  });

  it('usesWaterNotInPhoto da IA é descartado (só o backend marca)', () => {
    const prepared = prepareAiRecipePayload({ ...recipe(), usesWaterNotInPhoto: true }) as Record<string, unknown>;
    assert.ok(!('usesWaterNotInPhoto' in prepared));
    assert.equal(prepareAiRecipePayload(null), null);
    assert.deepEqual(prepareAiRecipePayload([1]), [1]);
  });
});

describe('CP-B2 — validador de dieta com nomes em pt-BR (ingredientes da foto)', () => {
  const cases: Array<[string, 'dairy_free' | 'nut_free' | 'vegan' | 'no_added_sugar']> = [
    ['Leite integral', 'dairy_free'],
    ['Iogurte natural', 'dairy_free'],
    ['Queijo cottage', 'dairy_free'],
    ['Requeijão', 'dairy_free'],
    ['Kefir', 'dairy_free'],
    ['Pasta de amendoim', 'nut_free'],
    ['Castanha-de-caju', 'nut_free'],
    ['Leite de amêndoas', 'nut_free'],
    ['Granola', 'nut_free'],
    ['Paçoca', 'nut_free'],
    ['Mel', 'vegan'],
    ['Clara de ovo', 'vegan'],
    ['Colágeno', 'vegan'],
    ['Proteína em pó', 'vegan'],
    ['Açúcar mascavo', 'no_added_sugar'],
    ['Achocolatado', 'no_added_sugar'],
    ['Leite condensado', 'no_added_sugar'],
  ];

  for (const [name, diet] of cases) {
    it(`${diet} barra "${name}"`, () => {
      const result = validateRecipeRestrictions({ ingredients: [{ name, amount: '1' }], blendInstruction: 'Bata.' }, [diet], 'ProPlus');
      assert.equal(result.compliant, false);
    });
  }

  it('alternativas vegetais em pt-BR continuam permitidas', () => {
    for (const name of ['Leite de aveia', 'Leite de coco', 'Iogurte de coco']) {
      const result = validateRecipeRestrictions({ ingredients: [{ name, amount: '1' }], blendInstruction: 'Bata.' }, ['dairy_free'], 'ProPlus');
      assert.equal(result.compliant, true, name);
    }
  });
});
