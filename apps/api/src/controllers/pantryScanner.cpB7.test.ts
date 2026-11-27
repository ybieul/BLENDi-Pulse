// CP-B7 — Pantry Scanner: a leitura lista todo alimento e bebida da foto
// (blendSuitable: o que não serve vai para "Outros itens", desmarcado), e o
// "Algum pedido?" passa pela mesma conferência do Pulse AI: alimento citado
// (até 2 novas tentativas) e valor pedido (1 nova tentativa) viram aviso no
// card, com sugestão que respeita a dieta.
// Mesma montagem de pantryScanner.twoStep.test.ts (models fakes em memória).
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

type ReadItem = { name: string; isAlcoholic: boolean; blendSuitable: boolean };

function readItems(res: { body?: Doc }): ReadItem[] {
  return (res.body?.data as { ingredients: ReadItem[] }).ingredients;
}

const TARGET_RETRY_MARKER = 'does not meet the nutrient values';
const ITEM_RETRY_MARKER = 'missing these required items';

function withProtein(title: string, protein: number, ingredients: Array<[string, string]>, extra: Doc = {}) {
  const carbs = 30;
  const fat = 5;
  return recipe(title, ingredients, {
    macros: { protein, carbs, fat, calories: Math.round(protein * 4 + carbs * 4 + fat * 9) },
    ...extra,
  });
}

// ─── Leitura completa ────────────────────────────────────────────────────────

describe('CP-B7 — leitura com todos os alimentos e bebidas', () => {
  it('blendSuitable na resposta; ausente ou fora do formato = true; bebida alcoólica fica no grupo principal', async () => {
    visionIngredients = [
      { name: 'Banana', confidence: 'high', blendSuitable: true },
      { name: 'Milk', confidence: 'high' },
      { name: 'Ketchup', confidence: 'high', blendSuitable: false },
      { name: 'Pickles', confidence: 'medium', blendSuitable: false },
      { name: 'Spinach', confidence: 'high', blendSuitable: 'yes' },
      // A visão marcou como "não serve", mas é bebida alcoólica: grupo principal, desmarcado no app.
      { name: 'White rum', confidence: 'high', blendSuitable: false },
    ];

    const res = await read();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(
      readItems(res).map(item => [item.name, item.blendSuitable, item.isAlcoholic]),
      [
        ['Banana', true, false],
        ['Milk', true, false],
        ['Ketchup', false, false],
        ['Pickles', false, false],
        ['Spinach', true, false],
        ['White rum', true, true],
      ]
    );
    // A leitura guardada tem o campo (a próxima geração usa o mesmo).
    const stored = fakePantryRead.state.docs[0];
    assert.deepEqual(stored.ingredients.map(item => item.blendSuitable), [true, true, false, false, true, true]);
  });

  it('o prompt de visão pede todo alimento e bebida com blendSuitable; teto de tokens maior', async () => {
    await read();

    const input = callVisionAiMock.mock.calls[0].arguments[0];
    assert.ok(input?.prompt.includes('List every food and every drink that is visible'));
    assert.ok(input?.prompt.includes('blendSuitable is false when the item clearly does not belong'));
    assert.ok(input?.prompt.includes('condiments and sauces (ketchup, mustard, mayonnaise'));
    assert.ok(input?.prompt.includes('Ignore items that are not food or drink'));
    assert.equal(input?.maxTokens, 2500);
  });

  it('"Outros itens" não contam para hasLiquid', async () => {
    visionIngredients = [
      { name: 'Banana', confidence: 'high', blendSuitable: true },
      { name: 'Coconut water', confidence: 'high', blendSuitable: false },
    ];

    const res = await read();

    assert.equal((res.body?.data as { hasLiquid: boolean }).hasLiquid, false);
  });

  it('só "Outros itens" na foto: a leitura sai (a pessoa vê o que foi lido e pode marcar ou adicionar)', async () => {
    visionIngredients = [
      { name: 'Ketchup', confidence: 'high', blendSuitable: false },
      { name: 'Mustard', confidence: 'high', blendSuitable: false },
    ];

    const res = await read();

    const data = res.body?.data as { readId?: string; noUsableIngredients?: boolean };
    assert.ok(data.readId);
    assert.equal(data.noUsableIngredients, undefined);
  });

  it('item de "Outros itens" só entra se a pessoa marcar: desmarcado fica fora do prompt e é cobrado como desmarcado', async () => {
    visionIngredients = [
      { name: 'Banana', confidence: 'high', blendSuitable: true },
      { name: 'Oats', confidence: 'high', blendSuitable: true },
      { name: 'Pickles', confidence: 'high', blendSuitable: false },
    ];
    const id = await readId();
    aiHandler = ({ messages }) => {
      const last = messages.at(-1)?.content ?? '';
      if (last.includes('unchecked')) return [recipe('Fixed', [['Banana', '1'], ['Oats', '30 g'], ['Water', '200 ml']])];
      return [recipe('Odd', [['Banana', '1'], ['Pickles', '20 g'], ['Water', '200 ml']])];
    };

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'] });

    assert.equal(res.statusCode, 200);
    assert.ok(!lastGeneration().systemPrompt.includes('Pickles'));
    assert.equal(retryCalls('unchecked').length, 1);
    assert.ok(!names(deliveredRecipes(res)[0]).includes('pickles'));
  });

  it('marcado pela pessoa, o item de "Outros itens" vai para a lista de disponíveis', async () => {
    visionIngredients = [
      { name: 'Banana', confidence: 'high', blendSuitable: true },
      { name: 'Cottage cheese', confidence: 'high', blendSuitable: false },
    ];
    const id = await readId();

    const res = await generate({ readId: id, selected: ['Banana', 'Cottage cheese'] });

    assert.equal(res.statusCode, 200);
    assert.ok(lastGeneration().systemPrompt.includes('Cottage cheese'));
  });
});

// ─── "Algum pedido?" ─────────────────────────────────────────────────────────

describe('CP-B7 — valor e alimento do "Algum pedido?"', () => {
  it('"com 30 g de proteína" sem chegar lá → 1 nova tentativa → aviso com sugestão (whey ou proteína em pó)', async () => {
    const id = await readId();
    aiHandler = () => [withProtein('Low', 19.8, [['Banana', '1'], ['Greek yogurt', '150 g']])];
    const logs: unknown[][] = [];
    const warn = mock.method(console, 'warn', (...args: unknown[]) => {
      logs.push(args);
    });

    try {
      const res = await generate({ readId: id, selected: ['Banana', 'Oats', 'Greek yogurt'], request: 'com 30 g de proteína' });

      assert.equal(res.statusCode, 200);
      assert.equal(retryCalls(TARGET_RETRY_MARKER).length, 1);
      assert.ok(retryCalls(TARGET_RETRY_MARKER)[0].arguments[0].messages.at(-1)?.content.includes('Use only the available ingredients'));
      assert.deepEqual(deliveredRecipes(res)[0].unmetTargets, [
        { nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8, suggestion: 'whey_or_protein_powder' },
      ]);
      const event = logs.find(args => args[0] === '[requestCheck] requested target unmet');
      assert.ok(event);
      assert.equal((event[1] as Doc).origin, 'pantry');
      assert.equal((event[1] as Doc).attempts, 1);
    } finally {
      warn.mock.restore();
    }
  });

  it('vegana: a sugestão é proteína vegetal', async () => {
    users[USER_ID].dietaryPreferences = ['vegan'];
    visionIngredients = [{ name: 'Banana', confidence: 'high' }, { name: 'Oats', confidence: 'high' }];
    const id = await readId();
    aiHandler = () => [withProtein('Low', 12, [['Banana', '1'], ['Oats', '40 g'], ['Water', '200 ml']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], request: 'pelo menos 25 g de proteína' });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(deliveredRecipes(res)[0].unmetTargets, [
      { nutrient: 'protein', kind: 'min', requested: 25, delivered: 12, suggestion: 'plant_protein_powder' },
    ]);
  });

  it('dentro da tolerância (27,5 de 30) passa sem nova tentativa', async () => {
    const id = await readId();
    aiHandler = () => [withProtein('Ok', 27.5, [['Banana', '1'], ['Greek yogurt', '200 g']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Greek yogurt'], request: 'com 30 g de proteína' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls(TARGET_RETRY_MARKER).length, 0);
    assert.equal(deliveredRecipes(res)[0].unmetTargets, undefined);
  });

  it('com capacityNotice legítimo (volume 95%) não duplica: sem nova tentativa, sem unmetTargets', async () => {
    const id = await readId();
    // CP-B8a: 1 banana (118) + 262 g de iogurte = 380 ml = 95% do copo de 400 ml.
    aiHandler = () => [
      withProtein('Cup', 40, [['Banana', '1'], ['Greek yogurt', '262 g']], { capacityNotice: 'O copo comporta até 400 ml; esta receita tem 40 g.' }),
    ];

    const res = await generate({ readId: id, selected: ['Banana', 'Greek yogurt'], request: 'com 90 g de proteína' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls(TARGET_RETRY_MARKER).length, 0);
    assert.equal(deliveredRecipes(res)[0].unmetTargets, undefined);
    assert.ok(deliveredRecipes(res)[0].capacityNotice);
  });

  it('alimento citado no pedido é cobrado em todas: até 2 novas tentativas → aviso com o termo', async () => {
    const id = await readId();
    aiHandler = () => [recipe('No berry', [['Banana', '1'], ['Oats', '30 g'], ['Water', '200 ml']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], request: 'quero com morango, sem mel' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls(ITEM_RETRY_MARKER).length, 2);
    assert.ok(retryCalls(ITEM_RETRY_MARKER)[0].arguments[0].messages.at(-1)?.content.includes('["morango"]'));
    assert.deepEqual(deliveredRecipes(res)[0].missingRequestedIngredients, ['morango']);
  });

  it('item pedido e desmarcado: o pedido vence (não é cobrado como desmarcado)', async () => {
    const id = await readId();
    aiHandler = () => [recipe('Yogurt', [['Banana', '1'], ['Greek yogurt', '150 g']])];

    const res = await generate({ readId: id, selected: ['Banana', 'Oats'], request: 'com iogurte' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls('unchecked').length, 0);
    assert.equal(deliveredRecipes(res)[0].missingRequestedIngredients, undefined);
  });
});

describe('CP-B8a — capacityNotice conferido pelo volume (Pantry)', () => {
  it('item adicionado faltando + capacityNotice com volume 50% → aviso descartado, novas tentativas, item cobrado', async () => {
    const id = await readId();
    aiHandler = () => [
      recipe('Half', [['Banana', '1'], ['Water', '82 ml']], { capacityNotice: 'O copo comporta até 400 ml.' }),
    ];

    const res = await generate({ readId: id, selected: ['Banana'], added: ['whey'] });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls(ITEM_RETRY_MARKER).length, 2);
    const delivered = deliveredRecipes(res)[0];
    assert.equal(delivered.capacityNotice, undefined);
    assert.deepEqual(delivered.missingRequestedIngredients, ['whey']);
  });

  it('"com 30 g de proteína" + capacityNotice com volume 60% → descartado, aviso com sugestão', async () => {
    const id = await readId();
    aiHandler = () => [
      withProtein('Low', 19.8, [['Banana', '1'], ['Greek yogurt', '122 g']], { capacityNotice: 'O copo comporta até 400 ml.' }),
    ];

    const res = await generate({ readId: id, selected: ['Banana', 'Greek yogurt'], request: 'com 30 g de proteína' });

    assert.equal(res.statusCode, 200);
    assert.equal(retryCalls(TARGET_RETRY_MARKER).length, 1);
    const delivered = deliveredRecipes(res)[0];
    assert.equal(delivered.capacityNotice, undefined);
    assert.deepEqual(delivered.unmetTargets, [
      { nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8, suggestion: 'whey_or_protein_powder' },
    ]);
  });
});
