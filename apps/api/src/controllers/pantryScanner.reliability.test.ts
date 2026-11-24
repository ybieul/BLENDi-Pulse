// CP-B1 — confiabilidade do Pantry Scanner: falha do provedor na geração é
// "IA indisponível" (503, scan devolvido); resposta inválida ganha 1 nova
// tentativa; array vazio segue como hoje (com motivo no log); 1 receita válida
// é entregue; as novas tentativas por receita (limite, dieta) são aceitas
// tanto em objeto quanto em array de 1 — o system prompt do Pantry pede array,
// e antes a resposta em array era descartada. Mesma montagem de
// pantryScanner.controller.test.ts.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createFakePantryReadModel, readAndGenerate } from './pantryScannerTestFakes';

import { INVALID_JSON_RETRY_INSTRUCTION } from '../utils/aiResponseRetry.utils';
import { getAiRequestRemainingMs } from '../services/aiRequestBudget.service';

function chain(resolvedValue: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) {
    query[method] = () => query;
  }
  query.exec = async () => resolvedValue;
  return query;
}

const SCAN_RESET_DATE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

let fakeUser: Record<string, unknown>;

const userFindByIdMock = mock.fn((_id: string) => chain(fakeUser));
const userFindOneAndUpdateMock = mock.fn((..._args: unknown[]) =>
  chain({ scanCount: 1, scanResetDate: SCAN_RESET_DATE })
);
const userUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: userFindByIdMock,
      findOneAndUpdate: userFindOneAndUpdateMock,
      findByIdAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: {
    BlendLogModel: { find: () => chain([]) },
  },
});

class FakeAiProviderRequestError extends Error {}

interface CallAiInput {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}

type AiAnswer = string | Error;

// Geração: fila de respostas (texto cru, para poder mandar JSON inválido).
// Novas tentativas por receita: resposta por título da receita anterior.
let generationAnswers: AiAnswer[] = [];
let limitRetryByTitle: Record<string, AiAnswer> = {};
let restrictionRetryByTitle: Record<string, AiAnswer> = {};
let remainingBudgetSeen: Array<number | null> = [];

function answer(value: AiAnswer) {
  if (value instanceof Error) throw value;
  return { content: value, provider: 'google', model: 'm', fromFallback: false };
}

const callAiMock = mock.fn(async ({ messages }: CallAiInput) => {
  remainingBudgetSeen.push(getAiRequestRemainingMs());
  const last = messages[messages.length - 1].content;

  if (last.includes('physical volume')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    return answer(limitRetryByTitle[previous.title] ?? new Error(`no limit retry for ${previous.title}`));
  }

  if (last.includes('mandatory restrictions')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    return answer(restrictionRetryByTitle[previous.title] ?? new Error(`no diet retry for ${previous.title}`));
  }

  const next = generationAnswers.shift();
  if (next === undefined) throw new Error('unexpected generation call');
  return answer(next);
});

const callVisionAiMock = mock.fn(async () => ({
  content: JSON.stringify({
    ingredients: [
      { name: 'Banana', confidence: 'high' },
      { name: 'Peanut butter', confidence: 'high' },
      { name: 'Oats', confidence: 'medium' },
    ],
    noFoodDetected: false,
  }),
  provider: 'google',
  model: 'm',
}));

mock.module('../services/aiProvider.service', {
  namedExports: {
    AiProviderRequestError: FakeAiProviderRequestError,
    callAi: callAiMock,
    callVisionAi: callVisionAiMock,
  },
});

const awardXPMock = mock.fn(async (..._args: unknown[]) => ({
  awarded: true,
  amount: 15,
  leveledUp: false,
  newLevel: 1,
}));

mock.module('../services/xp.service', {
  namedExports: { awardXP: awardXPMock },
});

const updateMissionProgressMock = mock.fn(async (..._args: unknown[]) => undefined);

mock.module('../services/missionProgress.service', {
  namedExports: { updateMissionProgress: updateMissionProgressMock },
});

// CP-B7: o antigo POST /analyze virou leitura + geração (pantryScannerTestFakes.ts).
const fakePantryRead = createFakePantryReadModel();
mock.module('../models/PantryRead', {
  namedExports: { PantryReadModel: fakePantryRead.model },
});

type ControllerModule = typeof import('./pantryScanner.controller.js');
let readPantry: ControllerModule['readPantry'];
let generatePantry: ControllerModule['generatePantry'];

before(async () => {
  ({ readPantry, generatePantry } = await import('./pantryScanner.controller.js'));
});

function recipe(title: string, ingredientName = 'Oats') {
  return {
    title,
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name: ingredientName, amount: '30 g' },
    ],
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend on high for 45 seconds.',
    hasSubstitutes: false,
  };
}

// Lite: 400 ml. CP-B2: acima do VOLUME (antes era acima da proteína, que
// deixou de ser limite).
function heavy(title: string) {
  return {
    ...recipe(title),
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name: 'Oat milk', amount: '500 ml' },
    ],
  };
}

// CP-B7: lê a foto e gera com todos os ingredientes lidos marcados (o
// equivalente ao antigo /analyze); devolve a resposta final do fluxo.
async function analyze() {
  fakePantryRead.reset();
  const { final } = await readAndGenerate({ readPantry, generatePantry, userId: 'user-1' });
  if (final.nextError) throw final.nextError;
  return final;
}

function titles(res: Awaited<ReturnType<typeof analyze>>): string[] {
  return (res.body?.data as { recipes: Array<{ title: string }> }).recipes.map(r => r.title);
}

function scanRollbackCalls() {
  return userUpdateOneMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { scanCount?: number } } | undefined;
    return update?.$inc?.scanCount === -1;
  });
}

// Captura os logs para conferir motivo e ausência de conteúdo.
let logCalls: Array<{ level: string; args: unknown[] }> = [];

function logsMatching(text: string) {
  return logCalls.filter(call => call.args[0] === text);
}

function logPayload(text: string, index = 0) {
  return logsMatching(text)[index]?.args[1] as Record<string, unknown> | undefined;
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
    scanCount: 0,
    scanResetDate: SCAN_RESET_DATE,
    isPro: false,
  };
  generationAnswers = [];
  limitRetryByTitle = {};
  restrictionRetryByTitle = {};
  remainingBudgetSeen = [];
  logCalls = [];
  for (const level of ['info', 'warn', 'error'] as const) {
    mock.method(console, level, (...args: unknown[]) => {
      logCalls.push({ level, args });
    });
  }
  for (const fn of [
    userFindByIdMock,
    userFindOneAndUpdateMock,
    userUpdateOneMock,
    callAiMock,
    awardXPMock,
    updateMissionProgressMock,
  ]) {
    fn.mock.resetCalls();
  }
});

afterEach(() => {
  mock.restoreAll();
});

describe('Pantry Scanner — resposta inválida ou vazia da IA (CP-B1)', () => {
  it('JSON inválido → nova tentativa no padrão do Pulse AI → sucesso', async () => {
    generationAnswers = ['not json {', JSON.stringify([recipe('A'), recipe('B')])];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(titles(res), ['A', 'B']);
    assert.equal(callAiMock.mock.callCount(), 2);
    // Mesmo padrão do Pulse AI: conversa original + a instrução como turno do usuário.
    const retryMessages = (callAiMock.mock.calls[1].arguments[0] as CallAiInput).messages;
    assert.deepEqual(retryMessages[retryMessages.length - 1], {
      role: 'user',
      content: INVALID_JSON_RETRY_INSTRUCTION,
    });
    assert.deepEqual(logPayload('[pantryScanner] recipe generation parsed with issues'), {
      attempt: 1,
      reason: 'invalid-json',
      responseLength: 'not json {'.length,
    });
    assert.equal(logPayload('[pantryScanner] recipe generation parsed')?.reason, 'ok');
    assert.equal(scanRollbackCalls().length, 0);
    assert.equal(awardXPMock.mock.callCount(), 1);
  });

  it('inválido duas vezes (schema e depois JSON) → 503 indisponível, scan devolvido, sem XP', async () => {
    generationAnswers = [JSON.stringify([{ title: 'Secret title' }]), '```json oops'];

    const res = await analyze();

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'scanner/vision-unavailable');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);

    const first = logPayload('[pantryScanner] recipe generation parsed with issues', 0);
    assert.equal(first?.reason, 'invalid-schema');
    // Caminho do primeiro erro do Zod, sem conteúdo da receita.
    assert.equal(first?.issuePath, '0.ingredients (invalid_type)');
    assert.equal(logPayload('[pantryScanner] recipe generation parsed with issues', 1)?.reason, 'invalid-json');
    assert.ok(!JSON.stringify(logCalls).includes('Secret title'));
  });

  it('array vazio devolvido pela IA → 200 sem receitas (como hoje), scan devolvido, motivo no log', async () => {
    generationAnswers = ['[]'];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.body?.data as { recipes: unknown[] }).recipes, []);
    assert.equal(res.body?.data && (res.body.data as { xpAwarded: number }).xpAwarded, 0);
    assert.equal(callAiMock.mock.callCount(), 1, 'array vazio não ganha nova tentativa');
    assert.equal(scanRollbackCalls().length, 1);
    assert.deepEqual(logPayload('[pantryScanner] recipe generation parsed with issues'), {
      attempt: 1,
      reason: 'empty',
      responseLength: 2,
    });
  });

  it('1 receita válida → 200 com 1 receita, scan consumido e XP', async () => {
    generationAnswers = [JSON.stringify([recipe('Only one')])];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(titles(res), ['Only one']);
    assert.equal(scanRollbackCalls().length, 0);
    assert.equal(awardXPMock.mock.callCount(), 1);
  });

  it('uma válida e outra fora do schema → a válida é entregue, sem nova tentativa', async () => {
    generationAnswers = [JSON.stringify([recipe('Good'), { ...recipe('Broken'), macros: null }])];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(titles(res), ['Good']);
    assert.equal(callAiMock.mock.callCount(), 1);
    const payload = logPayload('[pantryScanner] recipe generation parsed with issues');
    assert.equal(payload?.reason, 'ok');
    assert.equal(payload?.recipeCount, 1);
    assert.equal(payload?.invalidCount, 1);
    assert.equal(payload?.issuePath, '1.macros (invalid_type)');
  });

  it('mais de 2 receitas → fora do formato, nova tentativa', async () => {
    generationAnswers = [
      JSON.stringify([recipe('A'), recipe('B'), recipe('C')]),
      JSON.stringify({ recipes: [recipe('A'), recipe('B')] }),
    ];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(titles(res), ['A', 'B']);
    assert.equal(logPayload('[pantryScanner] recipe generation parsed with issues')?.issuePath, 'root (too_big)');
  });

  it('a chamada de geração roda dentro do orçamento de tempo da requisição', async () => {
    generationAnswers = [JSON.stringify([recipe('A')])];

    await analyze();

    const remaining = remainingBudgetSeen[0];
    assert.ok(typeof remaining === 'number' && remaining > 80_000 && remaining <= 85_000);
  });
});

describe('Pantry Scanner — nova tentativa por receita aceita array ou objeto (CP-B1)', () => {
  beforeEach(() => {
    fakeUser.blendiModel = 'Lite';
  });

  for (const shape of ['array', 'objeto'] as const) {
    const wrap = (value: unknown) => JSON.stringify(shape === 'array' ? [value] : value);

    it(`limite do copo: nova tentativa respondida em ${shape} é aceita`, async () => {
      generationAnswers = [JSON.stringify([recipe('Light'), heavy('Heavy')])];
      limitRetryByTitle = { Heavy: wrap(recipe('Heavy fixed')) };

      const res = await analyze();

      assert.equal(res.statusCode, 200);
      assert.deepEqual(titles(res), ['Light', 'Heavy fixed']);
      // O pedido diz o formato (array com 1 receita).
      const retryMessages = (callAiMock.mock.calls[1].arguments[0] as CallAiInput).messages;
      assert.match(retryMessages[retryMessages.length - 1].content, /JSON array containing exactly 1 recipe object/);
    });

    it(`dieta: nova tentativa respondida em ${shape} é aceita`, async () => {
      fakeUser.dietaryPreferences = ['nut_free'];
      generationAnswers = [JSON.stringify([recipe('Oat'), recipe('PB', 'Peanut butter')])];
      restrictionRetryByTitle = { PB: wrap(recipe('Seed', 'Sunflower seed butter')) };

      const res = await analyze();

      assert.equal(res.statusCode, 200);
      assert.deepEqual(titles(res), ['Oat', 'Seed']);
      const retryMessages = (callAiMock.mock.calls[1].arguments[0] as CallAiInput).messages;
      assert.match(retryMessages[retryMessages.length - 1].content, /JSON array containing exactly 1 recipe object/);
    });
  }

  it('nova tentativa com array de 2 receitas: descartada, com motivo no log', async () => {
    generationAnswers = [JSON.stringify([recipe('Light'), heavy('Heavy')])];
    limitRetryByTitle = { Heavy: JSON.stringify([recipe('X'), recipe('Y')]) };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(titles(res), ['Light']);
    assert.deepEqual(
      logPayload('[pantryScanner] blender limit retry returned an invalid recipe, discarding'),
      {
        reason: 'invalid-schema',
        responseLength: JSON.stringify([recipe('X'), recipe('Y')]).length,
        issuePath: 'root (array of 2)',
      }
    );
  });
});

describe('Pantry Scanner — logs sem conteúdo (CP-B1)', () => {
  it('nenhum log traz título, ingrediente ou texto da receita', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.dietaryPreferences = ['nut_free'];
    generationAnswers = [
      'garbage',
      JSON.stringify([heavy('Heavy Zebra'), { ...recipe('Broken Zebra', 'Peanut butter'), steps: 'x' }]),
    ];
    limitRetryByTitle = { 'Heavy Zebra': '{"oops": true}' };

    await analyze();

    const logged = JSON.stringify(logCalls);
    assert.ok(!logged.includes('Zebra'));
    assert.ok(!logged.includes('Peanut'));
    assert.ok(!logged.includes('Blend on high'));
  });
});
