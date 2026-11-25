// CP-B6 — Pantry Scanner × alergias. A leitura marca o item que bate com
// alergia cadastrada (isAllergen + códigos); marcar/adicionar alérgeno ou
// citá-lo no "Algum pedido?" exige a confirmação daquela geração (senão 428,
// sem contar scan e sem consumir a leitura); com ela, aviso forte no card;
// prato implícito no pedido → receita sem o alérgeno e sugestão; o item
// adicionado à mão é conferido na hora (POST /allergy-check).
// Mesma montagem de pantryScanner.cpB7.test.ts.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
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

let visionIngredients: Array<{ name: string; confidence: string; estimatedQuantity?: string; blendSuitable?: unknown }> = [];
let visionError: Error | null = null;
const callVisionAiMock = mock.fn(async (_input?: { prompt: string; maxTokens?: number }) => {
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
let checkPantryAllergy: ControllerModule['checkPantryAllergy'];

before(async () => {
  ({ readPantry, generatePantry, checkPantryAllergy } = await import('./pantryScanner.controller.js'));
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
    allergies: { common: ['peanut'], custom: [] },
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

function names(r: { ingredients: Array<{ name: string }> }): string[] {
  return r.ingredients.map(i => i.name.toLowerCase());
}

function deliveredRecipes(res: { body?: Doc }): Array<Doc & { ingredients: Array<{ name: string }> }> {
  return (res.body?.data as { recipes: Array<Doc & { ingredients: Array<{ name: string }> }> }).recipes;
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

type ReadItem = { name: string; isAlcoholic: boolean; blendSuitable: boolean };

function readItems(res: { body?: Doc }): ReadItem[] {
  return (res.body?.data as { ingredients: ReadItem[] }).ingredients;
}

const ITEM_RETRY_MARKER = 'missing these required items';


// ─── CP-B6 ───────────────────────────────────────────────────────────────────

type AllergyReadItem = ReadItem & { isAllergen?: boolean; allergens?: { common: string[]; custom: string[] } };

const PEANUT_PHOTO = [
  { name: 'Banana', confidence: 'high' },
  { name: 'Peanut butter', confidence: 'high' },
  { name: 'Oat milk', confidence: 'high' },
  { name: 'Paçoca', confidence: 'medium', blendSuitable: false },
];

function scanCount(): number {
  return (users[USER_ID].scanCount as number | undefined) ?? 0;
}

describe('CP-B6 — leitura marca o alérgeno', () => {
  beforeEach(() => {
    visionIngredients = PEANUT_PHOTO;
  });

  it('isAllergen + códigos no item (principal ou "Outros itens"); o resto sem o campo', async () => {
    const res = await read();
    const items = readItems(res) as AllergyReadItem[];

    assert.equal(res.statusCode, 200);
    assert.deepEqual(
      items.map(item => [item.name, item.isAllergen ?? false, item.allergens?.common ?? [], item.blendSuitable]),
      [
        ['Banana', false, [], true],
        ['Peanut butter', true, ['peanut'], true],
        ['Oat milk', false, [], true],
        ['Paçoca', true, ['peanut'], false],
      ]
    );
  });

  it('sem alergia cadastrada, nenhum item é marcado', async () => {
    users[USER_ID].allergies = { common: [], custom: [] };
    const items = readItems(await read()) as AllergyReadItem[];
    assert.equal(items.some(item => item.isAllergen), false);
  });
});

describe('CP-B6 — geração', () => {
  beforeEach(() => {
    visionIngredients = PEANUT_PHOTO;
  });

  it('item alergênico marcado sem confirmação: 428 sem scan, sem IA e com a leitura ainda válida', async () => {
    const id = await readId();

    const res = await generate({ readId: id, selected: ['Banana', 'Peanut butter'], added: [] });

    assert.equal(res.statusCode, 428);
    assert.equal(res.body?.code, 'scanner/allergy-confirmation-required');
    assert.deepEqual(res.body?.data, { allergens: { common: ['peanut'], custom: [] } });
    assert.equal(scanCount(), 0);
    assert.equal(callAiMock.mock.callCount(), 0);

    // A mesma leitura ainda gera (não foi consumida).
    aiHandler = () => [recipe('Banana PB', [['Banana', '1'], ['Peanut butter', '1 tbsp'], ['Water', '200 ml']])];
    const confirmed = await generate({
      readId: id,
      selected: ['Banana', 'Peanut butter'],
      added: [],
      allergyOverride: { common: ['peanut'], custom: [] },
    });
    assert.equal(confirmed.statusCode, 200, JSON.stringify(confirmed.body));
    assert.equal(scanCount(), 1);
    assert.deepEqual(deliveredRecipes(confirmed)[0].allergyOverride, { common: ['peanut'], custom: [] });
  });

  it('item adicionado à mão que é alérgeno também exige a confirmação', async () => {
    const id = await readId();

    const res = await generate({ readId: id, selected: ['Banana'], added: ['pasta de amendoim'] });

    assert.equal(res.statusCode, 428);
    assert.equal(scanCount(), 0);
  });

  it('alérgeno citado no "Algum pedido?": 428; "Não, fazer sem" gera sem ele e sem cobrar o item', async () => {
    const id = await readId();

    const asked = await generate({ readId: id, selected: ['Banana', 'Oat milk'], added: [], request: 'com amendoim' });
    assert.equal(asked.statusCode, 428);

    aiHandler = () => [recipe('Banana Oat', [['Banana', '1'], ['Oat milk', '200 ml']])];
    const declined = await generate({
      readId: id,
      selected: ['Banana', 'Oat milk'],
      added: [],
      request: 'com amendoim',
      allergyDeclined: { common: ['peanut'], custom: [] },
    });

    assert.equal(declined.statusCode, 200, JSON.stringify(declined.body));
    assert.equal(retryCalls(ITEM_RETRY_MARKER).length, 0);
    const delivered = deliveredRecipes(declined)[0];
    assert.equal(delivered.allergyOverride, undefined);
    assert.equal(delivered.allergySuggestion, undefined);
    assert.equal(delivered.missingRequestedIngredients, undefined);
  });

  it('a confirmação só vale para o que foi marcado, adicionado ou pedido (e cadastrado)', async () => {
    users[USER_ID].allergies = { common: ['peanut', 'egg'], custom: [] };
    const id = await readId();
    let attempt = 0;
    aiHandler = () => {
      attempt += 1;
      return attempt === 1
        ? [recipe('Egg Banana', [['Banana', '1'], ['Egg white', '2'], ['Oat milk', '200 ml']])]
        : [recipe('Banana Oat', [['Banana', '1'], ['Oat milk', '200 ml']])];
    };

    // Confirma ovo sem que nenhum item/pedido o cite: ignorado (ovo continua proibido).
    const res = await generate({
      readId: id,
      selected: ['Banana', 'Oat milk'],
      added: [],
      allergyOverride: { common: ['egg'], custom: [] },
    });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(attempt >= 2, 'a receita com ovo foi refeita');
    assert.equal(deliveredRecipes(res)[0].allergyOverride, undefined);
  });

  it('item desmarcado com alérgeno nunca entra; receita com alérgeno sem confirmação é descartada (sem scan)', async () => {
    const id = await readId();
    aiHandler = () => [recipe('Banana PB', [['Banana', '1'], ['Peanut butter', '1 tbsp'], ['Water', '200 ml']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Oat milk'], added: [] });

    assert.equal(res.statusCode, 422);
    assert.equal(scanCount(), 0);
  });

  it('prato implícito no pedido: receita sem o alérgeno e com a sugestão', async () => {
    const id = await readId();
    aiHandler = () => [recipe('Paçoca-style shake', [['Banana', '1'], ['Oat milk', '200 ml'], ['Cinnamon', '1 pinch']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Oat milk'], added: [], request: 'sabor paçoca' });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(deliveredRecipes(res)[0].allergySuggestion, { dish: 'Paçoca', allergens: ['peanut'] });
    assert.equal(retryCalls(ITEM_RETRY_MARKER).length, 0);
  });

  it('o prompt leva as alergias como dado', async () => {
    users[USER_ID].allergies = { common: ['peanut'], custom: ['kiwi <b>'] };
    const id = await readId();
    aiHandler = () => [recipe('Banana Oat', [['Banana', '1'], ['Oat milk', '200 ml']])];

    await generate({ readId: id, selected: ['Banana', 'Oat milk'], added: [] });

    const prompt = lastGeneration().systemPrompt;
    assert.match(prompt, /Allergies \(mandatory/);
    assert.match(prompt, /"kiwi <b>"/);
  });
});

describe('CP-B6 — POST /pantry-scanner/allergy-check', () => {
  it('confere o item pela família do backend (sem lactose não é lactose)', async () => {
    users[USER_ID].allergies = { common: ['lactose', 'peanut'], custom: ['kiwi'] };
    const check = (item: string) => invokeHandler(checkPantryAllergy, { body: { item }, user: { sub: USER_ID } });

    const peanut = await check('pasta de amendoim');
    const lactoseFree = await check('leite sem lactose');
    const kiwis = await check('kiwis');

    assert.equal(peanut.statusCode, 200);
    assert.deepEqual(peanut.body?.data, { isAllergen: true, allergens: { common: ['peanut'], custom: [] } });
    assert.deepEqual(lactoseFree.body?.data, { isAllergen: false, allergens: { common: [], custom: [] } });
    assert.deepEqual(kiwis.body?.data, { isAllergen: true, allergens: { common: [], custom: ['kiwi'] } });
    assert.equal(callAiMock.mock.callCount() + callVisionAiMock.mock.callCount(), 0);
  });

  it('corpo inválido: 400', async () => {
    const res = await invokeHandler(checkPantryAllergy, { body: { item: '', extra: 1 }, user: { sub: USER_ID } });
    assert.equal(res.statusCode, 400);
  });
});

describe('CP-B6b — chocolate na dieta (Pantry, mesmo validador)', () => {
  it('dairy_free: receita com "Chocolate" é refeita; com "Cocoa powder" passa e o prompt traz a linha do chocolate', async () => {
    users[USER_ID] = makeUser({ allergies: { common: [], custom: [] }, dietaryPreferences: ['dairy_free'] });
    visionIngredients = [
      { name: 'Banana', confidence: 'high' },
      { name: 'Chocolate', confidence: 'high' },
      { name: 'Cocoa powder', confidence: 'high' },
      { name: 'Oat milk', confidence: 'high' },
    ];
    const id = await readId();
    let attempt = 0;
    aiHandler = () => {
      attempt += 1;
      return attempt === 1
        ? [recipe('Choco', [['Banana', '1'], ['Chocolate', '20 g'], ['Oat milk', '200 ml']])]
        : [recipe('Cocoa', [['Banana', '1'], ['Cocoa powder', '1 tbsp'], ['Oat milk', '200 ml']])];
    };

    const res = await generate({ readId: id, selected: ['Banana', 'Chocolate', 'Cocoa powder', 'Oat milk'], added: [] });

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(attempt >= 2, 'a receita com chocolate foi refeita');
    assert.deepEqual(names(deliveredRecipes(res)[0]), ['banana', 'cocoa powder', 'oat milk']);
    assert.match(lastGeneration().systemPrompt, /For a chocolate flavor, use cocoa powder/);
  });
});
