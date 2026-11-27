// Fonte única da conversão ml <-> fl oz (volumeUnits.ts) e o displayVolume do
// useUnits, que precisa continuar mostrando exatamente o mesmo de antes.
import { renderHook } from '@testing-library/react-native';

let mockUnitSystem: 'metric' | 'imperial' = 'imperial';
let mockLocale: 'en' | 'pt-BR' = 'en';
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ user: { unitSystem: mockUnitSystem } }),
}));
jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key, locale: mockLocale }),
}));

import { useUnits } from '../hooks/useUnits';
import { ML_PER_US_FLUID_OUNCE } from '@blendi/shared';

import { flOzToMl, mlToFlOz } from './volumeUnits';

describe('volumeUnits — conversão ml <-> fl oz', () => {
  // CP-L1: fator único do shared (fl oz americano), o mesmo da API e dos
  // limites do liquidificador. Antes o app usava 29,574; nenhum valor desta
  // tabela mudou com a troca (diferença de 0,0005 ml por fl oz).
  it('o fator é o do shared (29,5735 ml por fl oz americano)', () => {
    expect(ML_PER_US_FLUID_OUNCE).toBe(29.5735);
    expect(mlToFlOz(ML_PER_US_FLUID_OUNCE)).toBe(1);
    expect(flOzToMl(1)).toBe(ML_PER_US_FLUID_OUNCE);
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
  beforeEach(() => {
    mockLocale = 'en';
  });

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

describe('CP-L1 — separador decimal pelo idioma da conta', () => {
  afterEach(() => {
    mockLocale = 'en';
  });

  it.each([
    ['en', 'imperial', 250, '8.5 fl oz'],
    ['pt-BR', 'imperial', 250, '8,5 fl oz'],
    ['en', 'imperial', 2500, '84.5 fl oz'],
    ['pt-BR', 'imperial', 2500, '84,5 fl oz'],
    ['pt-BR', 'imperial', 0, '0,0 fl oz'],
    ['en', 'metric', 250, '250 ml'],
    ['pt-BR', 'metric', 250, '250 ml'],
    ['pt-BR', 'metric', 2500, '2.500 ml'],
  ] as const)('%s, %s: %i ml -> %s', (locale, unitSystem, ml, text) => {
    mockLocale = locale;
    mockUnitSystem = unitSystem;
    const { result } = renderHook(() => useUnits());
    expect(result.current.displayVolume(ml)).toBe(text);
  });

  it.each([
    ['en', 'metric', 70, '70.0 kg'],
    ['pt-BR', 'metric', 70.25, '70,3 kg'],
    ['en', 'imperial', 81, '178.6 lbs'],
    ['pt-BR', 'imperial', 81, '178,6 lbs'],
  ] as const)('peso %s, %s: %s kg -> %s', (locale, unitSystem, kg, text) => {
    mockLocale = locale;
    mockUnitSystem = unitSystem;
    const { result } = renderHook(() => useUnits());
    expect(result.current.displayWeight(kg)).toBe(text);
  });
});
