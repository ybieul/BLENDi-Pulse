// Testes da normalizacao de ID de produto da RevenueCat (iOS simples x Android com
// plano base). Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeProductId } from './pricing.config';

describe('normalizeProductId', () => {
  it('mantem o ID simples (iOS) como esta', () => {
    assert.equal(normalizeProductId('pulse_pro_monthly'), 'pulse_pro_monthly');
    assert.equal(normalizeProductId('pulse_pro_annual'), 'pulse_pro_annual');
  });

  it('remove o plano base do formato Android', () => {
    assert.equal(normalizeProductId('pulse_pro_monthly:monthly'), 'pulse_pro_monthly');
    assert.equal(normalizeProductId('pulse_pro_annual:annual'), 'pulse_pro_annual');
  });

  it('corta no primeiro ":" quando ha mais de um', () => {
    assert.equal(normalizeProductId('pulse_pro_monthly:p1m:extra'), 'pulse_pro_monthly');
  });

  it('nao aplica trim nem minusculas', () => {
    assert.equal(normalizeProductId(' Pulse_Pro_Monthly :monthly'), ' Pulse_Pro_Monthly ');
  });

  it('devolve string vazia para "" e para ":" sozinho', () => {
    assert.equal(normalizeProductId(''), '');
    assert.equal(normalizeProductId(':'), '');
    assert.equal(normalizeProductId(':monthly'), '');
  });

  it('nao transforma IDs parecidos no ID do plano', () => {
    assert.equal(normalizeProductId('pulse_pro_monthly_trial'), 'pulse_pro_monthly_trial');
    assert.equal(normalizeProductId('pulse_pro_monthlyx'), 'pulse_pro_monthlyx');
  });
});
