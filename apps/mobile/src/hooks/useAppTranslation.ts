// apps/mobile/src/hooks/useAppTranslation.ts
// Hook central de tradução do BLENDi Pulse.
//
// Use SEMPRE este hook — nunca importe useTranslation diretamente.
// Garante:
//   ✅ Autocomplete TypeScript para todas as chaves (inferido de en.json)
//   ✅ Erro de compilação para chaves inexistentes
//   ✅ Troca de idioma persiste no MMKV automaticamente
//   ✅ Re-render automático em todos os componentes ao trocar idioma

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { storage, type SupportedLocale, SUPPORTED_LOCALES } from '../locales/i18n';

const LANGUAGE_KEY = 'user_language';

// ─── Tipos inferidos do arquivo de referência (en.json) ──────────────────────
// O i18n.d.ts garante que TFunction conheça todas as chaves válidas.

export interface UseAppTranslationReturn {
  /** Função de tradução com autocomplete TypeScript completo */
  t: ReturnType<typeof useTranslation>['t'];
  /** Idioma atualmente ativo */
  locale: SupportedLocale;
  /** Lista de idiomas suportados */
  supportedLocales: typeof SUPPORTED_LOCALES;
  /**
   * Troca o idioma do app em tempo de execução.
   * - Atualiza o i18next imediatamente (todos os componentes re-renderizam)
   * - Persiste a escolha no MMKV para a próxima abertura do app
   */
  changeLocale: (locale: SupportedLocale) => Promise<void>;
  /** Retorna true se o idioma ativo é RTL (preparação para expansão futura) */
  isRTL: boolean;
}

export function useAppTranslation(): UseAppTranslationReturn {
  const { t, i18n } = useTranslation();

  const changeLocale = useCallback(
    async (newLocale: SupportedLocale) => {
      // 1. Atualiza i18next → dispara re-render em todos os componentes
      await i18n.changeLanguage(newLocale);
      // 2. Persiste para a próxima sessão
      storage.set(LANGUAGE_KEY, newLocale);
    },
    [i18n]
  );

  return {
    t,
    locale: i18n.language as SupportedLocale,
    supportedLocales: SUPPORTED_LOCALES,
    changeLocale,
    isRTL: false, // EN e PT-BR são LTR
  };
}
