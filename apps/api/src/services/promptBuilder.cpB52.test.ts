// CP-B5.2 — prompt do chat: reforço para 21+ (nunca versão sem álcool por
// conta própria), tabela de ingredientes dos drinks e linha com a decisão do
// código sobre o pedido de álcool. O Pantry Scanner não muda.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPantryRecipePrompt,
  buildPulseAiPrompt,
  type BuildPulseAiPromptInput,
} from './promptBuilder.service';

const BASE: BuildPulseAiPromptInput = {
  blendiModel: 'ProPlus',
  goal: 'Muscle',
  weightGoal: 'gain',
  locale: 'en',
  unitSystem: 'metric',
  dailyProteinTarget: 150,
  dailyCarbTarget: 200,
  dailyCalorieTarget: 2500,
  recentBlendRecipeNames: ['Banana Oat Shake'],
  message: 'rum shake',
};

function chat(overrides: Partial<BuildPulseAiPromptInput> = {}): string {
  return buildPulseAiPrompt({ ...BASE, ...overrides }).systemPrompt;
}

const REINFORCEMENT =
  '- When the message counts as asking for alcohol, the recipe always has the alcoholic ingredient: never return an alcohol-free, "zero", "0%" or "virgin" version and never use those words in the title. Only the current message itself can ask for the alcohol-free version.';
const DECIDED_YES = '- The app has already checked the current message: it asks for alcohol. Set alcoholRequested to true.';
const DECIDED_NO =
  '- The app has already checked the current message: it does not ask for alcohol (or it asks for the alcohol-free version). Set alcoholRequested to false and use no alcoholic ingredient.';

describe('CP-B5.2 prompt — reforço para 21+', () => {
  for (const locale of ['en', 'pt-BR'] as const) {
    it(`${locale}: 21+ recebe o reforço; não-21+ não`, () => {
      assert.ok(chat({ locale, alcoholOfAge: true }).includes(REINFORCEMENT));
      assert.ok(!chat({ locale, alcoholOfAge: false }).includes(REINFORCEMENT));
    });
  }

  it('a linha que já existia continua', () => {
    assert.ok(chat({ alcoholOfAge: true }).includes('Never turn it into an alcohol-free version on your own: the user chose this drink.'));
  });
});

describe('CP-B5.2 prompt — ingredientes que definem o drink', () => {
  it('a tabela entra na seção de pedido explícito, nas duas idades e nos dois idiomas', () => {
    for (const alcoholOfAge of [true, false]) {
      for (const locale of ['en', 'pt-BR'] as const) {
        const prompt = chat({ alcoholOfAge, locale });
        const line = prompt.indexOf('- Drinks and the ingredients that define them');
        assert.ok(line > prompt.indexOf('Explicit request (the most important rule after the physical limits):'));
        assert.ok(line < prompt.indexOf('Alcohol:'));
        assert.ok(prompt.includes('caipirinha: lime; caipiroska: lime; piña colada: pineapple and coconut; mojito: mint and lime; margarita: lime; daiquiri: lime'));
      }
    }
  });
});

describe('CP-B5.2 prompt — decisão do código', () => {
  it('"yes" e "no" viram uma linha; "ai" e ausente deixam o prompt como antes', () => {
    for (const alcoholOfAge of [true, false]) {
      const yes = chat({ alcoholOfAge, alcoholRequestDecision: 'yes' });
      const no = chat({ alcoholOfAge, alcoholRequestDecision: 'no' });
      const ai = chat({ alcoholOfAge, alcoholRequestDecision: 'ai' });
      const absent = chat({ alcoholOfAge });

      assert.ok(yes.includes(DECIDED_YES) && !yes.includes(DECIDED_NO));
      assert.ok(no.includes(DECIDED_NO) && !no.includes(DECIDED_YES));
      assert.equal(ai, absent);
      assert.ok(!ai.includes('The app has already checked the current message'));
      // A linha fica dentro da seção de álcool.
      assert.ok(yes.indexOf(DECIDED_YES) > yes.indexOf('Alcohol:'));
    }
  });
});

describe('CP-B5.2 prompt — Pantry sem mudança', () => {
  it('nada de álcool, tabela de drinks ou decisão no Pantry', () => {
    // O tipo do Pantry nem aceita esses campos; mesmo passados por spread, nada muda.
    const withAlcohol: BuildPulseAiPromptInput = { ...BASE, alcoholOfAge: true, alcoholRequestDecision: 'yes' };
    const pantry = buildPantryRecipePrompt({ ...withAlcohol, availableIngredients: [{ name: 'Banana' }] }).systemPrompt;

    assert.ok(!pantry.includes('Alcohol:'));
    assert.ok(!pantry.includes('Drinks and the ingredients that define them'));
    assert.ok(!pantry.includes('The app has already checked'));
  });
});
