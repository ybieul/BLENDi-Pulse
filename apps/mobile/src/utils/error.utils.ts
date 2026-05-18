import type { AxiosError } from 'axios';

const DEFAULT_API_ERROR_TRANSLATION_KEY = 'errors.network_internal_server_error';

interface ApiErrorCodeResponse {
  code?: string | null;
}

export function getApiErrorTranslationKey(code?: string | null): string {
  const normalizedCode = code?.trim().toLowerCase();

  if (!normalizedCode) {
    return DEFAULT_API_ERROR_TRANSLATION_KEY;
  }

  return `errors.${normalizedCode.replace(/[/-]/g, '_')}`;
}

export function getAxiosErrorTranslationKey<T extends ApiErrorCodeResponse>(
  error: AxiosError<T>
): string {
  if (error.code === 'ECONNABORTED') {
    return 'errors.network.timeout';
  }

  if (!error.response) {
    return 'errors.network.offline';
  }

  return getApiErrorTranslationKey(error.response.data?.code);
}