// Testes dos 3 pontos de ciclo de vida de assinatura instrumentados com PostHog no
// webhook do RevenueCat (subscription_renewed, subscription_cancel_requested,
// subscription_expired). Mocka '../models/User', '../services/revenueCat.service' e
// '../services/analytics.service' para testar as funcoes exportadas diretamente, sem
// simular a requisicao HTTP inteira (auth, body bruto, validacao do payload).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

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

mock.module('../services/revenueCat.service', {
  namedExports: {
    getSubscriberCustomerInfo: getSubscriberCustomerInfoMock,
    extractActiveSubscriptionSnapshot: extractActiveSubscriptionSnapshotMock,
    RevenueCatConfigurationError: class RevenueCatConfigurationError extends Error {},
    RevenueCatInvalidPurchaseError: class RevenueCatInvalidPurchaseError extends Error {},
    RevenueCatRequestError: class RevenueCatRequestError extends Error {},
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

    await handleInitialPurchaseOrRenewal({ _id: USER_ID }, event as never);

    assert.equal(captureServerEventMock.mock.callCount(), 0);
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
