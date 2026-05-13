import axios, { type AxiosError } from 'axios';
import type { CreateBlendLogInput } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface CreateBlendLogResponse {
  success: true;
  data: CreateBlendLogResult;
}

interface GetTodayLogsResponse {
  success: true;
  data: BlendLogsTodayData;
}

export interface BlendLogEntry {
  id: string;
  recipeName: string | null;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  blendiModel: 'Lite' | 'ProPlus' | 'Steel';
  durationSeconds: number;
  rating?: number;
  createdAt: string;
}

export interface CreateBlendLogResult {
  log: BlendLogEntry;
  currentStreak: number;
  blendCount: number;
  totalBlends: number;
}

export interface BlendLogsTodayData {
  totalProtein: number;
  totalCarbs: number;
  totalCalories: number;
  blendCount: number;
  logs: BlendLogEntry[];
}

const BLEND_LOG_ERROR_TRANSLATION_KEYS = {
  'validation/invalid-input': 'errors.validation_invalid_input',
  'auth/unauthorized': 'errors.auth_unauthorized',
  'resource/not-found': 'errors.resource_not_found',
} as const;

export class BlendLogServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'BlendLogServiceError';
  }
}

function mapBlendLogErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
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

  return BLEND_LOG_ERROR_TRANSLATION_KEYS[
    normalizedCode as keyof typeof BLEND_LOG_ERROR_TRANSLATION_KEYS
  ] ?? getApiErrorTranslationKey(normalizedCode);
}

function toBlendLogServiceError(error: unknown): BlendLogServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new BlendLogServiceError(
      error.response?.data?.message ?? error.message,
      mapBlendLogErrorTranslationKey(error),
      apiCode,
    );
  }

  return new BlendLogServiceError(
    'Unexpected blend log service error.',
    'errors.network_internal_server_error',
  );
}

export async function createBlendLog(input: CreateBlendLogInput): Promise<CreateBlendLogResult> {
  try {
    const response = await api.post<CreateBlendLogResponse>('/blend-logs', input);
    return response.data.data;
  } catch (error) {
    throw toBlendLogServiceError(error);
  }
}

export async function getTodayLogs(): Promise<BlendLogsTodayData> {
  try {
    const response = await api.get<GetTodayLogsResponse>('/blend-logs/today');
    return response.data.data;
  } catch (error) {
    throw toBlendLogServiceError(error);
  }
}