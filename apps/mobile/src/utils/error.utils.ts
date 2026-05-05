const DEFAULT_API_ERROR_TRANSLATION_KEY = 'errors.network_internal_server_error';

export function getApiErrorTranslationKey(code?: string | null): string {
  const normalizedCode = code?.trim().toLowerCase();

  if (!normalizedCode) {
    return DEFAULT_API_ERROR_TRANSLATION_KEY;
  }

  return `errors.${normalizedCode.replace(/[/-]/g, '_')}`;
}