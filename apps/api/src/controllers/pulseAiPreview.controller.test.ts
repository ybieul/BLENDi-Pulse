// CP-1.1.4a — "Wow Moment Paywall" no Pulse AI: prévia bloqueada depois das 3
// mensagens grátis do dia, desbloqueio para quem virou Pro e o que NÃO pode
// vazar (resposta, conversa, histórico enviado à IA, cache).
//
// Os models são fakes com estado em memória: as operações atômicas (filtro +
// $inc do findOneAndUpdate, $push condicionado) são avaliadas no exec(), de uma
// vez, como o Mongo faria — é isso que permite testar a corrida.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

// ─── Estado dos fakes ────────────────────────────────────────────────────────

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
  dailyAiPreviewUsage?: number;
  aiUsageResetDate: Date;
  isPro: boolean;
}

interface FakeMessage {
  role: string;
  content: unknown;
  timestamp: Date;
  locked?: boolean;
  previewId?: mongoose.Types.ObjectId;
  previewExpiresAt?: Date;
}

interface FakeConversation {
  _id: string;
  userId: string;
  messages: FakeMessage[];
  lastRecipeName?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakePreview {
  _id: mongoose.Types.ObjectId;
  kind: string;
  userId: string;
  content: Record<string, unknown>;
  context: Record<string, unknown>;
  expiresAt: Date;
}

const OWNER_ID = new mongoose.Types.ObjectId().toHexString();
const OTHER_ID = new mongoose.Types.ObjectId().toHexString();
const CONVERSATION_ID = new mongoose.Types.ObjectId().toHexString();

let users: Record<string, FakeUser> = {};
let conversation: FakeConversation | null = null;
let previews: FakePreview[] = [];

// Cópia profunda que preserva ObjectId e Date (structuredClone perde o protótipo).
function clone<T>(value: T): T {
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(value.toHexString()) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(item => clone(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

function lazyChain(resolve: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) {
    query[method] = () => query;
  }
  query.exec = async () => resolve();
  return query;
}

type Filter = Record<string, unknown>;

function counterMatches(value: number | undefined, condition: unknown): boolean {
  if (condition === undefined) return true;
  const c = condition as { $lt?: number; $gt?: number; $exists?: boolean };
  if (c.$exists === false) return value === undefined;
  const current = value ?? 0;
  if (c.$lt !== undefined && !(value !== undefined && current < c.$lt)) return false;
  if (c.$gt !== undefined && !(current > c.$gt)) return false;
  return true;
}

function userMatches(user: FakeUser, filter: Filter): boolean {
  if (filter.isPro !== undefined && user.isPro !== filter.isPro) return false;
  if (filter.aiUsageResetDate instanceof Date
    && user.aiUsageResetDate.getTime() !== filter.aiUsageResetDate.getTime()) return false;
  if (!counterMatches(user.dailyAiUsage, filter.dailyAiUsage)) return false;
  if (!counterMatches(user.dailyAiPreviewUsage, filter.dailyAiPreviewUsage)) return false;
  if (Array.isArray(filter.$or)) {
    return (filter.$or as Filter[]).some(branch => userMatches(user, branch));
  }
  return true;
}

function applyUserUpdate(user: FakeUser, update: Record<string, Record<string, unknown>>) {
  Object.assign(user, update.$set ?? {});
  for (const [key, amount] of Object.entries(update.$inc ?? {})) {
    const record = user as unknown as Record<string, number | undefined>;
    record[key] = (record[key] ?? 0) + (amount as number);
  }
}

const userFindOneAndUpdateMock = mock.fn((filter: Filter, update: Record<string, Record<string, unknown>>) =>
  lazyChain(() => {
    const user = users[String(filter._id)];
    if (!user || !userMatches(user, filter)) return null;
    applyUserUpdate(user, update);
    return clone(user);
  })
);

const userUpdateOneMock = mock.fn((filter: Filter, update: Record<string, Record<string, unknown>>) =>
  lazyChain(() => {
    const user = users[String(filter._id)];
    if (!user || !userMatches(user, filter)) return { matchedCount: 0 };
    applyUserUpdate(user, update);
    return { matchedCount: 1 };
  })
);

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: (id: string) => lazyChain(() => (users[id] ? clone(users[id]) : null)),
      findOneAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: { BlendLogModel: { find: () => lazyChain(() => []) } },
});

const sameId = (a: unknown, b: unknown) => a !== undefined && b !== undefined && String(a) === String(b);

const conversationUpdateOneMock = mock.fn((filter: Filter, update: Record<string, Record<string, unknown>>) =>
  lazyChain(() => {
    if (!conversation || !sameId(conversation._id, filter._id)) return { matchedCount: 0 };
    if (filter.userId !== undefined && !sameId(conversation.userId, filter.userId)) return { matchedCount: 0 };

    const elemMatch = (filter.messages as { $elemMatch?: { previewId: unknown; locked: boolean } } | undefined)?.$elemMatch;
    if (elemMatch && !conversation.messages.some(m => sameId(m.previewId, elemMatch.previewId) && m.locked === elemMatch.locked)) {
      return { matchedCount: 0 };
    }
    const notIn = (filter['messages.previewId'] as { $ne?: unknown } | undefined)?.$ne;
    if (notIn !== undefined && conversation.messages.some(m => sameId(m.previewId, notIn))) {
      return { matchedCount: 0 };
    }

    const set = update.$set ?? {};
    if (elemMatch) {
      for (const message of conversation.messages.filter(m => sameId(m.previewId, elemMatch.previewId))) {
        message.content = clone(set['messages.$[turn].content']);
        message.locked = set['messages.$[turn].locked'] as boolean;
        delete message.previewExpiresAt;
      }
    }
    const push = (update.$push as { messages?: { $each: FakeMessage[] } } | undefined)?.messages;
    if (push) conversation.messages.push(...clone(push.$each));
    if (typeof set.lastRecipeName === 'string') conversation.lastRecipeName = set.lastRecipeName;
    return { matchedCount: 1 };
  })
);

let conversationFindOneValue: () => FakeConversation | null = () => conversation;

mock.module('../models/Conversation', {
  namedExports: {
    ConversationModel: {
      findOne: () => lazyChain(() => clone(conversationFindOneValue())),
      findById: (id: string) => lazyChain(() => (conversation && sameId(conversation._id, id) ? clone(conversation) : null)),
      insertOne: async ({ userId }: { userId: string }) => {
        conversation = {
          _id: CONVERSATION_ID,
          userId,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return { _id: CONVERSATION_ID };
      },
      updateOne: conversationUpdateOneMock,
    },
  },
});

const previewCreateMock = mock.fn(async (doc: Omit<FakePreview, '_id'>) => {
  const created = { ...clone(doc), _id: new mongoose.Types.ObjectId() };
  previews.push(created);
  return created;
});

mock.module('../models/LockedPreview', {
  namedExports: {
    LOCKED_PREVIEW_TTL_MS_BY_KIND: { pulse_ai: 24 * 60 * 60 * 1000, pantry_scanner: 7 * 24 * 60 * 60 * 1000 },
    LockedPreviewModel: {
      create: previewCreateMock,
      deleteOne: ({ _id }: { _id: mongoose.Types.ObjectId }) => lazyChain(() => {
        previews = previews.filter(p => !sameId(p._id, _id));
        return { deletedCount: 1 };
      }),
      findOne: (filter: { _id: mongoose.Types.ObjectId; userId: string; kind: string; expiresAt: { $gt: Date } }) =>
        lazyChain(() => {
          const found = previews.find(p =>
            sameId(p._id, filter._id)
            && sameId(p.userId, filter.userId)
            && p.kind === filter.kind
            && p.expiresAt > filter.expiresAt.$gt
          );
          return found ? clone(found) : null;
        }),
    },
  },
});

mock.module('../config/env', {
  namedExports: { env: { AI_PROVIDER: 'google', AI_MODEL: 'gemini-test' } },
});

class FakeAiProviderRequestError extends Error {}

interface CallAiInput {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}

let aiResponses: unknown[] = [];
const callAiMock = mock.fn(async (_input: CallAiInput) => {
  const next = aiResponses.shift();
  if (next === undefined) throw new Error('callAi called more times than expected');
  if (next instanceof Error) throw next;
  return { content: JSON.stringify(next), provider: 'google', model: 'gemini-test' };
});

mock.module('../services/aiProvider.service', {
  namedExports: { AiProviderRequestError: FakeAiProviderRequestError, callAi: callAiMock },
});

let cachedValue: unknown = null;
const setInCacheMock = mock.fn(async (_input: unknown) => undefined);

mock.module('../services/cache.service', {
  namedExports: {
    generateCacheKey: ({ rawMessage }: { rawMessage: string }) =>
      ['u', 'm', 'g', 'l', 'us', 'wg', 'p', 'am', createHash('sha256').update(rawMessage).digest('hex'), 'd'].join(':'),
    getFromCache: async () => cachedValue,
    setInCache: setInCacheMock,
    deleteFromCache: async () => undefined,
    invalidateUserCache: async () => 0,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({
  awarded: true,
  amount: 10,
  leveledUp: false,
  newLevel: 1,
}));
mock.module('../services/xp.service', { namedExports: { awardXP: awardXPMock } });

const missionMock = mock.fn(async (..._args: unknown[]) => undefined);
mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: missionMock },
});

type PulseAiModule = typeof import('./pulseAi.controller.js');
type ConversationModule = typeof import('./conversation.controller.js');
let chat: PulseAiModule['chat'];
let unlockPreview: PulseAiModule['unlockPreview'];
let getConversationById: ConversationModule['getConversationById'];

before(async () => {
  ({ chat, unlockPreview } = await import('./pulseAi.controller.js'));
  ({ getConversationById } = await import('./conversation.controller.js'));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Receita com conteúdo "secreto" reconhecível em todos os campos escondidos,
// inclusive quantidades dentro da dica e passos. O título também é escondido
// (decisão pós-pentest: a IA pode ser induzida a pôr a receita no título).
const SECRET_STRINGS = [
  'Dragon Kefir Smoothie',
  'Frozen dragonfruit',
  '137 g',
  'Coconut kefir',
  '213 ml',
  'Pulse 7 times',
  'Secret step one',
  'Secret step two',
  'add 11 g of chia',
];

function recipe(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Dragon Kefir Smoothie',
    ingredients: [
      { name: 'Frozen dragonfruit', amount: '137 g' },
      { name: 'Coconut kefir', amount: '213 ml' },
    ],
    // 12*4 + 30*4 + 6*9 = 222
    macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
    prepTimeSeconds: 150,
    blendInstruction: 'Pulse 7 times, then blend on high.',
    tip: 'For more fiber, add 11 g of chia.',
    hasSubstitutes: false,
    steps: [{ text: 'Secret step one' }, { text: 'Secret step two', pulseCount: 7 }],
    ...overrides,
  };
}

function assertNoSecrets(value: unknown, label: string) {
  const serialized = JSON.stringify(value);
  for (const secret of SECRET_STRINGS) {
    assert.ok(!serialized.includes(secret), `${label} vazou "${secret}": ${serialized}`);
  }
}

interface FakeRes {
  statusCode?: number;
  body?: Record<string, unknown>;
}

function fakeRes(): FakeRes & Response {
  const res: FakeRes & Partial<Response> = {};
  res.status = ((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: Record<string, unknown>) => {
    res.body = body;
    return res as Response;
  }) as Response['json'];
  return res as FakeRes & Response;
}

async function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Record<string, unknown>
) {
  const res = fakeRes();
  let nextError: unknown;
  await handler(req as unknown as Request, res, ((error: unknown) => {
    nextError = error;
  }) as NextFunction);
  if (nextError) throw nextError;
  return res;
}

let messageCounter = 0;
function send(text = 'dragonfruit smoothie', userId = OWNER_ID) {
  messageCounter += 1;
  return invoke(chat, { body: { message: `${text} ${messageCounter}` }, user: { sub: userId } });
}

function unlock(id: string, userId = OWNER_ID) {
  return invoke(unlockPreview, { params: { id }, user: { sub: userId } });
}

function makeUser(id: string, overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    _id: id,
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: [],
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'America/Sao_Paulo',
    dailyProteinTarget: 150,
    dailyCarbTarget: 200,
    dailyCalorieTarget: 2000,
    dailyAiUsage: 3,
    dailyAiPreviewUsage: 0,
    aiUsageResetDate: new Date(),
    isPro: false,
    ...overrides,
  };
}

// Gera uma prévia pela rota real (4ª mensagem) e devolve o previewId.
async function createPreview(): Promise<string> {
  aiResponses = [recipe()];
  const res = await send();
  assert.equal(res.statusCode, 200);
  const data = res.body?.data as { previewId: string };
  return data.previewId;
}

beforeEach(() => {
  users = { [OWNER_ID]: makeUser(OWNER_ID), [OTHER_ID]: makeUser(OTHER_ID, { isPro: true }) };
  conversation = null;
  conversationFindOneValue = () => conversation;
  previews = [];
  aiResponses = [];
  cachedValue = null;
  for (const fn of [
    userFindOneAndUpdateMock,
    userUpdateOneMock,
    conversationUpdateOneMock,
    previewCreateMock,
    callAiMock,
    setInCacheMock,
    awardXPMock,
    missionMock,
  ]) {
    fn.mock.resetCalls();
  }
});

// ─── Prévia no POST /pulse-ai/chat ───────────────────────────────────────────

describe('Pulse AI — prévia bloqueada (4ª mensagem do usuário grátis)', () => {
  it('responde só nome e macros, salva a receita inteira com 24h e não gasta mensagem', async () => {
    aiResponses = [recipe()];
    const before = Date.now();

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.equal(previews.length, 1);
    const stored = previews[0];
    // JSON inteiro da resposta, não só a ausência dos campos.
    assert.deepEqual(res.body, {
      success: true,
      data: {
        locked: true,
        previewId: String(stored._id),
        previewExpiresAt: stored.expiresAt.toISOString(),
        preview: {
          macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
        },
        usageRemaining: 0,
        conversationId: CONVERSATION_ID,
      },
    });
    assertNoSecrets(res.body, 'resposta da prévia');

    // Armazenamento: conteúdo completo, dono, tipo e validade de 24h.
    assert.equal(stored.kind, 'pulse_ai');
    assert.equal(stored.userId, OWNER_ID);
    assert.deepEqual(stored.content.ingredients, recipe().ingredients);
    assert.deepEqual(stored.content.steps, recipe().steps);
    const ttl = stored.expiresAt.getTime() - before;
    assert.ok(ttl >= 24 * 60 * 60 * 1000 - 5_000 && ttl <= 24 * 60 * 60 * 1000 + 5_000, `ttl ${ttl}`);

    // Contadores: a prévia é extra.
    assert.equal(users[OWNER_ID].dailyAiUsage, 3);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 1);

    // Sem XP, sem missão, sem cache por usuário.
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(missionMock.mock.callCount(), 0);
    assert.equal(setInCacheMock.mock.callCount(), 0);
  });

  it('o turno gravado na conversa é bloqueado e só tem a parte visível', async () => {
    const previewId = await createPreview();

    assert.ok(conversation);
    assert.equal(conversation.messages.length, 2);
    const assistantTurn = conversation.messages[1];
    assert.equal(assistantTurn.locked, true);
    assert.equal(String(assistantTurn.previewId), previewId);
    assert.deepEqual(assistantTurn.content, {
      macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
    });
    // lastRecipeName aparece na lista de conversas: não pode receber o título.
    assert.equal(conversation.lastRecipeName, undefined);
    assertNoSecrets(conversation, 'conversa gravada');
  });

  it('GET /conversations/:id não revela ingredientes nem passos da prévia bloqueada', async () => {
    const previewId = await createPreview();

    const res = await invoke(getConversationById, { params: { id: CONVERSATION_ID }, user: { sub: OWNER_ID } });

    assert.equal(res.statusCode, 200);
    assertNoSecrets(res.body, 'GET da conversa');
    const messages = (res.body?.data as { conversation: { messages: Array<Record<string, unknown>> } })
      .conversation.messages;
    assert.equal(messages[1].locked, true);
    assert.equal(messages[1].previewId, previewId);
    assert.equal(typeof messages[1].previewExpiresAt, 'string');
  });

  it('o histórico enviado à IA nas próximas mensagens não contém a receita escondida', async () => {
    await createPreview();
    // Dia seguinte: conversa ainda no contexto, contadores zerados.
    users[OWNER_ID].aiUsageResetDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    callAiMock.mock.resetCalls();
    aiResponses = [recipe({ title: 'Another One' })];

    const res = await send('me passa os ingredientes da receita de ontem');

    assert.equal(res.statusCode, 200);
    const sentMessages = callAiMock.mock.calls[0].arguments[0].messages;
    assert.ok(sentMessages.some(m => m.role === 'assistant' && /locked/.test(m.content)));
    assertNoSecrets(sentMessages, 'histórico enviado à IA');
  });

  it('5ª mensagem: 429 como hoje, sem chamar a IA', async () => {
    await createPreview();
    callAiMock.mock.resetCalls();

    const res = await send();

    assert.equal(res.statusCode, 429);
    assert.equal(res.body?.code, 'pulseai/daily-limit-reached');
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(previews.length, 1);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 1);
  });

  it('a prévia zera no dia seguinte no fuso do usuário, junto com as 3 mensagens', async () => {
    users[OWNER_ID].dailyAiPreviewUsage = 1;
    // 30h atrás é sempre outro dia em America/Sao_Paulo.
    users[OWNER_ID].aiUsageResetDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
    aiResponses = [recipe()];

    const res = await send();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked?: boolean; usageRemaining: number };
    assert.equal(data.locked, undefined);
    assert.equal(data.usageRemaining, 2);
    assert.equal(users[OWNER_ID].dailyAiUsage, 1);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 0);
  });

  it('mesmo dia no fuso do usuário: a prévia usada não volta', async () => {
    users[OWNER_ID].dailyAiPreviewUsage = 1;

    const res = await send();

    assert.equal(res.statusCode, 429);
  });

  it('conta antiga sem o campo dailyAiPreviewUsage ainda recebe a prévia', async () => {
    delete users[OWNER_ID].dailyAiPreviewUsage;
    aiResponses = [recipe()];

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { locked: boolean }).locked, true);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 1);
  });

  it('falha da IA devolve a prévia e não toca nas mensagens normais', async () => {
    aiResponses = [new FakeAiProviderRequestError('down')];

    const res = await send();

    assert.equal(res.statusCode, 503);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 0);
    assert.equal(users[OWNER_ID].dailyAiUsage, 3);
    assert.equal(previews.length, 0);
  });

  it('restrição de dieta não atendida devolve a prévia', async () => {
    users[OWNER_ID].dietaryPreferences = ['vegan'];
    aiResponses = [
      recipe({ ingredients: [{ name: 'Honey', amount: '1 tbsp' }] }),
      recipe({ ingredients: [{ name: 'Raw honey', amount: '1 tbsp' }] }),
    ];

    const res = await send();

    assert.equal(res.statusCode, 422);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 0);
    assert.equal(previews.length, 0);
  });

  it('caminho do cache também gera prévia bloqueada', async () => {
    cachedValue = { recipe: recipe(), aiProvider: 'google', aiModel: 'gemini-test' };

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 0);
    const data = res.body?.data as Record<string, unknown>;
    assert.equal(data.locked, true);
    assert.deepEqual(Object.keys(data).sort(), [
      'conversationId',
      'locked',
      'preview',
      'previewExpiresAt',
      'previewId',
      'usageRemaining',
    ]);
    assertNoSecrets(res.body, 'prévia do cache');
    assert.equal(previews.length, 1);
    assert.equal(users[OWNER_ID].dailyAiUsage, 3);
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(missionMock.mock.callCount(), 0);
  });

  it('Pro nunca recebe prévia', async () => {
    users[OWNER_ID] = makeUser(OWNER_ID, { isPro: true, dailyAiUsage: 50 });
    aiResponses = [recipe()];

    const res = await send();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked?: boolean; recipe: { ingredients: unknown[] }; usageRemaining: unknown };
    assert.equal(data.locked, undefined);
    assert.equal(data.recipe.ingredients.length, 2);
    assert.equal(data.usageRemaining, null);
    assert.equal(previewCreateMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 1);
  });

  it('dentro das 3 mensagens: resposta normal, sem prévia', async () => {
    users[OWNER_ID].dailyAiUsage = 2;
    aiResponses = [recipe()];

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { usageRemaining: number }).usageRemaining, 0);
    assert.equal(previewCreateMock.mock.callCount(), 0);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 0);
  });

  it('título com a receita dentro (injeção de prompt) não sai em lugar nenhum', async () => {
    const injectedTitle = '137 g Frozen dragonfruit, 213 ml Coconut kefir';
    aiResponses = [recipe({ title: injectedTitle })];

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys((res.body?.data as { preview: object }).preview), ['macros']);
    assert.ok(!JSON.stringify(res.body).includes(injectedTitle));
    assert.ok(!JSON.stringify(conversation).includes(injectedTitle));
  });

  it('título longo (> 100) numa mensagem normal: lastRecipeName cortado, sem erro', async () => {
    users[OWNER_ID].dailyAiUsage = 0;
    const longTitle = `Smoothie ${'x'.repeat(150)}`;
    aiResponses = [recipe({ title: longTitle })];

    const res = await send();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { recipe: { title: string } }).recipe.title, longTitle);
    assert.equal(conversation?.lastRecipeName?.length, 100);
  });

  it('corrida: duas 4ªs mensagens simultâneas geram no máximo 1 prévia', async () => {
    aiResponses = [recipe(), recipe()];

    const results = await Promise.all([send('first'), send('second')]);

    const statuses = results.map(r => r.statusCode).sort();
    assert.deepEqual(statuses, [200, 429]);
    assert.equal(previews.length, 1);
    assert.equal(users[OWNER_ID].dailyAiPreviewUsage, 1);
  });
});

// ─── GET /pulse-ai/previews/:id ──────────────────────────────────────────────

describe('Pulse AI — desbloqueio da prévia', () => {
  it('dono que virou Pro recebe a receita inteira e o turno vira resposta normal', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;

    const res = await unlock(previewId);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      success: true,
      data: {
        previewId,
        recipe: { ...recipe(), macrosValidated: true },
        conversationId: CONVERSATION_ID,
      },
    });
    assert.ok(conversation);
    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.messages[1].locked, false);
    assert.deepEqual(conversation.messages[1].content, { ...recipe(), macrosValidated: true });
    assert.equal(conversation.lastRecipeName, 'Dragon Kefir Smoothie');
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(missionMock.mock.callCount(), 0);
  });

  it('duas chamadas não duplicam o turno', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;

    const first = await unlock(previewId);
    const second = await unlock(previewId);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(conversation?.messages.length, 2);
  });

  it('sem o turno bloqueado na conversa, grava o turno completo uma vez só', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;
    assert.ok(conversation);
    conversation.messages = [];

    await unlock(previewId);
    await unlock(previewId);

    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.messages[0].role, 'user');
    assert.equal(conversation.messages[1].locked, undefined);
    assert.equal(String(conversation.messages[1].previewId), previewId);
  });

  it('dono não Pro: 403 pulseai/preview-locked, sem receita', async () => {
    const previewId = await createPreview();

    const res = await unlock(previewId);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.code, 'pulseai/preview-locked');
    assertNoSecrets(res.body, '403');
    assert.equal(conversation?.messages[1].locked, true);
  });

  it('outro usuário (mesmo Pro): 404, nunca 403', async () => {
    const previewId = await createPreview();

    const res = await unlock(previewId, OTHER_ID);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.code, 'pulseai/preview-not-found');
    assertNoSecrets(res.body, '404 de outro usuário');
  });

  it('prévia expirada: 404', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;
    previews[0].expiresAt = new Date(Date.now() - 1000);

    const res = await unlock(previewId);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.code, 'pulseai/preview-not-found');
  });

  it('id inexistente ou inválido: 404 sem erro 500', async () => {
    users[OWNER_ID].isPro = true;

    for (const id of [new mongoose.Types.ObjectId().toHexString(), 'abc', 'not-an-object-id-at-all', '']) {
      const res = await unlock(id);
      assert.equal(res.statusCode, 404, `id "${id}"`);
      assert.equal(res.body?.code, 'pulseai/preview-not-found');
    }
  });
});
