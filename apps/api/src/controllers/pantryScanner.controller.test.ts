// Testes do POST /pantry-scanner/analyze focados na validação determinística
// de restrições (CP-1.1.1c): descarte por receita, entrega parcial e erro com
// devolução do scan quando nenhuma receita sobra.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

function chain(resolvedValue: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) {
    query[method] = () => query;
  }
  query.exec = async () => resolvedValue;
  return query;
}

const SCAN_RESET_DATE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

let fakeUser: Record<string, unknown>;

const userFindByIdMock = mock.fn((_id: string) => chain(fakeUser));
const userFindOneAndUpdateMock = mock.fn((..._args: unknown[]) =>
  chain({ scanCount: 1, scanResetDate: SCAN_RESET_DATE })
);
const userUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: userFindByIdMock,
      findOneAndUpdate: userFindOneAndUpdateMock,
      findByIdAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: {
    BlendLogModel: { find: () => chain([]) },
  },
});

class FakeAiProviderRequestError extends Error {}

interface CallAiInput {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}

// Resposta da geração inicial (array de 2) e, por título, a do retry de
// restrição de cada receita. Promise.all roda os retries em paralelo, então a
// resposta é escolhida pelo conteúdo e não pela ordem.
let initialRecipes: unknown[] = [];
let retryByTitle: Record<string, unknown> = {};

const callAiMock = mock.fn(async ({ messages }: CallAiInput) => {
  const last = messages[messages.length - 1].content;

  if (last.includes('mandatory restrictions')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    return { content: JSON.stringify(retryByTitle[previous.title]), provider: 'google', model: 'm' };
  }

  return { content: JSON.stringify({ recipes: initialRecipes }), provider: 'google', model: 'm' };
});

const callVisionAiMock = mock.fn(async () => ({
  content: JSON.stringify({
    ingredients: [
      { name: 'Banana', confidence: 'high' },
      { name: 'Peanut butter', confidence: 'high' },
      { name: 'Oats', confidence: 'medium' },
    ],
    noFoodDetected: false,
  }),
  provider: 'google',
  model: 'm',
}));

mock.module('../services/aiProvider.service', {
  namedExports: {
    AiProviderRequestError: FakeAiProviderRequestError,
    callAi: callAiMock,
    callVisionAi: callVisionAiMock,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({
  awarded: true,
  amount: 15,
  leveledUp: false,
  newLevel: 1,
}));

mock.module('../services/xp.service', {
  namedExports: { awardXP: awardXPMock },
});

mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: async () => undefined },
});

type ControllerModule = typeof import('./pantryScanner.controller.js');
let analyzePantry: ControllerModule['analyzePantry'];

before(async () => {
  ({ analyzePantry } = await import('./pantryScanner.controller.js'));
});

function recipe(title: string, ingredientName: string) {
  return {
    title,
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name: ingredientName, amount: '30 g' },
    ],
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend on high for 45 seconds.',
    hasSubstitutes: false,
  };
}

// '/9j/' decodifica para FF D8 FF (assinatura JPEG).
const JPEG_BASE64 = `/9j/${'A'.repeat(200)}`;

async function analyze() {
  const res: { statusCode?: number; body?: Record<string, unknown> } & Partial<Response> = {};
  res.status = ((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: Record<string, unknown>) => {
    res.body = body;
    return res as Response;
  }) as Response['json'];

  let nextError: unknown;
  await analyzePantry(
    { body: { imageBase64: JPEG_BASE64, mimeType: 'image/jpeg' }, user: { sub: 'user-1' } } as unknown as Request,
    res as Response,
    ((error: unknown) => {
      nextError = error;
    }) as NextFunction
  );

  if (nextError) throw nextError;
  return res;
}

function scanRollbackCalls() {
  return userUpdateOneMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { scanCount?: number } } | undefined;
    return update?.$inc?.scanCount === -1;
  });
}

beforeEach(() => {
  fakeUser = {
    _id: 'user-1',
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: ['nut_free'],
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'America/New_York',
    dailyProteinTarget: 150,
    dailyCarbTarget: 200,
    dailyCalorieTarget: 2000,
    scanCount: 0,
    scanResetDate: SCAN_RESET_DATE,
    isPro: false,
  };
  initialRecipes = [];
  retryByTitle = {};
  for (const fn of [userFindByIdMock, userFindOneAndUpdateMock, userUpdateOneMock, callAiMock, awardXPMock]) {
    fn.mock.resetCalls();
  }
});

describe('Pantry Scanner — validação de restrições', () => {
  it('uma receita descartada e a outra entregue', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('PB Banana', 'Peanut butter')];
    retryByTitle = { 'PB Banana': recipe('PB Banana v2', 'Almond butter') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }>; xpAwarded: number };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana']);
    assert.equal(data.xpAwarded, 15);
    assert.equal(scanRollbackCalls().length, 0);
    // 1 geração + 1 retry de restrição
    assert.equal(callAiMock.mock.callCount(), 2);
  });

  it('retry que resolve mantém as duas receitas', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('PB Banana', 'Peanut butter')];
    retryByTitle = { 'PB Banana': recipe('Seed Banana', 'Sunflower seed butter') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana', 'Seed Banana']);
  });

  it('as duas descartadas: erro novo, devolve o scan e não dá XP', async () => {
    initialRecipes = [recipe('PB Banana', 'Peanut butter'), recipe('Almond Oat', 'Almond milk')];
    retryByTitle = {
      'PB Banana': recipe('PB Banana v2', 'Peanuts'),
      'Almond Oat': { invalid: true },
    };

    const res = await analyze();

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/dietary-restriction-unmet');
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('Lite: gelo descartado; ProPlus sem dieta: nenhuma mudança', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.dietaryPreferences = [];
    initialRecipes = [recipe('Icy', 'Ice cubes'), recipe('Frozen', 'Frozen banana')];
    retryByTitle = { Icy: recipe('Icy v2', 'Crushed ice') };

    const liteRes = await analyze();
    assert.equal(liteRes.statusCode, 200);
    assert.deepEqual(
      (liteRes.body?.data as { recipes: Array<{ title: string }> }).recipes.map(r => r.title),
      ['Frozen']
    );

    fakeUser.blendiModel = 'ProPlus';
    callAiMock.mock.resetCalls();
    const proRes = await analyze();
    assert.equal(proRes.statusCode, 200);
    assert.equal((proRes.body?.data as { recipes: unknown[] }).recipes.length, 2);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
