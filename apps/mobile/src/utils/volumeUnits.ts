// apps/mobile/src/utils/volumeUnits.ts
// Fonte única da conversão de volume do app (ml <-> fl oz americano). O
// backend guarda volume sempre em ml; o useUnits e as telas convertem a partir
// daqui — nenhuma tela deve repetir o fator.

/** Mililitros em 1 fl oz (onça fluida americana). */
export const MILLILITERS_PER_FLUID_OUNCE = 29.574;

/** ml -> fl oz, sem arredondar. */
export function mlToFlOz(valueInMl: number): number {
  return valueInMl / MILLILITERS_PER_FLUID_OUNCE;
}

/** fl oz -> ml, sem arredondar. */
export function flOzToMl(valueInFlOz: number): number {
  return valueInFlOz * MILLILITERS_PER_FLUID_OUNCE;
}
