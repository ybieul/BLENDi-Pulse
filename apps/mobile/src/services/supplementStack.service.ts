import axios, { type AxiosError } from 'axios';
import { calculateLevel } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { handleXPResponse } from '../utils/xp.utils';

 void calculateLevel;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface SupplementStackResponse {
  success: true;
  data: {
    stack: SupplementStackItem[];
  };
}

interface SupplementCheckResponse {
  success: true;
  data: {
    log: SupplementCheckLog;
    xpAwarded: number;
  };
}

interface SupplementDeleteResponse {
  success: true;
  data: {
    message: string;
  };
}

const SUPPLEMENT_STACK_ERROR_TRANSLATION_KEYS = {
  'auth/unauthorized': 'errors.auth_unauthorized',
  'resource/not-found': 'errors.resource_not_found',
  'supplement/not-found': 'errors.supplement_not_found',
  'supplement-log/not-found': 'errors.supplement_log_not_found',
  'validation/invalid-input': 'errors.validation_invalid_input',
} as const;

export interface SupplementStackItem {
  supplementId: string;
  name: string;
  dosage: string;
  timing: 'morning' | 'preWorkout' | 'postWorkout' | 'evening' | 'withMeal';
  isActive: boolean;
  order: number;
  dailyTargetCount?: number;
  consumedTodayCount?: number;
  checkedToday?: boolean;
  checkedAt?: string | null;
}

export interface SupplementCheckLog {
  id: string;
  supplementId: string;
  supplementName: string;
  logDate: string;
  consumedCount: number;
  createdAt: string;
}

export class SupplementStackServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'SupplementStackServiceError';
  }
}

function mapSupplementStackErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
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

  return SUPPLEMENT_STACK_ERROR_TRANSLATION_KEYS[
    normalizedCode as keyof typeof SUPPLEMENT_STACK_ERROR_TRANSLATION_KEYS
  ] ?? getApiErrorTranslationKey(normalizedCode);
}

function toSupplementStackServiceError(error: unknown): SupplementStackServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new SupplementStackServiceError(
      error.response?.data?.message ?? error.message,
      mapSupplementStackErrorTranslationKey(error),
      apiCode,
    );
  }

  return new SupplementStackServiceError(
    'Unexpected supplement stack service error.',
    'errors.network_internal_server_error',
  );
}

export async function getStack(): Promise<SupplementStackItem[]> {
  try {
    const response = await api.get<SupplementStackResponse>('/supplement-stack');
    return response.data.data.stack;
  } catch (error) {
    throw toSupplementStackServiceError(error);
  }
}

export async function updateStack(stack: SupplementStackItem[]): Promise<SupplementStackItem[]> {
  try {
    const response = await api.put<SupplementStackResponse>('/supplement-stack', stack);
    return response.data.data.stack;
  } catch (error) {
    throw toSupplementStackServiceError(error);
  }
}

export async function checkSupplement(supplementId: string): Promise<SupplementCheckLog> {
  try {
    const response = await api.post<SupplementCheckResponse>(
      `/supplement-stack/${encodeURIComponent(supplementId)}/check`
    );

    handleXPResponse(response.data.data);
    return response.data.data.log;
  } catch (error) {
    throw toSupplementStackServiceError(error);
  }
}

export async function uncheckSupplement(supplementId: string): Promise<void> {
  try {
    await api.delete<SupplementDeleteResponse>(
      `/supplement-stack/${encodeURIComponent(supplementId)}/check`
    );
  } catch (error) {
    throw toSupplementStackServiceError(error);
  }
}

export async function deleteFromStack(supplementId: string): Promise<SupplementStackItem[]> {
  try {
    const response = await api.delete<SupplementStackResponse>(
      `/supplement-stack/${encodeURIComponent(supplementId)}`
    );

    return response.data.data.stack;
  } catch (error) {
    throw toSupplementStackServiceError(error);
  }
}