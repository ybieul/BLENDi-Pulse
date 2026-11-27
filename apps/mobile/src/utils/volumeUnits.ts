// apps/mobile/src/utils/volumeUnits.ts
// Conversão de volume do app (ml <-> fl oz americano). O backend guarda volume
// sempre em ml; o useUnits e as telas convertem a partir daqui. CP-L1: o
// fator é o do shared (ML_PER_US_FLUID_OUNCE = 29.5735), o mesmo da API e dos
// limites do liquidificador; nenhuma tela repete o fator.
import { ML_PER_US_FLUID_OUNCE } from '@blendi/shared';

/** ml -> fl oz, sem arredondar. */
export function mlToFlOz(valueInMl: number): number {
  return valueInMl / ML_PER_US_FLUID_OUNCE;
}

/** fl oz -> ml, sem arredondar. */
export function flOzToMl(valueInFlOz: number): number {
  return valueInFlOz * ML_PER_US_FLUID_OUNCE;
}
