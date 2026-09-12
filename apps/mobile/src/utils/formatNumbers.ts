// apps/mobile/src/utils/formatNumbers.ts
// Utilitário central de formatação de números do BLENDi Pulse.
//
// Nenhum componente deve usar toFixed()/toLocaleString() sem locale para
// exibir um número ao usuário — toda formatação numérica passa por aqui.
// Ver hooks/useFormatNumbers.ts para a versão com locale já injetado.

import { toIntlLocale } from '../hooks/useDateFormat';
import type { SupportedLocale } from '../locales/i18n';

/**
 * Formata um número decimal com o separador correto para o locale — vírgula
 * em pt-BR, ponto em en. Omite casas decimais desnecessárias (valores
 * inteiros não ganham ".0"/",0").
 *
 * @example
 *   formatDecimal(17.5, 'pt-BR') // "17,5"
 *   formatDecimal(17.5, 'en')    // "17.5"
 *   formatDecimal(20, 'pt-BR')   // "20"
 */
export function formatDecimal(value: number, locale: SupportedLocale, decimalDigits = 1): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalDigits,
  }).format(value);
}

/**
 * Formata um número inteiro potencialmente grande com separador de milhar
 * correto para o locale.
 *
 * @example
 *   formatCount(1500, 'pt-BR') // "1.500"
 *   formatCount(1500, 'en')    // "1,500"
 */
export function formatCount(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}
