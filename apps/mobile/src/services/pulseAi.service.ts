import axios from 'axios';
import type { PulseAiChatInput, PulseAiRecipe } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

const PULSE_AI_ERROR_TRANSLATION_KEYS = {
  'pulseai/daily-limit-reached': 'errors.pulseai_daily_limit',
  'pulseai/ai-unavailable': 'errors.pulseai_unavailable',
  'pulseai/invalid-message': 'errors.pulseai_invalid_message',
} as const;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface PulseAiChatResponse {
  success: true;
  data: {
    recipe: PulseAiRecipe;
    fromCache: boolean;
    usageRemaining: number | null;
  };
}

interface PulseAiUsageResponse {
  success: true;
  data: {
    dailyAiUsage: number;
    isPro: boolean;
  };
}

export interface PulseAiChatResult {
  recipe: PulseAiRecipe;
  fromCache: boolean;
  usageRemaining: number | null;
}

export interface PulseAiUsage {
  dailyAiUsage: number;
  isPro: boolean;
}

export class PulseAiServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'PulseAiServiceError';
  }
}

function mapPulseAiErrorTranslationKey(code?: string | null): string {
  const normalizedCode = code?.trim().toLowerCase();

  if (!normalizedCode) {
    return 'errors.network_internal_server_error';
  }

  return (
    PULSE_AI_ERROR_TRANSLATION_KEYS[
      normalizedCode as keyof typeof PULSE_AI_ERROR_TRANSLATION_KEYS
    ] ?? getApiErrorTranslationKey(normalizedCode)
  );
}

function toPulseAiServiceError(error: unknown): PulseAiServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    return new PulseAiServiceError(
      error.response?.data?.message ?? error.message,
      mapPulseAiErrorTranslationKey(apiCode),
      apiCode,
    );
  }

  return new PulseAiServiceError(
    'Unexpected Pulse AI service error.',
    'errors.network_internal_server_error',
  );
}

export async function sendMessage(
  message: PulseAiChatInput['message']
): Promise<PulseAiChatResult> {
  const payload: PulseAiChatInput = { message };

  try {
    const response = await api.post<PulseAiChatResponse>('/pulse-ai/chat', payload);
    return response.data.data;
  } catch (error) {
    throw toPulseAiServiceError(error);
  }
}

export async function getUsage(): Promise<PulseAiUsage> {
  try {
    const response = await api.get<PulseAiUsageResponse>('/pulse-ai/usage');
    return response.data.data;
  } catch (error) {
    throw toPulseAiServiceError(error);
  }
}