// apps/mobile/src/utils/numericInput.utils.ts
// Leitura estrita do que a pessoa digita num campo numérico. Usada pela tela
// de metas (nutritionGoals.utils.ts), pelo onboarding (corpo e metas) e pelo
// completar perfil — uma regra só para todas.
//
// Aceita só dígitos ASCII (0-9), com espaços nas pontas ignorados. Recusa
// sinal ("-3", "+3"), notação científica ("1e2"), lixo ("12abc"), mais de um
// separador ("1.2.3") e dígitos de outros alfabetos ("١٢", "１２"): em JS, `\d`
// sem a flag `u` é exatamente [0-9].

const INTEGER_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^(\d+)(?:[.,](\d*))?$/;

/** Inteiro >= 0 só com dígitos ASCII; qualquer outra coisa (vazio, "1,5", "12abc", "-3") vira null. */
export function parseStrictInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!INTEGER_PATTERN.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Partes de um decimal digitado: inteira e decimal (decimal pode ser '' em "84."). */
export interface StrictDecimalParts {
  integerPart: string;
  fractionPart: string;
}

/**
 * Decimal >= 0 com no máximo `maxFractionDigits` casas, separadas por ponto OU
 * vírgula ("70", "70.5", "70,5"; "70." no meio da digitação vale 70). Sem
 * sinal, sem notação científica, sem ".5", sem segundo separador.
 */
export function parseStrictDecimalParts(text: string, maxFractionDigits: number): StrictDecimalParts | null {
  const match = DECIMAL_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }

  const integerPart = match[1] ?? '';
  const fractionPart = match[2] ?? '';
  if (fractionPart.length > maxFractionDigits) {
    return null;
  }

  return { integerPart, fractionPart };
}

/** Mesmo que parseStrictDecimalParts, já como número. null = texto inválido. */
export function parseStrictDecimal(text: string, maxFractionDigits: number): number | null {
  const parts = parseStrictDecimalParts(text, maxFractionDigits);
  if (!parts) {
    return null;
  }

  const value = Number(`${parts.integerPart}.${parts.fractionPart || '0'}`);
  return Number.isFinite(value) ? value : null;
}
