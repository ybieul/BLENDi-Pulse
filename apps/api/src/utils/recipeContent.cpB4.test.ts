// CP-B4 — a nova tentativa por volume preserva o valor pedido: reduz primeiro
// líquido e itens volumosos, não corta os pós (quase não ocupam volume) e só
// preenche o capacityNotice quando o valor de fato deixa de ser atendido. O
// prompt principal manda usar pó de proteína em pedidos altos de proteína.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPantryRecipePrompt,
  buildPulseAiPrompt,
  type PulseAiPromptUserContext,
} from '../services/promptBuilder.service';
import {
  BLENDER_LIMIT_RETRY_REDUCTION_RULES,
  buildBlenderLimitRetryMessage,
  validateBlenderLimits,
} from './blenderGuardrail.utils';
import type { RecipeTextContext } from './recipeText.utils';

const OVER_LITE = validateBlenderLimits(
  { ingredients: [{ name: 'Milk', amount: '600ml' }] },
  'Lite'
);
if (OVER_LITE.withinLimits) throw new Error('fixture deveria passar do limite');
const violation = OVER_LITE.violation;

// A mensagem é enviada em inglês (idioma de trabalho do prompt) para todas as
// contas; o contexto muda só o formato dos números e as xícaras do imperial.
const CONTEXTS: Array<[string, RecipeTextContext | undefined]> = [
  ['sem contexto', undefined],
  ['en métrico', { locale: 'en', unitSystem: 'metric', genericBlender: false }],
  ['pt-BR imperial', { locale: 'pt-BR', unitSystem: 'imperial', genericBlender: false }],
  ['pt-BR métrico sem BLENDi', { locale: 'pt-BR', unitSystem: 'metric', genericBlender: true }],
];

describe('CP-B4 — nova tentativa por volume preserva o pedido', () => {
  for (const [label, context] of CONTEXTS) {
    it(`${label}: ordem de redução, regra do pó e manter o valor pedido`, () => {
      const message = buildBlenderLimitRetryMessage(violation, context);

      assert.match(message, /Reduce first the liquid, then fruit, leafy greens and other bulky ingredients\./);
      assert.match(message, /Protein powder, cocoa powder and other powders take very little room in the cup: do not reduce them to fix the volume\./);
      assert.match(message, /must keep that amount whenever it fits the cup/);
      assert.match(message, /Only if, after reducing, the recipe still cannot deliver what the user explicitly asked for, fill the capacityNotice/);
      assert.match(message, /If the requested value is delivered, omit capacityNotice\./);
      assert.match(message, /compare the corrected macros with the requested value: if they reach it, do not fill capacityNotice/);
      for (const rule of BLENDER_LIMIT_RETRY_REDUCTION_RULES) {
        assert.ok(message.includes(rule), rule);
      }
    });
  }

  it('a ordem de redução vem antes da regra do capacityNotice', () => {
    const message = buildBlenderLimitRetryMessage(violation);
    assert.ok(message.indexOf('Reduce first the liquid') < message.indexOf('fill the capacityNotice'));
  });

  it('não cita proteína como limite do copo', () => {
    const message = buildBlenderLimitRetryMessage(violation, CONTEXTS[2][1]);
    assert.doesNotMatch(message, /protein (limit|guardrail|cap)|maximum (allowed )?protein|g of protein/i);
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

const POWDER_RULE =
  '- For a high protein request, get the protein from protein powder (it takes little room in the cup) before bulky foods, respecting the dietary restrictions and the goal.';

const MACRO_GRAMS_RULE =
  '- A requested amount of a macro is the grams of that macro in the macros field, not the weight of an ingredient: protein powder is not 100% protein, so 70 g of protein needs more than 70 g of protein powder.';

describe('CP-B4 — prompt: pó de proteína em pedido alto de proteína', () => {
  it('a seção de tamanho do Pulse AI traz a regra, em todas as contas', () => {
    for (const overrides of [
      {},
      { unitSystem: 'imperial' as const, locale: 'pt-BR' as const },
      { blendiOwnership: 'none' as const },
      { dietaryPreferences: ['vegan' as const] },
    ]) {
      const prompt = buildPulseAiPrompt({ ...BASE, ...overrides, message: 'shake com 70 g de proteína' }).systemPrompt;
      const servingSize = prompt.slice(prompt.indexOf('Serving size (volume budget):'));
      assert.ok(servingSize.includes(POWDER_RULE), JSON.stringify(overrides));
      assert.ok(servingSize.includes(MACRO_GRAMS_RULE), JSON.stringify(overrides));
    }
  });

  it('o Pantry (várias receitas, sem pedido de valor) não ganha a regra', () => {
    const prompt = buildPantryRecipePrompt({ ...BASE, availableIngredients: [{ name: 'Banana' }] }).systemPrompt;
    assert.ok(!prompt.includes(POWDER_RULE));
    assert.ok(!prompt.includes(MACRO_GRAMS_RULE));
  });
});
