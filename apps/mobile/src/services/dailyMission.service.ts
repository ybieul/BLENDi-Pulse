import axios, { type AxiosError } from 'axios';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

export interface DailyMissionItem {
  missionId: string;
  type: string;
  titleKey: string;
  descriptionKey: string;
  requirement: number;
  progress: number;
  completed: boolean;
  xpReward: number;
}

export interface DailyMissionData {
  missionDate: string;
  missions: DailyMissionItem[];
  bonusAwarded: boolean;
  xpAvailable: number;
  completedCount: number;
  createdAt: string;
}

interface DailyMissionResponse {
  success: true;
  data: {
    dailyMission: DailyMissionData;
  };
}

export class DailyMissionServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'DailyMissionServiceError';
  }
}

function mapDailyMissionErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
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

  return getApiErrorTranslationKey(normalizedCode);
}

function toDailyMissionServiceError(error: unknown): DailyMissionServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;

    return new DailyMissionServiceError(
      error.response?.data?.message ?? error.message,
      mapDailyMissionErrorTranslationKey(error),
      apiCode,
    );
  }

  return new DailyMissionServiceError(
    'Unexpected daily mission service error.',
    'errors.network_internal_server_error',
  );
}

export async function getDailyMissions(): Promise<DailyMissionData> {
  try {
    const response = await api.get<DailyMissionResponse>('/daily-missions');
    return response.data.data.dailyMission;
  } catch (error) {
    throw toDailyMissionServiceError(error);
  }
}
