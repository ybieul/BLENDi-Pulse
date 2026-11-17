// CP-1.1.9 — limite físico do BLENDi BLOQUEIA na Pulse AI (CP-B2: só o
// volume; o teto de proteína saiu e nenhuma receita é barrada ou refeita por
// proteína): um retry e, se continuar acima do limite, 422 pulseai/blender-limit-unmet
// com rollback do uso, sem cache, conversa nem XP. Inclui a conferência final
// depois dos outros retries e a receita do cache acima do limite.
// Mesma montagem de pulseAi.controller.test.ts (models, IA, cache, XP e
// missões simulados; promptBuilder e validadores reais).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

// ─── Fakes ───────────────────────────────────────────────────────────────────

function chain(resolvedValue: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) {
    query[method] = () => query;
  }
  query.exec = async () => resolvedValue;
  return query;
}

interface FakeUser {
  _id: string;
  blendiModel: string;
  goal: string;
  dietaryPreferences: string[];
  locale: string;
  unitSystem: string;
  timezone: string;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  dailyAiUsage: number;
  aiUsageResetDate: Date;
  isPro: boolean;
}

let fakeUser: FakeUser;

const userFindByIdMock = mock.fn((_id: string) => chain(fakeUser));
const userFindOneAndUpdateMock = mock.fn((..._args: unknown[]) =>
  chain({ dailyAiUsage: fakeUser.dailyAiUsage + 1, isPro: fakeUser.isPro })
);
const userUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: userFindByIdMock,
      findOneAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: {
    BlendLogModel: { find: () => chain([]) },
  },
});

const conversationUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/Conversation', {
  namedExports: {
    ConversationModel: {
      findOne: () => chain(null),
      insertOne: async () => ({ _id: 'conversation-1' }),
      updateOne: conversationUpdateOneMock,
    },
  },
});

mock.module('../config/env', {
  namedExports: {
    env: { AI_PROVIDER: 'google', AI_MODEL: 'gemini-test' },
  },
});

class FakeAiProviderRequestError extends Error {}

interface CallAiInput {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

let aiResponses: unknown[] = [];
const callAiMock = mock.fn(async (_input: CallAiInput) => {
  if (aiResponses.length === 0) {
    throw new Error('callAi called more times than expected');
  }
  const next = aiResponses.shift();
  if (next instanceof Error) {
    throw next;
  }
  return { content: JSON.stringify(next), provider: 'google', model: 'gemini-test' };
});

mock.module('../services/aiProvider.service', {
  namedExports: {
    AiProviderRequestError: FakeAiProviderRequestError,
    callAi: callAiMock,
  },
});

let cachedValue: unknown = null;
const getFromCacheMock = mock.fn(async (_key: string) => cachedValue);
const setInCacheMock = mock.fn(async (_input: unknown) => undefined);
const deleteFromCacheMock = mock.fn(async (_key: string) => undefined);

mock.module('../services/cache.service', {
  namedExports: {
    generateCacheKey: ({ rawMessage }: { rawMessage: string }) =>
      ['u', 'm', 'g', 'l', 'us', 'wg', 'p', 'am', createHash('sha256').update(rawMessage).digest('hex'), 'd'].join(':'),
    getFromCache: getFromCacheMock,
    setInCache: setInCacheMock,
    deleteFromCache: deleteFromCacheMock,
    invalidateUserCache: async () => 0,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({
  awarded: true,
  amount: 10,
  leveledUp: false,
  newLevel: 1,
}));

mock.module('../services/xp.service', {
  namedExports: { awardXP: awardXPMock },
});

mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: async () => undefined },
});

type ControllerModule = typeof import('./pulseAi.controller.js');
let chat: ControllerModule['chat'];

before(async () => {
  ({ chat } = await import('./pulseAi.controller.js'));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recipe(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Berry Oat Smoothie',
    ingredients: [
      { name: 'Strawberries', amount: '150 g' },
      { name: 'Oat milk', amount: '240 ml' },
    ],
    // 10*4 + 40*4 + 5*9 = 245
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend on high for 45 seconds.',
    hasSubstitutes: false,
    ...overrides,
  };
}

function withIngredient(name: string, overrides: Record<string, unknown> = {}) {
  return recipe({
    ingredients: [
      { name: 'Strawberries', amount: '150 g' },
      { name, amount: '1 tbsp' },
    ],
    ...overrides,
  });
}

async function send(message: string) {
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
  await chat(
    { body: { message }, user: { sub: 'user-1' } } as unknown as Request,
    res as Response,
    ((error: unknown) => {
      nextError = error;
    }) as NextFunction
  );

  if (nextError) throw nextError;
  return res;
}

function usageRollbackCalls() {
  return userUpdateOneMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { dailyAiUsage?: number } } | undefined;
    return update?.$inc?.dailyAiUsage === -1;
  });
}

function lastUserMessageOfCall(index: number): string {
  const messages = callAiMock.mock.calls[index].arguments[0].messages;
  return messages[messages.length - 1].content;
}

let messageCounter = 0;
function uniqueMessage(text: string) {
  messageCounter += 1;
  return `${text} ${messageCounter}`;
}

beforeEach(() => {
  fakeUser = {
    _id: 'user-1',
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: [],
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'America/New_York',
    dailyProteinTarget: 150,
    dailyCarbTarget: 200,
    dailyCalorieTarget: 2000,
    dailyAiUsage: 0,
    aiUsageResetDate: new Date(),
    isPro: false,
  };
  aiResponses = [];
  cachedValue = null;
  for (const fn of [
    userFindByIdMock,
    userFindOneAndUpdateMock,
    userUpdateOneMock,
    conversationUpdateOneMock,
    callAiMock,
    getFromCacheMock,
    setInCacheMock,
    deleteFromCacheMock,
    awardXPMock,
  ]) {
    fn.mock.resetCalls();
  }
});

// ─── Casos ───────────────────────────────────────────────────────────────────

const BLENDER_LIMIT_CODE = 'pulseai/blender-limit-unmet';

// 70*4 + 25*4 + 8*9 = 452 kcal; 30*4 + 20*4 + 5*9 = 245 kcal (macros consistentes).
function highProtein(overrides: Record<string, unknown> = {}) {
  return recipe({
    ingredients: [
      { name: 'Whey protein isolate', amount: '90 g' },
      { name: 'Skim milk', amount: '300 ml' },
    ],
    macros: { protein: 70, carbs: 25, fat: 8, calories: 452 },
    ...overrides,
  });
}
function okProtein(overrides: Record<string, unknown> = {}) {
  return recipe({ macros: { protein: 30, carbs: 20, fat: 5, calories: 245 }, ...overrides });
}
function bigVolume(overrides: Record<string, unknown> = {}) {
  return recipe({
    ingredients: [
      { name: 'Skim milk', amount: '400 ml' },
      { name: 'Strawberries', amount: '1 cup (200g)' },
    ],
    ...overrides,
  });
}

function expectBlocked(res: Awaited<ReturnType<typeof send>>) {
  assert.equal(res.statusCode, 422);
  assert.equal(res.body?.code, BLENDER_LIMIT_CODE);
  assert.equal(usageRollbackCalls().length, 1, 'uso diário devolvido');
  assert.equal(setInCacheMock.mock.callCount(), 0, 'sem cache');
  assert.equal(conversationUpdateOneMock.mock.callCount(), 0, 'sem turno de conversa');
  assert.equal(awardXPMock.mock.callCount(), 0, 'sem XP');
}

describe('Pulse AI — limite físico do BLENDi bloqueia (CP-1.1.9; CP-B2: só volume)', () => {
  beforeEach(() => {
    fakeUser.blendiModel = 'Lite'; // 400 ml (13,5 oz)
  });

  it('70 g de proteína com volume dentro do copo: entregue no Lite, sem nova tentativa', async () => {
    aiResponses = [highProtein({ title: 'Triple Whey' })];
    const res = await send(uniqueMessage('shake com 70 g de proteína'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    const data = res.body?.data as { recipe: { title: string; macros: { protein: number } } };
    assert.equal(data.recipe.title, 'Triple Whey');
    assert.equal(data.recipe.macros.protein, 70);
  });

  it('nenhum modelo refaz por proteína (Lite, Pro+ e Steel)', async () => {
    for (const blendiModel of ['Lite', 'ProPlus', 'Steel']) {
      fakeUser.blendiModel = blendiModel;
      callAiMock.mock.resetCalls();
      aiResponses = [highProtein()];
      const res = await send(uniqueMessage(`max protein ${blendiModel}`));
      assert.equal(res.statusCode, 200, blendiModel);
      assert.equal(callAiMock.mock.callCount(), 1, blendiModel);
    }
  });

  it('volume acima (600 ml) → retry dentro do limite: entrega; a mensagem cita os números e pede o capacityNotice', async () => {
    aiResponses = [bigVolume(), recipe({ title: 'Berry Oat Smoothie', capacityNotice: 'You asked for a big shake; the cup holds 400 ml.' })];
    const res = await send(uniqueMessage('big smoothie'));

    assert.equal(res.statusCode, 200);
    const retryMessage = lastUserMessageOfCall(1);
    assert.match(retryMessage, /about 600ml/);
    assert.match(retryMessage, /at most 400ml \(13\.5oz\)/);
    assert.match(retryMessage, /same title/);
    assert.match(retryMessage, /capacityNotice/);
    assert.doesNotMatch(retryMessage, /protein guardrail|g of protein|maximum allowed/i);
    assert.match(retryMessage, /about 90% of the limit \(around 360ml\)/);
    const data = res.body?.data as { recipe: { capacityNotice?: string } };
    assert.equal(data.recipe.capacityNotice, 'You asked for a big shake; the cup holds 400 ml.');
  });

  it('volume acima de novo no retry: 422', async () => {
    aiResponses = [bigVolume(), bigVolume()];
    expectBlocked(await send(uniqueMessage('big smoothie')));
  });

  it('retry com JSON inválido: 422 (a IA respondeu, mas sem receita válida)', async () => {
    aiResponses = [bigVolume(), { not: 'a recipe' }];
    expectBlocked(await send(uniqueMessage('huge again')));
  });

  it('retry que falha no provedor: 503 IA indisponível (não "não coube"), com rollback e sem cache/conversa/XP', async () => {
    aiResponses = [bigVolume(), new FakeAiProviderRequestError('quota exceeded')];
    const res = await send(uniqueMessage('huge'));

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'pulseai/ai-unavailable');
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('qualquer erro no retry (não só do provedor) também não vira "não coube"', async () => {
    aiResponses = [bigVolume(), new Error('socket hang up')];
    const res = await send(uniqueMessage('big one'));

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'pulseai/ai-unavailable');
  });

  it('itens sem medida não contam: "1 banana" + 380 ml fica dentro (sem retry)', async () => {
    aiResponses = [
      recipe({ ingredients: [{ name: 'Banana', amount: '1 large' }, { name: 'Oat milk', amount: '380 ml' }] }),
    ];
    const res = await send(uniqueMessage('banana shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('retry de restrição que volta acima do volume: barrado na conferência final', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    aiResponses = [
      withIngredient('Almond butter'),
      recipe({
        ingredients: [
          { name: 'Sunflower seed butter', amount: '1 tbsp' },
          { name: 'Oat milk', amount: '500 ml' },
        ],
      }),
    ];
    expectBlocked(await send(uniqueMessage('nutty shake')));
  });

  it('receita do cache acima do volume é removida e regenerada', async () => {
    cachedValue = { recipe: bigVolume({ title: 'Cached heavy' }), aiProvider: 'google', aiModel: 'gemini-test' };
    aiResponses = [okProtein({ title: 'Fresh' })];
    const res = await send(uniqueMessage('cached shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal((res.body?.data as { recipe: { title: string }; fromCache: boolean }).recipe.title, 'Fresh');
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, false);
  });

  it('receita do cache com 70 g de proteína (dentro do volume) é servida do cache, com o capacityNotice', async () => {
    cachedValue = {
      recipe: highProtein({ title: 'Cached whey', capacityNotice: 'Ajustado para caber no copo.' }),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };
    const res = await send(uniqueMessage('cached whey'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(deleteFromCacheMock.mock.callCount(), 0);
    const data = res.body?.data as { recipe: { capacityNotice?: string }; fromCache: boolean };
    assert.equal(data.fromCache, true);
    assert.equal(data.recipe.capacityNotice, 'Ajustado para caber no copo.');
  });

  it('dentro dos limites: nenhuma chamada extra (sem mudança)', async () => {
    aiResponses = [okProtein()];
    const res = await send(uniqueMessage('normal shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('Steel (600 ml): exatamente 600 ml passa sem retry', async () => {
    fakeUser.blendiModel = 'Steel';
    aiResponses = [bigVolume({ macros: { protein: 40, carbs: 20, fat: 5, calories: 285 } })];
    const res = await send(uniqueMessage('steel shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
