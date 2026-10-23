// apps/mobile/src/utils/birthDate.utils.ts
// Máscara DD/MM/AAAA — nenhuma lib de date-picker existe no app mobile (ver
// cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md, Tarefa 1.3).
// Extraído de OnboardingBodyScreen.tsx (CP-B.1) para ser reaproveitado também
// por CompleteProfileScreen.tsx, sem duplicar a lógica de máscara/validação.

import type { useAppTranslation } from '../hooks/useAppTranslation';

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

export const BIRTH_DATE_DIGITS_LENGTH = 8;
export const BIRTH_DATE_MASKED_LENGTH = 10;

export function maskBirthDateInput(rawText: string): string {
  const digits = rawText.replace(/\D/g, '').slice(0, BIRTH_DATE_DIGITS_LENGTH);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

export function birthDateInputToIso(maskedText: string): string | null {
  if (maskedText.length !== BIRTH_DATE_MASKED_LENGTH) return null;

  const [day, month, year] = maskedText.split('/');
  if (!day || !month || !year) return null;

  return `${year}-${month}-${day}`;
}

// Inverso de birthDateInputToIso — usado por CompleteProfileScreen.tsx pra
// pré-preencher o input com o birthDate já salvo (placeholder ou real),
// vindo de getMe como string ISO completa (ex. "1996-10-19T00:00:00.000Z").
export function isoToBirthDateInput(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) return '';

  return `${day}/${month}/${year}`;
}

// Traduz a mensagem de erro do Zod (birthDateSchema, packages/shared). O
// refine de idade plausível (13-120) embute min/max como JSON e é mostrado
// via errors.validation.number_range, já existente. Qualquer outra falha
// (required/.date() — chaves literais, sem JSON) é formato malformado de
// data — a chave genérica "errors.validation.invalid_option" não serve pra
// esse caso, por isso usa onboarding.birthDateFormatError.
export function translateBirthDateError(
  t: ReturnType<typeof useAppTranslation>['t'],
  rawMessage: string,
): string {
  try {
    const parsed: unknown = JSON.parse(rawMessage);
    if (parsed && typeof parsed === 'object' && 'key' in parsed) {
      const { key, ...vars } = parsed as { key: TranslationKey } & Record<string, unknown>;
      return t(key, vars);
    }
  } catch {
    // chave literal, sem JSON — cai no fallback de formato abaixo.
  }

  return t('onboarding.birthDateFormatError');
}
