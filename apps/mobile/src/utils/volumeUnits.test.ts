// Fonte única da conversão ml <-> fl oz (volumeUnits.ts) e o displayVolume do
// useUnits, que precisa continuar mostrando exatamente o mesmo de antes.
import { renderHook } from '@testing-library/react-native';

let mockUnitSystem: 'metric' | 'imperial' = 'imperial';
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ user: { unitSystem: mockUnitSystem } }),
}));
jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

import { useUnits } from '../hooks/useUnits';
import { MILLILITERS_PER_FLUID_OUNCE, flOzToMl, mlToFlOz } from './volumeUnits';

describe('volumeUnits — conversão ml <-> fl oz', () => {
  it('o fator é o mesmo que o app já usava (29,574 ml por fl oz)', () => {
    expect(MILLILITERS_PER_FLUID_OUNCE).toBe(29.574);
  });

  it.each([
    [500, 16.9],
    [2500, 84.5],
    [3000, 101.4],
    [8000, 270.5],
  ])('%i ml -> %s fl oz (uma casa) e a ida e volta exata devolve o mesmo ml', (ml, flOz) => {
    expect(Math.round(mlToFlOz(ml) * 10) / 10).toBe(flOz);
    expect(flOzToMl(mlToFlOz(ml))).toBeCloseTo(ml, 9);
  });

  it.each([
    [500, 500],
    [2500, 2499],
    [3000, 2999],
    [8000, 8000],
  ])('%i ml -> fl oz com uma casa -> ml inteiro dá %i (perda de arredondamento de no máximo 2 ml)', (ml, back) => {
    const shown = Math.round(mlToFlOz(ml) * 10) / 10;
    const roundTrip = Math.round(flOzToMl(shown));
    expect(roundTrip).toBe(back);
    expect(Math.abs(roundTrip - ml)).toBeLessThanOrEqual(2);
  });
});

describe('useUnits.displayVolume — sem mudança de exibição', () => {
  it.each([
    [2500, '84.5 fl oz'],
    [3000, '101.4 fl oz'],
    [500, '16.9 fl oz'],
    [0, '0.0 fl oz'],
  ])('imperial: %i ml aparece como %s', (ml, text) => {
    mockUnitSystem = 'imperial';
    const { result } = renderHook(() => useUnits());
    expect(result.current.displayVolume(ml)).toBe(text);
    expect(result.current.displayHydration(ml)).toBe(text);
  });

  it('métrico continua em ml', () => {
    mockUnitSystem = 'metric';
    const { result } = renderHook(() => useUnits());
    expect(result.current.displayVolume(2500)).toMatch(/^2[,.]?500 ml$/);
  });
});
