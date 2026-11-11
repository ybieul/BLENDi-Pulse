// apps/mobile/src/utils/bodyUnits.ts
// Fonte única das conversões de peso (kg <-> lbs) e altura (cm <-> pés e
// polegadas) do app, e das faixas de peso/altura na unidade exibida. O backend
// guarda peso em kg e altura em cm; o useUnits e as telas convertem a partir
// daqui — nenhuma tela deve repetir um fator nem um limite.
//
// Os limites vêm de @blendi/shared (BODY_WEIGHT_MIN_KG etc.). As faixas
// imperiais são derivadas deles "para dentro": só entram valores que, depois
// da mesma conversão que a tela faz antes de enviar, ficam dentro da faixa do
// backend.

import {
  BODY_HEIGHT_MAX_CM,
  BODY_HEIGHT_MIN_CM,
  BODY_WEIGHT_MAX_KG,
  BODY_WEIGHT_MIN_KG,
} from '@blendi/shared';

/** Libras em 1 kg. */
export const POUNDS_PER_KILOGRAM = 2.205;
/** Centímetros em 1 polegada. */
export const CENTIMETERS_PER_INCH = 2.54;
/** Polegadas em 1 pé. */
export const INCHES_PER_FOOT = 12;

const TENTHS_PER_UNIT = 10;

export function roundToOneDecimal(value: number): number {
  return Math.round(value * TENTHS_PER_UNIT) / TENTHS_PER_UNIT;
}

// ─── Peso ─────────────────────────────────────────────────────────────────────

/** kg -> lbs, sem arredondar. */
export function kgToPounds(valueInKg: number): number {
  return valueInKg * POUNDS_PER_KILOGRAM;
}

/** lbs -> kg, sem arredondar (é o que o app envia ao backend). */
export function poundsToKg(valueInPounds: number): number {
  return valueInPounds / POUNDS_PER_KILOGRAM;
}

export function isBodyWeightInRange(valueInKg: number): boolean {
  return valueInKg >= BODY_WEIGHT_MIN_KG && valueInKg <= BODY_WEIGHT_MAX_KG;
}

// ─── Altura ───────────────────────────────────────────────────────────────────

export interface FeetInches {
  feet: number;
  inches: number;
}

/** Polegadas totais -> cm, arredondado a uma casa (regra de sempre do app para a altura imperial). */
export function inchesToCm(totalInches: number): number {
  return roundToOneDecimal(totalInches * CENTIMETERS_PER_INCH);
}

/** Pés e polegadas -> cm, com a mesma regra e arredondamento de inchesToCm. */
export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * INCHES_PER_FOOT + inches);
}

/**
 * cm -> pés e polegadas inteiros (regra do displayHeight): pés pelo piso,
 * polegadas arredondadas; 12 polegadas viram mais um pé (ex.: 182.8 cm =
 * 71,97 in -> 6'0", não 5'12").
 */
export function cmToFeetInches(valueInCm: number): FeetInches {
  const totalInches = valueInCm / CENTIMETERS_PER_INCH;
  let feet = Math.floor(totalInches / INCHES_PER_FOOT);
  let inches = Math.round(totalInches % INCHES_PER_FOOT);

  if (inches === INCHES_PER_FOOT) {
    feet += 1;
    inches = 0;
  }

  return { feet, inches };
}

/** 5'10" */
export function formatFeetInches({ feet, inches }: FeetInches): string {
  return `${feet}'${inches}"`;
}

export function isBodyHeightInRange(valueInCm: number): boolean {
  return valueInCm >= BODY_HEIGHT_MIN_CM && valueInCm <= BODY_HEIGHT_MAX_CM;
}

// ─── Faixas na unidade exibida (imperial) ─────────────────────────────────────

/**
 * Menor e maior inteiro n (em `step`-ésimos da unidade exibida) tais que
 * `toStorage(n / step)` cai dentro de [min, max]. Parte do valor convertido e
 * ajusta para dentro até bater exatamente com a checagem que a tela faz — sem
 * depender de ruído de ponto flutuante num Math.ceil/floor.
 */
function displayRange(
  min: number,
  max: number,
  fromStorage: (value: number) => number,
  toStorage: (value: number) => number,
  step: number,
): { min: number; max: number } {
  const accepted = (n: number) => {
    const stored = toStorage(n / step);
    return stored >= min && stored <= max;
  };

  let low = Math.round(fromStorage(min) * step);
  while (accepted(low - 1)) low -= 1;
  while (!accepted(low)) low += 1;

  let high = Math.round(fromStorage(max) * step);
  while (accepted(high + 1)) high += 1;
  while (!accepted(high)) high -= 1;

  return { min: low / step, max: high / step };
}

/** Faixa de peso em lbs, uma casa decimal (hoje 44.1 a 661.5). */
export const BODY_WEIGHT_POUNDS_LIMITS: Readonly<{ min: number; max: number }> = displayRange(
  BODY_WEIGHT_MIN_KG,
  BODY_WEIGHT_MAX_KG,
  kgToPounds,
  poundsToKg,
  TENTHS_PER_UNIT,
);

const HEIGHT_INCHES_LIMITS = displayRange(
  BODY_HEIGHT_MIN_CM,
  BODY_HEIGHT_MAX_CM,
  (cm) => cm / CENTIMETERS_PER_INCH,
  inchesToCm,
  1,
);

function totalInchesToFeetInches(totalInches: number): FeetInches {
  return { feet: Math.floor(totalInches / INCHES_PER_FOOT), inches: totalInches % INCHES_PER_FOOT };
}

/** Faixa de altura em pés e polegadas inteiros (hoje 3'4" a 8'2"). */
export const BODY_HEIGHT_FEET_INCHES_LIMITS: Readonly<{ min: FeetInches; max: FeetInches }> = {
  min: totalInchesToFeetInches(HEIGHT_INCHES_LIMITS.min),
  max: totalInchesToFeetInches(HEIGHT_INCHES_LIMITS.max),
};
