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
//
// Namespace DEDICADO (não o 'blendi-pulse' compartilhado pelo resto do app):
// este módulo é importado no topo do App.tsx e lê a preferência de idioma de
// forma SÍNCRONA, em import-time — antes que `initMMKVEncryptionKey()' (que
// é assíncrono) tenha qualquer chance de resolver. Se usasse o namespace
// compartilhado, essa primeira leitura sem criptografia "abriria" o arquivo
// físico do MMKV para todo o resto do app nesse estado, já que
// react-native-mmkv reutiliza a instância nativa por id pelo tempo de vida
// do processo — a chave passada em aberturas seguintes do mesmo id seria
// ignorada. Isolar em um namespace próprio confina esse gap (dado de
// sensibilidade desprezível: só a preferência de idioma) e mantém o
// namespace compartilhado — onde ficam token de fallback, cache de foto,
// dados de saúde — protegido desde a primeira abertura.
export const storage = createAppStorage('blendi-pulse-i18n');

const LANGUAGE_KEY = 'user_language';

export type SupportedLocale = 'en' | 'pt-BR';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'pt-BR'];

// Caminho pontuado (dot-path) de toda chave-folha de en.json, derivado
// estruturalmente do JSON — não de Parameters<typeof t>, que resolve pra
// `string` (perde toda a restrição de chave) porque `Parameters<T>` sobre
// um tipo de função sobrecarregada (o `t` do react-i18next) sempre pega a
// ÚLTIMA assinatura da sobrecarga, que é o fallback mais permissivo. Esse
// alias quebrado foi copiado em 14 arquivos antes desta correção (ver
// achado 2 em docs/fixes/cp1.1.8-achados-fora-do-escopo.md) — agora todos
// importam este tipo em vez de redefini-lo localmente.
type DotPath<T, Prefix extends string = ''> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPath<T[K], `${Prefix}${K}.`>;
}[Extract<keyof T, string>];

type AllLeafPaths = DotPath<typeof en>;

// Chaves de pluralização do i18next (compatibilityJSON: 'v4', config de
// i18next.init abaixo) nunca existem no JSON sem sufixo — só como
// `<chave>_one`/`<chave>_other` (ex: me.badges.requirements.
// blendJourneyBronze_one/_other, chamado no código como só
// "...blendJourneyBronze" + { count }, com o sufixo resolvido em runtime
// pelo próprio i18next). Sem isso, toda chamada a uma chave pluralizada
// real seria rejeitada pelo tipo — descoberto ao aplicar esta correção
// nos 14 arquivos (BadgeDetailSheet.tsx, achado 2).
type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other';
type StripPluralSuffix<K extends string> = K extends `${infer Base}${PluralSuffix}` ? Base : never;

export type TranslationKey = AllLeafPaths | StripPluralSuffix<AllLeafPaths>;

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
