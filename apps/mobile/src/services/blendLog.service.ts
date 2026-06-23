import axios, { type AxiosError } from 'axios';
import { calculateLevel, type CreateBlendLogInput } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { handleMissionResponse, handleXPResponse } from '../utils/xp.utils';

 void calculateLevel;

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

interface GetBlendHistoryResponse {
  success: true;
  data: BlendHistoryData;
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
  longestStreak: number;
  blendCount: number;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number | null;
  totalBlends: number;
  missionsUpdated?: string[];
}

export interface BlendLogsTodayData {
  totalProtein: number;
  totalCarbs: number;
  totalCalories: number;
  blendCount: number;
  logs: BlendLogEntry[];
}

export interface BlendHistoryDailyBreakdownItem {
  date: string;
  count: number;
  protein: number;
  carbs: number;
  calories: number;
}

export interface BlendHistorySummary {
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCalories: number;
  blendCount: number;
  averageDailyProtein: number;
  averageDailyCalories: number;
}

export interface BlendHistoryData {
  logs: BlendLogEntry[];
  summary: BlendHistorySummary;
  dailyBreakdown: BlendHistoryDailyBreakdownItem[];
  total: number;
  page: number;
  totalPages: number;
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
    const result = response.data.data;
    handleXPResponse(result);
    handleMissionResponse(result);
    return result;
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

export async function getBlendHistory(
  from: string,
  to: string,
  page: number = 1,
  limit: number = 30
): Promise<BlendHistoryData> {
  try {
    const response = await api.get<GetBlendHistoryResponse>('/blend-logs/history', {
      params: {
        from,
        to,
        page,
        limit,
      },
    });

    return response.data.data;
  } catch (error) {
    throw toBlendLogServiceError(error);
  }
}