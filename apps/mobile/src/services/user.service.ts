import axios, { type AxiosError } from 'axios';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface MarkCleanedResponse {
  success: true;
  data: {
    user: {
      id: string;
      lastCleanedAt: string | null;
      updatedAt: string;
    };
  };
}

const USER_ERROR_TRANSLATION_KEYS = {
  'auth/unauthorized': 'errors.auth_unauthorized',
  'resource/not-found': 'errors.resource_not_found',
} as const;

export class UserServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

function mapUserErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
  if (error.code === 'ECONNABORTED') {
    return 'errors.network.timeout';
  }

  if (!error.response) {
    return 'errors.network.offline';
  }

  const normalizedCode = error.response.data?.code?.trim().toLowerCase();

  if (!normalizedCode) {
    return 'errors.network_internal_server_error';
  }

  return USER_ERROR_TRANSLATION_KEYS[
    normalizedCode as keyof typeof USER_ERROR_TRANSLATION_KEYS
  ] ?? getApiErrorTranslationKey(normalizedCode);
}

function toUserServiceError(error: unknown): UserServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new UserServiceError(
      error.response?.data?.message ?? error.message,
      mapUserErrorTranslationKey(error),
      apiCode,
    );
  }

  return new UserServiceError(
    'Unexpected user service error.',
    'errors.network_internal_server_error',
  );
}

export async function markCleaned(): Promise<string | null> {
  try {
    const response = await api.patch<MarkCleanedResponse>('/users/me/cleaned');
    return response.data.data.user.lastCleanedAt;
  } catch (error) {
    throw toUserServiceError(error);
  }
}