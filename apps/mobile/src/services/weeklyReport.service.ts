import axios from 'axios';
import type { WeeklyReportSummary } from '@blendi/shared';

import { api } from '../config/api';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

export interface WeeklyReportEmptyState {
  hasReport: false;
  nextReportDate: string;
}

export interface WeeklyReportWithFlag extends WeeklyReportSummary {
  hasReport: true;
}

export type LatestWeeklyReport = WeeklyReportEmptyState | WeeklyReportWithFlag;

interface LatestReportApiResponse {
  success: true;
  data: LatestWeeklyReport;
}

interface ReportByWeekApiResponse {
  success: true;
  data: WeeklyReportSummary;
}

interface ReportDatesApiResponse {
  success: true;
  data: {
    dates: string[];
  };
}

export class WeeklyReportServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'WeeklyReportServiceError';
  }
}

function toWeeklyReportServiceError(error: unknown): WeeklyReportServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return new WeeklyReportServiceError(
      error.response?.data?.message ?? error.message,
      getAxiosErrorTranslationKey(error),
      error.response?.data?.code
    );
  }

  return new WeeklyReportServiceError(
    'Unexpected weekly report service error.',
    'errors.network_internal_server_error'
  );
}

export async function getLatestReport(): Promise<LatestWeeklyReport> {
  try {
    const response = await api.get<LatestReportApiResponse>('/weekly-reports/latest');
    return response.data.data;
  } catch (error) {
    throw toWeeklyReportServiceError(error);
  }
}

export async function getReportByWeek(weekStartDate: string): Promise<WeeklyReportSummary> {
  try {
    const response = await api.get<ReportByWeekApiResponse>('/weekly-reports', {
      params: { weekStart: weekStartDate },
    });
    return response.data.data;
  } catch (error) {
    throw toWeeklyReportServiceError(error);
  }
}

export async function getAllReportDates(): Promise<string[]> {
  try {
    const response = await api.get<ReportDatesApiResponse>('/weekly-reports/dates');
    return response.data.data.dates;
  } catch (error) {
    throw toWeeklyReportServiceError(error);
  }
}
