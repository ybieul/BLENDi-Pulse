// apps/mobile/src/hooks/useFormatNumbers.ts
// Hook central de formatação de números do BLENDi Pulse.
//
// Mesmo padrão de useDateFormat/useUnits: lê o locale ativo do i18n e expõe
// as funções de utils/formatNumbers.ts já com o locale injetado, para que
// componentes chamem formatDecimal(value) sem passar locale a cada chamada.

import { useCallback, useMemo } from 'react';
import { formatCount, formatDecimal } from '../utils/formatNumbers';
import { useAppTranslation } from './useAppTranslation';

export interface UseFormatNumbersReturn {
  /** Número decimal com separador correto para o locale (ex: "17,5" / "17.5"). */
  formatDecimal: (value: number, decimalDigits?: number) => string;
  /** Número inteiro com separador de milhar correto para o locale (ex: "1.500" / "1,500"). */
  formatCount: (value: number) => string;
}

export function useFormatNumbers(): UseFormatNumbersReturn {
  const { locale } = useAppTranslation();

  const boundFormatDecimal = useCallback(
    (value: number, decimalDigits?: number) => formatDecimal(value, locale, decimalDigits),
    [locale],
  );

  const boundFormatCount = useCallback(
    (value: number) => formatCount(value, locale),
    [locale],
  );

  return useMemo(
    () => ({ formatDecimal: boundFormatDecimal, formatCount: boundFormatCount }),
    [boundFormatDecimal, boundFormatCount],
  );
}
