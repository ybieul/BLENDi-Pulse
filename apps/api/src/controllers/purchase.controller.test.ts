// Testes adversariais de POST /purchases/verify com o controller e o revenueCat.service
// reais: só o fetch da RevenueCat, o UserModel e o env são simulados. Cobre IDs de
// produto no formato Android (subscriptionId:basePlanId), IDs parecidos, chaves
// hostis no JSON da RevenueCat e corpo forjado pelo cliente.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

function fakeQuery(resolvedValue: unknown) {
  const query = {
    select: () => query,
    lean: () => Promise.resolve(resolvedValue),
  };
  return query;
}

const USER_ID = '665f1b2c3d4e5f6a7b8c9d0e';
const baseUser = {
  _id: USER_ID,
  email: 'user@test.local',
  name: 'User',
  blendiModel: 'Lite',
  goal: 'Muscle',
  locale: 'en',
  unitSystem: 'metric',
  timezone: 'UTC',
  dailyProteinTarget: 150,
  dailyCalorieTarget: 2200,
  isPro: false,
};

const findByIdMock = mock.fn(() => fakeQuery(baseUser));
const findByIdAndUpdateMock = mock.fn((_id: string, update: { $set: Record<string, unknown> }) =>
  fakeQuery({ ...baseUser, ...update.$set })
);

mock.module('../models/User', {
  namedExports: {
    UserModel: { findById: findByIdMock, findByIdAndUpdate: findByIdAndUpdateMock },
  },
});
mock.module('../config/env', {
  namedExports: {
    env: { REVENUECAT_API_KEY: 'sk_test_key' },
    paymentsConfig: { isConfigured: true },
  },
});

type ControllerModule = typeof import('./purchase.controller.js');
let verifyPurchase: ControllerModule['verifyPurchase'];

before(async () => {
  ({ verifyPurchase } = await import('./purchase.controller.js'));
});

const FUTURE = '2099-01-01T00:00:00.000Z';
const LATER = '2099-06-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

let fetchMock: ReturnType<typeof mock.method>;
let rcBody: string;

function setRevenueCatSubscriptions(subscriptionsJson: string) {
  rcBody = `{"request_date":"2026-11-11T00:00:00Z","request_date_ms":0,"subscriber":{"original_app_user_id":"${USER_ID}","subscriptions":${subscriptionsJson}}}`;
}

beforeEach(() => {
  findByIdMock.mock.resetCalls();
  findByIdAndUpdateMock.mock.resetCalls();
  // JSON cru (string) de propósito: JSON.parse cria "__proto__" como chave própria,
  // como aconteceria com uma resposta real.
  fetchMock = mock.method(globalThis, 'fetch', async () => new Response(rcBody, { status: 200 }));
});

afterEach(() => {
  fetchMock.mock.restore();
});

interface Captured {
  status?: number;
  body?: { success: boolean; code?: string; data?: { user: Record<string, unknown> } };
  nextError?: unknown;
}

async function callVerify(body: unknown): Promise<Captured> {
  const captured: Captured = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Captured['body']) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  const req = { body, user: { sub: USER_ID } } as unknown as Request;
  await verifyPurchase(req, res, ((err: unknown) => {
    captured.nextError = err;
  }) as NextFunction);
  return captured;
}

function savedSet(): Record<string, unknown> {
  assert.equal(findByIdAndUpdateMock.mock.callCount(), 1);
  return (findByIdAndUpdateMock.mock.calls[0].arguments[1] as { $set: Record<string, unknown> }).$set;
}

describe('POST /purchases/verify — formato Android', () => {
  for (const [key, plan] of [
    ['pulse_pro_monthly:monthly', 'monthly'],
    ['pulse_pro_annual:annual', 'annual'],
    ['pulse_pro_monthly', 'monthly'],
    ['pulse_pro_annual', 'annual'],
  ] as const) {
    it(`libera o Pro para "${key}" como ${plan} e guarda o ID original`, async () => {
      setRevenueCatSubscriptions(JSON.stringify({ [key]: { expires_date: FUTURE } }));

      const result = await callVerify({ platform: 'android' });

      assert.equal(result.status, 200);
      const set = savedSet();
      assert.equal(set.isPro, true);
      assert.equal(set.subscriptionPlan, plan);
      assert.equal(set.subscriptionId, key);
    });
  }

  it('usa o período de carência (grace_period_expires_date) também no formato Android', async () => {
    setRevenueCatSubscriptions(
      JSON.stringify({ 'pulse_pro_annual:annual': { expires_date: PAST, grace_period_expires_date: FUTURE } })
    );

    const result = await callVerify({});

    assert.equal(result.status, 200);
    assert.equal(savedSet().subscriptionPlan, 'annual');
  });

  it('chama a RevenueCat só com o ID do usuário do token, codificado', async () => {
    setRevenueCatSubscriptions('{}');

    await callVerify({ productId: '../../projects/x' });

    const url = String(fetchMock.mock.calls[0].arguments[0]);
    assert.equal(url, `https://api.revenuecat.com/v1/subscribers/${USER_ID}`);
  });
});

describe('POST /purchases/verify — IDs parecidos e chaves hostis da RevenueCat', () => {
  const hostileKeys = [
    'pulse_pro_monthly_trial',
    'pulse_pro_monthly_trial:monthly',
    'pulse_pro_monthlyx:monthly',
    'PULSE_PRO_MONTHLY:monthly',
    ' pulse_pro_monthly:monthly',
    'pulse_pro_monthly :monthly',
    'pulse_pro_monthly​:monthly',
    'pulse_pro_monthly：monthly',
    'pulse_pro_monthly%3Amonthly',
    'pulse_pro_monthly|monthly',
    'pulse_pro_monthly/monthly',
    'pulsе_pro_monthly:monthly',
    'other_app:pulse_pro_monthly',
    'rc_promo_pulse_pro_monthly',
    ':pulse_pro_monthly',
    ':',
    '',
    '__proto__',
    'constructor',
    'toString',
  ];

  for (const key of hostileKeys) {
    it(`não libera o Pro para ${JSON.stringify(key)}`, async () => {
      setRevenueCatSubscriptions(JSON.stringify({ [key]: { expires_date: FUTURE } }));

      const result = await callVerify({ platform: 'android', productId: 'pulse_pro_annual:annual' });

      assert.equal(result.status, 400);
      assert.equal(result.body?.code, 'purchases/invalid-receipt');
      assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
    });
  }

  it('"__proto__" como chave crua do JSON com um produto válido dentro não vira assinatura', async () => {
    setRevenueCatSubscriptions(`{"__proto__":{"pulse_pro_annual:annual":{"expires_date":"${FUTURE}"}}}`);

    const result = await callVerify({});

    assert.equal(result.status, 400);
    assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
    assert.equal(({} as Record<string, unknown>)['pulse_pro_annual:annual'], undefined);
  });

  it('assinatura conhecida com valor null responde 400, não 500', async () => {
    setRevenueCatSubscriptions('{"pulse_pro_annual:annual":null,"pulse_pro_monthly":null}');

    const result = await callVerify({});

    assert.equal(result.status, 400);
    assert.equal(result.body?.code, 'purchases/invalid-receipt');
    assert.equal(result.nextError, undefined);
  });

  it('assinatura conhecida no formato Android já expirada não libera o Pro', async () => {
    setRevenueCatSubscriptions(JSON.stringify({ 'pulse_pro_annual:annual': { expires_date: PAST } }));

    const result = await callVerify({});

    assert.equal(result.status, 400);
  });

  it('com 10.000 chaves desconhecidas e uma válida, acha a válida', async () => {
    const subscriptions: Record<string, { expires_date: string }> = {};
    for (let i = 0; i < 10_000; i += 1) {
      subscriptions[`pulse_pro_monthly_${i}:monthly`] = { expires_date: LATER };
    }
    subscriptions['pulse_pro_monthly:monthly'] = { expires_date: FUTURE };
    setRevenueCatSubscriptions(JSON.stringify(subscriptions));

    const result = await callVerify({});

    assert.equal(result.status, 200);
    assert.equal(savedSet().subscriptionId, 'pulse_pro_monthly:monthly');
  });

  it('mesmo plano nos dois formatos (iOS e Android): fica com o que expira por último', async () => {
    setRevenueCatSubscriptions(
      JSON.stringify({
        pulse_pro_monthly: { expires_date: FUTURE },
        'pulse_pro_monthly:monthly': { expires_date: LATER },
      })
    );

    await callVerify({});

    assert.equal(savedSet().subscriptionId, 'pulse_pro_monthly:monthly');
  });
});

describe('POST /purchases/verify — corpo forjado pelo cliente', () => {
  it('productId e platform do cliente não mudam o plano decidido pela RevenueCat', async () => {
    setRevenueCatSubscriptions(JSON.stringify({ 'pulse_pro_monthly:monthly': { expires_date: FUTURE } }));

    const result = await callVerify({ platform: 'ios', productId: 'pulse_pro_annual' });

    assert.equal(result.status, 200);
    assert.equal(savedSet().subscriptionPlan, 'monthly');
  });

  it('sem assinatura na RevenueCat, productId "pulse_pro_annual:annual" e campos extras não liberam o Pro', async () => {
    setRevenueCatSubscriptions('{}');

    const result = await callVerify({
      platform: 'android',
      productId: 'pulse_pro_annual:annual',
      isPro: true,
      subscriptionPlan: 'annual',
      subscriptionExpiresAt: FUTURE,
    });

    assert.equal(result.status, 400);
    assert.equal(result.body?.code, 'purchases/invalid-receipt');
    assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
  });

  for (const productId of [['pulse_pro_annual'], { $ne: null }, 123, '', '   ']) {
    it(`recusa productId inválido ${JSON.stringify(productId)} antes de chamar a RevenueCat`, async () => {
      setRevenueCatSubscriptions(JSON.stringify({ pulse_pro_annual: { expires_date: FUTURE } }));

      const result = await callVerify({ productId });

      assert.equal(result.status, 400);
      assert.equal(fetchMock.mock.callCount(), 0);
      assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
    });
  }

  it('recusa platform fora de ios/android', async () => {
    setRevenueCatSubscriptions('{}');

    const result = await callVerify({ platform: 'web' });

    assert.equal(result.status, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
