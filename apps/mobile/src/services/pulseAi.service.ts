import axios from 'axios';
import {
  calculateLevel,
  type PulseAiChatInput,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from '@blendi/shared';

import { api } from '../config/api';
import { trackEvent } from './analytics.service';
import i18n from '../locales/i18n';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { handleMissionResponse, handleXPResponse } from '../utils/xp.utils';
import type { TranslationKey } from '../locales/i18n';

 void calculateLevel;

const PULSE_AI_ERROR_TRANSLATION_KEYS = {
  'pulseai/daily-limit-reached': 'errors.pulseai_daily_limit',
  'pulseai/ai-unavailable': 'errors.pulseai_unavailable',
  'pulseai/invalid-message': 'errors.pulseai_invalid_message',
  // CP-1.1.1c: a receita violou a dieta (ou trouxe gelo para o Lite) mesmo
  // após o retry e foi barrada no backend.
  'pulseai/dietary-restriction-unmet': 'errors.pulseai_dietary_restriction_unmet',
  // CP-1.1.4a: desbloqueio de prévia — expirada/inexistente e ainda não Pro.
  'pulseai/preview-not-found': 'errors.pulseai_preview_expired',
  'pulseai/preview-locked': 'errors.pulseai_preview_locked',
} as const satisfies Record<string, TranslationKey>;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface PulseAiChatResponse {
  success: true;
  data: PulseAiRecipeResult | PulseAiLockedPreviewResult;
}

interface PulseAiUnlockPreviewResponse {
  success: true;
  data: PulseAiUnlockedPreview;
}

interface PulseAiUsageResponse {
  success: true;
  data: {
    dailyAiUsage: number;
    isPro: boolean;
  };
}

export interface PulseAiRecipeResult {
  locked?: undefined;
  recipe: PulseAiRecipe;
  fromCache: boolean;
  usageRemaining: number | null;
  xpAwarded: number;
  missionsUpdated?: string[];
  conversationId: string;
  macrosValidated: boolean;
}

/**
 * CP-1.1.4a: usuário grátis passou das 3 mensagens e recebeu a prévia do dia.
 * O backend manda só nome e macros; ingredientes e passos ficam no servidor
 * até o desbloqueio (unlockPreview) de quem já é Pro.
 */
export interface PulseAiLockedPreviewResult {
  locked: true;
  previewId: string;
  previewExpiresAt: string;
  preview: PulseAiRecipePreview;
  usageRemaining: 0;
  conversationId: string;
}

export type PulseAiChatResult = PulseAiRecipeResult | PulseAiLockedPreviewResult;

export interface PulseAiUnlockedPreview {
  previewId: string;
  recipe: PulseAiRecipe;
  conversationId: string | null;
}

export interface PulseAiUsage {
  dailyAiUsage: number;
  isPro: boolean;
}

export class PulseAiServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: TranslationKey,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'PulseAiServiceError';
  }
}

function mapPulseAiErrorTranslationKey(code?: string | null): TranslationKey {
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
  const currentLanguage = i18n.language;
  const payload: PulseAiChatInput = {
    message,
    ...(currentLanguage === 'en' || currentLanguage === 'pt-BR'
      ? { language: currentLanguage }
      : {}),
  };

  try {
    const response = await api.post<PulseAiChatResponse>('/pulse-ai/chat', payload);
    const result = response.data.data;

    if (result.locked) {
      // Prévia não dá XP nem missão; o evento de analytics dela
      // (paywall_preview_shown) é disparado pela tela que mostra o card.
      return result;
    }

    handleXPResponse(result);
    handleMissionResponse(result);
    trackEvent('ai_message_sent', { fromCache: result.fromCache });
    return result;
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

/**
 * Desbloqueia uma prévia para quem já é Pro (o backend confere isPro no banco).
 * Erros: 'pulseai/preview-not-found' (expirada ou inexistente) e
 * 'pulseai/preview-locked' (ainda não Pro), mapeados para chaves próprias.
 */
export async function unlockPreview(previewId: string): Promise<PulseAiUnlockedPreview> {
  try {
    const response = await api.get<PulseAiUnlockPreviewResponse>(
      `/pulse-ai/previews/${encodeURIComponent(previewId)}`,
    );
    return response.data.data;
  } catch (error) {
    throw toPulseAiServiceError(error);
  }
}
