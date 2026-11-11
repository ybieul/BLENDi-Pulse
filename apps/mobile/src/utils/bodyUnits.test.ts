// Conversões de peso e altura (bodyUnits.ts): pés/polegadas <-> cm e faixas
// imperiais derivadas dos limites do shared.
import {
  BODY_HEIGHT_MAX_CM,
  BODY_HEIGHT_MIN_CM,
  BODY_WEIGHT_MAX_KG,
  BODY_WEIGHT_MIN_KG,
} from '@blendi/shared';

import {
  BODY_HEIGHT_FEET_INCHES_LIMITS,
  BODY_WEIGHT_POUNDS_LIMITS,
  cmToFeetInches,
  feetInchesToCm,
  formatFeetInches,
  inchesToCm,
  poundsToKg,
} from './bodyUnits';

describe('feetInchesToCm', () => {
  it('valores comuns: 5\'10" = 177.8 cm e 6\'0" = 182.9 cm', () => {
    expect(feetInchesToCm(5, 10)).toBe(177.8);
    expect(feetInchesToCm(6, 0)).toBe(182.9);
  });

  it('mesma regra e arredondamento das polegadas totais (inchesToCm)', () => {
    for (let feet = 0; feet <= 9; feet += 1) {
      for (let inches = 0; inches <= 11; inches += 1) {
        expect(feetInchesToCm(feet, inches)).toBe(inchesToCm(feet * 12 + inches));
      }
    }
    expect(inchesToCm(70)).toBe(177.8);
  });
});

describe('cmToFeetInches', () => {
  it('valores comuns', () => {
    expect(cmToFeetInches(178)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(182.9)).toEqual({ feet: 6, inches: 0 });
  });

  it('12 polegadas viram mais um pé (182.8 cm = 71.97 in -> 6\'0", não 5\'12")', () => {
    expect(cmToFeetInches(182.8)).toEqual({ feet: 6, inches: 0 });
    expect(cmToFeetInches(152.3)).toEqual({ feet: 5, inches: 0 });
  });

  it('extremos da faixa do backend: 100 cm = 3\'3" e 250 cm = 8\'2"', () => {
    expect(cmToFeetInches(BODY_HEIGHT_MIN_CM)).toEqual({ feet: 3, inches: 3 });
    expect(cmToFeetInches(BODY_HEIGHT_MAX_CM)).toEqual({ feet: 8, inches: 2 });
  });

  it('ida e volta constante: pés/pol -> cm -> pés/pol devolve o mesmo valor', () => {
    for (let feet = 3; feet <= 8; feet += 1) {
      for (let inches = 0; inches <= 11; inches += 1) {
        expect(cmToFeetInches(feetInchesToCm(feet, inches))).toEqual({ feet, inches });
      }
    }
  });

  it('cm -> pés/pol -> cm erra no máximo meia polegada (1.27 cm) mais o arredondamento a uma casa (0.05)', () => {
    for (let tenths = BODY_HEIGHT_MIN_CM * 10; tenths <= BODY_HEIGHT_MAX_CM * 10; tenths += 1) {
      const cm = tenths / 10;
      const { feet, inches } = cmToFeetInches(cm);
      expect(inches).toBeGreaterThanOrEqual(0);
      expect(inches).toBeLessThanOrEqual(11);
      expect(Math.abs(feetInchesToCm(feet, inches) - cm)).toBeLessThanOrEqual(1.27 + 0.05 + 1e-9);
    }
  });

  it('formatFeetInches', () => {
    expect(formatFeetInches({ feet: 5, inches: 10 })).toBe('5\'10"');
  });
});

describe('faixas imperiais (derivadas para dentro)', () => {
  it('altura: 3\'4" a 8\'2"; o primeiro de fora de cada lado cai fora da faixa do backend', () => {
    const { min, max } = BODY_HEIGHT_FEET_INCHES_LIMITS;
    expect(min).toEqual({ feet: 3, inches: 4 });
    expect(max).toEqual({ feet: 8, inches: 2 });

    expect(feetInchesToCm(3, 4)).toBe(101.6);
    expect(feetInchesToCm(3, 3)).toBe(99.1);
    expect(feetInchesToCm(8, 2)).toBe(248.9);
    expect(feetInchesToCm(8, 3)).toBe(251.5);
    expect(feetInchesToCm(3, 4)).toBeGreaterThanOrEqual(BODY_HEIGHT_MIN_CM);
    expect(feetInchesToCm(3, 3)).toBeLessThan(BODY_HEIGHT_MIN_CM);
    expect(feetInchesToCm(8, 2)).toBeLessThanOrEqual(BODY_HEIGHT_MAX_CM);
    expect(feetInchesToCm(8, 3)).toBeGreaterThan(BODY_HEIGHT_MAX_CM);
  });

  it('peso: 44.1 a 661.5 lbs; tudo dentro converte para dentro de 20-300 kg', () => {
    expect(BODY_WEIGHT_POUNDS_LIMITS).toEqual({ min: 44.1, max: 661.5 });

    expect(poundsToKg(44.1)).toBeGreaterThanOrEqual(BODY_WEIGHT_MIN_KG);
    expect(poundsToKg(44.0)).toBeLessThan(BODY_WEIGHT_MIN_KG);
    expect(poundsToKg(661.5)).toBeLessThanOrEqual(BODY_WEIGHT_MAX_KG);
    expect(poundsToKg(661.6)).toBeGreaterThan(BODY_WEIGHT_MAX_KG);

    for (let tenths = 441; tenths <= 6615; tenths += 1) {
      const kg = poundsToKg(tenths / 10);
      expect(kg >= BODY_WEIGHT_MIN_KG && kg <= BODY_WEIGHT_MAX_KG).toBe(true);
    }
  });
});
