// CP-B2 — conteúdo das receitas no prompt (Pulse AI e Pantry): orçamento de
// volume sem teto de proteína, porção mínima, pedido explícito e
// capacityNotice, palavras de tamanho no título, idioma e unidades, passos
// coerentes (inverter só no Steel), Lite sem congelado, variedade e água no
// Pantry. Também o prompt da visão no idioma da conta.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RECIPE_CAPACITY_NOTICE_MAX_LENGTH,
  RECIPE_MIN_SERVING_KCAL,
  RECIPE_TITLE_SIZE_WORDS,
} from '@blendi/shared';

import type { BlendiModel } from '../models/User';
import { buildPantryAnalysisPrompt } from './pantryPromptBuilder.service';
import {
  buildPantryRecipePrompt,
  buildPulseAiPrompt,
  type PulseAiPromptUserContext,
} from './promptBuilder.service';

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
  return buildPulseAiPrompt({ ...BASE, ...overrides, message: 'post-workout shake' }).systemPrompt;
}

function pantry(overrides: Partial<PulseAiPromptUserContext> = {}) {
  return buildPantryRecipePrompt({
    ...BASE,
    ...overrides,
    availableIngredients: [{ name: 'Iogurte natural' }, { name: 'Morango' }, { name: 'Aveia' }],
  });
}

const MODELS: ReadonlyArray<[BlendiModel, string, string, string]> = [
  ['Lite', 'BLENDi Lite', '400ml', '13.5 fl oz, about 1 2/3 cups'],
  ['ProPlus', 'BLENDi Pro+', '400ml', '13.5 fl oz, about 1 2/3 cups'],
  ['Steel', 'BLENDi Steel', '600ml', '20.2 fl oz, about 2 1/2 cups'],
];

describe('CP-B2 prompt — volume como único limite físico', () => {
  for (const [blendiModel, displayName, metric, imperial] of MODELS) {
    it(`${blendiModel}: orçamento de volume de antemão e no fim, sem linha de proteína (métrico e imperial)`, () => {
      for (const [unitSystem, volume] of [['metric', metric], ['imperial', imperial]] as const) {
        for (const prompt of [pulseAi({ blendiModel, unitSystem }), pantry({ blendiModel, unitSystem }).systemPrompt]) {
          assert.ok(prompt.includes('Serving size (volume budget):'));
          assert.ok(
            prompt.includes(`that must fit the cup of the ${displayName}: the combined volume of all ingredients must be at most ${volume}`),
            `${blendiModel}/${unitSystem}: orçamento`
          );
          assert.ok(prompt.includes(`must not exceed ${volume}.`), `${blendiModel}/${unitSystem}: guardrail`);
          assert.ok(prompt.includes('The cup volume is the only physical limit'));
          assert.doesNotMatch(prompt, /protein in this recipe must not exceed/i);
          assert.doesNotMatch(prompt, /protein limits?/i);
          // O orçamento vem antes do guardrail final.
          assert.ok(prompt.indexOf('Serving size (volume budget):') < prompt.indexOf('Physical blender guardrails'));
        }
      }
    });
  }

  it('metas diárias são contexto, não alvo; a regra antiga de 25-40% da proteína diária saiu', () => {
    const prompt = pulseAi();
    assert.ok(prompt.includes('never as the target of a single blend'));
    assert.ok(!prompt.includes('25% and 40%'));
    assert.ok(!prompt.includes('Calibrate the recipe macros so the suggestion fits the user daily targets'));
    assert.ok(prompt.includes('- Daily protein target: 160 g.'));
  });
});

describe('CP-B2 prompt — tamanho: porção mínima, pedido explícito e capacityNotice', () => {
  it(`sem pedido: pelo menos 250 ml (8.5 fl oz) e ${RECIPE_MIN_SERVING_KCAL} kcal; pedido leve vale o pedido`, () => {
    assert.ok(pulseAi().includes(`make a regular serving: at least 250ml and at least ${RECIPE_MIN_SERVING_KCAL} kcal, within the cup budget.`));
    assert.ok(pulseAi({ unitSystem: 'imperial' }).includes(`at least 8.5 fl oz and at least ${RECIPE_MIN_SERVING_KCAL} kcal`));
    assert.ok(pulseAi().includes('When the user asks for something light or small'));
  });

  it('pedido com valor de qualquer macro ou kcal: entrega o valor, sem teto além do volume', () => {
    const prompt = pulseAi();
    assert.ok(prompt.includes('"400 kcal", "70 g of protein", "low carb, up to 15 g", "little fat"'));
    assert.ok(prompt.includes('Protein, carbs, fat and calories have no limit other than the cup volume.'));
    // Pedido que não cabe: a mais próxima usa quase o copo inteiro.
    assert.ok(prompt.includes('the closest recipe uses nearly the whole cup (about 90% of the volume budget)'));
    // Ingredientes de poucas calorias: quantidade maior, nunca porção menor.
    assert.ok(prompt.includes('reach the minimum with larger quantities or a more caloric ingredient that is allowed, never with a smaller serving'));
  });

  it('capacityNotice: no JSON, só quando ajustou, tamanho máximo e exemplo no idioma da conta', () => {
    const en = pulseAi();
    assert.ok(en.includes('"capacityNotice": string (optional)'));
    assert.ok(en.includes(`fill capacityNotice with one short sentence (at most ${RECIPE_CAPACITY_NOTICE_MAX_LENGTH} characters) in English`));
    assert.ok(en.includes('Fill capacityNotice only when you actually had to reduce what the user asked for.'));
    assert.ok(en.includes('You asked for 900 kcal, but your BLENDi Lite cup holds up to 400 ml'));

    const pt = pulseAi({ locale: 'pt-BR' });
    assert.ok(pt.includes('in Brazilian Portuguese saying what was asked'));
    assert.ok(pt.includes('Você pediu 900 kcal, mas o copo do seu BLENDi Lite comporta até 400 ml'));
  });

  it('Pantry (sem texto livre): porção mínima sim, regras de pedido explícito não; capacityNotice omitido', () => {
    const prompt = pantry().systemPrompt;
    assert.ok(prompt.includes('make a regular serving: at least 250ml'));
    assert.ok(!prompt.includes('When the user asks for a specific amount'));
    assert.ok(prompt.includes('- Omit the capacityNotice field.'));
  });

  it('títulos: proíbe palavras de tamanho (lista única do shared)', () => {
    for (const prompt of [pulseAi(), pantry().systemPrompt]) {
      const line = prompt.split('\n').find(l => l.includes('Never put a word about size or restriction in the title')) ?? '';
      for (const word of RECIPE_TITLE_SIZE_WORDS) {
        assert.ok(line.includes(word), `falta "${word}"`);
      }
      assert.ok(line.includes('compact') && line.includes('compacto'));
    }
  });
});

describe('CP-B2 prompt — idioma e unidades', () => {
  it('todo texto visível no idioma da conta, sem mistura; pt-BR com exemplos de nomes traduzidos', () => {
    const pt = pulseAi({ locale: 'pt-BR' });
    assert.ok(pt.includes('Write every user-visible text entirely in Brazilian Portuguese: the title, every ingredient name, every amount (including the unit words), the blendInstruction, every step, the tip and the capacityNotice. Never mix languages.'));
    assert.ok(pt.includes('"Leite de amêndoas sem açúcar", "Morango"'));
    assert.ok(pt.includes('never copy their English names into the recipe'));
    assert.ok(pt.includes('Proofread every text'));
    assert.ok(!pulseAi().includes('Translate every ingredient name into Brazilian Portuguese'));
  });

  it('o idioma pedido pela sessão do app prevalece sobre o locale salvo', () => {
    const prompt = buildPulseAiPrompt({ ...BASE, locale: 'en', language: 'pt-BR', message: 'x' }).systemPrompt;
    assert.ok(prompt.includes('Translate every ingredient name into Brazilian Portuguese'));
  });

  it('métrico: g e ml', () => {
    assert.ok(pulseAi().includes('grams (g) for solids and powders, milliliters (ml) for liquids'));
    assert.ok(pulseAi({ locale: 'pt-BR' }).includes('40 g de aveia em flocos, 200 ml de água de coco'));
  });

  it('imperial: frações comuns, nunca decimais; en com cup/tbsp/tsp/fl oz/oz', () => {
    const prompt = pulseAi({ unitSystem: 'imperial' });
    assert.ok(prompt.includes('cup, tbsp and tsp for volume, fl oz for liquids, oz for solids'));
    assert.ok(prompt.includes('common kitchen fractions (1/4, 1/3, 1/2, 2/3, 3/4, 1 1/2), never with decimals: never write 0.33 cup, 0.2 oz'));
  });

  // Lote 4 ao vivo: no imperial a IA media pó/sólidos em xícaras e o backend
  // conta a xícara como volume (9 de 12 novas tentativas eram imperiais).
  // CP-B3: folhas, frutas em pedaços, aveia, pós, sementes, pastas e iogurte
  // em xícara/colher contam pelo peso típico (antes: "contam a medida cheia,
  // mesmo pó ou sólido").
  it('imperial: folhas e frutas em xícara contam pelo peso típico; líquidos pela medida; whey pesado em oz', () => {
    const en = pulseAi({ unitSystem: 'imperial' });
    assert.ok(en.includes('leafy greens, fruit pieces, oats, powders (protein, cocoa, matcha), seeds, nut butters and yogurt measured in cups, tbsp or tsp count by their typical weight, not by the full measure'));
    assert.ok(en.includes('1 cup of spinach counts about 1 oz and 1 cup of strawberries about 5 oz'));
    assert.ok(en.includes('Liquids and any other ingredient measured in cups, tbsp or tsp count with the full measured volume (1 cup = 8 fl oz)'));
    assert.ok(en.includes('Measure protein powder by weight in oz'));
    assert.ok(!en.includes('even when it is a powder or a solid'));
    assert.ok(en.includes('(see the unit rules above for how cups, spoons and oz count)'));
    const pt = pulseAi({ unitSystem: 'imperial', locale: 'pt-BR' });
    assert.ok(pt.includes('measured in xícara or colher count by their typical weight'));
    assert.ok(pt.includes('1 xícara de espinafre counts about 1 oz'));
    const metric = pulseAi();
    assert.ok(!metric.includes('typical weight'));
    assert.ok(metric.includes('(count each gram of a solid ingredient as 1ml)'));
  });

  it('imperial em pt-BR: xícara, colher de sopa, colher de chá; "fl oz" e "oz"', () => {
    const prompt = pulseAi({ unitSystem: 'imperial', locale: 'pt-BR' });
    assert.ok(prompt.includes('xícara, colher de sopa and colher de chá for volume, "fl oz" for fluid ounces and "oz" for ounces'));
    assert.ok(prompt.includes('Never write cup, tablespoon, teaspoon or "fluid ounces" in English.'));
    assert.ok(prompt.includes('1/3 de xícara de aveia em flocos, 3/4 de xícara de água de coco'));
    assert.ok(prompt.includes('write 1/3 de xícara, 1/2 banana'));
  });
});

describe('CP-B2 prompt — passos coerentes, inverter só no Steel, Lite sem congelado', () => {
  it('passos só com ingredientes da receita; pulseCount só com gelo/congelado da receita; sem limite nem potência', () => {
    const prompt = pulseAi();
    assert.ok(prompt.includes('may only mention ingredients that are in the ingredients list of this recipe'));
    assert.ok(prompt.includes('Include pulseCount (an integer number of pulses) only in a step that adds ice or a frozen ingredient that is in the ingredients list of this recipe'));
    assert.ok(prompt.includes('Never mention the cup volume limit, the motor power or the wattage'));
    assert.ok(!prompt.includes('Personalize the blendInstruction for the user hardware'));
  });

  it('inverter o copo: proibido no Lite e no Pro+, permitido no Steel', () => {
    for (const blendiModel of ['Lite', 'ProPlus'] as const) {
      const prompt = pulseAi({ blendiModel });
      assert.ok(prompt.includes('Never tell the user to invert, flip or turn the cup upside down'), blendiModel);
      assert.ok(!prompt.includes('You may tell the user to invert the cup'), blendiModel);
    }
    const steel = pulseAi({ blendiModel: 'Steel' });
    assert.ok(steel.includes('You may tell the user to invert the cup when it helps the blend.'));
    assert.ok(!steel.includes('Never tell the user to invert'));
  });

  it('Lite: proíbe gelo e qualquer congelado, e congelado como substituto do gelo (hardware e guardrail)', () => {
    const prompt = pulseAi({ blendiModel: 'Lite' });
    const rule = 'Never use ice or any frozen ingredient (frozen fruit, frozen açaí pulp or anything else taken from the freezer), and never suggest a frozen ingredient as a replacement for ice';
    const hardware = prompt.split('\n').find(line => line.startsWith('- Hardware guidance:')) ?? '';
    assert.ok(hardware.includes(rule));
    const guardrails = prompt.slice(prompt.indexOf('Physical blender guardrails'));
    assert.ok(guardrails.includes(rule));
    assert.ok(pantry({ blendiModel: 'Lite' }).systemPrompt.includes(rule));
  });

  it('Pro+ e Steel não recebem a proibição de congelado', () => {
    for (const blendiModel of ['ProPlus', 'Steel'] as const) {
      assert.ok(!pulseAi({ blendiModel }).includes('Never use ice or any frozen ingredient'), blendiModel);
    }
    assert.ok(pulseAi({ blendiModel: 'ProPlus' }).includes('Can process frozen fruit'));
  });
});

describe('CP-B2 prompt — variedade', () => {
  it('leite de amêndoas não é base padrão; bases e proteínas variadas, filtradas pela dieta', () => {
    const prompt = pulseAi();
    assert.ok(prompt.includes('Do not use almond milk as a default base.'));
    assert.ok(prompt.includes('water, milk, oat milk, soy milk, almond milk, coconut water, yogurt, kefir'));
    assert.ok(prompt.includes('avoid falling back on the same "protein powder + banana + oats" or "strawberry + spinach" combination'));

    const vegan = pulseAi({ dietaryPreferences: ['vegan'] });
    const bases = vegan.split('\n').find(line => line.includes('Choose the liquid base')) ?? '';
    assert.ok(bases.includes('water, oat milk, soy milk, almond milk, coconut water'));
    assert.ok(!/\bmilk, oat/.test(bases) && !bases.includes('yogurt') && !bases.includes('kefir'));
  });

  it('Pulse AI: histórico recente no prompt com instrução reforçada de não repetir', () => {
    const prompt = buildPulseAiPrompt({
      ...BASE,
      recentBlendRecipeNames: ['Morning Oat Shake', 'Berry Whey'],
      message: 'x',
    }).systemPrompt;
    // CP-B5: no chat o histórico vale só para o que não foi pedido.
    assert.ok(prompt.includes("The user's most recent blends (history only, never a request. Do not repeat any of them, and do not repeat the same liquid base with the same main ingredients, but only for what the current message did not ask for: an ingredient, base or flavor the user asks for is always used, even when it is in this list):"));
    assert.ok(prompt.includes('1. Morning Oat Shake'));
    assert.ok(prompt.includes('Do not repeat a recipe you already suggested earlier in this conversation'));
  });

  it('Pantry: as 2 receitas precisam ser realmente diferentes', () => {
    const { systemPrompt, messages } = pantry();
    assert.ok(systemPrompt.includes('The 2 recipes must be clearly different from each other: change the liquid base, the flavor profile or the texture. Swapping only one fruit for another does not make a different recipe.'));
    assert.ok(systemPrompt.includes('one recipe with water or milk as the base and the other with yogurt as the base'));
    assert.ok(messages[0].content.includes('2 clearly different blend recipes'));
  });
});

describe('CP-B2 prompt — Pantry: água sempre permitida, único extra', () => {
  it('água fora da foto é permitida e é o único ingrediente extra; dica pode sugerir leite "se você tiver"', () => {
    for (const diets of [[], ['vegan']] as const) {
      const { systemPrompt, messages } = pantry({ dietaryPreferences: [...diets] });
      assert.ok(systemPrompt.includes('- Use only the ingredients listed in the Available ingredients section, plus plain water.'));
      assert.ok(systemPrompt.includes('Plain water is always available, even when it is not in the list'));
      assert.ok(systemPrompt.includes('Water is the only ingredient allowed outside the list.'));
      assert.ok(systemPrompt.includes('- Do not invent, substitute, or recommend any other ingredient that is not listed as available.'));
      assert.ok(systemPrompt.includes('"if you have some"'));
      assert.ok(messages[0].content.includes('plus plain water'));
    }
    // A Pulse AI não ganha nada disso.
    assert.ok(!pulseAi().includes('Plain water is always available'));
  });
});

describe('CP-B2 — prompt da visão no idioma da conta', () => {
  it('pt-BR pede nomes em português; en continua em inglês; padrão en', () => {
    assert.ok(buildPantryAnalysisPrompt('pt-BR').includes('- name: string in Brazilian Portuguese (for example "Leite integral", "Morango", "Aveia em flocos")'));
    assert.ok(buildPantryAnalysisPrompt('en').includes('- name: string in English'));
    assert.equal(buildPantryAnalysisPrompt(), buildPantryAnalysisPrompt('en'));
    assert.ok(!buildPantryAnalysisPrompt('pt-BR').includes('{{'));
  });
});
