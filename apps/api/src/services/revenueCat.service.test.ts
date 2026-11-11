// Testes de extractActiveSubscriptionSnapshot com IDs de produto nos dois formatos:
// simples (iOS, "pulse_pro_monthly") e com plano base (Android, "pulse_pro_monthly:monthly").
// Mocka '../config/env' para nao depender das variaveis de ambiente reais.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

mock.module('../config/env', {
  namedExports: {
    env: { REVENUECAT_API_KEY: 'test_key' },
    paymentsConfig: { isConfigured: true },
  },
});

type Service = typeof import('./revenueCat.service.js');
let service: Service;

before(async () => {
  service = await import('./revenueCat.service.js');
});

const FUTURE = '2099-01-01T00:00:00.000Z';
const LATER_FUTURE = '2099-06-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

function customerInfo(subscriptions: Record<string, { expires_date: string; store_transaction_id?: string }>) {
  return {
    request_date: '2026-11-11T00:00:00.000Z',
    request_date_ms: 0,
    subscriber: { original_app_user_id: 'user_1', subscriptions },
  };
}

describe('extractActiveSubscriptionSnapshot', () => {
  const cases: Array<[string, 'monthly' | 'annual']> = [
    ['pulse_pro_monthly', 'monthly'],
    ['pulse_pro_annual', 'annual'],
    ['pulse_pro_monthly:monthly', 'monthly'],
    ['pulse_pro_annual:annual', 'annual'],
    ['pulse_pro_monthly:p1m:extra', 'monthly'],
  ];

  for (const [productId, plan] of cases) {
    it(`reconhece ${productId} como ${plan} e devolve o ID original`, () => {
      const snapshot = service.extractActiveSubscriptionSnapshot(
        customerInfo({ [productId]: { expires_date: FUTURE, store_transaction_id: 'tx_1' } })
      );

      assert.equal(snapshot.subscriptionPlan, plan);
      assert.equal(snapshot.productId, productId);
      assert.equal(snapshot.subscriptionId, 'tx_1');
    });
  }

  it('usa o ID original como subscriptionId quando nao ha store_transaction_id', () => {
    const snapshot = service.extractActiveSubscriptionSnapshot(
      customerInfo({ 'pulse_pro_annual:annual': { expires_date: FUTURE } })
    );

    assert.equal(snapshot.subscriptionId, 'pulse_pro_annual:annual');
  });

  for (const productId of [
    'pulse_pro_monthly_trial',
    'pulse_pro_monthlyx',
    'pulse_pro_monthly_trial:monthly',
    'other_product',
    '',
    ':',
    ':monthly',
  ]) {
    it(`ignora produto desconhecido "${productId}"`, () => {
      assert.throws(
        () => service.extractActiveSubscriptionSnapshot(customerInfo({ [productId]: { expires_date: FUTURE } })),
        service.RevenueCatInvalidPurchaseError
      );
    });
  }

  it('ignora entrada conhecida com valor que nao e objeto e acha a valida', () => {
    const snapshot = service.extractActiveSubscriptionSnapshot(
      customerInfo({
        'pulse_pro_annual:annual': null,
        pulse_pro_annual: 'texto',
        'pulse_pro_monthly:monthly': { expires_date: FUTURE },
      } as unknown as Record<string, { expires_date: string }>)
    );

    assert.equal(snapshot.productId, 'pulse_pro_monthly:monthly');
  });

  it('so entradas conhecidas com valor null: nenhuma assinatura (sem TypeError)', () => {
    assert.throws(
      () =>
        service.extractActiveSubscriptionSnapshot(
          customerInfo({ pulse_pro_monthly: null } as unknown as Record<string, { expires_date: string }>)
        ),
      service.RevenueCatInvalidPurchaseError
    );
  });

  it('ignora assinatura conhecida ja expirada', () => {
    assert.throws(
      () => service.extractActiveSubscriptionSnapshot(customerInfo({ 'pulse_pro_monthly:monthly': { expires_date: PAST } })),
      service.RevenueCatInvalidPurchaseError
    );
  });

  it('ignora o desconhecido e fica com o conhecido quando os dois aparecem', () => {
    const snapshot = service.extractActiveSubscriptionSnapshot(
      customerInfo({
        pulse_pro_monthly_trial: { expires_date: LATER_FUTURE },
        'pulse_pro_monthly:monthly': { expires_date: FUTURE },
      })
    );

    assert.equal(snapshot.productId, 'pulse_pro_monthly:monthly');
    assert.equal(snapshot.subscriptionPlan, 'monthly');
  });

  describe('com mensal e anual ativos, escolhe a de expiracao mais tarde (criterio atual)', () => {
    const formats: Array<[string, string, string]> = [
      ['simples', 'pulse_pro_monthly', 'pulse_pro_annual'],
      ['Android', 'pulse_pro_monthly:monthly', 'pulse_pro_annual:annual'],
      ['misto', 'pulse_pro_monthly', 'pulse_pro_annual:annual'],
    ];

    for (const [label, monthlyId, annualId] of formats) {
      it(`formato ${label}: anual expira depois -> anual`, () => {
        const snapshot = service.extractActiveSubscriptionSnapshot(
          customerInfo({
            [monthlyId]: { expires_date: FUTURE },
            [annualId]: { expires_date: LATER_FUTURE },
          })
        );

        assert.equal(snapshot.subscriptionPlan, 'annual');
        assert.equal(snapshot.productId, annualId);
      });

      it(`formato ${label}: mensal expira depois -> mensal`, () => {
        const snapshot = service.extractActiveSubscriptionSnapshot(
          customerInfo({
            [monthlyId]: { expires_date: LATER_FUTURE },
            [annualId]: { expires_date: FUTURE },
          })
        );

        assert.equal(snapshot.subscriptionPlan, 'monthly');
        assert.equal(snapshot.productId, monthlyId);
      });
    }

    it('empate na expiracao mantem a primeira encontrada', () => {
      const snapshot = service.extractActiveSubscriptionSnapshot(
        customerInfo({
          'pulse_pro_annual:annual': { expires_date: FUTURE },
          pulse_pro_monthly: { expires_date: FUTURE },
        })
      );

      assert.equal(snapshot.productId, 'pulse_pro_annual:annual');
    });
  });
});
