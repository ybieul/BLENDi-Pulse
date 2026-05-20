import axios, { type AxiosError } from 'axios';

import { api } from '../config/api';
import type { SupplementStackItem } from './supplementStack.service';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface SupplementHistoryResponse {
  success: true;
  data: SupplementHistoryData;
}

const SUPPLEMENT_HISTORY_ERROR_TRANSLATION_KEYS = {
  'auth/unauthorized': 'errors.auth_unauthorized',
  'resource/not-found': 'errors.resource_not_found',
  'validation/invalid-input': 'errors.validation_invalid_input',
} as const;

export interface SupplementHistoryDay {
  date: string;
  checkedSupplements: SupplementStackItem[];
  missedSupplements: SupplementStackItem[];
  adherenceRate: number;
}

export interface SupplementHistoryData {
  history: SupplementHistoryDay[];
  summary: {
    averageAdherence: number;
  };
}

export class SupplementLogServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'SupplementLogServiceError';
  }
}

function mapSupplementHistoryErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
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

  return SUPPLEMENT_HISTORY_ERROR_TRANSLATION_KEYS[
    normalizedCode as keyof typeof SUPPLEMENT_HISTORY_ERROR_TRANSLATION_KEYS
  ] ?? getApiErrorTranslationKey(normalizedCode);
}

function toSupplementLogServiceError(error: unknown): SupplementLogServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new SupplementLogServiceError(
      error.response?.data?.message ?? error.message,
      mapSupplementHistoryErrorTranslationKey(error),
      apiCode,
    );
  }

  return new SupplementLogServiceError(
    'Unexpected supplement history service error.',
    'errors.network_internal_server_error',
  );
}

export async function getSupplementHistory(
  from: string,
  to: string,
  page: number = 1,
  limit: number = 30
): Promise<SupplementHistoryData> {
  try {
    const response = await api.get<SupplementHistoryResponse>('/supplement-logs/history', {
      params: {
        from,
        to,
        page,
        limit,
      },
    });

    return response.data.data;
  } catch (error) {
    throw toSupplementLogServiceError(error);
  }
}