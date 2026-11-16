// CP-1.1.9 — limite físico do BLENDi (proteína e volume) BLOQUEIA na Pulse
// AI: um retry e, se continuar acima do limite, 422 pulseai/blender-limit-unmet
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

const BLENDER_LIMIT_CODE = 'pulseai/blender-limit-unmet';

// 40*4 + 20*4 + 5*9 = 285 kcal; 30*4 + 20*4 + 5*9 = 245 kcal (macros consistentes).
function highProtein(overrides: Record<string, unknown> = {}) {
  return recipe({ macros: { protein: 40, carbs: 20, fat: 5, calories: 285 }, ...overrides });
}
function okProtein(overrides: Record<string, unknown> = {}) {
  return recipe({ macros: { protein: 30, carbs: 20, fat: 5, calories: 245 }, ...overrides });
}
function bigVolume(overrides: Record<string, unknown> = {}) {
  return recipe({
    ingredients: [
      { name: 'Skim milk', amount: '400 ml' },
      { name: 'Frozen strawberries', amount: '1 cup (200g)' },
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

describe('Pulse AI — limite físico do BLENDi bloqueia (CP-1.1.9)', () => {
  beforeEach(() => {
    fakeUser.blendiModel = 'Lite'; // 35 g de proteína, 400 ml (13,5 oz)
  });

  it('proteína acima → retry dentro do limite: entrega a receita refeita', async () => {
    aiResponses = [highProtein(), okProtein({ title: 'Lighter' })];
    const res = await send(uniqueMessage('max protein shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /protein guardrail/);
    assert.equal((res.body?.data as { recipe: { title: string } }).recipe.title, 'Lighter');
  });

  it('proteína acima de novo no retry: 422, devolve o uso, sem cache/conversa/XP', async () => {
    aiResponses = [highProtein(), highProtein()];
    expectBlocked(await send(uniqueMessage('max protein shake')));
  });

  it('volume acima (600 ml) → retry dentro do limite: entrega; a mensagem cita os números', async () => {
    aiResponses = [bigVolume(), recipe({ title: 'Smaller' })];
    const res = await send(uniqueMessage('big smoothie'));

    assert.equal(res.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /about 600ml/);
    assert.match(lastUserMessageOfCall(1), /maximum is 400ml \(13\.5oz\)/);
  });

  it('volume acima de novo no retry: 422', async () => {
    aiResponses = [bigVolume(), bigVolume()];
    expectBlocked(await send(uniqueMessage('big smoothie')));
  });

  it('proteína e volume acima juntos: uma só mensagem de retry com os dois', async () => {
    aiResponses = [bigVolume({ macros: { protein: 40, carbs: 20, fat: 5, calories: 285 } }), okProtein()];
    const res = await send(uniqueMessage('huge shake'));

    assert.equal(res.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /protein guardrail[\s\S]*physical volume/);
  });

  it('retry com JSON inválido: 422 (a IA respondeu, mas sem receita válida)', async () => {
    aiResponses = [highProtein(), { not: 'a recipe' }];
    expectBlocked(await send(uniqueMessage('max protein again')));
  });

  it('retry que falha no provedor: 503 IA indisponível (não "não coube"), com rollback e sem cache/conversa/XP', async () => {
    aiResponses = [highProtein(), new FakeAiProviderRequestError('quota exceeded')];
    const res = await send(uniqueMessage('max protein'));

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

  it('retry de restrição que volta acima do limite: barrado na conferência final', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    aiResponses = [
      withIngredient('Almond butter'),
      withIngredient('Sunflower seed butter', { macros: { protein: 40, carbs: 20, fat: 5, calories: 285 } }),
    ];
    expectBlocked(await send(uniqueMessage('nutty shake')));
  });

  it('receita do cache acima do limite é removida e regenerada', async () => {
    cachedValue = { recipe: highProtein({ title: 'Cached heavy' }), aiProvider: 'google', aiModel: 'gemini-test' };
    aiResponses = [okProtein({ title: 'Fresh' })];
    const res = await send(uniqueMessage('cached shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal((res.body?.data as { recipe: { title: string }; fromCache: boolean }).recipe.title, 'Fresh');
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, false);
  });

  it('dentro dos limites: nenhuma chamada extra (sem mudança)', async () => {
    aiResponses = [okProtein()];
    const res = await send(uniqueMessage('normal shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('Steel (55 g, 600 ml): 40 g e exatamente 600 ml passam sem retry', async () => {
    fakeUser.blendiModel = 'Steel';
    aiResponses = [bigVolume({ macros: { protein: 40, carbs: 20, fat: 5, calories: 285 } })];
    const res = await send(uniqueMessage('steel shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
