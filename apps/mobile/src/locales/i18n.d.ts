// apps/mobile/src/locales/i18n.d.ts
// Estende o módulo i18next com a estrutura completa dos arquivos JSON.
// Qualquer chave inválida é um ERRO DE COMPILAÇÃO — nunca um bug silencioso.

import type en from './en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    // Idioma de referência para as chaves
    defaultNS: 'translation';
    // Estrutura completa inferida do en.json
    resources: {
      translation: typeof en;
    };
  }
}
