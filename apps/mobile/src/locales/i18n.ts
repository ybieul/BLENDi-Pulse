// apps/mobile/src/locales/i18n.ts
// Inicialização síncrona do i18next — deve ser importado no topo do App.tsx,
// antes de qualquer componente ser renderizado, para evitar flickers de texto.

import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/pt.js';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ptBR from './pt-BR.json';
import { createAppStorage } from '../config/storage';

// ─── Storage síncrono do app ───────────────────────────────────────────────────
// Em builds nativos usa MMKV. No Expo Go, cai para memória para evitar crash
// no boot quando TurboModules/MMKV não estiverem disponíveis.
export const storage = createAppStorage('blendi-pulse');

const LANGUAGE_KEY = 'user_language';

export type SupportedLocale = 'en' | 'pt-BR';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'pt-BR'];

/**
 * Resolve o idioma inicial na seguinte ordem de prioridade:
 * 1. Preferência salva pelo usuário no MMKV
 * 2. Idioma do dispositivo (se suportado)
 * 3. Fallback: 'en'
 */
function resolveInitialLanguage(): SupportedLocale {
  // 1. Preferência salva
  const saved = storage.getString(LANGUAGE_KEY) as SupportedLocale | undefined;
  if (saved && SUPPORTED_LOCALES.includes(saved)) {
    return saved;
  }

  // 2. Idioma do dispositivo
  const deviceLocale = (getLocales()[0]?.languageTag as string | undefined) ?? '';
  // Suporte a variantes do PT (pt-BR, pt-PT → mapeia para pt-BR)
  if (deviceLocale.startsWith('pt')) return 'pt-BR';
  if (deviceLocale.startsWith('en')) return 'en';

  // 3. Fallback
  return 'en';
}

// ─── Inicialização síncrona ───────────────────────────────────────────────────
// Usamos initReactI18next com `initImmediate: false` para garantir que os
// textos estejam disponíveis imediatamente no primeiro render, sem flicker.
void i18next.use(initReactI18next).init({
  lng: resolveInitialLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LOCALES,

  // Namespace único — toda a estrutura fica em 'translation'
  defaultNS: 'translation',
  ns: ['translation'],

  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },

  // Inicialização síncrona — bloqueia até os recursos estarem prontos
  initImmediate: false,

  interpolation: {
    // React já escapa XSS por padrão
    escapeValue: false,
  },

  // Pluralização correta para pt-BR
  compatibilityJSON: 'v4',
});

export default i18next;
