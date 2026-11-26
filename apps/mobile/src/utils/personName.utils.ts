// apps/mobile/src/utils/personName.utils.ts
// Validação de Nome/Sobrenome nas telas (onboarding, perfil) com os MESMOS
// schemas do backend (@blendi/shared) — teste no build EAS 25-26/11.
// Devolve chaves de tradução (nunca texto) e os valores já limpos.

import { firstNameSchema, lastNameSchema } from '@blendi/shared';

import type { TranslationKey } from '../locales/i18n';

export interface PersonNameValidation {
  firstName: string;
  lastName: string;
  firstNameError: TranslationKey | null;
  lastNameError: TranslationKey | null;
  isValid: boolean;
}

const KNOWN_ERRORS: readonly TranslationKey[] = [
  'errors.validation.required',
  'errors.validation.too_long',
  'errors.validation.invalid_option',
];

function toErrorKey(message: string | undefined): TranslationKey {
  return KNOWN_ERRORS.find((key) => key === message) ?? 'errors.validation.invalid_option';
}

export function validatePersonName(firstName: string, lastName: string): PersonNameValidation {
  const first = firstNameSchema.safeParse(firstName);
  const last = lastNameSchema.safeParse(lastName);

  return {
    firstName: first.success ? first.data : firstName.trim(),
    lastName: last.success ? last.data : lastName.trim(),
    firstNameError: first.success ? null : toErrorKey(first.error.issues[0]?.message),
    lastNameError: last.success ? null : toErrorKey(last.error.issues[0]?.message),
    isValid: first.success && last.success,
  };
}
