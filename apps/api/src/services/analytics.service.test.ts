// Testes do captureServerEvent (eventos de servidor enviados ao PostHog). Rodar com:
// pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

// Mock de '../config/env' ANTES do import dinamico de analytics.service — garante o
// cenario de POSTHOG_API_KEY vazio independente do .env real da maquina (que o
// checkpoint exige manter vazio, mas nao pode ser a unica garantia do teste).
mock.module('../config/env', {
  namedExports: { env: { POSTHOG_API_KEY: undefined } },
});

let captureServerEvent: (typeof import('./analytics.service.js'))['captureServerEvent'];

before(async () => {
  ({ captureServerEvent } = await import('./analytics.service.js'));
});

describe('captureServerEvent', () => {
  it('nao lanca erro e nao faz nada quando POSTHOG_API_KEY esta vazio', () => {
    assert.doesNotThrow(() => {
      captureServerEvent('user123', 'subscription_renewed', { product_id: 'prod_1' });
    });
  });

  it('nao lanca erro mesmo sem properties', () => {
    assert.doesNotThrow(() => {
      captureServerEvent('user123', 'subscription_expired');
    });
  });
});
