// CP-B3 — mesmo critério de volume no métrico e no imperial (peso típico de
// ingredientes medidos em xícara/colher), limite em xícaras no prompt
// imperial, texto neutro para quem não tem BLENDi e números com vírgula em
// pt-BR. Também a chave do cache separando quem não tem BLENDi.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateCacheKey, type CacheKeyInput } from '../services/cache.service';
import {
  buildPantryRecipePrompt,
  buildPulseAiPrompt,
  type PulseAiPromptUserContext,
} from '../services/promptBuilder.service';
import { buildBlenderLimitRetryMessage, validateBlenderLimits } from './blenderGuardrail.utils';
import {
  LIQUID_INGREDIENT_TERMS,
  TYPICAL_INGREDIENT_WEIGHTS,
  findTypicalIngredientWeight,
} from './ingredientWeights.utils';
import { buildRecipeRestrictionRetryMessage, validateRecipeRestrictions } from './recipeRestrictions.utils';
import { formatCupsFloor, formatDecimal, formatMaxVolume } from './recipeText.utils';
import { estimateIngredientVolumeMl, estimateRecipeVolumeMl } from './recipeVolume.utils';

function close(actual: number | null, expected: number, label = '') {
  assert.ok(actual !== null && Math.abs(actual - expected) < 0.5, `${label} ${actual} ≈ ${expected}`);
}

const volumeOf = (name: string, amount: string) => estimateIngredientVolumeMl({ name, amount });

describe('CP-B3 — volume pelo peso típico (xícara e colher)', () => {
  it('"1 cup spinach" e "1 xícara de espinafre" contam ~30 ml', () => {
    close(volumeOf('Spinach', '1 cup'), 30);
    close(volumeOf('Espinafre', '1 xícara'), 30);
    close(volumeOf('Fresh baby spinach', '1 cup'), 30);
  });

  it('frutas em pedaços contam pelo peso típico', () => {
    close(volumeOf('Strawberries', '1 cup'), 152);
    close(volumeOf('Morangos', '1/2 xícara'), 76);
    close(volumeOf('Blueberries', '3/4 cup'), 111);
    close(volumeOf('Mango chunks', '1 cup'), 165);
  });

  it('líquidos continuam pela medida: leite, bebida vegetal, água, água de coco, suco, café, kefir, chá', () => {
    for (const [name, amount] of [
      ['Milk', '1 cup'], ['Leite', '1 xícara'], ['Oat milk', '1 cup'], ['Leite de aveia', '1 xícara'],
      ['Water', '1 cup'], ['Água de coco', '1 xícara'], ['Strawberry juice', '1 cup'], ['Suco de laranja', '1 xícara'],
      ['Cold brew coffee', '1 cup'], ['Kefir', '1 cup'], ['Chá verde', '1 xícara'], ['Polpa de manga', '1 xícara'],
    ] as const) {
      close(volumeOf(name, amount), 236.6, name);
    }
  });

  it('fora da tabela conta pelo volume da medida (como antes)', () => {
    close(volumeOf('Kiwi', '1 cup'), 236.6);
    close(volumeOf('Couve-flor', '1 xícara'), 236.6);
    close(volumeOf('Granola', '2 tbsp'), 29.6);
    close(volumeOf('', '1 cup'), 236.6);
  });

  it('medida entre parênteses prevalece', () => {
    close(volumeOf('Spinach', '2 cups (60 g)'), 60);
    close(volumeOf('Whey protein', '1 scoop (30 g)'), 30);
    close(volumeOf('Oat milk', '1 cup (240 ml)'), 240);
  });

  it('colher de sopa e de chá: 1/16 e 1/48 da xícara; frações e vírgula decimal', () => {
    close(volumeOf('Peanut butter', '2 tbsp'), 32);
    close(volumeOf('Pasta de amendoim', '1 colher (sopa)'), 16);
    close(volumeOf('Cacau em pó', '1 colher de sopa'), 5.4);
    close(volumeOf('Matcha', '1 tsp'), 2);
    close(volumeOf('Sementes de chia', '1,5 colher de sopa'), 15);
    close(volumeOf('Aveia em flocos', '1 1/2 xícara'), 121.5);
    close(volumeOf('Rolled oats', '⅓ cup'), 27);
    close(volumeOf('Leite', '1,5 xícara'), 354.9);
    close(volumeOf('Leite', '0,5 l'), 500);
  });

  it('nome composto casa com o item base ("banana congelada", "morangos frescos", "frozen mixed berries")', () => {
    assert.equal(findTypicalIngredientWeight('Banana congelada')?.id, 'banana');
    assert.equal(findTypicalIngredientWeight('Morangos frescos')?.id, 'strawberry');
    assert.equal(findTypicalIngredientWeight('Frozen mixed berries')?.id, 'mixed_berries');
    assert.equal(findTypicalIngredientWeight('Frutas vermelhas congeladas')?.id, 'mixed_berries');
    assert.equal(findTypicalIngredientWeight('Proteína whey em pó')?.id, 'protein_powder');
    assert.equal(findTypicalIngredientWeight('Couve manteiga picada')?.id, 'kale');
    // Mais de um item no nome: vale o de maior peso.
    assert.equal(findTypicalIngredientWeight('Iogurte de morango')?.id, 'yogurt');
    // "pó" tira o nome da regra de líquido.
    assert.equal(findTypicalIngredientWeight('Matcha green tea powder')?.id, 'matcha');
  });

  it('peso/medida (gramas) não muda: só xícara e colher usam a tabela', () => {
    close(volumeOf('Spinach', '30 g'), 30);
    close(volumeOf('Strawberries', '5 oz'), 141.75);
    close(volumeOf('Oat milk', '8 fl oz'), 236.6);
  });

  it('a tabela não tem líquido nem nome que caia na regra de líquido; ids únicos', () => {
    const ids = TYPICAL_INGREDIENT_WEIGHTS.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const entry of TYPICAL_INGREDIENT_WEIGHTS) {
      assert.ok(entry.gramsPerCup > 0 && entry.gramsPerCup < 300, entry.id);
      // Todo nome da tabela casa (com o próprio item ou um mais pesado).
      for (const name of entry.names) {
        const found = findTypicalIngredientWeight(name);
        assert.ok(found && found.gramsPerCup >= entry.gramsPerCup, name);
      }
    }
    for (const term of LIQUID_INGREDIENT_TERMS) {
      assert.equal(findTypicalIngredientWeight(term), null, term);
    }
  });
});

describe('CP-B3 — métrico e imperial com o mesmo critério', () => {
  const pairs: Array<[string, string, string, string]> = [
    ['Espinafre', '30 g', 'Spinach', '1 cup'],
    ['Morango', '150 g', 'Strawberries', '1 cup'],
    ['Aveia em flocos', '40 g', 'Rolled oats', '1/2 cup'],
    ['Banana', '75 g', 'Banana, sliced', '1/2 cup'],
    ['Proteína whey', '30 g', 'Whey protein', '1/3 cup'],
    ['Pasta de amendoim', '32 g', 'Peanut butter', '2 tbsp'],
    ['Iogurte grego', '170 g', 'Greek yogurt', '3/4 cup'],
    ['Leite', '240 ml', 'Milk', '1 cup'],
  ];

  for (const [metricName, metricAmount, imperialName, imperialAmount] of pairs) {
    it(`${metricAmount} ${metricName} ≈ ${imperialAmount} ${imperialName}`, () => {
      const metric = volumeOf(metricName, metricAmount) ?? 0;
      const imperial = volumeOf(imperialName, imperialAmount) ?? 0;
      assert.ok(Math.abs(metric - imperial) <= Math.max(10, metric * 0.1), `${metric} × ${imperial}`);
    });
  }

  it('a mesma receita verde passa no Lite nos dois sistemas (antes: 591 ml no imperial)', () => {
    const metric = [
      { name: 'Espinafre', amount: '30 g' },
      { name: 'Morango', amount: '75 g' },
      { name: 'Leite de aveia', amount: '240 ml' },
    ];
    const imperial = [
      { name: 'Spinach', amount: '1 cup' },
      { name: 'Strawberries', amount: '1/2 cup' },
      { name: 'Oat milk', amount: '1 cup' },
    ];
    assert.equal(estimateRecipeVolumeMl(metric).estimatedVolumeMl, 345);
    assert.equal(estimateRecipeVolumeMl(imperial).estimatedVolumeMl, 343);
    assert.ok(validateBlenderLimits({ ingredients: imperial }, 'Lite').withinLimits);
  });

  it('o limite e o bloqueio não mudam: 2 xícaras de leite continuam acima do Lite', () => {
    assert.ok(!validateBlenderLimits({ ingredients: [{ name: 'Leite', amount: '2 xícaras' }] }, 'Lite').withinLimits);
    assert.ok(validateBlenderLimits({ ingredients: [{ name: 'Leite', amount: '400 ml' }] }, 'Lite').withinLimits);
    assert.ok(!validateBlenderLimits({ ingredients: [{ name: 'Leite', amount: '401 ml' }] }, 'Lite').withinLimits);
  });
});

describe('CP-B3 — formatos', () => {
  it('xícaras arredondadas para baixo: Lite/Pro+ ~1 2/3, Steel ~2 1/2', () => {
    assert.equal(formatCupsFloor(400, 'en'), '1 2/3 cups');
    assert.equal(formatCupsFloor(600, 'en'), '2 1/2 cups');
    assert.equal(formatCupsFloor(400, 'pt-BR'), '1 2/3 xícara');
    assert.equal(formatCupsFloor(600, 'pt-BR'), '2 1/2 xícaras');
    assert.equal(formatCupsFloor(236.6, 'en'), '1 cup');
    assert.equal(formatCupsFloor(120, 'en'), '1/2 cup');
  });

  it('decimal com vírgula só em pt-BR; limite com fl oz e xícaras no imperial', () => {
    assert.equal(formatDecimal(13.5, 'pt-BR'), '13,5');
    assert.equal(formatDecimal(13.5, 'en'), '13.5');
    assert.equal(formatMaxVolume('Lite', 'imperial', 'en'), '13.5 fl oz, about 1 2/3 cups');
    assert.equal(formatMaxVolume('ProPlus', 'imperial', 'pt-BR'), '13,5 fl oz, cerca de 1 2/3 xícara');
    assert.equal(formatMaxVolume('Steel', 'imperial', 'pt-BR'), '20,2 fl oz, cerca de 2 1/2 xícaras');
    assert.equal(formatMaxVolume('Steel', 'metric', 'pt-BR'), '600ml');
  });
});

const BASE: PulseAiPromptUserContext = {
  blendiModel: 'Lite',
  goal: 'Muscle',
  weightGoal: 'maintain',
  locale: 'en',
  unitSystem: 'metric',
  dailyProteinTarget: 160,
  dailyCarbTarget: 250,
  dailyCalorieTarget: 2600,
};

function pulseAi(overrides: Partial<PulseAiPromptUserContext> = {}): string {
  return buildPulseAiPrompt({ ...BASE, ...overrides, message: 'shake' }).systemPrompt;
}

function pantry(overrides: Partial<PulseAiPromptUserContext> = {}): string {
  return buildPantryRecipePrompt({ ...BASE, ...overrides, availableIngredients: [{ name: 'Banana' }] }).systemPrompt;
}

describe('CP-B3 — prompt: limite em xícaras e regra do peso no imperial', () => {
  it('en e pt-BR imperial mostram o limite em fl oz e em xícaras (Lite, Pro+ e Steel)', () => {
    assert.ok(pulseAi({ unitSystem: 'imperial' }).includes('must be at most 13.5 fl oz, about 1 2/3 cups'));
    assert.ok(pulseAi({ unitSystem: 'imperial', blendiModel: 'ProPlus' }).includes('must not exceed 13.5 fl oz, about 1 2/3 cups.'));
    assert.ok(pulseAi({ unitSystem: 'imperial', blendiModel: 'Steel' }).includes('must be at most 20.2 fl oz, about 2 1/2 cups'));
    const pt = pulseAi({ unitSystem: 'imperial', locale: 'pt-BR' });
    assert.ok(pt.includes('must be at most 13,5 fl oz, cerca de 1 2/3 xícara'));
    assert.ok(pantry({ unitSystem: 'imperial', locale: 'pt-BR', blendiModel: 'Steel' }).includes('must not exceed 20,2 fl oz, cerca de 2 1/2 xícaras.'));
  });

  it('folhas e frutas em xícara contam pelo peso; métrico sem mudança no texto do limite', () => {
    assert.ok(pulseAi({ unitSystem: 'imperial' }).includes('1 cup of spinach counts about 1 oz and 1 cup of strawberries about 5 oz'));
    const metric = pulseAi();
    assert.ok(metric.includes('must be at most 400ml (count each gram of a solid ingredient as 1ml)'));
    assert.ok(metric.includes('must not exceed 400ml.'));
    assert.ok(!metric.includes('cups'));
  });
});

describe('CP-B3 — prompt: números com vírgula em pt-BR', () => {
  it('pt-BR imperial: nenhum decimal com ponto no prompt; regra da vírgula presente', () => {
    for (const prompt of [pulseAi({ unitSystem: 'imperial', locale: 'pt-BR' }), pantry({ unitSystem: 'imperial', locale: 'pt-BR' })]) {
      // CP-B5: a linha do ponto decimal no JSON fala do número do JSON (não
      // dos textos) e por isso usa ponto de propósito.
      assert.doesNotMatch(
        prompt
          .replace(/Nutrition reference table[\s\S]*?\n\n/, '')
          .replace(/- Every number in the JSON uses a dot[^\n]*\n/, ''),
        /\d\.\d/
      );
      assert.ok(prompt.includes('at least 8,5 fl oz'));
      assert.ok(prompt.includes('Write decimal numbers with a comma, as in Brazilian Portuguese'));
      assert.ok(prompt.includes('The numeric JSON fields (macros, prepTimeSeconds, pulseCount) stay plain JSON numbers.'));
    }
  });

  it('o exemplo de capacityNotice em pt-BR imperial usa "13,5 fl oz"; em inglês, "13.5 fl oz"', () => {
    assert.ok(pulseAi({ unitSystem: 'imperial', locale: 'pt-BR' }).includes('comporta até 13,5 fl oz; esta receita tem 610 kcal'));
    assert.ok(pulseAi({ unitSystem: 'imperial' }).includes('holds up to 13.5 fl oz; this recipe has 610 kcal'));
    assert.ok(pulseAi({ locale: 'pt-BR' }).includes('comporta até 400 ml; esta receita tem 610 kcal'));
  });

  it('en não recebe a regra da vírgula', () => {
    assert.ok(!pulseAi({ unitSystem: 'imperial' }).includes('decimal numbers with a comma'));
  });
});

describe("CP-B3 — prompt neutro para 'other' e 'none'", () => {
  for (const blendiOwnership of ['other', 'none'] as const) {
    for (const locale of ['en', 'pt-BR'] as const) {
      for (const unitSystem of ['metric', 'imperial'] as const) {
        it(`${blendiOwnership}/${locale}/${unitSystem}: sem BLENDi, Lite nem potência; limites e regras do Lite`, () => {
          for (const prompt of [pulseAi({ blendiOwnership, locale, unitSystem }), pantry({ blendiOwnership, locale, unitSystem })]) {
            assert.doesNotMatch(prompt, /BLENDi|\bLite\b|Pro\+|Steel|\d+\s?W\b/);
            assert.ok(prompt.includes('- Blender: a portable blender (brand and model not specified).'));
            assert.ok(prompt.includes("must fit the cup of the user's portable blender"));
            assert.ok(prompt.includes('Physical blender guardrails (portable blender):'));
            assert.ok(prompt.includes(unitSystem === 'metric' ? 'must not exceed 400ml.' : 'must not exceed 13'));
            assert.ok(prompt.includes('Never use ice or any frozen ingredient'));
            assert.ok(prompt.includes('Never tell the user to invert, flip or turn the cup upside down'));
            assert.ok(prompt.includes('Never mention a blender brand, model or motor power anywhere in the recipe.'));
            assert.ok(prompt.includes(locale === 'pt-BR' ? 'call it "seu liquidificador portátil"' : 'call it "your portable blender"'));
          }
        });
      }
    }
  }

  it('capacityNotice de exemplo neutro', () => {
    assert.ok(pulseAi({ blendiOwnership: 'none', locale: 'pt-BR' }).includes('mas o copo do seu liquidificador portátil comporta até 400 ml'));
    assert.ok(pulseAi({ blendiOwnership: 'other' }).includes('but the cup of your portable blender holds up to 400 ml'));
  });

  it("'other' e 'none' geram o mesmo prompt; 'blendi' e ausente, o prompt de antes", () => {
    assert.equal(pulseAi({ blendiOwnership: 'other' }), pulseAi({ blendiOwnership: 'none' }));
    assert.equal(pulseAi({ blendiOwnership: 'blendi' }), pulseAi());
    const blendi = pulseAi({ blendiOwnership: 'blendi' });
    assert.ok(blendi.includes('You are BLENDi Pulse AI'));
    assert.ok(blendi.includes('- BLENDi model: BLENDi Lite (70W).'));
    assert.ok(blendi.includes('must fit the cup of the BLENDi Lite'));
    assert.ok(!blendi.includes('portable blender'));
  });

  it('o resultado do prompt leva o contexto de texto para as novas tentativas', () => {
    const result = buildPulseAiPrompt({ ...BASE, blendiOwnership: 'none', locale: 'en', language: 'pt-BR', unitSystem: 'imperial', message: 'x' });
    assert.deepEqual(result.textContext, { locale: 'pt-BR', unitSystem: 'imperial', genericBlender: true });
  });
});

describe('CP-B3 — mensagens de nova tentativa', () => {
  const over = validateBlenderLimits({ ingredients: [{ name: 'Leite', amount: '3 xícaras' }] }, 'Lite');

  it('volume: pt-BR imperial com vírgula e xícaras; sem contexto, o formato de antes', () => {
    assert.ok(!over.withinLimits);
    if (over.withinLimits) return;
    assert.match(
      buildBlenderLimitRetryMessage(over.violation, { locale: 'pt-BR', unitSystem: 'imperial', genericBlender: false }),
      /at most 400ml \(13,5 fl oz, cerca de 1 2\/3 xícara\)/
    );
    assert.match(buildBlenderLimitRetryMessage(over.violation), /at most 400ml \(13\.5oz\)/);
    assert.match(buildBlenderLimitRetryMessage(over.violation), /count by their typical weight/);
    assert.doesNotMatch(buildBlenderLimitRetryMessage(over.violation), /BLENDi|Lite/);
  });

  it('gelo/congelado: neutro para quem não tem BLENDi; igual a antes para BLENDi', () => {
    const recipe = { ingredients: [{ name: 'Gelo', amount: '100 g' }], blendInstruction: 'Bata.' };
    const result = validateRecipeRestrictions(recipe, [], 'Lite');
    assert.ok(!result.compliant);
    if (result.compliant) return;
    const generic = buildRecipeRestrictionRetryMessage(recipe, result.violations, { genericBlender: true });
    assert.match(generic, /this blender cannot blend ice or anything frozen/);
    assert.doesNotMatch(generic, /BLENDi|Lite/);
    assert.match(buildRecipeRestrictionRetryMessage(recipe, result.violations), /the BLENDi Lite cannot blend ice/);
  });
});

describe('CP-B3 — cache separa quem não tem BLENDi', () => {
  const input: CacheKeyInput = {
    userId: 'user-1',
    model: 'Lite',
    goal: 'Muscle',
    language: 'en',
    unitSystem: 'metric',
    aiProvider: 'google',
    aiModel: 'm',
    rawMessage: 'shake',
  };

  it("genericBlender muda a chave; ausente/false = chave de antes (hash da mensagem no mesmo lugar)", () => {
    const before = generateCacheKey(input);
    assert.equal(generateCacheKey({ ...input, genericBlender: false }), before);
    const generic = generateCacheKey({ ...input, genericBlender: true });
    assert.notEqual(generic, before);
    assert.equal(generic, `${before}:generic`);
    assert.equal(generic.split(':')[8], before.split(':')[8]);
  });
});
