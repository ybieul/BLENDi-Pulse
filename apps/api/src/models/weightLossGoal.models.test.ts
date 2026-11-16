// CP-1.1.9 — schemas Mongoose com o goal WeightLoss (sem banco: validate()
// roda os validadores e os hooks de 'validate' em memória).
// - User: aceita WeightLoss, e a guarda do documento recusa WeightLoss sem
//   weightGoal 'lose' (cadastro, Google, Apple, user.save()).
// - Favorite: aceita o valor novo e continua recusando valor inválido.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import mongoose from 'mongoose';

import { FavoriteModel } from './Favorite';
import { UserModel } from './User';

function newUser(goal: string, weightGoal: string) {
  return new UserModel({
    email: 'model@test.local',
    name: 'Model Test',
    blendiModel: 'Lite',
    goal,
    weightGoal,
    timezone: 'UTC',
    dailyProteinTarget: 150,
    dailyCalorieTarget: 1500,
    biologicalSex: 'female',
    activityLevel: 'moderatelyActive',
    birthDate: new Date('1990-06-15T00:00:00.000Z'),
  });
}

function errorPaths(err: unknown): string[] {
  return err instanceof mongoose.Error.ValidationError ? Object.keys(err.errors) : [];
}

describe('UserModel — goal WeightLoss', () => {
  it('WeightLoss + lose é válido', async () => {
    await newUser('WeightLoss', 'lose').validate();
  });

  for (const weightGoal of ['maintain', 'gain']) {
    it(`WeightLoss + ${weightGoal} é recusado no campo weightGoal`, async () => {
      await assert.rejects(newUser('WeightLoss', weightGoal).validate(), err => {
        assert.deepEqual(errorPaths(err), ['weightGoal']);
        return true;
      });
    });
  }

  it('outros goals aceitam qualquer weightGoal, como antes', async () => {
    for (const goal of ['Muscle', 'Wellness', 'Energy', 'Recovery']) {
      for (const weightGoal of ['lose', 'maintain', 'gain']) {
        await newUser(goal, weightGoal).validate();
      }
    }
  });

  it('goal fora da lista continua recusado', async () => {
    await assert.rejects(newUser('weightLoss', 'lose').validate(), err => {
      assert.ok(errorPaths(err).includes('goal'));
      return true;
    });
  });
});

describe('FavoriteModel — goal WeightLoss', () => {
  function newFavorite(goal: string) {
    return new FavoriteModel({
      userId: new mongoose.Types.ObjectId(),
      recipeName: 'Raspberry Whey Shake',
      ingredients: [{ name: 'Whey protein isolate', amount: '30g' }],
      protein: 34,
      carbs: 26,
      fat: 2,
      calories: 244,
      prepTimeSeconds: 240,
      blendInstruction: 'Blend until smooth.',
      hasSubstitutes: false,
      blendiModel: 'Lite',
      goal,
    });
  }

  it('aceita WeightLoss', async () => {
    await newFavorite('WeightLoss').validate();
  });

  it('continua recusando goal inválido', async () => {
    await assert.rejects(newFavorite('Weight Loss').validate(), err => {
      assert.ok(errorPaths(err).includes('goal'));
      return true;
    });
  });
});
