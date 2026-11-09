// apps/mobile/src/utils/blenderOwnership.utils.ts
// As 5 opções de liquidificador usadas no onboarding (OnboardingModelScreen) e
// na troca de modelo do Me (EditSettingSheet). "other" e "none" gravam
// blendiModel 'Lite' — o backend aplica a mesma regra em PATCH /users/me.

import type { BlendiOwnership } from '@blendi/shared';

import type { TranslationKey } from '../locales/i18n';

export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
export type BlenderOptionKey = BlendiModel | 'other' | 'none';

export interface BlenderOption {
  key: BlenderOptionKey;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  /** Potência do motor — só nos BLENDi atuais. */
  badge?: string;
}

export const BLENDER_OPTIONS: readonly BlenderOption[] = [
  { key: 'Lite', titleKey: 'onboarding.model.lite.name', descKey: 'onboarding.modelLiteDesc', badge: '70W' },
  { key: 'ProPlus', titleKey: 'onboarding.model.pro_plus.name', descKey: 'onboarding.modelProDesc', badge: '120W' },
  { key: 'Steel', titleKey: 'onboarding.model.steel.name', descKey: 'onboarding.modelSteelDesc', badge: '180W' },
  { key: 'other', titleKey: 'onboarding.modelOtherTitle', descKey: 'onboarding.modelOtherDesc' },
  { key: 'none', titleKey: 'onboarding.modelNoneTitle', descKey: 'onboarding.modelNoneDesc' },
];

export function resolveBlenderOption(key: BlenderOptionKey): {
  blendiModel: BlendiModel;
  blendiOwnership: BlendiOwnership;
} {
  if (key === 'other' || key === 'none') {
    return { blendiModel: 'Lite', blendiOwnership: key };
  }

  return { blendiModel: key, blendiOwnership: 'blendi' };
}

/** Contas sem blendiOwnership (anteriores ao campo) contam como 'blendi'. */
export function getBlenderOptionKey(
  blendiModel: BlendiModel,
  blendiOwnership: BlendiOwnership | undefined
): BlenderOptionKey {
  if (blendiOwnership === 'other' || blendiOwnership === 'none') {
    return blendiOwnership;
  }

  return blendiModel;
}

export function isBlenderOptionKey(value: string): value is BlenderOptionKey {
  return BLENDER_OPTIONS.some(option => option.key === value);
}

/**
 * Valor da linha "Meu BLENDi" no card de configurações do Me: o modelo para
 * 'blendi', "Outro modelo" (+ o texto digitado, quando houver) para 'other' e
 * "Ainda não tenho um BLENDi" para 'none'. Devolve chave + parâmetros de i18n —
 * quem chama traduz com t().
 */
export function getModelDisplay(
  blendiModel: BlendiModel,
  blendiOwnership: BlendiOwnership | undefined,
  otherBlenderModel: string | null | undefined
): { key: TranslationKey; options?: { name: string } } {
  if (blendiOwnership === 'none') {
    return { key: 'me.blenderOwnership.none' };
  }

  if (blendiOwnership === 'other') {
    const name = otherBlenderModel?.trim();
    return name
      ? { key: 'me.blenderOwnership.otherWithName', options: { name } }
      : { key: 'me.blenderOwnership.other' };
  }

  const option = BLENDER_OPTIONS.find(candidate => candidate.key === blendiModel);
  return { key: option?.titleKey ?? 'onboarding.model.lite.name' };
}
