// apps/api/src/utils/recipeText.utils.ts
// CP-B3 — textos que o prompt e as mensagens de nova tentativa mostram à IA:
// números no formato do idioma (pt-BR com vírgula), o limite do copo também
// em xícaras no imperial, e o nome neutro do aparelho para quem não tem
// BLENDi (blendiOwnership 'other' ou 'none', gravado com blendiModel 'Lite').

import { ML_PER_US_FLUID_OUNCE } from '@blendi/shared';

import { BLENDER_LIMITS } from '../config/pricing.config';
import type { BlendiModel, BlendiOwnership, UserLocale, UserUnitSystem } from '../models/User';

/** O que muda no texto mostrado à IA, por conta. */
export interface RecipeTextContext {
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  /** Conta sem BLENDi: nada de marca, modelo nem potência no texto. */
  genericBlender: boolean;
}

/** 'other' e 'none' usam os limites do Lite, mas o texto não cita BLENDi. */
export function isGenericBlender(ownership: BlendiOwnership | undefined): boolean {
  return ownership === 'other' || ownership === 'none';
}

/** Como chamar o aparelho no texto da receita de quem não tem BLENDi. */
export const GENERIC_BLENDER_NAME: Record<UserLocale, string> = {
  en: 'your portable blender',
  'pt-BR': 'seu liquidificador portátil',
};

/** Número decimal no formato do idioma: "13.5" (en), "13,5" (pt-BR). */
export function formatDecimal(value: number, locale: UserLocale): string {
  const text = String(value);
  return locale === 'pt-BR' ? text.replace('.', ',') : text;
}

export const ML_PER_US_CUP = 236.6;

// Frações comuns de cozinha, em ordem crescente.
const CUP_FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
];

/**
 * Volume em xícaras, ARREDONDADO PARA BAIXO na fração comum mais próxima
 * (nunca promete mais do que cabe): 400 ml = 1,69 → "1 2/3"; 600 ml = 2,54 →
 * "2 1/2".
 */
export function formatCupsFloor(ml: number, locale: UserLocale): string {
  const cups = ml / ML_PER_US_CUP;
  const whole = Math.floor(cups);
  const rest = cups - whole;
  const fraction = [...CUP_FRACTIONS].reverse().find(([value]) => value <= rest + 1e-9)?.[1];
  const amount = [whole > 0 ? String(whole) : '', fraction ?? ''].filter(Boolean).join(' ') || '0';
  if (locale === 'pt-BR') {
    return `${amount} ${cups >= 2 ? 'xícaras' : 'xícara'}`;
  }
  return `${amount} ${cups >= 2 || (whole === 1 && fraction) ? 'cups' : 'cup'}`;
}

/** Volume no sistema da conta: "250ml" ou "8.5 fl oz" / "8,5 fl oz". */
export function formatVolume(ml: number, unitSystem: UserUnitSystem, locale: UserLocale): string {
  return unitSystem === 'imperial'
    ? `${formatDecimal(Math.round((ml / ML_PER_US_FLUID_OUNCE) * 10) / 10, locale)} fl oz`
    : `${ml}ml`;
}

/**
 * Limite do copo no sistema da conta. Imperial: fl oz e também xícaras
 * ("13.5 fl oz, about 1 2/3 cups" / "13,5 fl oz, cerca de 1 2/3 xícara").
 */
export function formatMaxVolume(blendiModel: BlendiModel, unitSystem: UserUnitSystem, locale: UserLocale): string {
  const limits = BLENDER_LIMITS[blendiModel];
  if (unitSystem !== 'imperial') {
    return `${limits.maxVolumeMl}ml`;
  }
  const cups = formatCupsFloor(limits.maxVolumeMl, locale);
  return `${formatDecimal(limits.maxVolumeOz, locale)} fl oz, ${locale === 'pt-BR' ? 'cerca de' : 'about'} ${cups}`;
}
