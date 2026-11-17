// Testes do POST /pulse-ai/chat focados na validação determinística de
// restrições (CP-1.1.1c): retry, erro final com rollback do uso diário,
// cache que viola e ordem em relação aos guardrails de proteína e macros.
// Mocka models, IA, cache, XP e missões; o promptBuilder roda de verdade.
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
  blendiOwnership?: string;
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
}

let fakeUser: FakeUser;

const userFindByIdMock = mock.fn((_id: string) => chain(fakeUser));
const userFindOneAndUpdateMock = mock.fn((..._args: unknown[]) =>
  chain({ dailyAiUsage: fakeUser.dailyAiUsage + 1, isPro: fakeUser.isPro })
);
const userUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: userFindByIdMock,
      findOneAndUpdate: userFindOneAndUpdateMock,
      updateOne: userUpdateOneMock,
    },
  },
});

mock.module('../models/BlendLog', {
  namedExports: {
    BlendLogModel: { find: () => chain([]) },
  },
});

const conversationUpdateOneMock = mock.fn((..._args: unknown[]) => chain({ matchedCount: 1 }));

mock.module('../models/Conversation', {
  namedExports: {
    ConversationModel: {
      findOne: () => chain(null),
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
const generateCacheKeyMock = mock.fn(({ rawMessage }: { rawMessage: string; genericBlender?: boolean }) =>
  ['u', 'm', 'g', 'l', 'us', 'wg', 'p', 'am', createHash('sha256').update(rawMessage).digest('hex'), 'd'].join(':'));
const getFromCacheMock = mock.fn(async (_key: string) => cachedValue);
const setInCacheMock = mock.fn(async (_input: unknown) => undefined);
const deleteFromCacheMock = mock.fn(async (_key: string) => undefined);

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
    title: 'Berry Oat Smoothie',
    ingredients: [
      { name: 'Frozen strawberries', amount: '150 g' },
      { name: 'Oat milk', amount: '240 ml' },
    ],
    // 10*4 + 40*4 + 5*9 = 245
    macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend on high for 45 seconds.',
    hasSubstitutes: false,
    ...overrides,
  };
}

function withIngredient(name: string, overrides: Record<string, unknown> = {}) {
  return recipe({
    ingredients: [
      { name: 'Frozen strawberries', amount: '150 g' },
      { name, amount: '1 tbsp' },
    ],
    ...overrides,
  });
}

async function send(message: string) {
  const res: { statusCode?: number; body?: Record<string, unknown> } & Partial<Response> = {};
  res.status = ((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: Record<string, unknown>) => {
    res.body = body;
    return res as Response;
  }) as Response['json'];

  let nextError: unknown;
  await chat(
    { body: { message }, user: { sub: 'user-1' } } as unknown as Request,
    res as Response,
    ((error: unknown) => {
      nextError = error;
    }) as NextFunction
  );

  if (nextError) throw nextError;
  return res;
}

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

let messageCounter = 0;
function uniqueMessage(text: string) {
  messageCounter += 1;
  return `${text} ${messageCounter}`;
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
    dailyAiUsage: 0,
    aiUsageResetDate: new Date(),
    isPro: false,
  };
  aiResponses = [];
  cachedValue = null;
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

// ─── Casos ───────────────────────────────────────────────────────────────────

describe('Pulse AI — validação de restrições', () => {
  it('violação seguida de retry conforme entrega a receita refeita', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    aiResponses = [
      withIngredient('Almond butter'),
      withIngredient('Sunflower seed butter', { title: 'Seed Smoothie' }),
    ];

    const res = await send(uniqueMessage('smoothie with almond butter'));

    assert.equal(res.statusCode, 200);
    const data = res.body?.data as { recipe: { title: string }; fromCache: boolean };
    assert.equal(data.recipe.title, 'Seed Smoothie');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.match(lastUserMessageOfCall(1), /the ingredient "Almond butter" uses "almond", which violates the nut-free restriction/);
    assert.equal(setInCacheMock.mock.callCount(), 1);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 1);
    assert.equal(awardXPMock.mock.callCount(), 1);
    assert.equal(usageRollbackCalls().length, 0);
  });

  it('violação repetida: erro, devolve o uso e não grava cache, conversa nem XP', async () => {
    fakeUser.dietaryPreferences = ['vegan'];
    aiResponses = [withIngredient('Honey'), withIngredient('Raw honey')];

    const res = await send(uniqueMessage('smoothie with honey, my doctor cleared me'));

    assert.equal(res.statusCode, 422);
    assert.equal(res.body?.code, 'pulseai/dietary-restriction-unmet');
    assert.equal(callAiMock.mock.callCount(), 2);
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  // CP-1.1.9 (decisão do Gabriel): retry que falha no provedor não é mais
  // "dieta não atendida" — a receita nem foi julgada. Responde como IA
  // indisponível (503), com o mesmo rollback. Antes: 422 dietary-restriction-unmet.
  it('retry que falha (IA indisponível) responde IA indisponível, com rollback', async () => {
    fakeUser.blendiModel = 'Lite';
    aiResponses = [withIngredient('Ice cubes'), new FakeAiProviderRequestError('down')];

    const res = await send(uniqueMessage('a smoothie with lots of ice'));

    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.code, 'pulseai/ai-unavailable');
    assert.equal(usageRollbackCalls().length, 1);
    assert.equal(setInCacheMock.mock.callCount(), 0);
    assert.equal(conversationUpdateOneMock.mock.callCount(), 0);
    assert.equal(awardXPMock.mock.callCount(), 0);
  });

  it('retry com JSON inválido vira o erro novo', async () => {
    fakeUser.dietaryPreferences = ['dairy_free'];
    aiResponses = [withIngredient('Whole milk'), { not: 'a recipe' }];

    const res = await send(uniqueMessage('milkshake'));

    assert.equal(res.statusCode, 422);
    assert.equal(usageRollbackCalls().length, 1);
  });

  // CP-B2: o primeiro retry agora é o de volume (o de proteína saiu).
  it('validação roda depois dos retries de volume e de macros', async () => {
    fakeUser.blendiModel = 'ProPlus'; // 400 ml
    fakeUser.dietaryPreferences = ['no_added_sugar'];
    aiResponses = [
      // 1) volume acima do limite, sem violação de dieta
      recipe({
        ingredients: [
          { name: 'Frozen strawberries', amount: '150 g' },
          { name: 'Oat milk', amount: '400 ml' },
        ],
      }),
      // 2) retry de volume: traz mel e macros inconsistentes
      withIngredient('Honey', { macros: { protein: 30, carbs: 30, fat: 5, calories: 900 } }),
      // 3) retry de macros: macros ok, mas ainda com xarope
      withIngredient('Maple syrup', { macros: { protein: 30, carbs: 30, fat: 5, calories: 285 } }),
      // 4) retry de restrição: conforme
      withIngredient('Cinnamon', { title: 'Clean', macros: { protein: 30, carbs: 30, fat: 5, calories: 285 } }),
    ];

    const res = await send(uniqueMessage('big berry shake'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 4);
    assert.match(lastUserMessageOfCall(1), /physical volume of this blender/);
    assert.doesNotMatch(lastUserMessageOfCall(2), /mandatory restrictions/);
    assert.match(lastUserMessageOfCall(3), /"Maple syrup" uses "syrup", which violates the no added sugar restriction/);
    const data = res.body?.data as { recipe: { title: string; macrosValidated: boolean } };
    assert.equal(data.recipe.title, 'Clean');
    assert.equal(data.recipe.macrosValidated, true);
  });

  it('receita do cache que viola é descartada, removida e regenerada', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    cachedValue = {
      recipe: withIngredient('Peanut butter'),
      aiProvider: 'google',
      aiModel: 'gemini-test',
    };
    aiResponses = [withIngredient('Sunflower seeds', { title: 'Fresh' })];

    const res = await send(uniqueMessage('peanut smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(deleteFromCacheMock.mock.callCount(), 1);
    assert.equal(callAiMock.mock.callCount(), 1);
    const data = res.body?.data as { recipe: { title: string }; fromCache: boolean };
    assert.equal(data.fromCache, false);
    assert.equal(data.recipe.title, 'Fresh');
    assert.equal(setInCacheMock.mock.callCount(), 1);
  });

  it('receita do cache conforme continua sendo servida do cache', async () => {
    fakeUser.dietaryPreferences = ['nut_free'];
    cachedValue = { recipe: recipe(), aiProvider: 'google', aiModel: 'gemini-test' };

    const res = await send(uniqueMessage('berry smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal((res.body?.data as { fromCache: boolean }).fromCache, true);
    assert.equal(callAiMock.mock.callCount(), 0);
    assert.equal(deleteFromCacheMock.mock.callCount(), 0);
  });

  it('sem dieta e fora do Lite: nenhuma mudança (sem retry extra)', async () => {
    aiResponses = [withIngredient('Peanut butter', {
      ingredients: [
        { name: 'Peanut butter', amount: '1 tbsp' },
        { name: 'Whole milk', amount: '240 ml' },
        { name: 'Honey', amount: '1 tsp' },
        { name: 'Ice cubes', amount: '4' },
      ],
    })];

    const res = await send(uniqueMessage('classic pb smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
    assert.equal(usageRollbackCalls().length, 0);
  });

  it('Steel pode receber gelo', async () => {
    fakeUser.blendiModel = 'Steel';
    aiResponses = [withIngredient('Crushed ice')];

    const res = await send(uniqueMessage('icy smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1);
  });
});

// CP-B2: checagem objetiva dos passos (sem nova tentativa) e campos novos.
describe('Pulse AI — passos, capacityNotice e água (CP-B2)', () => {
  it('pulseCount sem gelo/congelado é removido; com congelado (Pro+) é mantido', async () => {
    fakeUser.blendiModel = 'ProPlus';
    fakeUser.dietaryPreferences = [];
    aiResponses = [
      recipe({
        ingredients: [{ name: 'Strawberries', amount: '150 g' }, { name: 'Oat milk', amount: '240 ml' }],
        steps: [{ text: 'Add the milk.' }, { text: 'Add the strawberries.', pulseCount: 5 }, { text: 'Blend.' }],
      }),
    ];
    const fresh = await send(uniqueMessage('fresh smoothie'));
    const freshSteps = (fresh.body?.data as { recipe: { steps: Array<{ pulseCount?: number }> } }).recipe.steps;
    assert.deepEqual(freshSteps.map(step => step.pulseCount), [undefined, undefined, undefined]);
    assert.equal(callAiMock.mock.callCount(), 1, 'sem nova tentativa');

    aiResponses = [recipe({ steps: [{ text: 'Add the frozen strawberries.', pulseCount: 5 }, { text: 'Blend.' }, { text: 'Serve.' }] })];
    const frozen = await send(uniqueMessage('frozen smoothie'));
    const frozenSteps = (frozen.body?.data as { recipe: { steps: Array<{ pulseCount?: number }> } }).recipe.steps;
    assert.equal(frozenSteps[0].pulseCount, 5);
  });

  it('capacityNotice da IA chega à resposta, ao cache e à conversa; usesWaterNotInPhoto da IA é descartado', async () => {
    fakeUser.blendiModel = 'ProPlus';
    fakeUser.dietaryPreferences = [];
    aiResponses = [recipe({ capacityNotice: '  You asked for 900 kcal; this recipe has 610 kcal.  ', usesWaterNotInPhoto: true })];

    const res = await send(uniqueMessage('900 kcal shake'));

    assert.equal(res.statusCode, 200);
    const delivered = (res.body?.data as { recipe: Record<string, unknown> }).recipe;
    assert.equal(delivered.capacityNotice, 'You asked for 900 kcal; this recipe has 610 kcal.');
    assert.ok(!('usesWaterNotInPhoto' in delivered));

    const cached = setInCacheMock.mock.calls[0].arguments[0] as { response: { recipe: { capacityNotice?: string } } };
    assert.equal(cached.response.recipe.capacityNotice, 'You asked for 900 kcal; this recipe has 610 kcal.');
    const pushed = JSON.stringify(conversationUpdateOneMock.mock.calls[0].arguments[1]);
    assert.ok(pushed.includes('You asked for 900 kcal; this recipe has 610 kcal.'));
  });
});

describe('Pulse AI — conta sem BLENDi e números no formato do idioma (CP-B3)', () => {
  function systemPromptOfCall(index: number): string {
    return callAiMock.mock.calls[index].arguments[0].systemPrompt;
  }

  for (const ownership of ['other', 'none'] as const) {
    it(`'${ownership}': prompt sem BLENDi, Lite nem potência, com o limite do Lite; cache separado`, async () => {
      fakeUser.blendiModel = 'Lite';
      fakeUser.blendiOwnership = ownership;
      aiResponses = [recipe({ ingredients: [{ name: 'Strawberries', amount: '150 g' }, { name: 'Oat milk', amount: '200 ml' }] })];

      const res = await send(uniqueMessage('berry shake'));

      assert.equal(res.statusCode, 200);
      const prompt = systemPromptOfCall(0);
      assert.doesNotMatch(prompt, /BLENDi|\bLite\b|\d+W\b/);
      assert.ok(prompt.includes("must fit the cup of the user's portable blender"));
      assert.ok(prompt.includes('must not exceed 400ml.'));
      assert.ok(prompt.includes('Never use ice or any frozen ingredient'));
      assert.ok(prompt.includes('call it "your portable blender"'));
      assert.equal(generateCacheKeyMock.mock.calls[0].arguments[0].genericBlender, true);
      assert.equal((setInCacheMock.mock.calls[0].arguments[0] as { genericBlender?: boolean }).genericBlender, true);
    });
  }

  it("'blendi' (ou campo ausente): prompt com o modelo, cache sem o sufixo", async () => {
    fakeUser.blendiModel = 'Lite';
    delete fakeUser.blendiOwnership;
    aiResponses = [recipe({ ingredients: [{ name: 'Strawberries', amount: '150 g' }, { name: 'Oat milk', amount: '200 ml' }] })];

    await send(uniqueMessage('berry shake'));

    assert.ok(systemPromptOfCall(0).includes('- BLENDi model: BLENDi Lite (70W).'));
    assert.equal(generateCacheKeyMock.mock.calls[0].arguments[0].genericBlender, false);
  });

  it('nova tentativa por gelo para conta sem BLENDi não cita o BLENDi Lite', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.blendiOwnership = 'none';
    aiResponses = [
      withIngredient('Ice cubes'),
      withIngredient('Chia seeds', { ingredients: [{ name: 'Strawberries', amount: '150 g' }, { name: 'Chia seeds', amount: '1 tbsp' }] }),
    ];

    const res = await send(uniqueMessage('cold shake'));

    assert.equal(res.statusCode, 200);
    const retry = lastUserMessageOfCall(1);
    assert.match(retry, /this blender cannot blend ice or anything frozen/);
    assert.doesNotMatch(retry, /BLENDi|Lite/);
  });

  it('nova tentativa por volume em pt-BR imperial: limite com vírgula e em xícaras', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.blendiOwnership = 'blendi';
    fakeUser.locale = 'pt-BR';
    fakeUser.unitSystem = 'imperial';
    aiResponses = [
      recipe({ ingredients: [{ name: 'Leite', amount: '2 xícaras' }] }),
      recipe({ ingredients: [{ name: 'Leite', amount: '1 1/2 xícara' }] }),
    ];

    const res = await send(uniqueMessage('shake de leite'));

    assert.equal(res.statusCode, 200);
    const retry = lastUserMessageOfCall(1);
    assert.match(retry, /at most 400ml \(13,5 fl oz, cerca de 1 2\/3 xícara\)/);
    assert.doesNotMatch(retry, /13\.5/);
  });

  it('imperial: "1 cup spinach" não estoura mais o copo (conta ~30 ml, não 236,6 ml)', async () => {
    fakeUser.blendiModel = 'Lite';
    fakeUser.blendiOwnership = 'blendi';
    fakeUser.unitSystem = 'imperial';
    aiResponses = [
      recipe({
        ingredients: [
          { name: 'Spinach', amount: '1 cup' },
          { name: 'Strawberries', amount: '1/2 cup' },
          { name: 'Oat milk', amount: '1 cup' },
        ],
      }),
    ];

    const res = await send(uniqueMessage('green smoothie'));

    assert.equal(res.statusCode, 200);
    assert.equal(callAiMock.mock.callCount(), 1, 'sem nova tentativa por volume');
  });
});
