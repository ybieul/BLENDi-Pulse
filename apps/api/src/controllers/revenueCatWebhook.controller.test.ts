// Testes dos 3 pontos de ciclo de vida de assinatura instrumentados com PostHog no
// webhook do RevenueCat (subscription_renewed, subscription_cancel_requested,
// subscription_expired). Mocka '../models/User', '../services/revenueCat.service' e
// '../services/analytics.service' para testar as funcoes exportadas diretamente, sem
// simular a requisicao HTTP inteira (auth, body bruto, validacao do payload).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

// Imita o encadeamento de uma query do mongoose (.select().lean() ou .lean() direto)
// resolvendo sempre para `resolvedValue`, sem precisar de uma conexao real ao Mongo.
function fakeQuery(resolvedValue: unknown) {
  const query = {
    select: () => query,
    lean: () => Promise.resolve(resolvedValue),
  };
  return query;
}

const findByIdMock = mock.fn(() => fakeQuery(null));
const findByIdAndUpdateMock = mock.fn(() => fakeQuery(null));
const captureServerEventMock = mock.fn();
const getSubscriberCustomerInfoMock = mock.fn(async () => ({}));
const extractActiveSubscriptionSnapshotMock = mock.fn(() => ({
  subscriptionId: 'sub_1',
  subscriptionPlan: 'monthly',
  subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
  revenueCatCustomerId: 'cust_1',
  cancelRequestedAt: null,
}));

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: findByIdMock,
      findByIdAndUpdate: findByIdAndUpdateMock,
    },
  },
});

class FakeRevenueCatInvalidPurchaseError extends Error {
  name = 'RevenueCatInvalidPurchaseError';
}

class FakeRevenueCatRequestError extends Error {
  name = 'RevenueCatRequestError';
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

mock.module('../services/revenueCat.service', {
  namedExports: {
    getSubscriberCustomerInfo: getSubscriberCustomerInfoMock,
    extractActiveSubscriptionSnapshot: extractActiveSubscriptionSnapshotMock,
    RevenueCatConfigurationError: class RevenueCatConfigurationError extends Error {},
    RevenueCatInvalidPurchaseError: FakeRevenueCatInvalidPurchaseError,
    RevenueCatRequestError: FakeRevenueCatRequestError,
  },
});

mock.module('../services/analytics.service', {
  namedExports: { captureServerEvent: captureServerEventMock },
});

type ControllerModule = typeof import('./revenueCatWebhook.controller.js');

let handleInitialPurchaseOrRenewal: ControllerModule['handleInitialPurchaseOrRenewal'];
let markCancellationRequested: ControllerModule['markCancellationRequested'];
let revokeExpiredSubscription: ControllerModule['revokeExpiredSubscription'];

before(async () => {
  ({ handleInitialPurchaseOrRenewal, markCancellationRequested, revokeExpiredSubscription } =
    await import('./revenueCatWebhook.controller.js'));
});

const USER_ID = 'user123';

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'RENEWAL',
    app_user_id: USER_ID,
    product_id: 'prod_monthly',
    store: 'APP_STORE',
    event_timestamp_ms: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  findByIdMock.mock.resetCalls();
  findByIdAndUpdateMock.mock.resetCalls();
  captureServerEventMock.mock.resetCalls();
  findByIdAndUpdateMock.mock.mockImplementation(() => fakeQuery(null));
  getSubscriberCustomerInfoMock.mock.resetCalls();
  getSubscriberCustomerInfoMock.mock.mockImplementation(async () => ({}));
});

describe('handleInitialPurchaseOrRenewal', () => {
  it('RENEWAL: dispara subscription_renewed com o distinctId e os dados do evento', async () => {
    const event = buildEvent({ type: 'RENEWAL' });

    await handleInitialPurchaseOrRenewal({ _id: USER_ID }, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 1);
    assert.deepEqual(captureServerEventMock.mock.calls[0]?.arguments, [
      USER_ID,
      'subscription_renewed',
      { product_id: 'prod_monthly', store: 'APP_STORE' },
    ]);
  });

  it('INITIAL_PURCHASE: NAO dispara nenhum evento (so o app dispara purchase_completed)', async () => {
    const event = buildEvent({ type: 'INITIAL_PURCHASE' });

    const outcome = await handleInitialPurchaseOrRenewal({ _id: USER_ID }, event as never);

    assert.equal(outcome, 'synced');
    assert.equal(captureServerEventMock.mock.callCount(), 0);
  });
});

// CP-1.1.1d: erro na sincronizacao da compra/renovacao.
describe('handleInitialPurchaseOrRenewal — erros de sincronizacao', () => {
  let consoleErrorMock: ReturnType<typeof mock.method>;
  let consoleWarnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    consoleErrorMock = mock.method(console, 'error', () => undefined);
    consoleWarnMock = mock.method(console, 'warn', () => undefined);
  });

  afterEach(() => {
    consoleErrorMock.mock.restore();
    consoleWarnMock.mock.restore();
  });

  const temporaryErrors: Array<[string, () => Error]> = [
    ['erro HTTP da API da RevenueCat (5xx)', () => new FakeRevenueCatRequestError('down', 503)],
    ['erro HTTP da API da RevenueCat (429)', () => new FakeRevenueCatRequestError('slow down', 429)],
    ['falha de rede do fetch', () => new TypeError('fetch failed')],
    ['timeout', () => Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
  ];

  for (const eventType of ['RENEWAL', 'INITIAL_PURCHASE']) {
    for (const [label, buildError] of temporaryErrors) {
      it(`${eventType} + ${label}: 'retry', sem gravar e sem subscription_renewed`, async () => {
        getSubscriberCustomerInfoMock.mock.mockImplementation(async () => {
          throw buildError();
        });

        const outcome = await handleInitialPurchaseOrRenewal(
          { _id: USER_ID },
          buildEvent({ type: eventType }) as never
        );

        assert.equal(outcome, 'retry');
        assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
        assert.equal(captureServerEventMock.mock.callCount(), 0);
        assert.equal(consoleErrorMock.mock.callCount(), 1);
      });
    }

    it(`${eventType} + compra invalida (permanente): 'invalid-purchase', sem gravar e sem evento`, async () => {
      getSubscriberCustomerInfoMock.mock.mockImplementation(async () => {
        throw new FakeRevenueCatInvalidPurchaseError('no active subscription');
      });

      const outcome = await handleInitialPurchaseOrRenewal(
        { _id: USER_ID },
        buildEvent({ type: eventType }) as never
      );

      assert.equal(outcome, 'invalid-purchase');
      assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
      assert.equal(captureServerEventMock.mock.callCount(), 0);
      assert.equal(consoleWarnMock.mock.callCount(), 1);
    });
  }

  it('RENEWAL: falha temporaria e depois reenvio com sucesso dispara subscription_renewed uma unica vez', async () => {
    getSubscriberCustomerInfoMock.mock.mockImplementationOnce(async () => {
      throw new FakeRevenueCatRequestError('down', 502);
    });
    const event = buildEvent({ type: 'RENEWAL' });

    assert.equal(await handleInitialPurchaseOrRenewal({ _id: USER_ID }, event as never), 'retry');
    assert.equal(await handleInitialPurchaseOrRenewal({ _id: USER_ID }, event as never), 'synced');

    assert.equal(findByIdAndUpdateMock.mock.callCount(), 1);
    assert.equal(captureServerEventMock.mock.callCount(), 1);
    assert.equal(captureServerEventMock.mock.calls[0]?.arguments[1], 'subscription_renewed');
  });

  it('log do erro: so nome/status, sem a mensagem da API externa', async () => {
    getSubscriberCustomerInfoMock.mock.mockImplementation(async () => {
      throw new FakeRevenueCatRequestError('SECRET-UPSTREAM-DETAIL', 500);
    });

    await handleInitialPurchaseOrRenewal({ _id: USER_ID }, buildEvent() as never);

    const logged = JSON.stringify(consoleErrorMock.mock.calls.map(call => call.arguments));
    assert.equal(logged.includes('SECRET-UPSTREAM-DETAIL'), false);
    assert.equal(logged.includes('RevenueCatRequestError'), true);
    assert.equal(logged.includes('500'), true);
  });
});

describe('markCancellationRequested', () => {
  it('assinatura ativa: dispara subscription_cancel_requested com o distinctId e os dados do evento', async () => {
    findByIdMock.mock.mockImplementation(() => fakeQuery({ isPro: true }));
    const event = buildEvent({ type: 'CANCELLATION' });

    await markCancellationRequested(USER_ID, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 1);
    assert.deepEqual(captureServerEventMock.mock.calls[0]?.arguments, [
      USER_ID,
      'subscription_cancel_requested',
      { product_id: 'prod_monthly', store: 'APP_STORE' },
    ]);
  });

  it('CANCELLATION apos EXPIRATION ja processada (retorno antecipado): NAO dispara evento', async () => {
    findByIdMock.mock.mockImplementation(() => fakeQuery({ isPro: false }));
    const event = buildEvent({ type: 'CANCELLATION' });

    await markCancellationRequested(USER_ID, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 0);
    assert.equal(findByIdAndUpdateMock.mock.callCount(), 0);
  });

  it('usuario inexistente (retorno antecipado): NAO dispara evento', async () => {
    findByIdMock.mock.mockImplementation(() => fakeQuery(null));
    const event = buildEvent({ type: 'CANCELLATION' });

    await markCancellationRequested(USER_ID, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 0);
  });
});

describe('revokeExpiredSubscription', () => {
  it('dispara subscription_expired com o distinctId e os dados do evento', async () => {
    const event = buildEvent({ type: 'EXPIRATION' });

    await revokeExpiredSubscription(USER_ID, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 1);
    assert.deepEqual(captureServerEventMock.mock.calls[0]?.arguments, [
      USER_ID,
      'subscription_expired',
      { product_id: 'prod_monthly', store: 'APP_STORE' },
    ]);
  });
});
