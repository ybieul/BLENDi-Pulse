// CP-1.1.9 — limite físico do BLENDi no Pantry Scanner (CP-B2: só o volume;
// o teto de proteína saiu):
// por receita, um retry e, se continuar acima do limite, a receita é
// descartada. Todas descartadas só pelo limite → 422 scanner/blender-limit-unmet
// (scan devolvido, sem XP); se alguma caiu pela dieta, o código continua o da
// dieta. Mesma montagem de pantryScanner.controller.test.ts.
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
let limitRetryByTitle: Record<string, unknown> = {};
// CP-1.1.1d: quando definido, a geração inicial lança (falha da IA).
let generationError: Error | null = null;

const callAiMock = mock.fn(async ({ messages }: CallAiInput) => {
  const last = messages[messages.length - 1].content;

  if (generationError) {
    throw generationError;
  }

  // CP-1.1.9: retry do limite físico (CP-B2: só volume), escolhido pelo título.
  if (last.includes('physical volume')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    const answer = limitRetryByTitle[previous.title];
    if (answer instanceof Error) throw answer;
    return { content: JSON.stringify(answer), provider: 'google', model: 'm' };
  }

  if (last.includes('mandatory restrictions')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    const answer = retryByTitle[previous.title];
    if (answer instanceof Error) throw answer;
    return { content: JSON.stringify(answer), provider: 'google', model: 'm' };
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

const updateMissionProgressMock = mock.fn(async (..._args: unknown[]) => undefined);

mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: updateMissionProgressMock },
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
  limitRetryByTitle = {};
  generationError = null;
  for (const fn of [
    userFindByIdMock,
    userFindOneAndUpdateMock,
    userUpdateOneMock,
    callAiMock,
    awardXPMock,
    updateMissionProgressMock,
  ]) {
    fn.mock.resetCalls();
  }
});


// CP-B2: "heavy" passou a ser acima do VOLUME (500 ml de leite de aveia);
// antes era acima da proteína (40 g no Lite), que não é mais limite.
function heavy(title: string) {
  return {
    ...recipe(title, 'Oats'),
    ingredients: [
      { name: 'Oats', amount: '40 g' },
      { name: 'Oat milk', amount: '500 ml' },
    ],
  };
}
// 70*4 + 25*4 + 8*9 = 452 kcal (consistente); 90 g + 300 ml = 390 ml.
function highProtein(title: string) {
  return {
    ...recipe(title, 'Whey protein isolate'),
    ingredients: [
      { name: 'Whey protein isolate', amount: '90 g' },
      { name: 'Milk', amount: '300 ml' },
    ],
    macros: { protein: 70, carbs: 25, fat: 8, calories: 452 },
  };
}
function bulky(title: string) {
  return {
    ...recipe(title, 'Oats'),
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name: 'Oat milk', amount: '2 cups' },
      { name: 'Oats', amount: '80 g' },
    ],
  };
}

describe('Pantry Scanner — limite físico do BLENDi (CP-1.1.9)', () => {
  beforeEach(() => {
    fakeUser.blendiModel = 'Lite'; // 400 ml (13,5 oz)
    fakeUser.dietaryPreferences = [];
  });

  it('70 g de proteína dentro do volume: entregue no Lite, sem nova tentativa', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), highProtein('Whey Max')];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana', 'Whey Max']);
  });

  it('uma acima do volume, retry resolve: as duas entregues', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), heavy('Heavy')];
    limitRetryByTitle = { Heavy: recipe('Heavy fixed', 'Oats') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana', 'Heavy fixed']);
  });

  it('uma continua acima no retry: descartada, a outra entregue', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), bulky('Bulky')];
    limitRetryByTitle = { Bulky: bulky('Bulky again') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana']);
    assert.equal(scanRollbackCalls().length, 0);
  });

  it('as duas acima do limite: 422 blender-limit-unmet, devolve o scan, sem XP', async () => {
    initialRecipes = [heavy('Heavy'), bulky('Bulky')];
    limitRetryByTitle = { Heavy: heavy('Heavy again'), Bulky: { invalid: true } };

    const res = await analyze();

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/blender-limit-unmet');
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('retry que falha no provedor e nenhuma entregue: 503 indisponível, devolve o scan, sem XP', async () => {
    initialRecipes = [heavy('Heavy'), bulky('Bulky')];
    limitRetryByTitle = { Heavy: heavy('Heavy again'), Bulky: new Error('provider down') };

    const res = await analyze();

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'scanner/vision-unavailable');
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('falha no provedor mas a outra receita foi entregue: 200 com 1 receita', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), heavy('Heavy')];
    limitRetryByTitle = { Heavy: new Error('provider down') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana']);
  });

  it('retry de DIETA que falha no provedor: 503 indisponível, não "dieta não atendida"', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    initialRecipes = [recipe('PB Banana', 'Peanut butter'), recipe('Almond Oat', 'Almond milk')];
    // PB: retry ainda viola ('unmet'); Almond: retry falha no provedor ('aiUnavailable').
    retryByTitle = { 'PB Banana': recipe('PB v2', 'Peanuts'), 'Almond Oat': new Error('provider down') };

    const res = await analyze();

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'scanner/vision-unavailable');
  });

  it('uma pelo limite e outra pela dieta: o código continua o da dieta', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    initialRecipes = [heavy('Heavy'), recipe('PB Banana', 'Peanut butter')];
    limitRetryByTitle = { Heavy: heavy('Heavy again') };
    retryByTitle = { 'PB Banana': recipe('PB Banana v2', 'Peanuts') };

    const res = await analyze();

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/dietary-restriction-unmet');
  });

  it('retry de dieta que volta acima do limite: descartada na conferência final', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('PB Banana', 'Peanut butter')];
    retryByTitle = { 'PB Banana': heavy('Seed but heavy') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana']);
  });

  it('dentro dos limites: só a chamada de geração (sem mudança)', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('Berry Oat', 'Oats')];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
