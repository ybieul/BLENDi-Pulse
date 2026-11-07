import type { AxiosError } from 'axios';

import type { TranslationKey } from '../locales/i18n';

const DEFAULT_API_ERROR_TRANSLATION_KEY = 'errors.network_internal_server_error';

interface ApiErrorCodeResponse {
  code?: string | null;
}

export function getApiErrorTranslationKey(code?: string | null): TranslationKey {
  const normalizedCode = code?.trim().toLowerCase();

  if (!normalizedCode) {
    return DEFAULT_API_ERROR_TRANSLATION_KEY;
  }

  // O código de erro vem do backend e não é enumerável em tempo de
  // compilação, então a chave montada aqui não é estaticamente
  // verificável. É seguro mesmo assim: o i18next nunca lança erro por
  // chave ausente — no pior caso, uma chave sem tradução correspondente
  // aparece literalmente na tela em vez de quebrar o app. Este é o único
  // cast deste arquivo.
  return `errors.${normalizedCode.replace(/[/-]/g, '_')}` as TranslationKey;
}

export function getAxiosErrorTranslationKey<T extends ApiErrorCodeResponse>(
  error: AxiosError<T>
): TranslationKey {
  if (error.code === 'ECONNABORTED') {
    return 'errors.network.timeout';
  }

  if (!error.response) {
    return 'errors.network.offline';
  }

  return getApiErrorTranslationKey(error.response.data?.code);
}