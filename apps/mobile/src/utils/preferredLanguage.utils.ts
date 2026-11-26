// apps/mobile/src/utils/preferredLanguage.utils.ts
// Idioma mandado nos cadastros (e-mail, Apple, Google) — teste no build EAS
// de 25-26/11: contas Apple/Google nasciam sempre em 'en'.
//
// É o idioma ativo do app (i18next), que no primeiro uso vem do aparelho
// (resolveInitialLanguage em locales/i18n.ts: pt-* → pt-BR, en-* → en,
// qualquer outro → en) — o mesmo valor que o cadastro por e-mail já mandava.
// Importa só o i18next (não locales/i18n.ts) para não puxar o armazenamento
// local nos hooks de login.

import i18next from 'i18next';
import type { PreferredLanguage } from '@blendi/shared';

/** pt-* → 'pt-BR'; qualquer outro (ou nenhum) → 'en'. */
export function toPreferredLanguage(language: string | null | undefined): PreferredLanguage {
  return typeof language === 'string' && language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

/** Idioma ativo do app, no formato aceito pelas rotas de cadastro. */
export function getAppPreferredLanguage(): PreferredLanguage {
  return toPreferredLanguage(i18next.language);
}
