// apps/mobile/src/utils/intlLocale.ts
// Locale do app → tag BCP 47 do Intl. Função pura, sem dependência de store:
// antes vivia só em hooks/useDateFormat.ts, e utils/formatNumbers.ts a
// importava de lá — o que fazia qualquer componente que formata número
// (ex.: os chips de macros) carregar a store de auth e a config da API.

import type { SupportedLocale } from '../locales/i18n';

/**
 *   'en'    → 'en-US'  (garante formatação americana: Apr 22, 2026 / 11:00 PM)
 *   'pt-BR' → 'pt-BR'  (já é uma tag BCP 47 válida)
 */
export function toIntlLocale(locale: SupportedLocale): string {
  return locale === 'en' ? 'en-US' : 'pt-BR';
}
