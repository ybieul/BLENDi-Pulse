// CP-1.1.9 — regra "WeightLoss sempre com weightGoal 'lose'", multiplicador de
// proteína do WeightLoss, pool de missões e textos de notificação.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { USER_GOAL_VALUES, WEIGHT_GOAL_VALUES } from '@blendi/shared';

import { FALLBACK_MISSION_TYPES, MISSION_DEFINITIONS, MISSION_POOLS } from '../config/missionDefinitions';
import notificationEn from '../locales/notification-en.json';
import notificationPtBr from '../locales/notification-pt-br.json';
import { getAccountCreationBodyProfileDefaults } from './accountDefaults.utils';
import { calculateMacroTargets } from './macroCalculation.utils';
import {
  getCalorieGoalXpRange,
  isWithinCalorieGoalXpRange,
  resolveWeightLossGoalCoherence,
} from './weightLossGoal.utils';

describe('resolveWeightLossGoalCoherence — estado final do usuário', () => {
  it('troca o goal para WeightLoss sem weightGoal no corpo: grava lose e conta como mudança', () => {
    for (const savedWeightGoal of ['maintain', 'gain'] as const) {
      assert.deepEqual(
        resolveWeightLossGoalCoherence({ bodyGoal: 'WeightLoss', savedGoal: 'Muscle', savedWeightGoal }),
        { ok: true, weightGoalToSet: 'lose', weightGoalChangedByRule: true, requireGoalNotWeightLoss: false }
      );
    }
  });

  it('troca o goal para WeightLoss com lose já salvo: grava lose junto, sem contar como mudança', () => {
    assert.deepEqual(
      resolveWeightLossGoalCoherence({ bodyGoal: 'WeightLoss', savedGoal: 'Energy', savedWeightGoal: 'lose' }),
      { ok: true, weightGoalToSet: 'lose', weightGoalChangedByRule: false, requireGoalNotWeightLoss: false }
    );
  });

  it('WeightLoss + maintain/gain no corpo: recusa (goal no corpo ou já salvo)', () => {
    for (const bodyWeightGoal of ['maintain', 'gain'] as const) {
      assert.deepEqual(
        resolveWeightLossGoalCoherence({ bodyGoal: 'WeightLoss', bodyWeightGoal, savedGoal: 'Muscle', savedWeightGoal: 'maintain' }),
        { ok: false }
      );
      assert.deepEqual(
        resolveWeightLossGoalCoherence({ bodyWeightGoal, savedGoal: 'WeightLoss', savedWeightGoal: 'lose' }),
        { ok: false }
      );
    }
  });

  it('WeightLoss + lose no corpo: aceito', () => {
    assert.deepEqual(
      resolveWeightLossGoalCoherence({ bodyGoal: 'WeightLoss', bodyWeightGoal: 'lose', savedGoal: 'Muscle', savedWeightGoal: 'gain' }),
      { ok: true, weightGoalToSet: 'lose', weightGoalChangedByRule: false, requireGoalNotWeightLoss: false }
    );
  });

  it('WeightLoss salvo e PATCH sem goal nem weightGoal: não mexe no weightGoal (já é lose)', () => {
    assert.deepEqual(
      resolveWeightLossGoalCoherence({ savedGoal: 'WeightLoss', savedWeightGoal: 'lose' }),
      { ok: true, weightGoalToSet: undefined, weightGoalChangedByRule: false, requireGoalNotWeightLoss: false }
    );
  });

  it('WeightLoss salvo com weightGoal incoerente (dado antigo): corrige para lose em qualquer PATCH', () => {
    assert.deepEqual(
      resolveWeightLossGoalCoherence({ savedGoal: 'WeightLoss', savedWeightGoal: 'gain' }),
      { ok: true, weightGoalToSet: 'lose', weightGoalChangedByRule: true, requireGoalNotWeightLoss: false }
    );
  });

  it('sair do WeightLoss para outro goal não muda o weightGoal', () => {
    assert.deepEqual(
      resolveWeightLossGoalCoherence({ bodyGoal: 'Muscle', savedGoal: 'WeightLoss', savedWeightGoal: 'lose' }),
      { ok: true, weightGoalToSet: undefined, weightGoalChangedByRule: false, requireGoalNotWeightLoss: false }
    );
  });

  it('outros goals: weightGoal do corpo passa igual; só maintain/gain sozinho pede o filtro atômico', () => {
    for (const savedGoal of USER_GOAL_VALUES.filter(goal => goal !== 'WeightLoss')) {
      for (const bodyWeightGoal of WEIGHT_GOAL_VALUES) {
        assert.deepEqual(resolveWeightLossGoalCoherence({ bodyWeightGoal, savedGoal, savedWeightGoal: 'maintain' }), {
          ok: true,
          weightGoalToSet: bodyWeightGoal,
          weightGoalChangedByRule: false,
          requireGoalNotWeightLoss: bodyWeightGoal !== 'lose',
        });
        assert.deepEqual(
          resolveWeightLossGoalCoherence({ bodyGoal: savedGoal, bodyWeightGoal, savedGoal: 'WeightLoss', savedWeightGoal: 'lose' }),
          { ok: true, weightGoalToSet: bodyWeightGoal, weightGoalChangedByRule: false, requireGoalNotWeightLoss: false }
        );
      }
    }
  });
});

describe('cadastro — weightGoal inicial', () => {
  it('WeightLoss nasce com lose; os outros goals continuam com o placeholder maintain', () => {
    assert.equal(getAccountCreationBodyProfileDefaults('WeightLoss').weightGoal, 'lose');
    for (const goal of USER_GOAL_VALUES.filter(value => value !== 'WeightLoss')) {
      assert.equal(getAccountCreationBodyProfileDefaults(goal).weightGoal, 'maintain');
    }
    assert.equal(getAccountCreationBodyProfileDefaults().weightGoal, 'maintain');
  });
});

describe('calculateMacroTargets — WeightLoss', () => {
  const body = {
    weight: 80,
    height: 175,
    birthDate: new Date('1990-06-15T00:00:00.000Z'),
    biologicalSex: 'female' as const,
    activityLevel: 'moderatelyActive' as const,
  };

  it('proteína 2,0 g/kg (80 kg → 160 g), igual ao Muscle', () => {
    const weightLoss = calculateMacroTargets({ ...body, goal: 'WeightLoss', weightGoal: 'lose' });
    const muscle = calculateMacroTargets({ ...body, goal: 'Muscle', weightGoal: 'lose' });

    assert.equal(weightLoss.dailyProteinTarget, 160);
    assert.equal(weightLoss.dailyProteinTarget, muscle.dailyProteinTarget);
  });

  it('o ajuste de calorias continua sendo o do weightGoal (lose = TDEE - 500), sem nada próprio do goal', () => {
    const lose = calculateMacroTargets({ ...body, goal: 'WeightLoss', weightGoal: 'lose' });
    const maintain = calculateMacroTargets({ ...body, goal: 'Wellness', weightGoal: 'maintain' });

    assert.equal(lose.dailyCalorieTarget, maintain.dailyCalorieTarget - 500);
  });

  it('multiplicadores dos outros goals não mudaram', () => {
    const expected = { Muscle: 160, Wellness: 128, Energy: 144, Recovery: 176 } as const;
    for (const [goal, protein] of Object.entries(expected)) {
      assert.equal(
        calculateMacroTargets({ ...body, goal: goal as keyof typeof expected, weightGoal: 'maintain' }).dailyProteinTarget,
        protein
      );
    }
  });
});

describe('missões — pool do WeightLoss', () => {
  it('todo goal tem pool, e o do WeightLoss só usa tipos que já existem', () => {
    const knownTypes = new Set(MISSION_DEFINITIONS.map(definition => definition.type));
    for (const goal of USER_GOAL_VALUES) {
      assert.ok(MISSION_POOLS[goal]?.length, `pool ausente para ${goal}`);
    }
    for (const entry of MISSION_POOLS.WeightLoss) {
      assert.ok(knownTypes.has(entry.type), `tipo desconhecido: ${entry.type}`);
      assert.ok(entry.weight > 0);
    }
  });

  it('foca em proteína e constância e nunca premia passar da meta de calorias', () => {
    const types = MISSION_POOLS.WeightLoss.map(entry => entry.type);
    assert.ok(!types.includes('hitCalorieGoal'));
    assert.ok(!FALLBACK_MISSION_TYPES.includes('hitCalorieGoal'));
    assert.ok(types.includes('hitProteinGoal'));
    assert.ok(types.includes('makeBlend'));
    // hitProteinGoal com o maior peso do pool
    const maxWeight = Math.max(...MISSION_POOLS.WeightLoss.map(entry => entry.weight));
    assert.equal(MISSION_POOLS.WeightLoss.find(entry => entry.type === 'hitProteinGoal')?.weight, maxWeight);
    // o pool permite sortear 3 missões distintas (selectDailyMissions)
    assert.ok(new Set(types).size >= 3);
  });
});

describe('notificações — Daily Pulse do WeightLoss', () => {
  const locales = { en: notificationEn, 'pt-BR': notificationPtBr };
  // Nenhuma promessa de resultado de peso (ex.: "perca 2 kg", "lose 5 lbs", "burn fat").
  const RESULT_PROMISE = /\d+\s*(kg|quilo|lb|lbs|pound)|\b(perca|perder|emagre|lose|burn|queim|slim)/i;

  for (const [locale, templates] of Object.entries(locales)) {
    it(`${locale}: todo goal tem os dois textos; WeightLoss sem promessa de resultado`, () => {
      for (const goal of USER_GOAL_VALUES) {
        const content = templates.dailyPulse.goals[goal];
        assert.ok(content.withRecipe.includes('{recipeName}'), `${goal}.withRecipe sem {recipeName}`);
        assert.ok(content.generic.trim().length > 0);
      }
      const weightLoss = templates.dailyPulse.goals.WeightLoss;
      assert.ok(!RESULT_PROMISE.test(weightLoss.withRecipe), weightLoss.withRecipe);
      assert.ok(!RESULT_PROMISE.test(weightLoss.generic), weightLoss.generic);
    });
  }
});

describe('XP de meta de calorias — faixa do WeightLoss', () => {
  const target = 1500;

  it('WeightLoss: só entre 90% e 100% da meta (passar da meta não dá XP)', () => {
    const range = getCalorieGoalXpRange('WeightLoss', target);
    assert.deepEqual(range, { min: 1350, max: 1500 });
    assert.equal(isWithinCalorieGoalXpRange(1349, range), false);
    assert.equal(isWithinCalorieGoalXpRange(1350, range), true);
    assert.equal(isWithinCalorieGoalXpRange(1500, range), true);
    assert.equal(isWithinCalorieGoalXpRange(1501, range), false);
    assert.equal(isWithinCalorieGoalXpRange(3000, range), false);
  });

  it('outros goals: como antes, basta chegar à meta, sem teto', () => {
    for (const goal of USER_GOAL_VALUES.filter(value => value !== 'WeightLoss')) {
      const range = getCalorieGoalXpRange(goal, target);
      assert.deepEqual(range, { min: 1500 });
      assert.equal(isWithinCalorieGoalXpRange(1499, range), false);
      assert.equal(isWithinCalorieGoalXpRange(1500, range), true);
      assert.equal(isWithinCalorieGoalXpRange(5000, range), true);
    }
  });
});
