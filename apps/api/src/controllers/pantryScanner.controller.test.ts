// Testes do POST /pantry-scanner/analyze focados na validação determinística
// de restrições (CP-1.1.1c): descarte por receita, entrega parcial e erro com
// devolução do scan quando nenhuma receita sobra.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { createFakePantryReadModel, readAndGenerate } from './pantryScannerTestFakes';

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

// Resposta da geração inicial (array de 2) e, por título, a do retry de
// restrição de cada receita. Promise.all roda os retries em paralelo, então a
// resposta é escolhida pelo conteúdo e não pela ordem.
let initialRecipes: unknown[] = [];
let retryByTitle: Record<string, unknown> = {};
// CP-1.1.1d: quando definido, a geração inicial lança (falha da IA).
let generationError: Error | null = null;

const callAiMock = mock.fn(async ({ messages }: CallAiInput) => {
  const last = messages[messages.length - 1].content;

  if (generationError) {
    throw generationError;
  }

  if (last.includes('mandatory restrictions')) {
    const previous = JSON.parse(messages[messages.length - 2].content) as { title: string };
    return { content: JSON.stringify(retryByTitle[previous.title]), provider: 'google', model: 'm' };
  }

  return { content: JSON.stringify({ recipes: initialRecipes }), provider: 'google', model: 'm' };
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

// CP-B5.4: o antigo POST /analyze virou leitura + geração (pantryScannerTestFakes.ts).
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

function recipe(title: string, ingredientName: string) {
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

// CP-B5.4: lê a foto e gera com todos os ingredientes lidos marcados (o
// equivalente ao antigo /analyze); devolve a resposta final do fluxo.
async function analyze() {
  fakePantryRead.reset();
  const { final } = await readAndGenerate({ readPantry, generatePantry, userId: 'user-1' });
  if (final.nextError) throw final.nextError;
  return final;
}

function scanRollbackCalls() {
  return userUpdateOneMock.mock.calls.filter(call => {
    const update = call.arguments[1] as { $inc?: { scanCount?: number } } | undefined;
    return update?.$inc?.scanCount === -1;
  });
}

beforeEach(() => {
  fakeUser = {
    _id: 'user-1',
    blendiModel: 'ProPlus',
    goal: 'Wellness',
    dietaryPreferences: ['nut_free'],
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
  initialRecipes = [];
  retryByTitle = {};
  generationError = null;
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

describe('Pantry Scanner — validação de restrições', () => {
  it('uma receita descartada e a outra entregue', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('PB Banana', 'Peanut butter')];
    retryByTitle = { 'PB Banana': recipe('PB Banana v2', 'Almond butter') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }>; xpAwarded: number };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana']);
    assert.equal(data.xpAwarded, 15);
    assert.equal(scanRollbackCalls().length, 0);
    // 1 geração + 1 retry de restrição
    assert.equal(callAiMock.mock.callCount(), 2);
  });

  it('retry que resolve mantém as duas receitas', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('PB Banana', 'Peanut butter')];
    retryByTitle = { 'PB Banana': recipe('Seed Banana', 'Sunflower seed butter') };

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string }> };
    assert.deepEqual(data.recipes.map(r => r.title), ['Oat Banana', 'Seed Banana']);
  });

  it('as duas descartadas: erro novo, devolve o scan e não dá XP', async () => {
    initialRecipes = [recipe('PB Banana', 'Peanut butter'), recipe('Almond Oat', 'Almond milk')];
    retryByTitle = {
      'PB Banana': recipe('PB Banana v2', 'Peanuts'),
      'Almond Oat': { invalid: true },
    };

    const res = await analyze();

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'scanner/dietary-restriction-unmet');
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  // CP-B2: o Lite também barra congelados (decisão do Jon) — a receita com
  // banana congelada, antes entregue, agora passa pela nova tentativa.
  it('Lite: gelo e congelado descartados/refeitos; ProPlus sem dieta: nenhuma mudança', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.dietaryPreferences = [];
    initialRecipes = [recipe('Icy', 'Ice cubes'), recipe('Frozen', 'Frozen banana')];
    retryByTitle = { Icy: recipe('Icy v2', 'Crushed ice'), Frozen: recipe('Fresh', 'Banana') };

    const liteRes = await analyze();
    assert.equal(liteRes.statusCode, 200);
    assert.deepEqual(
      (liteRes.body?.data as { recipes: Array<{ title: string }> }).recipes.map(r => r.title),
      ['Fresh']
    );

    fakeUser.blendiModel = 'ProPlus';
    callAiMock.mock.resetCalls();
    const proRes = await analyze();
    assert.equal(proRes.statusCode, 200);
    assert.equal((proRes.body?.data as { recipes: unknown[] }).recipes.length, 2);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});

describe('Pantry Scanner — IA sem receita (CP-1.1.1d)', () => {
  // Formato que o app já recebia nesses casos: 200, recipes [], ingredientes
  // e contadores — só os valores de scansUsed/xpAwarded mudam.
  function assertNoRecipeResponse(res: Awaited<ReturnType<typeof analyze>>) {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
    const data = res.body?.data as Record<string, unknown>;
    assert.deepEqual(data.recipes, []);
    assert.equal((data.ingredients as unknown[]).length, 3);
    assert.equal(data.noFoodDetected, false);
    assert.equal(data.scansLimit, 3);
    // o increment devolveu 1; com o scan devolvido, volta a 0
    assert.equal(data.scansUsed, 0);
    assert.equal(data.xpAwarded, 0);
    assert.equal(data.leveledUp, false);
    assert.equal(data.newLevel, null);
    assert.deepEqual(
      Object.keys(data).sort(),
      [
        'ingredients',
        'leveledUp',
        'newLevel',
        'noFoodDetected',
        // CP-B5.4: a leitura volta e o id segue valendo para gerar de novo.
        'readExpiresAt',
        'readId',
        'recipes',
        'resetDate',
        'scansLimit',
        'scansUsed',
        'xpAwarded',
      ]
    );
  }

  it('geração vazia: devolve o scan, sem XP e sem progresso de missão', async () => {
    initialRecipes = [];

    const res = await analyze();

    assertNoRecipeResponse(res);
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(updateMissionProgressMock.mock.callCount(), 0);
  });

  // CP-B1: falha do provedor na geração deixou de ser "200 sem receitas" —
  // agora é IA indisponível (503), com o scan devolvido e sem XP.
  it('falha da IA na geração: 503 indisponível, devolve o scan, sem XP e sem progresso de missão', async () => {
    generationError = new Error('provider down');

    const res = await analyze();

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'scanner/vision-unavailable');
    assert.equal(scanRollbackCalls().length, 1);
    assert.equal(awardXPMock.mock.callCount(), 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(updateMissionProgressMock.mock.callCount(), 0);
  });

  it('com receita entregue: scan consumido e XP dado (sem regressão)', async () => {
    initialRecipes = [recipe('Oat Banana', 'Oats'), recipe('Seed Banana', 'Sunflower seeds')];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { scansUsed: number; xpAwarded: number };
    assert.equal(data.scansUsed, 1);
    assert.equal(data.xpAwarded, 15);
    assert.equal(scanRollbackCalls().length, 0);
    assert.equal(awardXPMock.mock.callCount(), 1);
  });
});

// CP-B2: água é o único extra fora da foto; o backend marca a receita que a
// usa (a foto deste teste tem banana, pasta de amendoim e aveia, sem água), e
// a checagem objetiva tira o pulseCount de passo sem gelo/congelado.
describe('Pantry Scanner — água fora da foto e passos (CP-B2)', () => {
  it('receita com água que não estava na foto vem com usesWaterNotInPhoto; a outra não', async () => {
    fakeUser.dietaryPreferences = [];
    initialRecipes = [
      { ...recipe('Oat Water', 'Oats'), ingredients: [{ name: 'Oats', amount: '40 g' }, { name: 'Water', amount: '250 ml' }] },
      { ...recipe('Banana Oat', 'Oats'), usesWaterNotInPhoto: true },
    ];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipes: Array<{ title: string; usesWaterNotInPhoto?: boolean }> };
    assert.deepEqual(
      data.recipes.map(r => [r.title, r.usesWaterNotInPhoto]),
      [['Oat Water', true], ['Banana Oat', undefined]]
    );
  });

  it('pulseCount de passo sem gelo/congelado é removido; água de coco não marca', async () => {
    fakeUser.dietaryPreferences = [];
    initialRecipes = [
      {
        ...recipe('Coco Oat', 'Oats'),
        ingredients: [{ name: 'Oats', amount: '40 g' }, { name: 'Coconut water', amount: '250 ml' }],
        steps: [{ text: 'Add the oats.' }, { text: 'Add the coconut water.', pulseCount: 6 }, { text: 'Blend.' }],
      },
    ];

    const res = await analyze();

    assert.equal(res.statusCode, 200);
    const [only] = (res.body?.data as { recipes: Array<{ usesWaterNotInPhoto?: boolean; steps: Array<{ pulseCount?: number }> }> }).recipes;
    assert.equal(only.usesWaterNotInPhoto, undefined);
    assert.deepEqual(only.steps.map(step => step.pulseCount), [undefined, undefined, undefined]);
  });
});

describe('Pantry Scanner — conta sem BLENDi (CP-B3)', () => {
  for (const ownership of ['other', 'none'] as const) {
    it(`'${ownership}': prompt das receitas sem BLENDi, Lite nem potência, com o limite e as regras do Lite`, async () => {
      fakeUser.dietaryPreferences = [];
      fakeUser.blendiModel = 'Lite';
      fakeUser.blendiOwnership = ownership;
      fakeUser.locale = 'pt-BR';
      initialRecipes = [recipe('Banana com Aveia', 'Aveia')];

      const res = await analyze();

      assert.equal(res.statusCode, 200);
      const prompt = callAiMock.mock.calls[0].arguments[0].systemPrompt;
      assert.doesNotMatch(prompt, /BLENDi|\bLite\b|\d+W\b/);
      assert.ok(prompt.includes('must not exceed 400ml.'));
      assert.ok(prompt.includes('Never use ice or any frozen ingredient'));
      assert.ok(prompt.includes('call it "seu liquidificador portátil"'));
    });
  }

  it("'blendi': prompt com o modelo, como antes", async () => {
    fakeUser.dietaryPreferences = [];
    fakeUser.blendiModel = 'Lite';
    fakeUser.blendiOwnership = 'blendi';
    initialRecipes = [recipe('Banana Oat', 'Oats')];

    await analyze();

    assert.ok(callAiMock.mock.calls[0].arguments[0].systemPrompt.includes('- BLENDi model: BLENDi Lite (70W).'));
  });
});
