// CP-1.1.4b — "Wow Moment Paywall" no Pantry Scanner: prévia bloqueada depois
// dos 3 scans grátis do ciclo, devolução da prévia em todo caminho sem receita,
// desbloqueio para quem virou Pro e o cruzamento com o Pulse AI.
//
// Os models são fakes com estado em memória: as operações atômicas (filtro +
// $inc do findOneAndUpdate) são avaliadas no exec(), de uma vez, como o Mongo
// faria — é isso que permite testar a corrida.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
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
  scanCount: number;
  scanResetDate: Date;
  monthlyScanPreviewUsage?: number;
  isPro: boolean;
}

interface FakePreview {
  _id: mongoose.Types.ObjectId;
  kind: string;
  userId: string;
  content: Record<string, unknown>;
  context: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

const OWNER_ID = new mongoose.Types.ObjectId().toHexString();
const OTHER_ID = new mongoose.Types.ObjectId().toHexString();
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_RESET_DATE = new Date(Date.now() + 10 * DAY_MS);

let users: Record<string, FakeUser> = {};
let previews: FakePreview[] = [];

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
  const c = condition as { $lt?: number; $gt?: number; $gte?: number; $exists?: boolean };
  if (c.$exists === false) return value === undefined;
  if (c.$lt !== undefined && !(value !== undefined && value < c.$lt)) return false;
  if (c.$gt !== undefined && !(value !== undefined && value > c.$gt)) return false;
  if (c.$gte !== undefined && !(value !== undefined && value >= c.$gte)) return false;
  return true;
}

function userMatches(user: FakeUser, filter: Filter): boolean {
  if (filter.isPro !== undefined && user.isPro !== filter.isPro) return false;
  if (filter.scanResetDate instanceof Date
    && user.scanResetDate.getTime() !== filter.scanResetDate.getTime()) return false;
  if (!counterMatches(user.scanCount, filter.scanCount)) return false;
  if (!counterMatches(user.monthlyScanPreviewUsage, filter.monthlyScanPreviewUsage)) return false;
  if (Array.isArray(filter.$or)) {
    return (filter.$or as Filter[]).some(branch => userMatches(user, branch));
  }
  return true;
}

function applyUserUpdate(user: FakeUser, update: Record<string, Record<string, unknown>>) {
  Object.assign(user, clone(update.$set ?? {}));
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
      findByIdAndUpdate: (id: string, update: Record<string, Record<string, unknown>>) =>
        userFindOneAndUpdateMock({ _id: id }, update),
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: { BlendLogModel: { find: () => lazyChain(() => []) } },
});

// O Pulse AI importa Conversation; o cruzamento só passa pelo 404 do
// desbloqueio, que nunca chega na conversa.
const conversationUpdateOneMock = mock.fn(() => lazyChain(() => ({ matchedCount: 0 })));
mock.module('../models/Conversation', {
  namedExports: {
    ConversationModel: {
      findOne: () => lazyChain(() => null),
      findById: () => lazyChain(() => null),
      updateOne: conversationUpdateOneMock,
    },
  },
});

const sameId = (a: unknown, b: unknown) => a !== undefined && b !== undefined && String(a) === String(b);

let previewCreateError: Error | null = null;
const previewCreateMock = mock.fn(async (doc: Omit<FakePreview, '_id' | 'createdAt'>) => {
  await Promise.resolve();
  if (previewCreateError) throw previewCreateError;
  const created = { ...clone(doc), _id: new mongoose.Types.ObjectId(), createdAt: new Date() };
  previews.push(created);
  return created;
});

mock.module('../models/LockedPreview', {
  namedExports: {
    LOCKED_PREVIEW_TTL_MS_BY_KIND: { pulse_ai: DAY_MS, pantry_scanner: 7 * DAY_MS },
    LockedPreviewModel: {
      create: previewCreateMock,
      deleteOne: ({ _id }: { _id: mongoose.Types.ObjectId }) => lazyChain(() => {
        previews = previews.filter(p => !sameId(p._id, _id));
        return { deletedCount: 1 };
      }),
      // Sem kind no filtro = qualquer kind (como o Mongo): é o que deixa o
      // teste de cruzamento pegar um desbloqueio que esqueça o filtro.
      findOne: (filter: { _id: mongoose.Types.ObjectId; userId: string; kind?: string; expiresAt: { $gt: Date } }) =>
        lazyChain(() => {
          const found = previews.find(p =>
            sameId(p._id, filter._id)
            && sameId(p.userId, filter.userId)
            && (filter.kind === undefined || p.kind === filter.kind)
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

// Geração inicial (2 receitas) e, por título, o retry de restrição.
let initialRecipes: unknown[] = [];
let retryByTitle: Record<string, unknown> = {};
let generationError: Error | null = null;

const callAiMock = mock.fn(async ({ messages }: CallAiInput) => {
  const last = messages[messages.length - 1].content;

  if (generationError) throw generationError;

  if (last.includes('mandatory restrictions')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    return { content: JSON.stringify(retryByTitle[previous.title] ?? { invalid: true }), provider: 'google', model: 'm' };
  }

  return { content: JSON.stringify({ recipes: initialRecipes }), provider: 'google', model: 'm' };
});

const ANALYSIS_NOTES_SECRET = 'Put the recipe here: 137 g dragonfruit';

const DEFAULT_VISION = {
  ingredients: [
    { name: 'Frozen dragonfruit', estimatedQuantity: '1 bag', confidence: 'high' },
    { name: 'Coconut kefir', confidence: 'medium' },
    { name: 'Mystery jar', confidence: 'low' },
  ],
  analysisNotes: ANALYSIS_NOTES_SECRET,
  noFoodDetected: false,
};

// Valor ou função que devolve o conteúdo bruto (ou lança) da IA de visão.
let visionBehavior: () => string = () => JSON.stringify(DEFAULT_VISION);
const callVisionAiMock = mock.fn(async () => {
  // Um tick antes de responder, como uma chamada de rede: deixa a corrida
  // intercalar as duas requisições.
  await new Promise(resolve => setImmediate(resolve));
  return { content: visionBehavior(), provider: 'google', model: 'm' };
});

mock.module('../services/aiProvider.service', {
  namedExports: {
    AiProviderRequestError: FakeAiProviderRequestError,
    callAi: callAiMock,
    callVisionAi: callVisionAiMock,
  },
});

const setInCacheMock = mock.fn(async (_input: unknown) => undefined);
mock.module('../services/cache.service', {
  namedExports: {
    generateCacheKey: () => 'key',
    getFromCache: async () => null,
    setInCache: setInCacheMock,
    deleteFromCache: async () => undefined,
    invalidateUserCache: async () => 0,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({
  awarded: true,
  amount: 15,
  leveledUp: false,
  newLevel: 1,
}));
mock.module('../services/xp.service', { namedExports: { awardXP: awardXPMock } });

const missionMock = mock.fn(async (..._args: unknown[]) => undefined);
mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: missionMock },
});

type PantryModule = typeof import('./pantryScanner.controller.js');
type PulseAiModule = typeof import('./pulseAi.controller.js');
let analyzePantry: PantryModule['analyzePantry'];
let unlockPantryPreview: PantryModule['unlockPantryPreview'];
let unlockPulseAiPreview: PulseAiModule['unlockPreview'];

before(async () => {
  ({ analyzePantry, unlockPantryPreview } = await import('./pantryScanner.controller.js'));
  ({ unlockPreview: unlockPulseAiPreview } = await import('./pulseAi.controller.js'));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Receitas com conteúdo "secreto" reconhecível em todos os campos escondidos.
// O título também é escondido (lição do pentest do CP-1.1.4a): o primeiro já
// vem "injetado", com a receita inteira dentro.
function recipeA() {
  return {
    title: '137 g Frozen dragonfruit, 213 ml Coconut kefir, pulse 7 times',
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
  };
}

function recipeB() {
  return {
    title: 'Pink Kefir Cooler',
    ingredients: [
      { name: 'Frozen dragonfruit', amount: '90 g' },
      { name: 'Coconut kefir', amount: '250 ml' },
    ],
    // 10*4 + 25*4 + 5*9 = 185
    macros: { protein: 10, carbs: 25, fat: 5, calories: 185 },
    prepTimeSeconds: 90,
    blendInstruction: 'Blend for 40 seconds on medium.',
    tip: 'Chill the glass for 9 minutes first.',
    hasSubstitutes: true,
  };
}

const SECRET_STRINGS = [
  '137 g',
  '213 ml',
  'Pulse 7 times',
  'pulse 7 times',
  'add 11 g of chia',
  'Secret step one',
  'Secret step two',
  'Pink Kefir Cooler',
  '90 g',
  '250 ml',
  'Blend for 40 seconds',
  'Chill the glass',
  ANALYSIS_NOTES_SECRET,
  'prepTimeSeconds',
  'blendInstruction',
  'hasSubstitutes',
  'macrosValidated',
  'analysisNotes',
  'title',
];

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
): Promise<FakeRes & { nextError?: unknown }> {
  const res = fakeRes();
  let nextError: unknown;
  await handler(req as unknown as Request, res, ((error: unknown) => {
    nextError = error;
  }) as NextFunction);
  return Object.assign(res, { nextError });
}

// '/9j/' decodifica para FF D8 FF (assinatura JPEG).
const JPEG_BASE64 = `/9j/${'A'.repeat(200)}`;

function scan(userId = OWNER_ID) {
  return invoke(analyzePantry, {
    body: { imageBase64: JPEG_BASE64, mimeType: 'image/jpeg' },
    user: { sub: userId },
  });
}

function unlock(id: string, userId = OWNER_ID) {
  return invoke(unlockPantryPreview, { params: { id }, user: { sub: userId } });
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
    scanCount: 3,
    scanResetDate: new Date(SCAN_RESET_DATE),
    monthlyScanPreviewUsage: 0,
    isPro: false,
    ...overrides,
  };
}

async function flushMissionQueue() {
  await new Promise(resolve => setImmediate(resolve));
}

// Gera uma prévia pela rota real (4º scan) e devolve o previewId.
async function createPreview(): Promise<string> {
  const res = await scan();
  assert.equal(res.statusCode, 200);
  return (res.body?.data as { previewId: string }).previewId;
}

beforeEach(() => {
  users = { [OWNER_ID]: makeUser(OWNER_ID), [OTHER_ID]: makeUser(OTHER_ID, { isPro: true }) };
  previews = [];
  initialRecipes = [recipeA(), recipeB()];
  retryByTitle = {};
  generationError = null;
  previewCreateError = null;
  visionBehavior = () => JSON.stringify(DEFAULT_VISION);
  for (const fn of [
    userFindOneAndUpdateMock,
    userUpdateOneMock,
    conversationUpdateOneMock,
    previewCreateMock,
    callAiMock,
    callVisionAiMock,
    setInCacheMock,
    awardXPMock,
    missionMock,
  ]) {
    fn.mock.resetCalls();
  }
});

// ─── 4º scan: prévia ─────────────────────────────────────────────────────────

describe('Pantry Scanner — 4º scan do grátis (prévia bloqueada)', () => {
  it('responde só ingredientes, ciclo e macros (JSON inteiro), guarda as receitas por 7 dias, sem XP, missão, cache nem scan', async () => {
    const before = Date.now();
    const res = await scan();
    const after = Date.now();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { previewId: string; previewExpiresAt: string };
    assert.ok(mongoose.isValidObjectId(data.previewId));

    // JSON inteiro, não só a ausência de campos.
    assert.deepEqual(res.body, {
      success: true,
      data: {
        locked: true,
        previewId: data.previewId,
        previewExpiresAt: data.previewExpiresAt,
        ingredients: [
          { name: 'Frozen dragonfruit', estimatedQuantity: '1 bag', confidence: 'high' },
          { name: 'Coconut kefir', confidence: 'medium' },
        ],
        recipes: [
          { macros: { protein: 12, carbs: 30, fat: 6, calories: 222 } },
          { macros: { protein: 10, carbs: 25, fat: 5, calories: 185 } },
        ],
        scansUsed: 3,
        scansLimit: 3,
        resetDate: SCAN_RESET_DATE.toISOString(),
      },
    });
    assertNoSecrets(res.body, 'resposta da prévia');

    const expiresAtMs = new Date(data.previewExpiresAt).getTime();
    assert.ok(expiresAtMs >= before + 7 * DAY_MS && expiresAtMs <= after + 7 * DAY_MS);

    // Guardado: kind, dono, receitas completas, ingredientes no context, 7 dias.
    assert.equal(previews.length, 1);
    const stored = previews[0];
    assert.equal(stored.kind, 'pantry_scanner');
    assert.equal(stored.userId, OWNER_ID);
    assert.equal(String(stored._id), data.previewId);
    assert.equal(stored.expiresAt.getTime(), expiresAtMs);
    const storedRecipes = (stored.content as { recipes: Array<Record<string, unknown>> }).recipes;
    assert.equal(storedRecipes.length, 2);
    assert.equal(storedRecipes[0].title, recipeA().title);
    assert.deepEqual(storedRecipes[0].steps, recipeA().steps);
    assert.equal(storedRecipes[1].tip, recipeB().tip);
    assert.deepEqual(Object.keys(stored.context), ['ingredients']);
    assert.equal((stored.context.ingredients as unknown[]).length, 2);

    // Contadores: scanCount intacto, prévia usada.
    assert.equal(users[OWNER_ID].scanCount, 3);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 1);

    await flushMissionQueue();
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(missionMock.mock.callCount(), 0);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(callVisionAiMock.mock.callCount(), 1);
  });

  it('5º scan: 429 de hoje sem chamar a IA', async () => {
    await createPreview();
    callVisionAiMock.mock.resetCalls();
    callAiMock.mock.resetCalls();

    const res = await scan();

    assert.equal(res.statusCode, 429);
    assert.equal(res.body?.code, 'scanner/monthly-limit-reached');
    assert.equal(res.body?.scansUsed, 3);
    assert.equal(res.body?.scansLimit, 3);
    assert.equal(callVisionAiMock.mock.callCount(), 0);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(previews.length, 1);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 1);
  });

  it('conta antiga sem o campo conta como 0 e ganha a prévia', async () => {
    delete users[OWNER_ID].monthlyScanPreviewUsage;

    const res = await scan();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { locked: boolean }).locked, true);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 1);
  });

  it('ciclo novo: scans e prévia voltam juntos (mesmo update)', async () => {
    const pastReset = new Date(Date.now() - DAY_MS);
    users[OWNER_ID] = makeUser(OWNER_ID, { scanResetDate: pastReset, monthlyScanPreviewUsage: 1 });

    const res = await scan();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked?: boolean; recipes: Array<{ title: string }>; scansUsed: number };
    assert.equal(data.locked, undefined);
    assert.equal(data.recipes[0].title, recipeA().title);
    assert.equal(data.scansUsed, 1);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 0);
    assert.ok(users[OWNER_ID].scanResetDate.getTime() > Date.now());

    const resetUpdate = userUpdateOneMock.mock.calls.find(call =>
      (call.arguments[1] as { $set?: Record<string, unknown> }).$set?.scanCount === 0
    );
    assert.ok(resetUpdate, 'update de reset não encontrado');
    assert.deepEqual(
      Object.keys((resetUpdate.arguments[1] as { $set: Record<string, unknown> }).$set).sort(),
      ['monthlyScanPreviewUsage', 'scanCount', 'scanResetDate']
    );
  });

  it('mesmo ciclo: a prévia usada não volta', async () => {
    users[OWNER_ID].monthlyScanPreviewUsage = 1;

    const res = await scan();

    assert.equal(res.statusCode, 429);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 1);
  });

  it('corrida: dois 4º scans simultâneos = 1 prévia e 1 chamada de visão', async () => {
    const [first, second] = await Promise.all([scan(), scan()]);

    const statuses = [first.statusCode, second.statusCode].sort();
    assert.deepEqual(statuses, [200, 429]);
    assert.equal(previews.length, 1);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 1);
    assert.equal(callVisionAiMock.mock.callCount(), 1);
  });
});

// ─── Rollback da prévia ──────────────────────────────────────────────────────

describe('Pantry Scanner — prévia devolvida em todo caminho sem receita', () => {
  function assertPreviewReturned() {
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 0, 'prévia não devolvida');
    assert.equal(users[OWNER_ID].scanCount, 3, 'scanCount mudou');
    assert.equal(previews.length, 0, 'sobrou prévia gravada');
  }

  it('visão indisponível (503)', async () => {
    visionBehavior = () => {
      throw new FakeAiProviderRequestError('down');
    };

    const res = await scan();

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'scanner/vision-unavailable');
    assertPreviewReturned();
  });

  it('erro inesperado na visão (vai para o handler de erro)', async () => {
    visionBehavior = () => {
      throw new Error('boom');
    };

    const res = await scan();

    assert.ok(res.nextError instanceof Error);
    assertPreviewReturned();
  });

  it('resposta inválida da visão (500)', async () => {
    visionBehavior = () => 'not json';

    const res = await scan();

    assert.equal(res.statusCode, 500);
    assert.equal(res.body?.code, 'scanner/vision-parse-error');
    assertPreviewReturned();
  });

  it('sem comida (200 de hoje)', async () => {
    visionBehavior = () => JSON.stringify({ ingredients: [], noFoodDetected: true });

    const res = await scan();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { noFoodDetected: boolean }).noFoodDetected, true);
    assert.equal(callAiMock.mock.callCount(), 0);
    assertPreviewReturned();
  });

  it('sem ingrediente utilizável (200 de hoje)', async () => {
    visionBehavior = () => JSON.stringify({
      ingredients: [{ name: 'Blurry thing', confidence: 'low' }],
      noFoodDetected: false,
    });

    const res = await scan();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { noUsableIngredients: boolean }).noUsableIngredients, true);
    assertPreviewReturned();
  });

  it('geração vazia (200 sem receitas, como hoje)', async () => {
    initialRecipes = [];

    const res = await scan();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as Record<string, unknown>;
    assert.deepEqual(data.recipes, []);
    assert.equal(data.scansUsed, 3);
    assert.equal(data.xpAwarded, 0);
    assert.equal(data.locked, undefined);
    assertPreviewReturned();
  });

  it('falha da IA na geração (200 sem receitas)', async () => {
    generationError = new Error('provider down');

    const res = await scan();

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.body?.data as { recipes: unknown[] }).recipes, []);
    assertPreviewReturned();
  });

  it('todas as receitas violando a dieta (422)', async () => {
    users[OWNER_ID].dietaryPreferences = ['nut_free'];
    initialRecipes = [
      { ...recipeA(), title: 'PB', ingredients: [{ name: 'Peanut butter', amount: '30 g' }] },
      { ...recipeB(), title: 'Almond', ingredients: [{ name: 'Almond milk', amount: '200 ml' }] },
    ];

    const res = await scan();

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/dietary-restriction-unmet');
    assertPreviewReturned();
  });

  it('erro ao gravar a prévia', async () => {
    previewCreateError = new Error('write failed');

    const res = await scan();

    assert.ok(res.nextError instanceof Error);
    assert.equal(res.body, undefined);
    assertPreviewReturned();
  });

  it('depois de devolvida, a prévia ainda pode ser usada no ciclo', async () => {
    visionBehavior = () => 'not json';
    await scan();
    visionBehavior = () => JSON.stringify(DEFAULT_VISION);

    const res = await scan();

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { locked: boolean }).locked, true);
  });
});

// ─── Sem mudança para Pro e para grátis dentro dos 3 ─────────────────────────

describe('Pantry Scanner — fluxo de hoje', () => {
  it('Pro acima de 3 scans: receitas completas, XP, sem prévia', async () => {
    users[OWNER_ID] = makeUser(OWNER_ID, { isPro: true, scanCount: 12 });

    const res = await scan();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked?: boolean; recipes: Array<{ title: string }>; xpAwarded: number };
    assert.equal(data.locked, undefined);
    assert.equal(data.recipes[0].title, recipeA().title);
    assert.equal(data.xpAwarded, 15);
    assert.equal(users[OWNER_ID].scanCount, 13);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 0);
    assert.equal(previews.length, 0);
  });

  it('grátis no 3º scan: normal, scan contado, prévia intocada', async () => {
    users[OWNER_ID].scanCount = 2;

    const res = await scan();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked?: boolean; scansUsed: number; xpAwarded: number };
    assert.equal(data.locked, undefined);
    assert.equal(data.scansUsed, 3);
    assert.equal(data.xpAwarded, 15);
    assert.equal(users[OWNER_ID].monthlyScanPreviewUsage, 0);
    assert.equal(previews.length, 0);
    await flushMissionQueue();
    assert.equal(missionMock.mock.callCount(), 1);
  });
});

// ─── Desbloqueio ─────────────────────────────────────────────────────────────

describe('Pantry Scanner — desbloqueio GET /pantry-scanner/previews/:id', () => {
  it('dono Pro recebe receitas completas e ingredientes; repetir devolve o mesmo; sem XP nem missão', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;

    const first = await unlock(previewId);
    const second = await unlock(previewId);

    assert.equal(first.statusCode, 200);
    const data = first.body?.data as {
      previewId: string;
      ingredients: unknown[];
      recipes: Array<Record<string, unknown>>;
    };
    assert.equal(data.previewId, previewId);
    assert.deepEqual(data.ingredients, [
      { name: 'Frozen dragonfruit', estimatedQuantity: '1 bag', confidence: 'high' },
      { name: 'Coconut kefir', confidence: 'medium' },
    ]);
    assert.equal(data.recipes.length, 2);
    assert.deepEqual(data.recipes[0], { ...recipeA(), macrosValidated: true });
    assert.deepEqual(data.recipes[1], { ...recipeB(), macrosValidated: true });
    assert.deepEqual(second.body, first.body);

    await flushMissionQueue();
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(missionMock.mock.callCount(), 0);
  });

  it('dono não Pro: 403 com código próprio, sem nada da receita', async () => {
    const previewId = await createPreview();

    const res = await unlock(previewId);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.code, 'scanner/preview-locked');
    assertNoSecrets(res.body, '403');
  });

  it('outro usuário (mesmo Pro), expirada, inexistente e ids inválidos: mesmo 404', async () => {
    const previewId = await createPreview();

    const other = await unlock(previewId, OTHER_ID);
    assert.equal(other.statusCode, 404);
    assert.equal(other.body?.code, 'scanner/preview-not-found');
    assertNoSecrets(other.body, 'outro usuário');

    users[OWNER_ID].isPro = true;
    previews[0].expiresAt = new Date(Date.now() - 1000);
    const expired = await unlock(previewId);
    assert.equal(expired.statusCode, 404);
    assert.equal(expired.body?.code, 'scanner/preview-not-found');

    const missing = await unlock(new mongoose.Types.ObjectId().toHexString());
    assert.equal(missing.statusCode, 404);

    for (const id of ['abc', '', '{"$gt":""}', '../../users/me', 'x'.repeat(5000), "1' OR '1'='1"]) {
      const res = await unlock(id);
      assert.equal(res.statusCode, 404, `id ${id.slice(0, 20)}`);
      assert.equal(res.body?.code, 'scanner/preview-not-found');
      assert.equal(res.nextError, undefined);
    }
  });
});

// ─── Cruzamento com o Pulse AI ───────────────────────────────────────────────

describe('Pantry Scanner × Pulse AI — um desbloqueio não abre prévia do outro', () => {
  it('Pulse AI com id do Pantry: 404 do Pulse AI', async () => {
    const previewId = await createPreview();
    users[OWNER_ID].isPro = true;

    const res = await invoke(unlockPulseAiPreview, { params: { id: previewId }, user: { sub: OWNER_ID } });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.code, 'pulseai/preview-not-found');
    assertNoSecrets(res.body, 'Pulse AI com id do Pantry');
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
  });

  it('Pantry com id do Pulse AI: 404 do Pantry', async () => {
    const pulseAiPreviewId = new mongoose.Types.ObjectId();
    previews.push({
      _id: pulseAiPreviewId,
      kind: 'pulse_ai',
      userId: OWNER_ID,
      // Formato que o Pantry aceitaria: só o kind pode barrar.
      content: { recipes: [recipeA(), recipeB()] },
      context: { ingredients: [] },
      expiresAt: new Date(Date.now() + DAY_MS),
      createdAt: new Date(),
    });
    users[OWNER_ID].isPro = true;

    const res = await unlock(pulseAiPreviewId.toHexString());

    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.code, 'scanner/preview-not-found');
    assertNoSecrets(res.body, 'Pantry com id do Pulse AI');
  });
});
