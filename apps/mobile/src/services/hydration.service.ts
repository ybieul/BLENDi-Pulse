// apps/mobile/src/services/hydration.service.ts
// Serviço de hidratação — registra consumo de água no backend.
//
// Mantido separado do auth.service.ts para seguir o mesmo padrão de um
// arquivo por domínio adotado no resto da camada de serviços.

import axios, { type AxiosError } from 'axios';
import { calculateLevel } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { handleMissionResponse, handleXPResponse } from '../utils/xp.utils';

 void calculateLevel;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

// ─── Tipos de resposta ────────────────────────────────────────────────────────

export interface HydrationLogEntry {
  id: string;
  amountMl: number;
  createdAt: string;
}

export interface LogWaterResponse {
  success: true;
  data: {
    log: HydrationLogEntry;
    totalMl: number;
    goalMl: number;
    xpAwarded: number;
    missionsUpdated?: string[];
  };
}

export interface HydrationTodayResponse {
  success: true;
  data: {
    totalMl: number;
    goalMl: number;
    logs: HydrationLogEntry[];
  };
}

export interface HydrationHistoryDailyBreakdownItem {
  date: string;
  totalMl: number;
}

export interface HydrationHistoryData {
  logs: HydrationLogEntry[];
  summary: {
    totalMl: number;
    averageDailyMl: number;
  };
  dailyBreakdown: HydrationHistoryDailyBreakdownItem[];
  dailyHydrationTarget: number;
  total: number;
  page: number;
  totalPages: number;
}

interface HydrationHistoryResponse {
  success: true;
  data: HydrationHistoryData;
}

const HYDRATION_ERROR_TRANSLATION_KEYS = {
  'auth/unauthorized': 'errors.auth_unauthorized',
  'resource/not-found': 'errors.resource_not_found',
  'validation/invalid-input': 'errors.validation_invalid_input',
} as const;

export class HydrationServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'HydrationServiceError';
  }
}

function mapHydrationErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
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

  return HYDRATION_ERROR_TRANSLATION_KEYS[
    normalizedCode as keyof typeof HYDRATION_ERROR_TRANSLATION_KEYS
  ] ?? getApiErrorTranslationKey(normalizedCode);
}

function toHydrationServiceError(error: unknown): HydrationServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new HydrationServiceError(
      error.response?.data?.message ?? error.message,
      mapHydrationErrorTranslationKey(error),
      apiCode,
    );
  }

  return new HydrationServiceError(
    'Unexpected hydration service error.',
    'errors.network_internal_server_error',
  );
}

// ─── Funções do serviço ───────────────────────────────────────────────────────

/**
 * Registra um consumo de água no backend.
 *
 * @param amountMl - Volume em mililitros (padrão: 250 ml por copo)
 */
export async function logWater(amountMl: number = 250): Promise<LogWaterResponse> {
  try {
    const response = await api.post<LogWaterResponse>('/hydration-logs', { amountMl });
    handleXPResponse(response.data.data);
    handleMissionResponse(response.data.data);
    return response.data;
  } catch (error) {
    throw toHydrationServiceError(error);
  }
}

/**
 * Busca o total de água consumida hoje.
 * Usado como queryFn da query QUERY_KEYS.hydrationToday.
 */
export async function getHydrationToday(): Promise<HydrationTodayResponse> {
  try {
    const response = await api.get<HydrationTodayResponse>('/hydration-logs/today');
    return response.data;
  } catch (error) {
    throw toHydrationServiceError(error);
  }
}

export async function getHydrationHistory(
  from: string,
  to: string,
  page: number = 1,
  limit: number = 30
): Promise<HydrationHistoryData> {
  try {
    const response = await api.get<HydrationHistoryResponse>('/hydration-logs/history', {
      params: {
        from,
        to,
        page,
        limit,
      },
    });

    return response.data.data;
  } catch (error) {
    throw toHydrationServiceError(error);
  }
}
