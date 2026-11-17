// apps/mobile/src/utils/blenderText.utils.ts
// CP-B4: textos que citam "BLENDi" como o aparelho da pessoa têm uma variante
// neutra ("seu liquidificador portátil" / "your portable blender") para quem
// não tem BLENDi (blendiOwnership 'other' ou 'none'). 'blendi' ou ausente
// (contas anteriores ao campo) continuam com o texto atual.
//
// Os códigos de erro da API não mudam: o app mapeia o código para a chave
// (pulseAi.service / pantryScanner.service) e a variante é escolhida aqui, no
// ponto em que a mensagem é mostrada. Textos de escolha de modelo, medalhas,
// fatos da marca e o nome do app ficam fora desta lista.

import type { BlendiOwnership } from '@blendi/shared';

import type { TranslationKey } from '../locales/i18n';

/** Chave atual → variante neutra. Lista única dos textos com variante. */
export const NEUTRAL_BLENDER_TEXT_KEYS = {
  'errors.pulseai_dietary_restriction_unmet': 'errors.pulseai_dietary_restriction_unmet_generic',
  'errors.pulseai_blender_limit_unmet': 'errors.pulseai_blender_limit_unmet_generic',
  'errors.scanner_dietary_restriction_unmet': 'errors.scanner_dietary_restriction_unmet_generic',
  'errors.scanner_blender_limit_unmet': 'errors.scanner_blender_limit_unmet_generic',
  'pulseAi.goals.muscle.welcomeSubtitle': 'pulseAi.goals.muscle.welcomeSubtitleGeneric',
  'pulseAi.goals.wellness.welcomeSubtitle': 'pulseAi.goals.wellness.welcomeSubtitleGeneric',
  'pulseAi.goals.energy.welcomeSubtitle': 'pulseAi.goals.energy.welcomeSubtitleGeneric',
  'pulseAi.goals.weightLoss.welcomeSubtitle': 'pulseAi.goals.weightLoss.welcomeSubtitleGeneric',
  'pulseAi.goals.recovery.welcomeSubtitle': 'pulseAi.goals.recovery.welcomeSubtitleGeneric',
  'blend.cleanReminder': 'blend.cleanReminderGeneric',
  'profile.fields.model': 'profile.fields.modelGeneric',
  'me.edit.modelTitle': 'me.edit.modelTitleGeneric',
} as const satisfies Partial<Record<TranslationKey, TranslationKey>>;

type NeutralBlenderTextKey = keyof typeof NEUTRAL_BLENDER_TEXT_KEYS;

function hasNeutralVariant(key: TranslationKey): key is NeutralBlenderTextKey {
  return Object.prototype.hasOwnProperty.call(NEUTRAL_BLENDER_TEXT_KEYS, key);
}

/** 'other' e 'none' leem o texto neutro; 'blendi' ou ausente, o atual. */
export function isGenericBlenderOwnership(ownership: BlendiOwnership | null | undefined): boolean {
  return ownership === 'other' || ownership === 'none';
}

/**
 * Devolve a chave a mostrar para a conta: a variante neutra quando a chave
 * tem uma e a pessoa não tem BLENDi; senão, a própria chave.
 */
export function resolveBlenderTextKey(
  key: TranslationKey,
  ownership: BlendiOwnership | null | undefined
): TranslationKey {
  if (isGenericBlenderOwnership(ownership) && hasNeutralVariant(key)) {
    return NEUTRAL_BLENDER_TEXT_KEYS[key];
  }
  return key;
}
