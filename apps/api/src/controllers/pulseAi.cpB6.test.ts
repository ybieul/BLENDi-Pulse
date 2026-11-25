// CP-B6 — Pulse AI × alergias. Alérgeno cadastrado e NOMEADO na mensagem
// atual sem confirmação → 428 sem IA, sem uso, sem cache e sem turno; com a
// confirmação daquela requisição → receita com o alérgeno e aviso forte
// (allergyOverride); "Não, fazer sem" → receita sem ele e sem sugestão;
// prato que implica o alérgeno ("paçoca") → receita sem ele e sugestão;
// histórico nunca libera; IA que põe o alérgeno sem pedido → nova tentativa
// → 422; cache separado por alergia; nada de alergia nos logs.
// Mesma montagem de pulseAi.cpB7.test.ts.
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
  allergies?: { common: string[]; custom: string[] };
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
  ({ rawMessage, alcoholTier, allergyParts }: { rawMessage: string; alcoholTier?: string; allergyParts?: string[] }) =>
    [
      'u', 'm', 'g', 'l', 'us', 'wg', 'p', 'am',
      createHash('sha256').update(rawMessage).digest('hex'),
      'd',
      alcoholTier ?? 'none',
      createHash('sha256').update((allergyParts ?? []).join('|')).digest('hex'),
    ].join(':')
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
    allergies: { common: ['peanut'], custom: [] },
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

// ─── Helpers do CP-B6 ────────────────────────────────────────────────────────

const sendWith = (message: string, extra: Record<string, unknown>) => invoke(chat, { message, ...extra });

function usageReservations() {
  return userFindOneAndUpdateMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { dailyAiUsage?: number } } | undefined;
    return update?.$inc?.dailyAiUsage === 1;
  });
}

function systemPromptOfCall(index: number): string {
  return callAiMock.mock.calls[index].arguments[0].systemPrompt;
}

/** Captura tudo que vai para o console durante `run`. */
async function captureLogs(run: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const restore = (['info', 'warn', 'error', 'log'] as const).map(level => {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      lines.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    };
    return () => {
      console[level] = original;
    };
  });
  try {
    await run();
  } finally {
    restore.forEach(fn => fn());
  }
  return lines.join('\n');
}

const PEANUT_RECIPE = withIngredients(['Banana', 'Pasta de amendoim', 'Leite de aveia'], { title: 'Shake de banana com amendoim' });
const SAFE_RECIPE = withIngredients(['Banana', 'Pasta de semente de girassol', 'Leite de aveia'], { title: 'Shake de banana' });

describe('CP-B6 — alérgeno nomeado na mensagem atual', () => {
  it('sem confirmação: 428 com os alérgenos citados, sem IA, sem uso, sem cache e sem turno', async () => {
    const res = await send('shake com banana e pasta de amendoim');

    assert.equal(res.statusCode, 428);
    assert.equal(res.body?.code, 'pulseai/allergy-confirmation-required');
    assert.deepEqual(res.body?.data, { allergens: { common: ['peanut'], custom: [] } });
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(userFindOneAndUpdateMock.mock.callCount(), 0);
    assert.equal(getFromCacheMock.mock.callCount(), 0);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
  });

  it('com a confirmação daquela requisição: receita com o alérgeno, aviso forte e uso normal', async () => {
    aiResponses = [PEANUT_RECIPE];

    const res = await sendWith('shake com banana e pasta de amendoim', { allergyOverride: { common: ['peanut'], custom: [] } });
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(body.recipe.allergyOverride, { common: ['peanut'], custom: [] });
    assert.equal(body.recipe.allergySuggestion, undefined);
    assert.equal(usageReservations().length, 1);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.match(systemPromptOfCall(0), /confirmed in the app, for this request only/);
  });

  it('a confirmação não é gravada: a mesma mensagem sem ela volta a pedir', async () => {
    aiResponses = [PEANUT_RECIPE];
    await sendWith('shake com amendoim', { allergyOverride: { common: ['peanut'], custom: [] } });

    const again = await send('shake com amendoim');

    assert.equal(again.statusCode, 428);
    assert.equal(userUpdateOneMock.mock.calls.some(call => JSON.stringify(call.arguments[1]).includes('allerg')), false);
  });

  it('confirmação de item NÃO citado ou NÃO cadastrado é ignorada', async () => {
    fakeUser.allergies = { common: ['peanut', 'egg'], custom: [] };
    // Cita amendoim; confirma amendoim E ovo (ovo não foi citado) e soja (não cadastrada).
    aiResponses = [
      withIngredients(['Banana', 'Pasta de amendoim', 'Clara de ovo']),
      PEANUT_RECIPE,
    ];

    const res = await sendWith('shake com amendoim', { allergyOverride: { common: ['peanut', 'egg', 'soy'], custom: [] } });
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    // O ovo continua proibido: a primeira receita foi refeita.
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /violated the user's mandatory restrictions/);
    assert.deepEqual(body.recipe.allergyOverride, { common: ['peanut'], custom: [] });
  });

  it('confirmar só um de dois alérgenos citados ainda pede o outro', async () => {
    fakeUser.allergies = { common: ['peanut', 'milk'], custom: [] };

    const res = await sendWith('shake com amendoim e leite', { allergyOverride: { common: ['peanut'], custom: [] } });

    assert.equal(res.statusCode, 428);
    assert.deepEqual(res.body?.data, { allergens: { common: ['milk'], custom: [] } });
    assert.equal(callAiMock.mock.callCount(), 0);
  });

  it('"sem amendoim" não pede confirmação', async () => {
    aiResponses = [SAFE_RECIPE];

    const res = await send('shake de banana sem amendoim');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('"Não, fazer sem": receita sem o alérgeno, sem sugestão, e o item pedido não é cobrado', async () => {
    aiResponses = [SAFE_RECIPE];

    const res = await sendWith('shake com banana e pasta de amendoim', { allergyDeclined: { common: ['peanut'], custom: [] } });
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    // Sem nova tentativa de "faltou o item pedido".
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(body.recipe.allergyOverride, undefined);
    assert.equal(body.recipe.allergySuggestion, undefined);
    assert.equal(body.recipe.missingRequestedIngredients, undefined);
    assert.match(systemPromptOfCall(0), /chose to leave it out because of the allergy/);
  });

  it('alergia do campo livre: nomeada pede confirmação pelo próprio item', async () => {
    fakeUser.allergies = { common: [], custom: ['kiwi'] };

    const res = await send('smoothie de kiwis com banana');

    assert.equal(res.statusCode, 428);
    assert.deepEqual(res.body?.data, { allergens: { common: [], custom: ['kiwi'] } });
  });
});

describe('CP-B6 — alérgeno implícito (prato/produto)', () => {
  it('"shake de paçoca": receita SEM amendoim, com a sugestão, e a paçoca não é cobrada', async () => {
    aiResponses = [withIngredients(['Banana', 'Pasta de semente de girassol', 'Leite de aveia', 'Canela'], { title: 'Shake sabor paçoca' })];

    const res = await send('shake de paçoca');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(body.recipe.allergySuggestion, { dish: 'Paçoca', allergens: ['peanut'] });
    assert.equal(body.recipe.allergyOverride, undefined);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.match(systemPromptOfCall(0), /normally contains/);
  });

  it('a paçoca nos ingredientes, ou o alérgeno no título, são refeitos', async () => {
    aiResponses = [
      withIngredients(['Banana', 'Paçoca'], { title: 'Shake sabor paçoca' }),
      withIngredients(['Banana', 'Pasta de semente de girassol'], { title: 'Shake de paçoca com amendoim' }),
    ];

    const res = await send('shake de paçoca');

    assert.equal(res.statusCode, 422);
    assert.equal(callAiMock.mock.callCount(), 2);
  });

  it('com o alérgeno nomeado e confirmado (botão "Quer com amendoim?"), sem sugestão', async () => {
    aiResponses = [withIngredients(['Banana', 'Paçoca', 'Leite de aveia'], { title: 'Shake de paçoca' })];

    const res = await sendWith('shake de paçoca (com amendoim)', { allergyOverride: { common: ['peanut'], custom: [] } });
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(body.recipe.allergySuggestion, undefined);
    assert.deepEqual(body.recipe.allergyOverride, { common: ['peanut'], custom: [] });
  });
});

describe('CP-B6 — a rede do validador', () => {
  it('IA que põe o alérgeno sem pedido → nova tentativa → 422, sem uso gasto', async () => {
    aiResponses = [PEANUT_RECIPE, PEANUT_RECIPE];

    const res = await send('shake de banana');

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(usageRollbackCalls().length, 1);
  });

  it('mensagens anteriores e o histórico nunca liberam: a mensagem atual não nomeia → proibido', async () => {
    existingConversation = {
      _id: 'conversation-1',
      messages: [
        { role: 'user', content: 'shake com pasta de amendoim', timestamp: new Date() },
        { role: 'assistant', content: PEANUT_RECIPE, timestamp: new Date() },
      ],
    };
    aiResponses = [PEANUT_RECIPE, PEANUT_RECIPE];

    const res = await send('quero outro igual');

    assert.equal(res.statusCode, 422);
  });

  it('a dica não pode sugerir o alérgeno', async () => {
    aiResponses = [
      withIngredients(['Banana', 'Leite de aveia'], { tip: 'Fica ótimo com uma colher de pasta de amendoim.' }),
      withIngredients(['Banana', 'Leite de aveia'], { tip: 'Fica ótimo com canela.' }),
    ];

    const res = await send('shake de banana');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 2);
  });

  it('nut_free continua furável pelo pedido; a alergia, não', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    fakeUser.allergies = { common: [], custom: [] };
    aiResponses = [withIngredients(['Banana', 'Pasta de amendoim'])];

    const diet = await send('hoje quero com pasta de amendoim');
    assert.equal(diet.statusCode, 200, JSON.stringify(diet.body));

    fakeUser.allergies = { common: ['peanut'], custom: [] };
    const allergy = await send('hoje quero com pasta de amendoim');
    assert.equal(allergy.statusCode, 428);
  });

  it('alergia a trigo/glúten: aveia passa e o card ganha o aviso da aveia certificada', async () => {
    fakeUser.allergies = { common: ['wheat_gluten'], custom: [] };
    aiResponses = [withIngredients(['Banana', 'Aveia em flocos', 'Leite de aveia'])];

    const res = await send('shake de banana com aveia');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(body.recipe.glutenFreeOatsNotice, true);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('os campos de alergia vindos da IA são descartados', async () => {
    fakeUser.allergies = { common: [], custom: [] };
    aiResponses = [
      recipe({
        allergyOverride: { common: ['peanut'], custom: [] },
        allergySuggestion: { dish: 'X', allergens: ['peanut'] },
        glutenFreeOatsNotice: true,
      }),
    ];

    const res = await send('shake de banana');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(body.recipe.allergyOverride, undefined);
    assert.equal(body.recipe.allergySuggestion, undefined);
    assert.equal(body.recipe.glutenFreeOatsNotice, undefined);
  });
});

describe('CP-B6 — cache e logs', () => {
  it('a chave do cache muda com as alergias e com a resposta da folha', async () => {
    aiResponses = [SAFE_RECIPE, SAFE_RECIPE, PEANUT_RECIPE];

    fakeUser.allergies = { common: [], custom: [] };
    await send('shake de banana');
    fakeUser.allergies = { common: ['peanut'], custom: [] };
    await send('shake de banana');
    await sendWith('shake de banana com amendoim', { allergyOverride: { common: ['peanut'], custom: [] } });

    const parts = generateCacheKeyMock.mock.calls.map(call => (call.arguments[0] as { allergyParts?: string[] }).allergyParts ?? []);
    assert.deepEqual(parts[0], []);
    assert.ok(parts[1].length > 0);
    assert.notDeepEqual(parts[1], parts[2]);
  });

  it('receita do cache com o alérgeno (gravada antes da alergia) é descartada e refeita', async () => {
    cachedValue = { recipe: PEANUT_RECIPE, aiProvider: 'google', aiModel: 'gemini-test' };
    aiResponses = [SAFE_RECIPE];

    const res = await send('shake de banana');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, false);
  });

  it('nenhum log leva a alergia nem o alérgeno', async () => {
    fakeUser.allergies = { common: ['peanut'], custom: ['kiwi'] };
    aiResponses = [PEANUT_RECIPE, PEANUT_RECIPE];

    const logs = await captureLogs(async () => {
      await send('shake com kiwi');
      await send('shake de banana');
    });

    assert.doesNotMatch(logs.toLowerCase(), /amendoim|peanut|kiwi/);
  });
});

describe('CP-B6 — chocolate com alergia a leite', () => {
  beforeEach(() => {
    fakeUser.allergies = { common: ['milk'], custom: [] };
  });

  it('"shake sabor chocolate": IA devolve "Chocolate" → nova tentativa; "Cacau em pó" passa, sem confirmação nem sugestão', async () => {
    aiResponses = [
      withIngredients(['Banana', 'Chocolate', 'Leite de aveia'], { title: 'Shake de chocolate' }),
      withIngredients(['Banana', 'Cacau em pó', 'Leite de aveia'], { title: 'Shake de chocolate' }),
    ];

    const res = await send('shake sabor chocolate');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /violated the user's mandatory restrictions/);
    assert.equal(body.recipe.allergyOverride, undefined);
    assert.equal(body.recipe.allergySuggestion, undefined);
    assert.equal(body.recipe.missingRequestedIngredients, undefined);
  });

  it('o sabor pedido continua cobrado: sem cacau nem chocolate, a receita é pedida de novo', async () => {
    aiResponses = [
      withIngredients(['Banana', 'Leite de aveia']),
      withIngredients(['Banana', 'Cacau em pó', 'Leite de aveia']),
    ];

    const res = await send('shake sabor chocolate');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.match(lastUserMessageOfCall(1), /missing ingredients the user explicitly asked for/);
  });

  it('sem alergia, "Chocolate" passa sem nova tentativa', async () => {
    fakeUser.allergies = { common: [], custom: [] };
    aiResponses = [withIngredients(['Banana', 'Chocolate', 'Leite de aveia'])];

    const res = await send('shake sabor chocolate');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});

describe('CP-B6b — chocolate na dieta vegana (Pulse AI)', () => {
  beforeEach(() => {
    fakeUser.allergies = { common: [], custom: [] };
    fakeUser.dietaryPreferences = ['vegan'];
  });

  it('"shake sabor chocolate": "Chocolate" → nova tentativa; "Cacau em pó" passa, sem aviso de dieta', async () => {
    aiResponses = [
      withIngredients(['Banana', 'Chocolate', 'Leite de aveia'], { title: 'Shake de chocolate' }),
      withIngredients(['Banana', 'Cacau em pó', 'Leite de aveia'], { title: 'Shake de chocolate' }),
    ];

    const res = await send('shake sabor chocolate');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(body.recipe.dietOverrideIngredients, undefined);
    assert.match(systemPromptOfCall(0), /For a chocolate flavor, use cocoa powder/);
  });

  it('"com chocolate ao leite": entra, com o aviso de dieta', async () => {
    aiResponses = [withIngredients(['Banana', 'Chocolate ao leite', 'Leite de aveia'])];

    const res = await send('hoje quero com chocolate ao leite');
    const body = res.body?.data as RecipeBody;

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.deepEqual(body.recipe.dietOverrideIngredients, ['Chocolate ao leite']);
  });

  it('com a linha do chocolate na dieta e alergia a leite, a linha aparece uma vez só', async () => {
    fakeUser.allergies = { common: ['milk'], custom: [] };
    aiResponses = [withIngredients(['Banana', 'Cacau em pó', 'Leite de aveia'])];

    await send('shake sabor chocolate');

    assert.equal(systemPromptOfCall(0).split('For a chocolate flavor').length - 1, 1);
  });

  it('sem vegan/dairy_free e sem alergia a leite: sem a linha, "Chocolate" passa', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    aiResponses = [withIngredients(['Banana', 'Chocolate', 'Leite de aveia'])];

    const res = await send('shake sabor chocolate');

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.doesNotMatch(systemPromptOfCall(0), /For a chocolate flavor/);
  });
});
