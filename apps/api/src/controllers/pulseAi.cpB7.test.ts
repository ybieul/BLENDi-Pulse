// CP-B7 — Pulse AI: alimento e valor pedidos na mensagem atual conferidos
// pelo backend. Alimento que falta: até 2 novas tentativas e, se persistir,
// aviso no card (missingRequestedIngredients). Valor fora de ±10%: 1 nova
// tentativa e, se persistir, aviso (unmetTargets). Nunca bloqueia; o evento
// de log não leva o nome do item.
// Mesma montagem de pulseAi.cpB5.test.ts (models, IA, cache, XP e missões
// simulados; promptBuilder e validadores reais).
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
  birthDate: Date;
  hasRealBodyProfile: boolean;
  alcoholAgeConfirmed?: boolean;
}

let fakeUser: FakeUser;

const userFindByIdMock = mock.fn((_id: string) => chain(fakeUser));
const userFindOneAndUpdateMock = mock.fn((..._args: unknown[]) =>
  chain({ dailyAiUsage: fakeUser.dailyAiUsage + 1, isPro: fakeUser.isPro })
);
const userUpdateOneMock = mock.fn((...args: unknown[]) => {
  // Simula o filtro de write-once da confirmação de idade.
  const filter = args[0] as { alcoholAgeConfirmed?: { $exists: boolean } };
  const update = args[1] as { $set?: { alcoholAgeConfirmed?: boolean } };
  if (filter?.alcoholAgeConfirmed?.$exists === false && update?.$set && 'alcoholAgeConfirmed' in update.$set) {
    if (fakeUser.alcoholAgeConfirmed === undefined) {
      fakeUser.alcoholAgeConfirmed = update.$set.alcoholAgeConfirmed;
      return chain({ matchedCount: 1, modifiedCount: 1 });
    }
    return chain({ matchedCount: 0, modifiedCount: 0 });
  }
  return chain({ matchedCount: 1 });
});

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: userFindByIdMock,
      findOneAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

let recentBlendLogs: Array<{ recipeName: string }> = [];
mock.module('../models/BlendLog', {
  namedExports: {
    BlendLogModel: { find: () => chain(recentBlendLogs) },
  },
});

let existingConversation: unknown = null;
const conversationUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/Conversation', {
  namedExports: {
    ConversationModel: {
      findOne: () => chain(existingConversation),
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
const generateCacheKeyMock = mock.fn(
  ({ rawMessage, alcoholTier }: { rawMessage: string; alcoholTier?: string }) =>
    ['u', 'm', 'g', 'l', 'us', 'wg', 'p', 'am', createHash('sha256').update(rawMessage).digest('hex'), 'd', alcoholTier ?? 'none'].join(':')
);

mock.module('../services/cache.service', {
  namedExports: {
    generateCacheKey: generateCacheKeyMock,
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
    title: 'Shake',
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name: 'Leite de aveia', amount: '200 ml' },
    ],
    // 10*4 + 40*4 + 5*9 = 245
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Bata por 45 segundos.',
    hasSubstitutes: false,
    ...overrides,
  };
}

function withIngredients(names: string[], overrides: Record<string, unknown> = {}) {
  return recipe({ ingredients: names.map(name => ({ name, amount: '30 g' })), ...overrides });
}

function fakeRes() {
  const res: { statusCode?: number; body?: Record<string, unknown> } & Partial<Response> = {};
  res.status = ((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: Record<string, unknown>) => {
    res.body = body;
    return res as Response;
  }) as Response['json'];
  return res;
}

async function invoke(handler: ControllerModule['chat'], body: unknown) {
  const res = fakeRes();
  let nextError: unknown;
  await handler(
    { body, user: { sub: 'user-1' } } as unknown as Request,
    res as Response,
    ((error: unknown) => {
      nextError = error;
    }) as NextFunction
  );
  if (nextError) throw nextError;
  return res;
}

const send = (message: string) => invoke(chat, { message });

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

type RecipeBody = {
  recipe: {
    title: string;
    dietOverrideIngredients?: string[];
    alcoholFreeVersion?: boolean;
    alcoholGrams?: number;
    macrosValidated?: boolean;
    ingredients: Array<{ name: string }>;
  } & Record<string, unknown>;
};

function yearsAgo(years: number, days = 0): Date {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

beforeEach(() => {
  fakeUser = {
    _id: 'user-1',
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: [],
    locale: 'pt-BR',
    unitSystem: 'metric',
    timezone: 'America/Sao_Paulo',
    dailyProteinTarget: 150,
    dailyCarbTarget: 200,
    dailyCalorieTarget: 2000,
    dailyAiUsage: 0,
    aiUsageResetDate: new Date(),
    isPro: false,
    // Conta com data de nascimento real de 30 anos (21+).
    birthDate: yearsAgo(30),
    hasRealBodyProfile: true,
  };
  aiResponses = [];
  cachedValue = null;
  existingConversation = null;
  recentBlendLogs = [];
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
    generateCacheKeyMock,
  ]) {
    fn.mock.resetCalls();
  }
});

// ─── Helpers do CP-B7 ────────────────────────────────────────────────────────

const ITEM_RETRY_MARKER = 'missing ingredients the user explicitly asked for';
const TARGET_RETRY_MARKER = 'does not meet the nutrient values';

function retryCallsWith(marker: string) {
  return callAiMock.mock.calls.filter(call => {
    const messages = call.arguments[0].messages;
    return messages[messages.length - 1].content.includes(marker);
  });
}

/** Captura console.warn durante `run` (para o evento de log). */
async function captureWarnings(run: () => Promise<void>): Promise<unknown[][]> {
  const logs: unknown[][] = [];
  const warn = mock.method(console, 'warn', (...args: unknown[]) => {
    logs.push(args);
  });
  try {
    await run();
  } finally {
    warn.mock.restore();
  }
  return logs;
}

// Macros consistentes (4/4/9) para não disparar a nova tentativa de macros.
function withProtein(protein: number, names: string[] = ['Banana', 'Leite de aveia'], overrides: Record<string, unknown> = {}) {
  const carbs = 30;
  const fat = 5;
  return withIngredients(names, {
    macros: { protein, carbs, fat, calories: Math.round(protein * 4 + carbs * 4 + fat * 9) },
    ...overrides,
  });
}

function withCalories(calories: number, names: string[] = ['Banana', 'Leite de aveia']) {
  // proteína 10, gordura 5 → carboidrato fecha a conta.
  const carbs = (calories - 10 * 4 - 5 * 9) / 4;
  return withIngredients(names, { macros: { protein: 10, carbs, fat: 5, calories } });
}

type CheckedRecipe = RecipeBody['recipe'] & {
  missingRequestedIngredients?: string[];
  unmetTargets?: Array<Record<string, unknown>>;
  capacityNotice?: string;
};

function deliveredRecipe(res: { body?: Record<string, unknown> }): CheckedRecipe {
  return (res.body?.data as { recipe: CheckedRecipe }).recipe;
}

// Volume perto do limite do copo de 400 ml (ProPlus/Lite).
const FULL_CUP_WHEY = [
  { name: 'Whey', amount: '60 g' },
  { name: 'Leite de aveia', amount: '320 ml' },
];
// Metade do copo: 200 ml.
const HALF_CUP_NO_BANANA = [
  { name: 'Morango', amount: '100 g' },
  { name: 'Leite de aveia', amount: '100 ml' },
];
const CUP_NOTICE = 'Você pediu mais do que cabe; o copo comporta até 400 ml.';

// ─── Alimento pedido ─────────────────────────────────────────────────────────

describe('CP-B7 — alimento pedido na mensagem atual', () => {
  it('"shake com banana" sem banana → 2 novas tentativas → aviso no card; o log tem só contagens', async () => {
    aiResponses = [
      withIngredients(['Morango', 'Leite de aveia']),
      withIngredients(['Morango', 'Leite de aveia']),
      withIngredients(['Morango', 'Leite de aveia']),
    ];
    let res: Awaited<ReturnType<typeof send>> | undefined;

    const logs = await captureWarnings(async () => {
      res = await send('shake com banana');
    });

    assert.equal(res?.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 3);
    const retries = retryCallsWith(ITEM_RETRY_MARKER);
    assert.equal(retries.length, 2);
    assert.ok(lastUserMessageOfCall(1).includes('["banana"]'));
    assert.deepEqual(deliveredRecipe(res!).missingRequestedIngredients, ['banana']);
    // Nunca bloqueia: uso gasto, conversa gravada.
    assert.equal(usageRollbackCalls().length, 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 1);

    const event = logs.find(args => args[0] === '[requestCheck] requested item unmet');
    assert.ok(event, 'evento de log ausente');
    assert.deepEqual(event[1], {
      event: 'requested_item_unmet',
      origin: 'pulse_ai',
      type: 'ingredient',
      count: 1,
      attempts: 2,
      provider: 'google',
      model: 'gemini-test',
    });
    assert.ok(!JSON.stringify(logs).toLowerCase().includes('banana'), 'o log não pode ter o nome do item');
  });

  it('banana só na 2ª nova tentativa → entregue sem aviso', async () => {
    aiResponses = [
      withIngredients(['Morango', 'Leite de aveia']),
      withIngredients(['Morango', 'Leite de aveia']),
      withIngredients(['Banana', 'Morango', 'Leite de aveia']),
    ];

    const res = await send('shake com banana');

    assert.equal(res.statusCode, 200);
    assert.equal(retryCallsWith(ITEM_RETRY_MARKER).length, 2);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
    assert.deepEqual(deliveredRecipe(res).ingredients.map(i => i.name), ['Banana', 'Morango', 'Leite de aveia']);
  });

  it('com banana (e morango, no plural) → uma chamada só, sem aviso', async () => {
    aiResponses = [withIngredients(['Banana', 'Morangos', 'Leite de aveia'])];

    const res = await send('shake com banana e morango');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('"sem banana" não cobra a banana', async () => {
    aiResponses = [withIngredients(['Morango', 'Leite de aveia'])];

    const res = await send('shake de morango sem banana');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('sabor baunilha atendido por "Extrato de baunilha"', async () => {
    aiResponses = [withIngredients(['Banana', 'Extrato de baunilha', 'Leite de aveia'])];

    const res = await send('shake sabor baunilha');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('sabor chocolate atendido por cacau em pó', async () => {
    aiResponses = [withIngredients(['Banana', 'Cacau em pó', 'Leite de aveia'])];

    const res = await send('shake sabor chocolate');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('item de mensagem anterior (histórico) não é cobrado', async () => {
    existingConversation = {
      _id: 'conversation-1',
      messages: [
        { role: 'user', content: 'shake com banana', timestamp: new Date() },
        { role: 'assistant', content: withIngredients(['Banana']), timestamp: new Date() },
      ],
    };
    aiResponses = [withIngredients(['Manga', 'Leite de aveia'])];

    const res = await send('agora outro shake');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('"piña colada com rum" para menor de 21: versão sem álcool, o rum não é cobrado', async () => {
    fakeUser.birthDate = yearsAgo(18);
    aiResponses = [
      withIngredients(['Abacaxi', 'Leite de coco', 'Água'], { title: 'Piña colada sem álcool' }),
    ];

    const res = await send('piña colada com rum');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    const delivered = deliveredRecipe(res);
    assert.equal(delivered.missingRequestedIngredients, undefined);
    assert.equal(delivered.alcoholFreeVersion, true);
  });

  it('21+ que pede rum: o rum é cobrado como os outros itens', async () => {
    aiResponses = [
      withIngredients(['Abacaxi', 'Leite de coco'], { title: 'Piña colada' }),
      recipe({
        title: 'Piña colada',
        ingredients: [
          { name: 'Rum branco', amount: '50 ml' },
          { name: 'Abacaxi', amount: '150 g' },
          { name: 'Leite de coco', amount: '50 ml' },
        ],
        macros: { protein: 1, carbs: 20, fat: 5, calories: 241 },
        alcoholGrams: 16,
      }),
    ];

    const res = await send('piña colada com rum');

    assert.equal(res.statusCode, 200);
    assert.equal(retryCallsWith(ITEM_RETRY_MARKER).length, 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('gelo no Lite não é cobrado', async () => {
    fakeUser.blendiModel = 'Lite';
    aiResponses = [withIngredients(['Banana', 'Leite de aveia'])];

    const res = await send('shake de banana com gelo');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('en: "banana shake with strawberries" e nome digitado entre parênteses', async () => {
    fakeUser.locale = 'en';
    aiResponses = [
      withIngredients(['Banana', 'Oat milk']),
      withIngredients(['Banana', 'Morango (strawberry)', 'Oat milk']),
    ];

    const res = await invoke(chat, { message: 'banana shake with strawberries', language: 'en' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCallsWith(ITEM_RETRY_MARKER).length, 1);
    assert.ok(lastUserMessageOfCall(1).includes('["strawberry"]'));
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('en: "no banana" não cobra; falha do provedor na nova tentativa entrega a receita com aviso', async () => {
    fakeUser.locale = 'en';
    aiResponses = [withIngredients(['Mango', 'Oat milk']), new FakeAiProviderRequestError('down')];

    const res = await invoke(chat, { message: 'mango and kiwi smoothie, no banana', language: 'en' });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(deliveredRecipe(res).missingRequestedIngredients, ['kiwi']);
  });

  it('o aviso é só do backend: o valor da IA é descartado', async () => {
    aiResponses = [withIngredients(['Banana', 'Leite de aveia'], { missingRequestedIngredients: ['inventado'], unmetTargets: [{ nutrient: 'protein' }] })];

    const res = await send('shake de banana');

    assert.equal(res.statusCode, 200);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('receita do cache passa pela mesma conferência final (sem nova tentativa)', async () => {
    cachedValue = {
      recipe: withIngredients(['Morango', 'Leite de aveia']),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };

    const res = await send('shake com banana');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.deepEqual(deliveredRecipe(res).missingRequestedIngredients, ['banana']);
  });
});

// ─── Valor pedido ────────────────────────────────────────────────────────────

describe('CP-B7 — valor pedido na mensagem atual', () => {
  it('30 g pedido e 27,5 g entregue → passa (±10%), sem nova tentativa', async () => {
    aiResponses = [withProtein(27.5)];

    const res = await send('shake com 30 g de proteína');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('19,8 g → 1 nova tentativa (pedido × entregue) → aviso; log sem conteúdo', async () => {
    aiResponses = [withProtein(19.8), withProtein(19.8)];
    let res: Awaited<ReturnType<typeof send>> | undefined;

    const logs = await captureWarnings(async () => {
      res = await send('shake com 30 g de proteína');
    });

    assert.equal(res?.statusCode, 200);
    const retries = retryCallsWith(TARGET_RETRY_MARKER);
    assert.equal(retries.length, 1);
    assert.ok(lastUserMessageOfCall(1).includes('30 g of protein and the recipe has 19.8 g'));
    assert.ok(lastUserMessageOfCall(1).includes('protein powder'));
    assert.deepEqual(deliveredRecipe(res!).unmetTargets, [
      { nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8 },
    ]);
    const event = logs.find(args => args[0] === '[requestCheck] requested target unmet');
    assert.ok(event);
    assert.deepEqual(event[1], {
      event: 'requested_target_unmet',
      origin: 'pulse_ai',
      type: 'target',
      nutrient: 'protein',
      count: 1,
      attempts: 1,
      provider: 'google',
      model: 'gemini-test',
    });
  });

  it('a nova tentativa acerta → sem aviso', async () => {
    aiResponses = [withProtein(19.8), withProtein(31, ['Whey', 'Banana', 'Leite de aveia'])];

    const res = await send('shake com 30 g de proteína');

    assert.equal(res.statusCode, 200);
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('não duplica com o capacityNotice legítimo (volume 95%): sem nova tentativa, mantém só o aviso do copo', async () => {
    const notice = 'Você pediu 90 g de proteína, mas o copo comporta até 400 ml; esta receita tem 60 g.';
    // CP-B8a: 60 g de whey + 320 ml de leite = 380 ml = 95% do copo de 400 ml.
    aiResponses = [withProtein(60, [], { capacityNotice: notice, ingredients: FULL_CUP_WHEY })];

    const res = await send('shake com 90 g de proteína');

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).capacityNotice, notice);
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('máximo: "no máximo 250 kcal" com 320 → nova tentativa → 240 passa', async () => {
    aiResponses = [withCalories(320), withCalories(240)];

    const res = await send('shake com no máximo 250 kcal');

    assert.equal(res.statusCode, 200);
    assert.equal(retryCallsWith(TARGET_RETRY_MARKER).length, 1);
    assert.ok(lastUserMessageOfCall(1).includes('at most 250 kcal'));
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('en: "at least 30g of protein" com 20 → aviso de mínimo', async () => {
    fakeUser.locale = 'en';
    aiResponses = [withProtein(20, ['Banana', 'Oat milk']), withProtein(20, ['Banana', 'Oat milk'])];

    const res = await invoke(chat, { message: 'shake with at least 30g of protein', language: 'en' });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(deliveredRecipe(res).unmetTargets, [
      { nutrient: 'protein', kind: 'min', requested: 30, delivered: 20 },
    ]);
  });
});

// ─── CP-B8a: capacityNotice só vale perto do limite ─────────────────────────

describe('CP-B8a — capacityNotice conferido pelo volume', () => {
  it('banana faltando + capacityNotice + volume 50% → aviso descartado, nova tentativa, banana cobrada; evento só com códigos', async () => {
    aiResponses = [
      recipe({ ingredients: HALF_CUP_NO_BANANA, capacityNotice: CUP_NOTICE }),
      recipe({ ingredients: [{ name: 'Banana', amount: '1' }, ...HALF_CUP_NO_BANANA] }),
    ];
    let res: Awaited<ReturnType<typeof send>> | undefined;

    const logs = await captureWarnings(async () => {
      res = await send('shake com banana');
    });

    assert.equal(res?.statusCode, 200);
    assert.equal(retryCallsWith(ITEM_RETRY_MARKER).length, 1);
    const delivered = deliveredRecipe(res!);
    assert.equal(delivered.capacityNotice, undefined);
    assert.equal(delivered.missingRequestedIngredients, undefined);
    assert.ok(delivered.ingredients.some(i => i.name === 'Banana'));
    // A receita refeita não tem aviso; o descarte é registrado quando o aviso chega ao fim.
    assert.equal(logs.filter(args => args[0] === '[requestCheck] capacity notice discarded').length, 0);
  });

  it('o aviso ilegítimo que chega à entrega é descartado e registrado (sem conteúdo)', async () => {
    aiResponses = [recipe({ ingredients: HALF_CUP_NO_BANANA, capacityNotice: CUP_NOTICE })];
    let res: Awaited<ReturnType<typeof send>> | undefined;

    const logs = await captureWarnings(async () => {
      res = await send('shake de morango');
    });

    assert.equal(deliveredRecipe(res!).capacityNotice, undefined);
    const event = logs.find(args => args[0] === '[requestCheck] capacity notice discarded');
    assert.ok(event);
    assert.deepEqual(event[1], {
      event: 'capacity_notice_discarded',
      origin: 'pulse_ai',
      volumePercent: 50,
      unmeasured: 0,
      provider: 'google',
      model: 'gemini-test',
    });
    assert.ok(!JSON.stringify(logs).includes('copo comporta'));
  });

  it('banana faltando + capacityNotice + volume 95% → aviso mantido, nada cobrado', async () => {
    aiResponses = [
      recipe({
        ingredients: [{ name: 'Morango', amount: '200 g' }, { name: 'Leite de aveia', amount: '180 ml' }],
        capacityNotice: CUP_NOTICE,
      }),
    ];

    const res = await send('shake com banana');

    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).capacityNotice, CUP_NOTICE);
    assert.equal(deliveredRecipe(res).missingRequestedIngredients, undefined);
  });

  it('30 g de proteína pedidos, 19,8 entregues, capacityNotice com volume 60% → descartado, unmetTargets', async () => {
    const sixty = [{ name: 'Banana', amount: '1' }, { name: 'Leite de aveia', amount: '122 ml' }];
    aiResponses = [withProtein(19.8, [], { ingredients: sixty, capacityNotice: CUP_NOTICE }), withProtein(19.8, [], { ingredients: sixty })];

    const res = await send('shake com 30 g de proteína');

    assert.equal(retryCallsWith(TARGET_RETRY_MARKER).length, 1);
    assert.equal(deliveredRecipe(res).capacityNotice, undefined);
    assert.deepEqual(deliveredRecipe(res).unmetTargets, [
      { nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8 },
    ]);
  });

  it('900 kcal no Lite com volume 98% → aviso mantido, sem nova tentativa', async () => {
    fakeUser.blendiModel = 'Lite';
    const notice = 'Você pediu 900 kcal, mas o copo comporta até 400 ml; esta receita tem 610 kcal.';
    aiResponses = [
      recipe({
        ingredients: [
          { name: 'Pasta de amendoim', amount: '60 g' },
          { name: 'Aveia', amount: '60 g' },
          { name: 'Banana', amount: '1' },
          { name: 'Leite de aveia', amount: '154 ml' },
        ],
        macros: { protein: 20, carbs: 70, fat: 30, calories: 630 },
        capacityNotice: notice,
      }),
    ];

    const res = await send('shake com 900 kcal');

    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(deliveredRecipe(res).capacityNotice, notice);
    assert.equal(deliveredRecipe(res).unmetTargets, undefined);
  });

  it('receita do cache: aviso ilegítimo descartado e item cobrado no aviso', async () => {
    cachedValue = {
      recipe: recipe({ ingredients: HALF_CUP_NO_BANANA, capacityNotice: CUP_NOTICE }),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };

    const res = await send('shake com banana');

    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(deliveredRecipe(res).capacityNotice, undefined);
    assert.deepEqual(deliveredRecipe(res).missingRequestedIngredients, ['banana']);
  });
});
