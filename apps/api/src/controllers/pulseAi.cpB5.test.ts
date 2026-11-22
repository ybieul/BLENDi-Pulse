// CP-B5 — Pulse AI: dieta furada pelo pedido explícito da mensagem atual,
// álcool só para 21+ que pediu, confirmação única de idade sem gastar uso,
// avisos no card marcados pelo backend e cache separado por idade.
// Mesma montagem de pulseAi.blenderLimits.test.ts (models, IA, cache, XP e
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
let confirmAlcoholAge: ControllerModule['confirmAlcoholAge'];
let resolveAlcoholAge: ControllerModule['resolveAlcoholAge'];

before(async () => {
  ({ chat, confirmAlcoholAge, resolveAlcoholAge } = await import('./pulseAi.controller.js'));
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

// 50 ml de cachaça (~16 g de álcool) + morango + limão + água: 1*4 + 20*4 + 0 + 16*7 = 196.
// CP-B5.2: com limão (ingrediente que define a caipirinha; sem ele o backend refaz).
function caipirinha(overrides: Record<string, unknown> = {}) {
  return recipe({
    title: 'Caipirinha de morango',
    ingredients: [
      { name: 'Cachaça', amount: '50 ml' },
      { name: 'Morango', amount: '100 g' },
      { name: 'Limão', amount: '1/2' },
      { name: 'Água', amount: '100 ml' },
    ],
    macros: { protein: 1, carbs: 20, fat: 0, calories: 196 },
    alcoholGrams: 16,
    alcoholRequested: true,
    ...overrides,
  });
}

function virginCaipirinha(overrides: Record<string, unknown> = {}) {
  return recipe({
    title: 'Caipirinha de morango sem álcool',
    ingredients: [
      { name: 'Morango', amount: '150 g' },
      { name: 'Limão', amount: '1/2' },
      { name: 'Água com gás', amount: '150 ml' },
    ],
    macros: { protein: 1, carbs: 20, fat: 0, calories: 84 },
    alcoholRequested: true,
    ...overrides,
  });
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

function usageReservations() {
  return userFindOneAndUpdateMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { dailyAiUsage?: number } } | undefined;
    return update?.$inc?.dailyAiUsage === 1;
  });
}

function systemPromptOfCall(index: number): string {
  return callAiMock.mock.calls[index].arguments[0].systemPrompt;
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

let messageCounter = 0;
function uniqueMessage(text: string) {
  messageCounter += 1;
  return `${text} ${messageCounter}`;
}

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

// ─── Idade ───────────────────────────────────────────────────────────────────

describe('CP-B5 — idade para álcool (resolveAlcoholAge)', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('data real: 21 anos hoje é 21+; um dia antes do aniversário, não', () => {
    assert.equal(resolveAlcoholAge({ hasRealBodyProfile: true, birthDate: new Date('2005-11-18') }, now), 'of-age');
    assert.equal(resolveAlcoholAge({ hasRealBodyProfile: true, birthDate: new Date('2005-11-19') }, now), 'under-age');
  });

  it('data real prevalece sobre a confirmação', () => {
    assert.equal(
      resolveAlcoholAge({ hasRealBodyProfile: true, birthDate: new Date('2008-01-01'), alcoholAgeConfirmed: true }, now),
      'under-age'
    );
  });

  it('placeholder de 30 anos (hasRealBodyProfile false) não conta: vale a confirmação, ou desconhecido', () => {
    const placeholder = new Date('1996-11-18');
    assert.equal(resolveAlcoholAge({ hasRealBodyProfile: false, birthDate: placeholder }, now), 'unknown');
    assert.equal(resolveAlcoholAge({ hasRealBodyProfile: false, birthDate: placeholder, alcoholAgeConfirmed: true }, now), 'of-age');
    assert.equal(resolveAlcoholAge({ hasRealBodyProfile: false, birthDate: placeholder, alcoholAgeConfirmed: false }, now), 'under-age');
    assert.equal(resolveAlcoholAge({}, now), 'unknown');
  });
});

// ─── Dieta ───────────────────────────────────────────────────────────────────

describe('CP-B5 — dieta furada pelo pedido explícito', () => {
  it('vegana pede whey: entregue com whey, aviso com o nome, uma chamada só', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [withIngredients(['Proteína whey isolada', 'Leite de aveia', 'Banana'])];

    const res = await send(uniqueMessage('hoje quero com whey'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as RecipeBody;
    assert.deepEqual(data.recipe.dietOverrideIngredients, ['Proteína whey isolada']);
    assert.equal(data.recipe.alcoholFreeVersion, undefined);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(setInCacheMock.mock.callCount(), 1);
  });

  it('vegana pede "um shake" e a IA põe whey: refeito, sem aviso', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [
      withIngredients(['Proteína whey isolada', 'Banana']),
      withIngredients(['Proteína de ervilha', 'Banana']),
    ];

    const res = await send(uniqueMessage('um shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /uses "whey", which violates the vegan restriction/);
    const data = res.body?.data as RecipeBody;
    assert.equal(data.recipe.dietOverrideIngredients, undefined);
  });

  it('pedido em mensagem ANTERIOR não libera: "quero com whey" ontem, "um shake" hoje', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    existingConversation = {
      _id: 'conversation-1',
      messages: [
        { role: 'user', content: 'hoje quero com whey', timestamp: new Date() },
        { role: 'assistant', content: withIngredients(['Proteína whey isolada']), timestamp: new Date() },
      ],
    };
    aiResponses = [withIngredients(['Proteína whey isolada', 'Banana']), withIngredients(['Proteína whey isolada'])];

    const res = await send(uniqueMessage('outro shake'));

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(usageRollbackCalls().length, 1);
  });

  it('a IA não consegue marcar o aviso nem a versão sem álcool sozinha', async () => {
    aiResponses = [recipe({ dietOverrideIngredients: ['Banana'], alcoholFreeVersion: true })];

    const res = await send(uniqueMessage('um shake de banana'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as RecipeBody;
    assert.equal(data.recipe.dietOverrideIngredients, undefined);
    assert.equal(data.recipe.alcoholFreeVersion, undefined);
  });

  it('Lite: gelo pedido continua barrado mesmo com pedido explícito', async () => {
    fakeUser.blendiModel = 'Lite';
    aiResponses = [withIngredients(['Gelo', 'Morango']), withIngredients(['Gelo picado', 'Morango'])];

    const res = await send(uniqueMessage('smoothie com gelo'));

    assert.equal(res.statusCode, 422);
    assert.equal(usageRollbackCalls().length, 1);
  });
});

// ─── Álcool ──────────────────────────────────────────────────────────────────

describe('CP-B5 — álcool', () => {
  it('21+ (data real) que pediu: recebe com álcool, calorias do álcool contadas; prompt e cache de 21+', async () => {
    aiResponses = [caipirinha()];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as RecipeBody;
    assert.equal(data.recipe.ingredients[0].name, 'Cachaça');
    assert.equal(data.recipe.alcoholGrams, 16);
    assert.equal(data.recipe.macrosValidated, true);
    assert.equal(data.recipe.alcoholFreeVersion, undefined);
    assert.equal('alcoholRequested' in data.recipe, false);
    assert.ok(systemPromptOfCall(0).includes('The user is of legal drinking age.'));
    assert.equal((generateCacheKeyMock.mock.calls[0].arguments[0] as { alcoholTier?: string }).alcoholTier, 'of-age');
    assert.equal((setInCacheMock.mock.calls[0].arguments[0] as { alcoholTier?: string }).alcoholTier, 'of-age');
  });

  it('menor de 21 (data real): versão sem álcool com aviso; prompt sem álcool; cache não-21+', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [virginCaipirinha()];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as RecipeBody;
    assert.equal(data.recipe.alcoholFreeVersion, true);
    assert.ok(systemPromptOfCall(0).includes('Never use alcohol in this recipe'));
    assert.ok(!systemPromptOfCall(0).includes('The user is of legal drinking age.'));
    assert.equal((generateCacheKeyMock.mock.calls[0].arguments[0] as { alcoholTier?: string }).alcoholTier, 'not-of-age');
  });

  it('menor de 21: a IA põe cachaça mesmo assim → refaz sem álcool; se insistir, nada é entregue', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [caipirinha(), virginCaipirinha()];
    const fixed = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(fixed.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /violates the no alcohol/);
    assert.equal((fixed.body?.data as RecipeBody).recipe.alcoholFreeVersion, true);

    callAiMock.mock.resetCalls();
    aiResponses = [caipirinha(), caipirinha()];
    const blocked = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(blocked.statusCode, 422);
    assert.equal(setInCacheMock.mock.callCount(), 1); // só a do primeiro pedido
  });

  it('21+ que NÃO pediu: álcool adicionado pela IA nunca sai', async () => {
    aiResponses = [
      withIngredients(['Rum branco', 'Abacaxi'], { alcoholGrams: 10, alcoholRequested: false, macros: { protein: 1, carbs: 20, fat: 0, calories: 154 } }),
      withIngredients(['Abacaxi', 'Água de coco']),
    ];

    const res = await send(uniqueMessage('smoothie tropical'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /violates the no alcohol/);
    const data = res.body?.data as RecipeBody;
    assert.ok(!data.recipe.ingredients.some(ingredient => ingredient.name === 'Rum branco'));
  });

  it('21+ com dose exagerada (40 g) é refeito para uma dose normal', async () => {
    aiResponses = [
      caipirinha({ alcoholGrams: 40, macros: { protein: 1, carbs: 20, fat: 0, calories: 364 } }),
      caipirinha(),
    ];

    const res = await send(uniqueMessage('caipirinha bem forte'));

    assert.equal(res.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /at most 28 g of pure alcohol/);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholGrams, 16);
  });

  it('sem data real e sem resposta: código de confirmação, uso devolvido, nada gravado', async () => {
    fakeUser.hasRealBodyProfile = false;
    aiResponses = [virginCaipirinha()];

    const res = await send(uniqueMessage('piña colada sem gelo'));

    assert.equal(res.statusCode, 428);
    assert.equal(res.body?.code, 'pulseai/age-confirmation-required');
    assert.equal(usageReservations().length, 1);
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('sem data real, pedido sem álcool: segue normal, sem perguntar', async () => {
    fakeUser.hasRealBodyProfile = false;
    aiResponses = [recipe({ alcoholRequested: false })];

    const res = await send(uniqueMessage('shake de banana'));

    assert.equal(res.statusCode, 200);
  });

  it('confirmação "Tenho 21+" gravada uma vez; o reenvio gera com álcool e não pergunta de novo', async () => {
    fakeUser.hasRealBodyProfile = false;

    const confirmed = await invoke(confirmAlcoholAge, { isAdult: true });
    assert.equal(confirmed.statusCode, 200);
    assert.deepEqual(confirmed.body?.data, { alcoholAgeConfirmed: true });
    assert.equal(fakeUser.alcoholAgeConfirmed, true);
    const confirmCall = userUpdateOneMock.mock.calls.at(-1);
    assert.deepEqual(confirmCall?.arguments[0], { _id: 'user-1', alcoholAgeConfirmed: { $exists: false } });
    assert.ok((confirmCall?.arguments[1] as { $set: { alcoholAgeConfirmedAt: unknown } }).$set.alcoholAgeConfirmedAt instanceof Date);

    aiResponses = [caipirinha()];
    const res = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as RecipeBody).recipe.ingredients[0].name, 'Cachaça');
    assert.equal(usageReservations().length, 1);
    assert.equal(usageRollbackCalls().length, 0);
  });

  it('resposta "Não": versão sem álcool, e a resposta não pode ser trocada depois', async () => {
    fakeUser.hasRealBodyProfile = false;

    const declined = await invoke(confirmAlcoholAge, { isAdult: false });
    assert.deepEqual(declined.body?.data, { alcoholAgeConfirmed: false });

    const flip = await invoke(confirmAlcoholAge, { isAdult: true });
    assert.deepEqual(flip.body?.data, { alcoholAgeConfirmed: false });
    assert.equal(fakeUser.alcoholAgeConfirmed, false);

    aiResponses = [virginCaipirinha()];
    const res = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholFreeVersion, true);
  });

  it('confirmação com corpo inválido: 400, nada gravado', async () => {
    for (const body of [{}, { isAdult: 'yes' }, { isAdult: true, alcoholAgeConfirmed: true }]) {
      const res = await invoke(confirmAlcoholAge, body);
      assert.equal(res.statusCode, 400);
    }
    assert.equal(fakeUser.alcoholAgeConfirmed, undefined);
  });

  it('um drink no histórico não traz álcool nem pergunta idade', async () => {
    fakeUser.hasRealBodyProfile = false;
    recentBlendLogs = [{ recipeName: 'Caipirinha de morango' }];
    aiResponses = [recipe({ alcoholRequested: false })];

    const res = await send(uniqueMessage('um shake de morango'));

    assert.equal(res.statusCode, 200);
    assert.ok(systemPromptOfCall(0).includes('1. Caipirinha de morango'));
  });

  it('cache: receita com álcool gravada para 21+ continua conferida (teto) ao ser lida', async () => {
    cachedValue = {
      recipe: caipirinha({ alcoholGrams: 40, macros: { protein: 1, carbs: 20, fat: 0, calories: 364 } }),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };
    aiResponses = [caipirinha()];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, false);
  });
});

describe('CP-B5 — nova tentativa por volume mantém o que foi pedido (lote 9)', () => {
  it('Pulse AI pede para manter o item pedido e reduzir os outros antes', async () => {
    aiResponses = [
      withIngredients(['Banana'], {
        ingredients: [
          { name: 'Banana', amount: '2 (240 g)' },
          { name: 'Pasta de amendoim', amount: '1 colher de sopa (16 g)' },
          { name: 'Leite desnatado', amount: '250 ml' },
        ],
      }),
      withIngredients(['Banana'], {
        ingredients: [
          { name: 'Banana', amount: '2 (240 g)' },
          { name: 'Pasta de amendoim', amount: '1 colher de sopa (16 g)' },
          { name: 'Leite desnatado', amount: '100 ml' },
        ],
      }),
    ];

    const res = await send(uniqueMessage('2 bananas e 1 colher de pasta de amendoim'));

    assert.equal(res.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /Keep every ingredient the user's current message explicitly asked for, in the requested amount/);
  });
});

// ─── Pós CP-B5: título conferido ─────────────────────────────────────────────

describe('pós CP-B5 — título conferido com a dieta e o álcool', () => {
  const VEGAN_INGREDIENTS = ['Proteína de ervilha', 'Aveia em flocos', 'Banana'];

  it('vegana sem pedido: receita vegana com "Whey" no título → nova tentativa pelo mesmo caminho', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [
      withIngredients(VEGAN_INGREDIENTS, { title: 'Shake de Banana com Aveia e Whey' }),
      withIngredients(VEGAN_INGREDIENTS, { title: 'Shake de Banana com Aveia' }),
    ];

    const res = await send(uniqueMessage('shake com banana'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /the title uses "whey", which violates the vegan restriction/);
    assert.match(lastUserMessageOfCall(1), /Rename the title/);
    const data = res.body?.data as RecipeBody;
    assert.equal(data.recipe.title, 'Shake de Banana com Aveia');
    assert.equal(data.recipe.dietOverrideIngredients, undefined);
  });

  it('vegana que pediu whey: título com whey passa de primeira, com o aviso', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [withIngredients(['Whey protein', 'Morango', 'Leite de aveia'], { title: 'Shake de Morango com Whey' })];

    const res = await send(uniqueMessage('hoje quero com whey'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.deepEqual((res.body?.data as RecipeBody).recipe.dietOverrideIngredients, ['Whey protein']);
  });

  it('título que continua violando depois da nova tentativa → o mesmo 422 de hoje, uso devolvido', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [
      withIngredients(VEGAN_INGREDIENTS, { title: 'Shake com Whey' }),
      withIngredients(VEGAN_INGREDIENTS, { title: 'Shake com Whey' }),
    ];

    const res = await send(uniqueMessage('shake com banana'));

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
  });

  it('menor de 21: "Caipirinha de Morango" passa; "…com Cachaça" na versão sem álcool é refeita', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [virginCaipirinha({ title: 'Caipirinha de Morango' })];
    const named = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(named.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal((named.body?.data as RecipeBody).recipe.alcoholFreeVersion, true);

    callAiMock.mock.resetCalls();
    aiResponses = [
      virginCaipirinha({ title: 'Caipirinha de Morango com Cachaça' }),
      virginCaipirinha({ title: 'Caipirinha de Morango' }),
    ];
    const fixed = await send(uniqueMessage('caipirinha de morango'));
    assert.equal(fixed.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /the title uses "cachaca", which violates the no alcohol/);
    assert.equal((fixed.body?.data as RecipeBody).recipe.title, 'Caipirinha de Morango');
  });

  it('21+ que pediu: título com o destilado passa', async () => {
    aiResponses = [caipirinha({ title: 'Caipirinha de Morango com Cachaça' })];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});

// ─── CP-B5.2: detecção mista e ingredientes do drink ─────────────────────────

describe('CP-B5.2 — detecção mista: o código decide os casos óbvios', () => {
  // Piña colada com rum, abacaxi e coco: 1*4 + 20*4 + 10*9 + 16*7 = 286.
  function colada(overrides: Record<string, unknown> = {}) {
    return recipe({
      title: 'Piña Colada',
      ingredients: [
        { name: 'Abacaxi', amount: '150 g' },
        { name: 'Leite de coco', amount: '100 ml' },
        { name: 'Rum branco', amount: '50 ml' },
      ],
      macros: { protein: 1, carbs: 20, fat: 10, calories: 286 },
      alcoholGrams: 16,
      ...overrides,
    });
  }

  function virginColada(overrides: Record<string, unknown> = {}) {
    return recipe({
      title: 'Piña Colada sem álcool',
      ingredients: [
        { name: 'Abacaxi', amount: '150 g' },
        { name: 'Leite de coco', amount: '100 ml' },
      ],
      macros: { protein: 1, carbs: 20, fat: 10, calories: 174 },
      ...overrides,
    });
  }

  it('"no" ignora a flag true da IA: menor pede "piña colada sem álcool" → sem aviso indevido', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [virginColada({ alcoholRequested: true })];

    const res = await send(uniqueMessage('piña colada sem álcool'));

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholFreeVersion, undefined);
    assert.ok(systemPromptOfCall(0).includes('The app has already checked the current message: it does not ask for alcohol'));
  });

  it('"no" ignora a flag true da IA: sem data pede "virgin piña colada" → nenhuma pergunta de idade', async () => {
    fakeUser.hasRealBodyProfile = false;
    aiResponses = [virginColada({ alcoholRequested: true })];

    const res = await send(uniqueMessage('virgin piña colada'));

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholFreeVersion, undefined);
  });

  it('"no" para 21+: a flag true da IA não libera álcool; receita com rum é refeita', async () => {
    aiResponses = [colada({ alcoholRequested: true }), virginColada()];

    const res = await send(uniqueMessage('piña colada sem álcool'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /violates the no alcohol/);
  });

  it('"yes" ignora a flag false da IA: 21+ pede "shake com rum" → álcool permitido', async () => {
    aiResponses = [withIngredients(['Rum branco', 'Banana'], {
      alcoholRequested: false,
      alcoholGrams: 16,
      macros: { protein: 1, carbs: 20, fat: 0, calories: 196 },
    })];

    const res = await send(uniqueMessage('shake com rum'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholGrams, 16);
    assert.ok(systemPromptOfCall(0).includes('The app has already checked the current message: it asks for alcohol.'));
  });

  it('"yes" ignora a flag false da IA: menor pede "rum shake" → versão sem álcool COM aviso', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [withIngredients(['Banana', 'Leite de aveia'], { alcoholRequested: false })];

    const res = await send(uniqueMessage('rum shake'));

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholFreeVersion, true);
  });

  it('"yes" + idade desconhecida → 428 ANTES da IA: nenhuma chamada, nenhum uso, nada gravado', async () => {
    fakeUser.hasRealBodyProfile = false;
    cachedValue = { recipe: recipe(), aiProvider: 'google', aiModel: 'gemini-test' };

    const res = await send(uniqueMessage('mistura com vodka e alguma fruta'));

    assert.equal(res.statusCode, 428);
    assert.equal(res.body?.code, 'pulseai/age-confirmation-required');
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(getFromCacheMock.mock.callCount(), 0);
    assert.equal(usageReservations().length, 0);
    assert.equal(usageRollbackCalls().length, 0);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('"ai" segue a flag da IA: drink pelo nome, sem data → 428 depois da chamada (fluxo de antes)', async () => {
    fakeUser.hasRealBodyProfile = false;
    aiResponses = [virginColada({ alcoholRequested: true })];

    const res = await send(uniqueMessage('piña colada sem gelo'));

    assert.equal(res.statusCode, 428);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(usageRollbackCalls().length, 1);
    assert.ok(!systemPromptOfCall(0).includes('The app has already checked the current message'));
  });

  it('"ai" segue a flag da IA: false para 21+ → álcool proibido (receita com rum é refeita)', async () => {
    aiResponses = [colada({ alcoholRequested: false }), virginColada()];

    const res = await send(uniqueMessage('piña colada sem gelo'));

    assert.equal(res.statusCode, 200);
    assert.match(lastUserMessageOfCall(1), /violates the no alcohol/);
  });

  it('cache: "no" decidido pelo código confere a receita gravada com álcool proibido, mesmo para 21+', async () => {
    cachedValue = { recipe: colada(), aiProvider: 'google', aiModel: 'gemini-test' };
    aiResponses = [virginColada()];

    const res = await send(uniqueMessage('piña colada sem álcool'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, false);
  });
});

describe('CP-B5.2 — ingredientes que definem o drink', () => {
  const NO_LIME = () => caipirinha({
    ingredients: [
      { name: 'Cachaça', amount: '50 ml' },
      { name: 'Morango', amount: '100 g' },
      { name: 'Açúcar', amount: '10 g' },
    ],
  });

  it('caipirinha sem limão → nova tentativa dizendo o que faltou; a refeita é entregue', async () => {
    aiResponses = [NO_LIME(), caipirinha()];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /missing ingredients that define the drink the user asked for: a caipirinha needs lime/);
    assert.ok((res.body?.data as RecipeBody).recipe.ingredients.some(ingredient => ingredient.name === 'Limão'));
  });

  it('versão sem álcool também: menor, caipirinha sem limão → refeita', async () => {
    fakeUser.birthDate = yearsAgo(19);
    aiResponses = [
      virginCaipirinha({ ingredients: [{ name: 'Morango', amount: '150 g' }, { name: 'Água com gás', amount: '150 ml' }] }),
      virginCaipirinha(),
    ];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal((res.body?.data as RecipeBody).recipe.alcoholFreeVersion, true);
  });

  it('"caipirinha sem limão" pedido → não refaz', async () => {
    aiResponses = [NO_LIME()];

    const res = await send(uniqueMessage('caipirinha sem limão'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });

  it('persistente → entrega a receita (não bloqueia), uso gasto normalmente', async () => {
    aiResponses = [NO_LIME(), NO_LIME()];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(usageRollbackCalls().length, 0);
    assert.equal(setInCacheMock.mock.callCount(), 1);
  });

  it('falha do provedor na nova tentativa → entrega a primeira (não vira 503)', async () => {
    aiResponses = [NO_LIME(), new FakeAiProviderRequestError('quota')];

    const res = await send(uniqueMessage('caipirinha de morango'));

    assert.equal(res.statusCode, 200);
    assert.ok(!(res.body?.data as RecipeBody).recipe.ingredients.some(ingredient => ingredient.name === 'Limão'));
  });

  it('drink sem pedido de drink na mensagem: nada é cobrado', async () => {
    aiResponses = [recipe()];

    const res = await send(uniqueMessage('um shake de morango'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});
