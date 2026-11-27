// CP-B7 — Pantry Scanner em duas etapas: POST /pantry-scanner/read (só a
// visão, não conta scan, limites de leitura por plano) e POST
// /pantry-scanner/generate (conta o scan, confirmação com efeito real,
// pedido explícito, líquido e álcool com as regras do Pulse AI).
//
// Os models são fakes em memória; as operações atômicas (filtro + update do
// findOneAndUpdate) são avaliadas no exec(), como o Mongo faria.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import {
  PANTRY_PRO_READ_BURST_LIMIT,
  PANTRY_PRO_READ_BURST_WINDOW_MS,
  PANTRY_PRO_READ_DAILY_LIMIT,
  PANTRY_READS_PER_SCAN,
  PANTRY_READ_TTL_MS,
} from '@blendi/shared';
import mongoose from 'mongoose';

import { createFakePantryReadModel, invokeHandler, TEST_JPEG_BASE64 } from './pantryScannerTestFakes';

// ─── User falso ──────────────────────────────────────────────────────────────

type Doc = Record<string, unknown>;

const USER_ID = new mongoose.Types.ObjectId().toHexString();
const OTHER_ID = new mongoose.Types.ObjectId().toHexString();
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_RESET_DATE = new Date(Date.now() + 10 * DAY_MS);

let users: Record<string, Doc> = {};

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(item => clone(item)) as T;
  if (value !== null && typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

function chain(resolve: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) query[method] = () => query;
  query.exec = async () => resolve();
  return query;
}

function getPath(doc: Doc, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value[Number(key)];
    return (value as Doc)[key];
  }, doc);
}

function toComparable(value: unknown): number | unknown {
  return value instanceof Date ? value.getTime() : value;
}

function conditionMatches(value: unknown, condition: unknown): boolean {
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  if (condition === null || typeof condition !== 'object') return value === condition;
  const ops = condition as Record<string, unknown>;
  if ('$exists' in ops && (value !== undefined) !== ops.$exists) return false;
  const v = toComparable(value) as number;
  if ('$lt' in ops && !(value !== undefined && v < (toComparable(ops.$lt) as number))) return false;
  if ('$lte' in ops && !(value !== undefined && v <= (toComparable(ops.$lte) as number))) return false;
  if ('$gt' in ops && !(value !== undefined && v > (toComparable(ops.$gt) as number))) return false;
  if ('$gte' in ops && !(value !== undefined && v >= (toComparable(ops.$gte) as number))) return false;
  return true;
}

function userMatches(user: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '_id') return String(condition) === String(user._id);
    if (key === '$and') return (condition as Doc[]).every(branch => userMatches(user, branch));
    if (key === '$or') return (condition as Doc[]).some(branch => userMatches(user, branch));
    return conditionMatches(getPath(user, key), condition);
  });
}

function applyUpdate(user: Doc, update: Doc) {
  Object.assign(user, clone((update.$set ?? {}) as Doc));
  for (const [key, amount] of Object.entries((update.$inc ?? {}) as Record<string, number>)) {
    user[key] = ((user[key] as number | undefined) ?? 0) + amount;
  }
  for (const [key, spec] of Object.entries((update.$push ?? {}) as Record<string, { $each: unknown[]; $slice?: number }>)) {
    const list = [...((user[key] as unknown[] | undefined) ?? []), ...clone(spec.$each)];
    user[key] = spec.$slice !== undefined ? list.slice(spec.$slice) : list;
  }
  for (const [key, value] of Object.entries((update.$pull ?? {}) as Record<string, unknown>)) {
    user[key] = ((user[key] as unknown[] | undefined) ?? []).filter(item => toComparable(item) !== toComparable(value));
  }
}

const userFindOneAndUpdateMock = mock.fn((filter: Doc, update: Doc) =>
  chain(() => {
    const user = users[String(filter._id)];
    if (!user || !userMatches(user, filter)) return null;
    applyUpdate(user, update);
    return clone(user);
  })
);
const userUpdateOneMock = mock.fn((filter: Doc, update: Doc) =>
  chain(() => {
    const user = users[String(filter._id)];
    if (!user || !userMatches(user, filter)) return { matchedCount: 0 };
    applyUpdate(user, update);
    return { matchedCount: 1 };
  })
);

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: (id: string) => chain(() => (users[id] ? clone(users[id]) : null)),
      findOneAndUpdate: userFindOneAndUpdateMock,
      findByIdAndUpdate: (id: string, update: Doc) => userFindOneAndUpdateMock({ _id: id }, update),
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: { BlendLogModel: { find: () => chain(() => []) } },
});

const fakePantryRead = createFakePantryReadModel();
const pantryReadCreateMock = mock.fn(fakePantryRead.model.create);
mock.module('../models/PantryRead', {
  namedExports: { PantryReadModel: { ...fakePantryRead.model, create: pantryReadCreateMock } },
});

let previews: Doc[] = [];
mock.module('../models/LockedPreview', {
  namedExports: {
    LOCKED_PREVIEW_TTL_MS_BY_KIND: { pulse_ai: DAY_MS, pantry_scanner: 7 * DAY_MS },
    LockedPreviewModel: {
      create: async (doc: Doc) => {
        const created = { ...doc, _id: new mongoose.Types.ObjectId() };
        previews.push(created);
        return created;
      },
      deleteOne: () => chain(() => ({ deletedCount: 1 })),
      findOne: () => chain(() => null),
    },
  },
});

// ─── IA falsa ────────────────────────────────────────────────────────────────

class FakeAiProviderRequestError extends Error {}

interface CallAiInput {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}

/** Responde à geração (array) e às novas tentativas; cada teste troca o roteiro. */
let aiHandler: (input: CallAiInput) => unknown = () => [];
const callAiMock = mock.fn(async (input: CallAiInput) => {
  const reply = aiHandler(input);
  if (reply instanceof Error) throw reply;
  return { content: JSON.stringify(reply), provider: 'google', model: 'm' };
});

let visionIngredients: Array<{ name: string; confidence: string; estimatedQuantity?: string }> = [];
let visionError: Error | null = null;
const callVisionAiMock = mock.fn(async () => {
  if (visionError) throw visionError;
  return {
    content: JSON.stringify({ ingredients: visionIngredients, noFoodDetected: false }),
    provider: 'google',
    model: 'm',
  };
});

mock.module('../services/aiProvider.service', {
  namedExports: {
    AiProviderRequestError: FakeAiProviderRequestError,
    callAi: callAiMock,
    callVisionAi: callVisionAiMock,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({ awarded: true, amount: 15, leveledUp: false, newLevel: 1 }));
mock.module('../services/xp.service', { namedExports: { awardXP: awardXPMock } });
mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: async () => undefined },
});

type ControllerModule = typeof import('./pantryScanner.controller.js');
let readPantry: ControllerModule['readPantry'];
let generatePantry: ControllerModule['generatePantry'];

before(async () => {
  ({ readPantry, generatePantry } = await import('./pantryScanner.controller.js'));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Doc = {}): Doc {
  return {
    _id: USER_ID,
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: [],
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'America/Sao_Paulo',
    dailyProteinTarget: 150,
    dailyCarbTarget: 200,
    dailyCalorieTarget: 2000,
    scanCount: 0,
    scanResetDate: new Date(SCAN_RESET_DATE),
    monthlyScanPreviewUsage: 0,
    isPro: false,
    ...overrides,
  };
}

function recipe(title: string, ingredients: Array<[string, string]>, extra: Doc = {}) {
  return {
    title,
    ingredients: ingredients.map(([name, amount]) => ({ name, amount })),
    // 10*4 + 40*4 + 5*9 = 245
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend on high for 45 seconds.',
    hasSubstitutes: false,
    ...extra,
  };
}

function read(userId = USER_ID) {
  return invokeHandler(readPantry, {
    body: { imageBase64: TEST_JPEG_BASE64, mimeType: 'image/jpeg' },
    user: { sub: userId },
  });
}

function generate(body: Doc, userId = USER_ID) {
  return invokeHandler(generatePantry, { body, user: { sub: userId } });
}

async function readId(): Promise<string> {
  const res = await read();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return (res.body?.data as { readId: string }).readId;
}

function lastGeneration(): CallAiInput {
  const call = callAiMock.mock.calls.find(c => !c.arguments[0].messages.some(m => m.role === 'assistant'));
  assert.ok(call, 'geração não encontrada');
  return call.arguments[0];
}

function retryCalls(marker: string) {
  return callAiMock.mock.calls.filter(c => c.arguments[0].messages.at(-1)?.content.includes(marker));
}

function deliveredRecipes(res: { body?: Doc }): Array<Doc & { ingredients: Array<{ name: string }> }> {
  return (res.body?.data as { recipes: Array<Doc & { ingredients: Array<{ name: string }> }> }).recipes;
}

function names(r: { ingredients: Array<{ name: string }> }): string[] {
  return r.ingredients.map(i => i.name.toLowerCase());
}

const BANANA_OATS = [
  { name: 'Banana', confidence: 'high', estimatedQuantity: '4 units' },
  { name: 'Oats', confidence: 'high' },
  { name: 'Greek yogurt', confidence: 'medium' },
];

beforeEach(() => {
  users = { [USER_ID]: makeUser(), [OTHER_ID]: makeUser({ _id: OTHER_ID }) };
  previews = [];
  fakePantryRead.reset();
  visionIngredients = BANANA_OATS;
  visionError = null;
  aiHandler = () => [
    recipe('Banana Oat Blend', [['Banana', '1'], ['Oats', '30 g'], ['Water', '200 ml']]),
    recipe('Yogurt Banana', [['Banana', '1'], ['Greek yogurt', '150 g']]),
  ];
  for (const fn of [userFindOneAndUpdateMock, userUpdateOneMock, callAiMock, callVisionAiMock, awardXPMock, pantryReadCreateMock]) {
    fn.mock.resetCalls();
  }
});

// ─── Leitura ─────────────────────────────────────────────────────────────────

describe('CP-B7 — POST /pantry-scanner/read', () => {
  it('só a visão: não conta scan, não chama a geração, sem XP; guarda a leitura sem a imagem, com TTL de 30 min', async () => {
    const before = Date.now();
    const res = await read();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as Doc & { ingredients: Doc[] };
    assert.equal(typeof data.readId, 'string');
    assert.equal(data.hasLiquid, false);
    assert.equal(data.noFoodDetected, false);
    assert.equal(data.alcoholAge, 'unknown');
    assert.equal(data.nextGenerationIsPreview, false);
    assert.deepEqual(data.ingredients.map(i => i.name), ['Banana', 'Oats', 'Greek yogurt']);
    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(users[USER_ID].pantryReadCount, 1);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);

    assert.equal(pantryReadCreateMock.mock.callCount(), 1);
    const stored = pantryReadCreateMock.mock.calls[0].arguments[0] as unknown as Doc;
    const serialized = JSON.stringify(stored);
    assert.ok(!serialized.includes(TEST_JPEG_BASE64.slice(0, 20)), 'a imagem não pode ser gravada');
    assert.deepEqual(Object.keys(stored).sort(), ['expiresAt', 'hasLiquid', 'ingredients', 'userId']);
    const expiresAt = (stored.expiresAt as Date).getTime();
    assert.ok(expiresAt >= before + PANTRY_READ_TTL_MS && expiresAt <= Date.now() + PANTRY_READ_TTL_MS);
    assert.equal(PANTRY_READ_TTL_MS, 30 * 60 * 1000);
  });

  it('isAlcoholic pela lista do validador (ginger beer não é); hasLiquid pelo líquido de base, não pela bebida', async () => {
    visionIngredients = [
      { name: 'White rum', confidence: 'high' },
      { name: 'Ginger beer', confidence: 'high' },
      { name: 'Cerveja sem álcool', confidence: 'high' },
      { name: 'Vinho tinto', confidence: 'medium' },
      { name: 'Pineapple', confidence: 'high' },
    ];
    const res = await read();
    const data = res.body?.data as { ingredients: Array<{ name: string; isAlcoholic: boolean }>; hasLiquid: boolean };

    assert.deepEqual(
      data.ingredients.map(i => [i.name, i.isAlcoholic]),
      [['White rum', true], ['Ginger beer', false], ['Cerveja sem álcool', false], ['Vinho tinto', true], ['Pineapple', false]]
    );
    assert.equal(data.hasLiquid, false);

    visionIngredients = [{ name: 'Leite integral', confidence: 'high' }, { name: 'Morango', confidence: 'high' }];
    assert.equal(((await read()).body?.data as { hasLiquid: boolean }).hasLiquid, true);
    visionIngredients = [{ name: 'Leite condensado', confidence: 'high' }, { name: 'Morango', confidence: 'high' }];
    assert.equal(((await read()).body?.data as { hasLiquid: boolean }).hasLiquid, false);
  });

  it('respostas de hoje: sem comida e sem ingrediente utilizável (200, sem readId); provedor fora: 503 e a leitura volta', async () => {
    callVisionAiMock.mock.mockImplementationOnce(async () => ({
      content: JSON.stringify({ ingredients: [], noFoodDetected: true }),
      provider: 'google',
      model: 'm',
    }));
    const noFood = await read();
    assert.equal(noFood.statusCode, 200);
    assert.equal((noFood.body?.data as Doc).noFoodDetected, true);
    assert.equal((noFood.body?.data as Doc).readId, undefined);

    visionIngredients = [{ name: 'Mystery jar', confidence: 'low' }];
    const noUsable = await read();
    assert.equal((noUsable.body?.data as Doc).noUsableIngredients, true);
    assert.equal((noUsable.body?.data as Doc).readId, undefined);
    assert.equal(users[USER_ID].pantryReadCount, 2);

    visionError = new FakeAiProviderRequestError('down');
    const down = await read();
    assert.equal(down.statusCode, 503);
    assert.equal(down.body?.code, 'scanner/vision-unavailable');
    assert.equal(users[USER_ID].pantryReadCount, 2, 'falha do provedor devolve a leitura');
    assert.equal(users[USER_ID].scanCount, 0);
  });

  it('free: teto de (3 scans + 1 prévia) × 3 leituras por ciclo, com a data de renovação', async () => {
    const limit = (3 + 1) * PANTRY_READS_PER_SCAN;
    users[USER_ID].pantryReadCount = limit - 1;

    assert.equal((await read()).statusCode, 200);
    const blocked = await read();

    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body?.code, 'scanner/read-limit-reached');
    assert.equal(blocked.body?.resetDate, SCAN_RESET_DATE.toISOString());
    assert.equal(callVisionAiMock.mock.callCount(), 1);
  });

  it('free: sem scan nem prévia restante não lê; só com a prévia restante lê (e avisa que a geração será a prévia)', async () => {
    users[USER_ID].scanCount = 3;
    const withPreview = await read();
    assert.equal(withPreview.statusCode, 200);
    assert.equal((withPreview.body?.data as Doc).nextGenerationIsPreview, true);

    users[USER_ID].monthlyScanPreviewUsage = 1;
    const none = await read();
    assert.equal(none.statusCode, 429);
    assert.equal(none.body?.code, 'scanner/read-limit-reached');
    assert.equal(callVisionAiMock.mock.callCount(), 1);
  });

  it('free: ciclo novo zera as leituras junto com scans e prévia', async () => {
    users[USER_ID] = makeUser({
      scanResetDate: new Date(Date.now() - DAY_MS),
      scanCount: 3,
      monthlyScanPreviewUsage: 1,
      pantryReadCount: 12,
    });

    const res = await read();

    assert.equal(res.statusCode, 200);
    assert.equal(users[USER_ID].pantryReadCount, 1);
    assert.equal(users[USER_ID].scanCount, 0);
  });

  it(`Pro: ${PANTRY_PRO_READ_BURST_LIMIT} leituras em 10 min, a seguinte "aguarde"; fora da janela volta a ler`, async () => {
    users[USER_ID] = makeUser({ isPro: true, scanCount: 40 });

    for (let i = 0; i < PANTRY_PRO_READ_BURST_LIMIT; i += 1) {
      assert.equal((await read()).statusCode, 200, `leitura ${i + 1}`);
    }
    const blocked = await read();
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body?.code, 'scanner/read-rate-limited');
    assert.equal(callVisionAiMock.mock.callCount(), PANTRY_PRO_READ_BURST_LIMIT);

    // As 10 ficaram para trás da janela.
    const old = Date.now() - PANTRY_PRO_READ_BURST_WINDOW_MS - 1000;
    users[USER_ID].pantryReadRecent = (users[USER_ID].pantryReadRecent as Date[]).map((_, i) => new Date(old + i));
    assert.equal((await read()).statusCode, 200);
    assert.equal(users[USER_ID].scanCount, 40, 'leitura não conta scan');
  });

  it(`Pro: teto de segurança de ${PANTRY_PRO_READ_DAILY_LIMIT} por dia; dia novo zera`, async () => {
    users[USER_ID] = makeUser({ isPro: true, pantryReadDayCount: PANTRY_PRO_READ_DAILY_LIMIT, pantryReadDayResetDate: new Date() });

    const blocked = await read();
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body?.code, 'scanner/read-daily-limit');

    users[USER_ID].pantryReadDayResetDate = new Date(Date.now() - 2 * DAY_MS);
    assert.equal((await read()).statusCode, 200);
    assert.equal(users[USER_ID].pantryReadDayCount, 1);
  });

  it('Pro: falha do provedor devolve a leitura (contador e janela)', async () => {
    users[USER_ID] = makeUser({ isPro: true });
    visionError = new FakeAiProviderRequestError('down');

    assert.equal((await read()).statusCode, 503);
    assert.equal(users[USER_ID].pantryReadDayCount, 0);
    assert.deepEqual(users[USER_ID].pantryReadRecent, []);
  });
});

// ─── Geração ─────────────────────────────────────────────────────────────────

describe('CP-B7 — POST /pantry-scanner/generate: leitura e scan', () => {
  it('conta o scan, dá XP, entrega e devolve um readId novo com o mesmo vencimento; o antigo não gera de novo', async () => {
    const id = await readId();
    const res = await generate({ readId: id, selected: ['Banana', 'Oats', 'Greek yogurt'], added: [] });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const data = res.body?.data as Doc;
    assert.equal(users[USER_ID].scanCount, 1);
    assert.equal(data.scansUsed, 1);
    assert.equal(awardXPMock.mock.callCount(), 1);
    assert.notEqual(data.readId, id);
    const original = fakePantryRead.state.docs.find(d => d._id.toHexString() === id);
    assert.equal(data.readExpiresAt, original?.expiresAt.toISOString());

    const again = await generate({ readId: id, selected: ['Banana'], added: [] });
    assert.equal(again.statusCode, 410);
    assert.equal(again.body?.code, 'scanner/read-expired');

    aiHandler = () => [recipe('Banana Water', [['Banana', '1'], ['Water', '200 ml']])];
    const edited = await generate({ readId: data.readId, selected: ['Banana'], added: [] });
    assert.equal(edited.statusCode, 200);
    assert.equal(users[USER_ID].scanCount, 2, 'gerar de novo conta um novo scan');
  });

  it('readId de outro usuário, vencido, inválido ou inexistente: 410 sem contar scan nem chamar a IA', async () => {
    const id = await readId();

    const other = await generate({ readId: id, selected: ['Banana'], added: [] }, OTHER_ID);
    assert.equal(other.statusCode, 410);

    fakePantryRead.state.docs[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal((await generate({ readId: id, selected: ['Banana'], added: [] })).statusCode, 410);
    assert.equal((await generate({ readId: 'nope', selected: ['Banana'], added: [] })).statusCode, 410);
    assert.equal(
      (await generate({ readId: new mongoose.Types.ObjectId().toHexString(), selected: ['Banana'], added: [] })).statusCode,
      410
    );
    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(callAiMock.mock.callCount(), 0);
  });

  it('selected fora da leitura é recusado (o app não injeta item como "lido da foto"); schema estrito', async () => {
    const id = await readId();

    const injected = await generate({ readId: id, selected: ['Banana', 'Whey protein'], added: [] });
    assert.equal(injected.statusCode, 400);
    assert.equal(injected.body?.code, 'scanner/invalid-selection');

    const extraField = await generate({ readId: id, selected: ['Banana'], added: [], isPro: true });
    assert.equal(extraField.statusCode, 400);
    assert.equal(extraField.body?.code, 'scanner/invalid-generate-request');

    const tooMany = await generate({ readId: id, selected: ['Banana'], added: Array.from({ length: 11 }, (_, i) => `item ${i}`) });
    assert.equal(tooMany.statusCode, 400);
    const tooLong = await generate({ readId: id, selected: ['Banana'], added: ['x'.repeat(41)] });
    assert.equal(tooLong.statusCode, 400);
    const longRequest = await generate({ readId: id, selected: ['Banana'], added: [], request: 'y'.repeat(501) });
    assert.equal(longRequest.statusCode, 400);
    const nothing = await generate({ readId: id, selected: [], added: [] });
    assert.equal(nothing.statusCode, 400);

    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(callAiMock.mock.callCount(), 0);
  });

  it('falha da IA: 503, scan devolvido, leitura devolvida (o mesmo readId gera depois)', async () => {
    const id = await readId();
    aiHandler = () => new Error('provider down');

    const failed = await generate({ readId: id, selected: ['Banana'], added: [] });
    assert.equal(failed.statusCode, 503);
    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(awardXPMock.mock.callCount(), 0);

    aiHandler = () => [recipe('Banana Water', [['Banana', '1'], ['Water', '200 ml']])];
    const ok = await generate({ readId: id, selected: ['Banana'], added: [] });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(users[USER_ID].scanCount, 1);
  });

  it('free sem scans: a geração é a prévia bloqueada (ingredientes + macros), sem scan nem XP', async () => {
    users[USER_ID].scanCount = 3;
    const id = await readId();

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: ['Peanut butter'] });

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { locked: boolean; ingredients: Array<{ name: string }>; recipes: Doc[] };
    assert.equal(data.locked, true);
    assert.deepEqual(data.ingredients.map(i => i.name), ['Banana', 'Oats', 'Peanut butter']);
    assert.ok(data.recipes.every(r => Object.keys(r).join() === 'macros'));
    assert.equal(users[USER_ID].scanCount, 3);
    assert.equal(users[USER_ID].monthlyScanPreviewUsage, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
    assert.equal(previews.length, 1);
  });
});

describe('CP-B7 — confirmação com efeito real', () => {
  it('desmarcado nunca entra: não vai ao prompt; se a IA usar, nova tentativa; se persistir, a receita cai', async () => {
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('items the user unchecked')) {
        const previous = JSON.parse(messages.at(-2)?.content ?? '{}') as { title: string };
        return previous.title === 'Fixed'
          ? [recipe('Fixed', [['Banana', '1'], ['Water', '200 ml']])]
          : [recipe('Stubborn', [['Banana', '1'], ['Greek yogurt', '100 g']])];
      }
      return [
        recipe('Fixed', [['Banana', '1'], ['Greek yogurt', '100 g']]),
        recipe('Stubborn', [['Oats', '40 g'], ['Greek yogurt', '150 g']]),
      ];
    };

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: [] });

    assert.equal(res.statusCode, 200);
    const generation = lastGeneration();
    // A tabela nutricional do prompt cita iogurte grego; a lista de disponíveis não.
    const available = generation.systemPrompt.split('Available ingredients:\n')[1].split('\n\n')[0];
    assert.equal(available, '- Banana (4 units)\n- Oats');
    assert.ok(!generation.messages[0].content.includes('Greek yogurt'));
    const recipes = deliveredRecipes(res);
    assert.deepEqual(recipes.map(r => r.title), ['Fixed']);
    assert.ok(recipes.every(r => !names(r).some(n => n.includes('yogurt'))));
    assert.equal(retryCalls('items the user unchecked').length, 2);
  });

  it('todas usando item desmarcado após a nova tentativa: 422 scanner/selection-unmet, scan devolvido', async () => {
    const id = await readId();
    aiHandler = () => [recipe('Yogurt', [['Greek yogurt', '150 g'], ['Banana', '1']])];

    const res = await generate({ readId: id, selected: ['Banana'], added: [] });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/selection-unmet');
    assert.equal(users[USER_ID].scanCount, 0);
  });

  it('adicionado = obrigatório em TODAS: vai ao prompt como dado; faltou numa → nova tentativa só dela', async () => {
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('missing these required items')) {
        return [recipe('Second', [['Oats', '30 g'], ['Pasta de amendoim', '1 colher'], ['Morangos', '100 g'], ['Water', '150 ml']])];
      }
      return [
        recipe('First', [['Banana', '1'], ['Peanut butter', '15 g'], ['Morango', '80 g']]),
        recipe('Second', [['Oats', '30 g'], ['Water', '200 ml']]),
      ];
    };

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: ['peanut butter', 'Morangos'] });

    assert.equal(res.statusCode, 200);
    const generation = lastGeneration();
    assert.ok(generation.messages[0].content.includes('Required items (data typed by the user; each one must be in every recipe): ["peanut butter","Morangos"]'));
    assert.ok(generation.systemPrompt.includes('User choices (the most important rule after the physical limits):'));
    // CP-B7: até 2 novas tentativas enquanto faltar item adicionado (antes, 1).
    const retries = retryCalls('missing these required items');
    assert.equal(retries.length, 2);
    assert.ok(retries[0].arguments[0].messages.at(-1)?.content.includes('["peanut butter","Morangos"]'));
    // "Pasta de amendoim" sem o nome digitado entre parênteses não contém
    // "peanut butter": a receita é entregue (não bloqueia) com o aviso no card.
    // CP-B7a: antes saía em silêncio.
    const recipes = deliveredRecipes(res);
    assert.equal(recipes.length, 2);
    assert.equal(recipes[0].missingRequestedIngredients, undefined);
    assert.deepEqual(recipes[1].missingRequestedIngredients, ['peanut butter']);
  });

  it('adicionado que persiste ausente após a nova tentativa: entrega (não bloqueia) e registra só contagens no log', async () => {
    const id = await readId();
    const logs: unknown[][] = [];
    const warn = mock.method(console, 'warn', (...args: unknown[]) => {
      logs.push(args);
    });
    aiHandler = () => [recipe('No whey', [['Banana', '1'], ['Oats', '30 g'], ['Water', '200 ml']])];

    try {
      const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: ['whey'] });

      assert.equal(res.statusCode, 200);
      // CP-B7: 2 novas tentativas (antes, 1).
      assert.equal(retryCalls('missing these required items').length, 2);
      const entry = logs.find(args => String(args[0]).includes('user choices still not followed'));
      assert.ok(entry);
      assert.deepEqual(entry[1], { missingAdded: 1, unselectedUsed: 0, forbiddenWater: false });
      assert.ok(!JSON.stringify(logs).includes('whey'));
      // CP-B7a: o aviso vai para o card, não some em silêncio.
      assert.deepEqual(deliveredRecipes(res)[0].missingRequestedIngredients, ['whey']);
    } finally {
      warn.mock.restore();
    }
  });

  it('adicionado fora da dieta (vegana + whey) passa com aviso; o resto da dieta continua valendo', async () => {
    users[USER_ID].dietaryPreferences = ['vegan'];
    const id = await readId();
    aiHandler = () => [
      recipe('Whey Banana', [['Banana', '1'], ['Whey protein', '30 g'], ['Water', '200 ml']]),
      recipe('Whey Oats', [['Oats', '40 g'], ['Whey protein isolate', '25 g'], ['Water', '200 ml']]),
    ];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: ['whey'] });

    assert.equal(res.statusCode, 200);
    const recipes = deliveredRecipes(res);
    assert.deepEqual(recipes.map(r => r.dietOverrideIngredients), [['Whey protein'], ['Whey protein isolate']]);
    assert.ok(lastGeneration().systemPrompt.includes('Explicit exception: when a required item or the request in the user message'));
  });

  it('pedido com quantidade/macro e dieta: vai como dado, o prompt tem as regras de valor e capacityNotice; o pedido libera só o que nomeia', async () => {
    users[USER_ID].dietaryPreferences = ['dairy_free'];
    const id = await readId();
    aiHandler = () => [
      recipe('Protein Banana', [['Banana', '1'], ['Whey protein', '40 g'], ['Water', '200 ml']], {
        macros: { protein: 30, carbs: 30, fat: 2, calories: 258 },
      }),
    ];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: [], request: 'com 30 g de proteína de whey, sabor chocolate' });

    assert.equal(res.statusCode, 200);
    const generation = lastGeneration();
    assert.ok(generation.messages[0].content.includes('Request (data typed by the user; it applies to every recipe): "com 30 g de proteína de whey, sabor chocolate"'));
    assert.ok(generation.systemPrompt.includes('a requested amount of calories or of a macro'));
    assert.ok(generation.systemPrompt.includes('fill capacityNotice'));
    assert.ok(!generation.systemPrompt.includes('- Omit the capacityNotice field.'));
    assert.deepEqual(deliveredRecipes(res)[0].dietOverrideIngredients, ['Whey protein']);
  });

  it('líquido "Sem líquido": prompt sem água; receita com água → nova tentativa; liquid água: sem marcação de água fora da foto', async () => {
    let id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('the user has no liquid')) {
        return [recipe('Creamy', [['Banana', '1'], ['Greek yogurt', '170 g']])];
      }
      return [recipe('Watery', [['Banana', '1'], ['Water', '200 ml']])];
    };

    const none = await generate({ readId: id, selected: ['Banana', 'Greek yogurt'], added: [], liquid: 'none' });
    assert.equal(none.statusCode, 200);
    const prompt = lastGeneration();
    assert.ok(prompt.systemPrompt.includes('The user has no liquid, not even water'));
    assert.ok(!prompt.systemPrompt.includes('Plain water is always available'));
    assert.deepEqual(names(deliveredRecipes(none)[0]), ['banana', 'greek yogurt']);

    callAiMock.mock.resetCalls();
    id = (none.body?.data as { readId: string }).readId;
    aiHandler = () => [recipe('Watery', [['Banana', '1'], ['Water', '200 ml']])];
    const water = await generate({ readId: id, selected: ['Banana'], added: [], liquid: 'water' });
    assert.equal(water.statusCode, 200);
    assert.equal(deliveredRecipes(water)[0].usesWaterNotInPhoto, undefined);

    // Sem escolha (como hoje): água fora da foto continua marcada.
    id = (water.body?.data as { readId: string }).readId;
    const unset = await generate({ readId: id, selected: ['Banana'], added: [] });
    assert.equal(deliveredRecipes(unset)[0].usesWaterNotInPhoto, true);
  });

  it('líquido leite: entra na lista como disponível e a água sai do prompt', async () => {
    const id = await readId();
    aiHandler = () => [recipe('Milky', [['Banana', '1'], ['Milk', '250 ml']])];

    const res = await generate({ readId: id, selected: ['Banana'], added: [], liquid: 'milk' });

    assert.equal(res.statusCode, 200);
    const prompt = lastGeneration();
    assert.ok(prompt.systemPrompt.includes('Available ingredients:\n- Banana (4 units)\n- Milk'));
    assert.ok(prompt.systemPrompt.includes('The user chose milk as the liquid'));
    assert.ok(!prompt.systemPrompt.includes('Plain water is always available'));
  });

  it('adicionado grande que não cabe: a nova tentativa por volume mantém o pedido e a receita mais próxima vem com capacityNotice', async () => {
    users[USER_ID].blendiModel = 'Lite';
    const id = await readId();
    const notice = 'You asked for 300 g of banana, but your BLENDi Lite cup holds up to 400 ml; this recipe has 250 g.';
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('exceeded the physical volume')) {
        return [recipe('Banana Max', [['Banana', '250 g'], ['Water', '120 ml']], { capacityNotice: notice })];
      }
      return [recipe('Banana Max', [['Banana', '300 g'], ['Water', '250 ml']])];
    };

    const res = await generate({ readId: id, selected: ['Oats'], added: ['300 g de banana'] });

    assert.equal(res.statusCode, 200);
    const volumeRetry = retryCalls('exceeded the physical volume');
    assert.equal(volumeRetry.length, 1);
    assert.ok(volumeRetry[0].arguments[0].messages.at(-1)?.content.includes("Keep every ingredient the user's current message explicitly asked for"));
    assert.equal(deliveredRecipes(res)[0].capacityNotice, notice);
  });
});

// ─── Álcool ──────────────────────────────────────────────────────────────────

describe('CP-B7a — item adicionado em qualquer idioma', () => {
  it('pt-BR com "peanut butter": "Pasta de amendoim (peanut butter)" passa sem nova tentativa e sem aviso', async () => {
    users[USER_ID].locale = 'pt-BR';
    const id = await readId();
    aiHandler = () => [
      recipe('Banana e amendoim', [['Banana', '1'], ['Pasta de amendoim (peanut butter)', '1 colher de sopa'], ['Água', '200 ml']]),
      recipe('Aveia e amendoim', [['Aveia', '30 g'], ['Pasta de amendoim (peanut butter)', '15 g'], ['Água', '200 ml']]),
    ];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], added: ['peanut butter'] });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls('missing these required items').length, 0);
    assert.ok(deliveredRecipes(res).every(r => r.missingRequestedIngredients === undefined));
    assert.ok(lastGeneration().systemPrompt.includes('add the typed name in parentheses, for example "Pasta de amendoim (peanut butter)"'));
  });

  it('en com "pasta de amendoim": "Peanut butter (pasta de amendoim)" também passa', async () => {
    const id = await readId();
    aiHandler = () => [recipe('PB Banana', [['Banana', '1'], ['Peanut butter (pasta de amendoim)', '15 g'], ['Water', '200 ml']])];

    const res = await generate({ readId: id, selected: ['Banana'], added: ['pasta de amendoim'] });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls('missing these required items').length, 0);
    assert.equal(deliveredRecipes(res)[0].missingRequestedIngredients, undefined);
  });

  it('sem parênteses e sem o item: nova tentativa (que pede os parênteses) e, se continuar faltando, aviso no card', async () => {
    users[USER_ID].locale = 'pt-BR';
    const id = await readId();
    aiHandler = () => [recipe('Banana', [['Banana', '1'], ['Pasta de amendoim', '15 g'], ['Água', '200 ml']])];

    const res = await generate({ readId: id, selected: ['Banana'], added: ['peanut butter'] });

    assert.equal(res.statusCode, 200);
    // CP-B7: 2 novas tentativas (antes, 1).
    const retries = retryCalls('missing these required items');
    assert.equal(retries.length, 2);
    assert.ok(retries[0].arguments[0].messages.at(-1)?.content.includes('add the typed name in parentheses'));
    assert.deepEqual(deliveredRecipes(res)[0].missingRequestedIngredients, ['peanut butter']);
  });

  it('o aviso é só do backend: o valor vindo da IA é descartado', async () => {
    const id = await readId();
    aiHandler = () => [
      recipe('Whey Banana', [['Banana', '1'], ['Whey protein', '30 g'], ['Water', '200 ml']], {
        missingRequestedIngredients: ['inventado pela IA'],
      }),
    ];

    const res = await generate({ readId: id, selected: ['Banana'], added: ['whey'] });

    assert.equal(res.statusCode, 200);
    assert.equal(deliveredRecipes(res)[0].missingRequestedIngredients, undefined);
  });
});

describe('CP-B7 — álcool no Pantry (só na geração)', () => {
  const WITH_RUM = [
    { name: 'Pineapple', confidence: 'high' },
    { name: 'Coconut milk', confidence: 'high' },
    { name: 'White rum', confidence: 'high' },
  ];

  function pinaColada(withRum: boolean, extra: Doc = {}) {
    return recipe(withRum ? 'Pineapple Coconut Rum' : 'Pineapple Coconut', [
      ['Pineapple', '150 g'],
      ['Coconut milk', '120 ml'],
      ...(withRum ? ([['White rum', '45 ml']] as Array<[string, string]>) : []),
    ], withRum ? { alcoholGrams: 14, macros: { protein: 2, carbs: 30, fat: 12, calories: 336 }, ...extra } : extra);
  }

  it('21+ com a garrafa marcada: prompt com álcool permitido e a receita sai com álcool e alcoholGrams', async () => {
    users[USER_ID].alcoholAgeConfirmed = true;
    visionIngredients = WITH_RUM;
    const id = await readId();
    aiHandler = () => [pinaColada(true), pinaColada(false)];

    const res = await generate({ readId: id, selected: ['Pineapple', 'Coconut milk', 'White rum'], added: [] });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const prompt = lastGeneration().systemPrompt;
    assert.ok(prompt.includes('The user is of legal drinking age and checked an alcoholic ingredient as available'));
    assert.ok(prompt.includes('"alcoholGrams": number (optional)'));
    const [withAlcohol] = deliveredRecipes(res);
    assert.equal(withAlcohol.alcoholGrams, 14);
    assert.equal(withAlcohol.alcoholFreeVersion, undefined);
  });

  it('21+: acima do teto de 28 g → nova tentativa pela rede alcohol_limit', async () => {
    users[USER_ID].alcoholAgeConfirmed = true;
    visionIngredients = WITH_RUM;
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('mandatory restrictions')) return [pinaColada(true)];
      return [pinaColada(true, { alcoholGrams: 40, macros: { protein: 2, carbs: 30, fat: 12, calories: 462 } })];
    };

    const res = await generate({ readId: id, selected: ['Pineapple', 'Coconut milk', 'White rum'], added: [] });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls('mandatory restrictions').length, 1);
    assert.equal(deliveredRecipes(res)[0].alcoholGrams, 14);
  });

  it('menor (data real) com item alcoólico marcado: 403 próprio, sem scan e sem IA', async () => {
    users[USER_ID].hasRealBodyProfile = true;
    users[USER_ID].birthDate = new Date(Date.now() - 17 * 365 * DAY_MS);
    visionIngredients = WITH_RUM;
    const id = await readId();
    assert.equal(((await read()).body?.data as Doc).alcoholAge, 'under-age');

    const res = await generate({ readId: id, selected: ['Pineapple', 'White rum'], added: [] });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.code, 'scanner/alcohol-not-allowed');
    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(callAiMock.mock.callCount(), 0);
  });

  it('"Não" na pergunta e álcool pedido no texto: receita sem álcool, com aviso; a rede no_alcohol refaz a que trouxe rum', async () => {
    users[USER_ID].alcoholAgeConfirmed = false;
    visionIngredients = WITH_RUM;
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('mandatory restrictions')) return [pinaColada(false)];
      // "Dark rum" não é o item desmarcado ("White rum"): quem pega é a rede no_alcohol.
      const withRum = pinaColada(true);
      return [{ ...withRum, ingredients: withRum.ingredients.map(i => (i.name === 'White rum' ? { ...i, name: 'Dark rum' } : i)) }];
    };

    const res = await generate({ readId: id, selected: ['Pineapple', 'Coconut milk'], added: [], request: 'com rum' });

    assert.equal(res.statusCode, 200);
    const prompt = lastGeneration().systemPrompt;
    assert.ok(prompt.includes('Never use alcohol in these recipes'));
    assert.ok(prompt.includes('make the alcohol-free version with the same flavor'));
    assert.ok(!lastGeneration().systemPrompt.includes('White rum'), 'desmarcado não vai ao prompt');
    const [delivered] = deliveredRecipes(res);
    assert.equal(delivered.alcoholFreeVersion, true);
    assert.ok(!names(delivered).some(n => n.includes('rum')));
    assert.equal(retryCalls('mandatory restrictions').length, 1);
  });

  it('sem idade e com álcool (marcado, adicionado ou pedido): 428 antes de contar scan e de chamar a IA; a leitura segue valendo', async () => {
    visionIngredients = WITH_RUM;
    const id = await readId();

    for (const body of [
      { readId: id, selected: ['Pineapple', 'White rum'], added: [] },
      { readId: id, selected: ['Pineapple'], added: ['cachaça'] },
      { readId: id, selected: ['Pineapple'], added: [], request: 'with vodka' },
    ]) {
      const res = await generate(body);
      assert.equal(res.statusCode, 428);
      assert.equal(res.body?.code, 'scanner/age-confirmation-required');
    }
    assert.equal(users[USER_ID].scanCount, 0);
    assert.equal(callAiMock.mock.callCount(), 0);

    // Depois da confirmação (POST /pulse-ai/age-confirmation), o reenvio gera.
    users[USER_ID].alcoholAgeConfirmed = true;
    aiHandler = () => [pinaColada(true)];
    const res = await generate({ readId: id, selected: ['Pineapple', 'Coconut milk', 'White rum'], added: [] });
    assert.equal(res.statusCode, 200);
  });

  it('rede no_alcohol no Pantry: sem pedido de álcool, a IA que põe vinho é refeita; ginger beer marcado não é álcool', async () => {
    visionIngredients = [
      { name: 'Ginger beer', confidence: 'high' },
      { name: 'Lime', confidence: 'high' },
    ];
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('mandatory restrictions')) return [recipe('Ginger Lime', [['Ginger beer', '200 ml'], ['Lime', '1']])];
      return [recipe('Ginger Lime Wine', [['Ginger beer', '150 ml'], ['Lime', '1'], ['Red wine', '50 ml']])];
    };

    const res = await generate({ readId: id, selected: ['Ginger beer', 'Lime'], added: [] });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(lastGeneration().systemPrompt.includes('Never use alcohol in these recipes'));
    assert.equal(retryCalls('mandatory restrictions').length, 1);
    assert.ok(!names(deliveredRecipes(res)[0]).some(n => n.includes('wine')));
    assert.equal(deliveredRecipes(res)[0].alcoholFreeVersion, undefined);
  });
});
