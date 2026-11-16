// CP-1.1.9 — contexto do goal WeightLoss no prompt de sistema (Pulse AI e
// Pantry Scanner). A comparação completa "antes × depois" dos prompts dos
// outros goals (modelo × goal × weightGoal × idioma × unidade × dieta ×
// caminho) foi feita contra o código anterior ao CP e está no relatório; aqui
// ficam as garantias estáveis.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DietaryPreference, UserGoal, WeightGoal } from '../models/User';
import {
  buildPantryRecipePrompt,
  buildPulseAiPrompt,
  type PulseAiPromptUserContext,
} from './promptBuilder.service';

const WEIGHT_LOSS_CONTEXT = 'prioritize satiety, high protein and fiber, and lower calories per serving';
const LOSE_SECTION_HEADER = 'Weight goal guidance (lose):';

function buildBoth(context: PulseAiPromptUserContext): string[] {
  return [
    buildPulseAiPrompt({ ...context, message: 'A filling shake please' }).systemPrompt,
    buildPantryRecipePrompt({ ...context, availableIngredients: [{ name: 'Banana' }, { name: 'Oats' }] }).systemPrompt,
  ];
}

const BASE: PulseAiPromptUserContext = {
  blendiModel: 'Lite',
  goal: 'WeightLoss',
  weightGoal: 'lose',
  locale: 'en',
  unitSystem: 'metric',
  dailyProteinTarget: 150,
  dailyCarbTarget: 150,
  dailyCalorieTarget: 1500,
};

describe('promptBuilder — goal WeightLoss', () => {
  it('traz o contexto do WeightLoss na linha do goal, nos dois caminhos', () => {
    for (const prompt of buildBoth(BASE)) {
      assert.ok(prompt.includes(`- Goal: WeightLoss (${WEIGHT_LOSS_CONTEXT}).`));
    }
  });

  it('soma-se à orientação de "lose", que aparece uma vez só, sem repetir as regras dela no contexto', () => {
    for (const prompt of buildBoth(BASE)) {
      assert.equal(prompt.split(LOSE_SECTION_HEADER).length - 1, 1);
      // As regras do "lose" (bases líquidas, mel/açúcar) não foram copiadas para o contexto do goal.
      assert.ok(!WEIGHT_LOSS_CONTEXT.includes('honey'));
      assert.ok(!WEIGHT_LOSS_CONTEXT.includes('liquid base'));
    }
  });

  it('com dieta, o contexto do goal continua e a dieta segue obrigatória', () => {
    const dietaryPreferences: DietaryPreference[] = ['vegan', 'nut_free'];
    for (const prompt of buildBoth({ ...BASE, dietaryPreferences })) {
      assert.ok(prompt.includes(WEIGHT_LOSS_CONTEXT));
      assert.ok(prompt.includes('Dietary restrictions (mandatory):'));
    }
  });

  it('os outros goals não citam o contexto do WeightLoss em nenhuma combinação de weightGoal', () => {
    const otherGoals: UserGoal[] = ['Muscle', 'Wellness', 'Energy', 'Recovery'];
    const weightGoals: Array<WeightGoal | undefined> = [undefined, 'lose', 'maintain', 'gain'];
    for (const goal of otherGoals) {
      for (const weightGoal of weightGoals) {
        for (const prompt of buildBoth({ ...BASE, goal, weightGoal })) {
          assert.ok(!prompt.includes(WEIGHT_LOSS_CONTEXT), `${goal}/${weightGoal}`);
          assert.ok(prompt.includes(`- Goal: ${goal} (`));
        }
      }
    }
  });
});
