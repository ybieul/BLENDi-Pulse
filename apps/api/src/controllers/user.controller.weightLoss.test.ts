// CP-1.1.9 — PATCH /users/me e POST /users/calculate-macros com o goal
// WeightLoss: weightGoal 'lose' gravado junto, combinação contraditória
// recusada (400 user/weight-loss-requires-lose), recálculo de metas e o
// filtro atômico contra a corrida "só weightGoal" × "troca para WeightLoss".
// Inclui o pentest de mass assignment desses dois campos.
//
// Controller real; só o UserModel (um documento em memória que aplica $set,
// $unset, $push e o filtro do update) e a revogação da Apple são simulados.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import { calculateMacroTargets } from '../utils/macroCalculation.utils';

const USER_ID = '665f1b2c3d4e5f6a7b8c9d0e';
const BIRTH_DATE = new Date('1990-06-15T00:00:00.000Z');

type UserDoc = Record<string, unknown>;

function fullBodyUser(overrides: UserDoc = {}): UserDoc {
  return {
    _id: USER_ID,
    email: 'user@test.local',
    name: 'User',
    blendiModel: 'ProPlus',
    blendiOwnership: 'blendi',
    dietaryPreferences: [],
    goal: 'Muscle',
    weightGoal: 'maintain',
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'UTC',
    weight: 80,
    height: 175,
    birthDate: BIRTH_DATE,
    biologicalSex: 'female',
    activityLevel: 'moderatelyActive',
    dailyProteinTarget: 160,
    dailyCalorieTarget: 2200,
    dailyCarbTarget: 200,
    dailyFatTarget: 70,
    ...overrides,
  };
}

let storedUser: UserDoc | null = null;
/** Roda entre a leitura (findById) e a escrita — simula outra requisição concorrente. */
let beforeWrite: (() => void) | null = null;

function query<T>(value: () => T) {
  const chain = {
    select: () => chain,
    lean: () => Promise.resolve(value()),
  };
  return chain;
}

function matches(filter: Record<string, unknown>): boolean {
  if (!storedUser) return false;
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '_id') return true;
    if (condition && typeof condition === 'object' && '$ne' in condition) {
      return storedUser?.[key] !== (condition as { $ne: unknown }).$ne;
    }
    return storedUser?.[key] === condition;
  });
}

interface MongoUpdate {
  $set?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
  $push?: Record<string, unknown>;
}

function applyUpdate(update: MongoUpdate) {
  if (!storedUser) return;
  Object.assign(storedUser, update.$set ?? {});
  for (const key of Object.keys(update.$unset ?? {})) delete storedUser[key];
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    storedUser[key] = [...((storedUser[key] as unknown[]) ?? []), value];
  }
}

const findOneAndUpdateMock = mock.fn((filter: Record<string, unknown>, update: MongoUpdate) => {
  beforeWrite?.();
  beforeWrite = null;
  return query(() => {
    if (!matches(filter)) return null;
    applyUpdate(update);
    return { ...storedUser };
  });
});

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: () => query(() => (storedUser ? { ...storedUser } : null)),
      findOneAndUpdate: findOneAndUpdateMock,
      updateOne: async (filter: Record<string, unknown>, update: MongoUpdate) => {
        if (matches(filter)) applyUpdate(update);
        return { acknowledged: true };
      },
      exists: async () => (storedUser ? { _id: USER_ID } : null),
    },
  },
});
mock.module('../services/apple.service', {
  namedExports: { revokeAppleRefreshToken: async () => undefined },
});

type ControllerModule = typeof import('./user.controller.js');
let updateMe: ControllerModule['updateMe'];
let calculateMacros: ControllerModule['calculateMacros'];

before(async () => {
  ({ updateMe, calculateMacros } = await import('./user.controller.js'));
});

beforeEach(() => {
  storedUser = fullBodyUser();
  beforeWrite = null;
  findOneAndUpdateMock.mock.resetCalls();
});

interface Captured {
  status?: number;
  body?: {
    success: boolean;
    code?: string;
    errors?: Array<{ field: string; message: string }>;
    data?: Record<string, unknown> & { user?: Record<string, unknown> };
  };
  nextError?: unknown;
}

async function call(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  body: unknown
): Promise<Captured> {
  const captured: Captured = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Captured['body']) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  await handler({ body, user: { sub: USER_ID } } as unknown as Request, res, (err?: unknown) => {
    captured.nextError = err;
  });
  assert.equal(captured.nextError, undefined, `next(err): ${String(captured.nextError)}`);
  return captured;
}

const patch = (body: unknown) => call(updateMe, body);
const calc = (body: unknown) => call(calculateMacros, body);

function expectWeightLossRejected(result: Captured) {
  assert.equal(result.status, 400);
  assert.equal(result.body?.code, 'user/weight-loss-requires-lose');
}

function expectedTargets(goal: 'WeightLoss' | 'Muscle', weightGoal: 'lose' | 'maintain' | 'gain') {
  return calculateMacroTargets({
    weight: 80,
    height: 175,
    birthDate: BIRTH_DATE,
    biologicalSex: 'female',
    activityLevel: 'moderatelyActive',
    goal,
    weightGoal,
  });
}

describe('PATCH /users/me — goal WeightLoss', () => {
  it('trocar o goal para WeightLoss (sem weightGoal) grava lose e recalcula as metas com o déficit', async () => {
    const result = await patch({ goal: 'WeightLoss' });
    const expected = expectedTargets('WeightLoss', 'lose');

    assert.equal(result.status, 200);
    assert.equal(storedUser?.goal, 'WeightLoss');
    assert.equal(storedUser?.weightGoal, 'lose');
    assert.equal(storedUser?.dailyCalorieTarget, expected.dailyCalorieTarget);
    assert.equal(storedUser?.dailyProteinTarget, 160); // 80 kg × 2,0
    assert.equal(result.body?.data?.user?.weightGoal, 'lose');
    // goal e weightGoal no MESMO update (sem janela WeightLoss + maintain)
    assert.equal(findOneAndUpdateMock.mock.callCount(), 1);
    const [, update] = findOneAndUpdateMock.mock.calls[0].arguments as [unknown, MongoUpdate];
    assert.equal(update.$set?.goal, 'WeightLoss');
    assert.equal(update.$set?.weightGoal, 'lose');
  });

  it('o weightGoal trocado pela regra conta como mudança: calorias saem de maintain para lose', async () => {
    const before = expectedTargets('Muscle', 'maintain').dailyCalorieTarget;
    await patch({ goal: 'WeightLoss' });
    assert.equal(storedUser?.dailyCalorieTarget, before - 500);
  });

  for (const weightGoal of ['maintain', 'gain'] as const) {
    it(`goal WeightLoss + weightGoal ${weightGoal} no corpo: 400 e nada é gravado`, async () => {
      const result = await patch({ goal: 'WeightLoss', weightGoal });
      expectWeightLossRejected(result);
      assert.equal(findOneAndUpdateMock.mock.callCount(), 0);
      assert.equal(storedUser?.goal, 'Muscle');
      assert.equal(storedUser?.weightGoal, 'maintain');
    });

    it(`trocar só o weightGoal para ${weightGoal} com WeightLoss salvo: 400`, async () => {
      storedUser = fullBodyUser({ goal: 'WeightLoss', weightGoal: 'lose' });
      const result = await patch({ weightGoal });
      expectWeightLossRejected(result);
      assert.equal(storedUser?.weightGoal, 'lose');
    });
  }

  it('goal WeightLoss + weightGoal lose: aceito', async () => {
    const result = await patch({ goal: 'WeightLoss', weightGoal: 'lose' });
    assert.equal(result.status, 200);
    assert.equal(storedUser?.weightGoal, 'lose');
  });

  it('sair do WeightLoss para outro goal mantém o weightGoal', async () => {
    storedUser = fullBodyUser({ goal: 'WeightLoss', weightGoal: 'lose' });
    const result = await patch({ goal: 'Energy' });
    assert.equal(result.status, 200);
    assert.equal(storedUser?.goal, 'Energy');
    assert.equal(storedUser?.weightGoal, 'lose');
  });

  it('sair do WeightLoss mandando gain junto: aceito (estado final Muscle + gain)', async () => {
    storedUser = fullBodyUser({ goal: 'WeightLoss', weightGoal: 'lose' });
    const result = await patch({ goal: 'Muscle', weightGoal: 'gain' });
    assert.equal(result.status, 200);
    assert.equal(storedUser?.weightGoal, 'gain');
  });

  it('conta sem dados de corpo (pulou a tela): grava lose sem recalcular as metas manuais', async () => {
    storedUser = fullBodyUser({ weight: undefined, height: undefined, dailyCalorieTarget: 1800 });
    const result = await patch({ goal: 'WeightLoss', dailyCalorieTarget: 1500, dailyProteinTarget: 140 });
    assert.equal(result.status, 200);
    assert.equal(storedUser?.weightGoal, 'lose');
    assert.equal(storedUser?.dailyCalorieTarget, 1500);
    assert.equal(storedUser?.dailyProteinTarget, 140);
  });

  it('corrida: PATCH só de gain lê Muscle, mas outro PATCH grava WeightLoss antes da escrita → 400, banco fica WeightLoss + lose', async () => {
    beforeWrite = () => {
      Object.assign(storedUser ?? {}, { goal: 'WeightLoss', weightGoal: 'lose' });
    };
    const result = await patch({ weightGoal: 'gain' });
    expectWeightLossRejected(result);
    assert.equal(storedUser?.goal, 'WeightLoss');
    assert.equal(storedUser?.weightGoal, 'lose');
    const [filter] = findOneAndUpdateMock.mock.calls[0].arguments;
    assert.deepEqual(filter.goal, { $ne: 'WeightLoss' });
  });

  it('sem WeightLoss envolvido, o PATCH de weightGoal segue igual a antes', async () => {
    const result = await patch({ weightGoal: 'gain' });
    assert.equal(result.status, 200);
    assert.equal(storedUser?.weightGoal, 'gain');
    assert.equal(storedUser?.dailyCalorieTarget, expectedTargets('Muscle', 'gain').dailyCalorieTarget);
  });
});

describe('POST /users/calculate-macros — goal WeightLoss', () => {
  const body = {
    weight: 80,
    height: 175,
    birthDate: '1990-06-15',
    biologicalSex: 'female',
    activityLevel: 'moderatelyActive',
    unitSystem: 'metric',
  };

  it('sem weightGoal no corpo usa lose (não o maintain salvo)', async () => {
    const result = await calc({ ...body, goal: 'WeightLoss' });
    assert.equal(result.status, 200);
    assert.equal(result.body?.data?.dailyCalorieTarget, expectedTargets('WeightLoss', 'lose').dailyCalorieTarget);
    assert.equal(result.body?.data?.dailyProteinTarget, 160);
  });

  it('sem weightGoal nem birthDate: o fallback do perfil preenche a data, mas o weightGoal fica lose', async () => {
    const { birthDate: _omit, ...withoutBirthDate } = body;
    const result = await calc({ ...withoutBirthDate, goal: 'WeightLoss' });
    assert.equal(result.status, 200);
    assert.equal(result.body?.data?.dailyCalorieTarget, expectedTargets('WeightLoss', 'lose').dailyCalorieTarget);
  });

  for (const weightGoal of ['maintain', 'gain'] as const) {
    it(`WeightLoss + ${weightGoal}: 400`, async () => {
      expectWeightLossRejected(await calc({ ...body, goal: 'WeightLoss', weightGoal }));
    });
  }

  it('outros goals continuam usando o weightGoal salvo quando ele não vem no corpo', async () => {
    const result = await calc({ ...body, goal: 'Muscle' });
    assert.equal(result.body?.data?.dailyCalorieTarget, expectedTargets('Muscle', 'maintain').dailyCalorieTarget);
  });
});

describe('pentest — mass assignment de goal/weightGoal', () => {
  const invalidGoals: unknown[] = ['weightloss', 'Weight Loss', 'WEIGHTLOSS', 'Admin', '', null, 42, ['WeightLoss'], { $ne: null }, { $gt: '' }];
  const invalidWeightGoals: unknown[] = ['lose_fast', 'LOSE', '', null, 0, ['lose'], { $in: ['gain'] }];

  for (const goal of invalidGoals) {
    it(`PATCH e calculate-macros recusam goal ${JSON.stringify(goal)} (validação)`, async () => {
      for (const result of [await patch({ goal }), await calc({ weight: 80, height: 175, birthDate: '1990-06-15', biologicalSex: 'female', activityLevel: 'moderatelyActive', unitSystem: 'metric', weightGoal: 'lose', goal })]) {
        assert.equal(result.status, 400);
        assert.equal(result.body?.code, 'validation/invalid-input');
      }
      assert.equal(storedUser?.goal, 'Muscle');
      assert.equal(findOneAndUpdateMock.mock.callCount(), 0);
    });
  }

  for (const weightGoal of invalidWeightGoals) {
    it(`PATCH recusa weightGoal ${JSON.stringify(weightGoal)} junto com WeightLoss (validação)`, async () => {
      const result = await patch({ goal: 'WeightLoss', weightGoal });
      assert.equal(result.status, 400);
      assert.equal(result.body?.code, 'validation/invalid-input');
      assert.equal(storedUser?.goal, 'Muscle');
    });
  }

  it('campos fora do schema não são gravados junto com o WeightLoss', async () => {
    const result = await patch({ goal: 'WeightLoss', isPro: true, hasRealBodyProfile: true, scanCount: 0, role: 'admin' });
    assert.equal(result.status, 200);
    const [, update] = findOneAndUpdateMock.mock.calls[0].arguments as [unknown, MongoUpdate];
    assert.equal(update.$set?.isPro, undefined);
    assert.equal(update.$set?.hasRealBodyProfile, undefined);
    assert.equal(update.$set?.role, undefined);
  });

  it('combinação contraditória por todos os caminhos de escrita do PATCH', async () => {
    const cases: Array<{ saved: UserDoc; body: Record<string, unknown> }> = [
      { saved: {}, body: { goal: 'WeightLoss', weightGoal: 'gain' } },
      { saved: {}, body: { goal: 'WeightLoss', weightGoal: 'maintain', completingBodyOnboarding: true, weight: 80, height: 175, birthDate: '1990-06-15', biologicalSex: 'female', activityLevel: 'moderatelyActive' } },
      { saved: {}, body: { goal: 'WeightLoss', weightGoal: 'gain', blendiModel: 'Lite', blendiOwnership: 'other', otherBlenderModel: 'X' } },
      { saved: { goal: 'WeightLoss', weightGoal: 'lose' }, body: { weightGoal: 'gain', dailyCalorieTarget: 3000 } },
      { saved: { goal: 'WeightLoss', weightGoal: 'lose', blendiOwnership: 'other' }, body: { weightGoal: 'maintain', otherBlenderModel: 'Y' } },
    ];
    for (const { saved, body } of cases) {
      storedUser = fullBodyUser(saved);
      const snapshot = JSON.stringify(storedUser);
      expectWeightLossRejected(await patch(body));
      assert.equal(JSON.stringify(storedUser), snapshot, JSON.stringify(body));
    }
  });
});
