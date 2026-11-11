// Normalização de ID de produto da RevenueCat (iOS simples x Android com plano base).
// Mesmos casos do teste equivalente no backend (apps/api/src/config/pricing.config.test.ts).
import { normalizeProductId } from './pricing.config';

describe('normalizeProductId', () => {
  it('mantém o ID simples (iOS) como está', () => {
    expect(normalizeProductId('pulse_pro_monthly')).toBe('pulse_pro_monthly');
    expect(normalizeProductId('pulse_pro_annual')).toBe('pulse_pro_annual');
  });

  it('remove o plano base do formato Android', () => {
    expect(normalizeProductId('pulse_pro_monthly:monthly')).toBe('pulse_pro_monthly');
    expect(normalizeProductId('pulse_pro_annual:annual')).toBe('pulse_pro_annual');
  });

  it('corta no primeiro ":" quando há mais de um', () => {
    expect(normalizeProductId('pulse_pro_monthly:p1m:extra')).toBe('pulse_pro_monthly');
  });

  it('não aplica trim nem minúsculas', () => {
    expect(normalizeProductId(' Pulse_Pro_Monthly :monthly')).toBe(' Pulse_Pro_Monthly ');
  });

  it('devolve string vazia para "" e para ":" sozinho', () => {
    expect(normalizeProductId('')).toBe('');
    expect(normalizeProductId(':')).toBe('');
    expect(normalizeProductId(':monthly')).toBe('');
  });

  it('não transforma IDs parecidos no ID do plano', () => {
    expect(normalizeProductId('pulse_pro_monthly_trial')).toBe('pulse_pro_monthly_trial');
    expect(normalizeProductId('pulse_pro_monthlyx')).toBe('pulse_pro_monthlyx');
  });
});
