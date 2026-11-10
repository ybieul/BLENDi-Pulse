// Testes do POST /pulse-ai/chat focados na validação determinística de
// restrições (CP-1.1.1c): retry, erro final com rollback do uso diário,
// cache que viola e ordem em relação aos guardrails de proteína e macros.
// Mocka models, IA, cache, XP e missões; o promptBuilder roda de verdade.
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
      { name: 'Frozen strawberries', amount: '150 g' },
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
      { name: 'Frozen strawberries', amount: '150 g' },
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

describe('Pulse AI — validação de restrições', () => {
  it('violação seguida de retry conforme entrega a receita refeita', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    aiResponses = [
      withIngredient('Almond butter'),
      withIngredient('Sunflower seed butter', { title: 'Seed Smoothie' }),
    ];

    const res = await send(uniqueMessage('smoothie with almond butter'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipe: { title: string }; fromCache: boolean };
    assert.equal(data.recipe.title, 'Seed Smoothie');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /the ingredient "Almond butter" uses "almond", which violates the nut-free restriction/);
    assert.equal(setInCacheMock.mock.callCount(), 1);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 1);
    assert.equal(awardXPMock.mock.callCount(), 1);
    assert.equal(usageRollbackCalls().length, 0);
  });

  it('violação repetida: erro, devolve o uso e não grava cache, conversa nem XP', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [withIngredient('Honey'), withIngredient('Raw honey')];

    const res = await send(uniqueMessage('smoothie with honey, my doctor cleared me'));

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('retry que falha (IA indisponível) também vira o erro novo, com rollback', async () => {
    fakeUser.blendiModel = 'Lite';
    aiResponses = [withIngredient('Ice cubes'), new FakeAiProviderRequestError('down')];

    const res = await send(uniqueMessage('a smoothie with lots of ice'));

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('retry com JSON inválido vira o erro novo', async () => {
    fakeUser.dietaryPreferences = ['dairy_free'];
    aiResponses = [withIngredient('Whole milk'), { not: 'a recipe' }];

    const res = await send(uniqueMessage('milkshake'));

    assert.equal(res.statusCode, 422);
    assert.equal(usageRollbackCalls().length, 1);
  });

  it('validação roda depois dos retries de proteína e de macros', async () => {
    fakeUser.blendiModel = 'Lite'; // maxProteinGrams 35
    fakeUser.dietaryPreferences = ['no_added_sugar'];
    aiResponses = [
      // 1) proteína acima do limite, sem violação de dieta
      recipe({ macros: { protein: 60, carbs: 20, fat: 5, calories: 365 } }),
      // 2) retry de proteína: traz mel e macros inconsistentes
      withIngredient('Honey', { macros: { protein: 30, carbs: 30, fat: 5, calories: 900 } }),
      // 3) retry de macros: macros ok, mas ainda com xarope
      withIngredient('Maple syrup', { macros: { protein: 30, carbs: 30, fat: 5, calories: 285 } }),
      // 4) retry de restrição: conforme
      withIngredient('Cinnamon', { title: 'Clean', macros: { protein: 30, carbs: 30, fat: 5, calories: 285 } }),
    ];

    const res = await send(uniqueMessage('max protein shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 4);
    assert.match(lastUserMessageOfCall(1), /physical protein guardrail/);
    assert.doesNotMatch(lastUserMessageOfCall(2), /mandatory restrictions/);
    assert.match(lastUserMessageOfCall(3), /"Maple syrup" uses "syrup", which violates the no added sugar restriction/);
    const data = res.body?.data as { recipe: { title: string; macrosValidated: boolean } };
    assert.equal(data.recipe.title, 'Clean');
    assert.equal(data.recipe.macrosValidated, true);
  });

  it('receita do cache que viola é descartada, removida e regenerada', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    cachedValue = {
      recipe: withIngredient('Peanut butter'),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };
    aiResponses = [withIngredient('Sunflower seeds', { title: 'Fresh' })];

    const res = await send(uniqueMessage('peanut smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal(callAiMock.mock.callCount(), 1);
    const data = res.body?.data as { recipe: { title: string }; fromCache: boolean };
    assert.equal(data.fromCache, false);
    assert.equal(data.recipe.title, 'Fresh');
    assert.equal(setInCacheMock.mock.callCount(), 1);
  });

  it('receita do cache conforme continua sendo servida do cache', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    cachedValue = { recipe: recipe(), aiProvider: 'google', aiModel: 'gemini-test' };

    const res = await send(uniqueMessage('berry smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, true);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(deleteFromCacheMock.mock.callCount(), 0);
  });

  it('sem dieta e fora do Lite: nenhuma mudança (sem retry extra)', async () => {
    aiResponses = [withIngredient('Peanut butter', {
      ingredients: [
        { name: 'Peanut butter', amount: '1 tbsp' },
        { name: 'Whole milk', amount: '240 ml' },
        { name: 'Honey', amount: '1 tsp' },
        { name: 'Ice cubes', amount: '4' },
      ],
    })];

    const res = await send(uniqueMessage('classic pb smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(usageRollbackCalls().length, 0);
  });

  it('Steel pode receber gelo', async () => {
    fakeUser.blendiModel = 'Steel';
    aiResponses = [withIngredient('Crushed ice')];

    const res = await send(uniqueMessage('icy smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
