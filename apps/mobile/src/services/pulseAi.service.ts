import axios from 'axios';
import {
  AI_CLIENT_TIMEOUT_MS,
  PULSE_AI_ALLERGY_CONFIRMATION_REQUIRED_CODE,
  calculateLevel,
  type AllergenSelection,
  type PulseAiAgeConfirmationInput,
  type PulseAiChatInput,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from '@blendi/shared';

import { api } from '../config/api';
import { trackEvent } from './analytics.service';
import i18n from '../locales/i18n';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { readAllergensFromErrorData } from '../utils/allergies.utils';
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
  // CP-1.1.9: a receita passou do limite de volume do copo (CP-B2: só volume) mesmo
  // após o retry e foi barrada no backend.
  'pulseai/blender-limit-unmet': 'errors.pulseai_blender_limit_unmet',
  // CP-1.1.4a: desbloqueio de prévia — expirada/inexistente e ainda não Pro.
  'pulseai/preview-not-found': 'errors.pulseai_preview_expired',
  'pulseai/preview-locked': 'errors.pulseai_preview_locked',
  // CP-B5: o pedido tem bebida alcoólica e a conta não tem idade conhecida.
  // A tela mostra a confirmação única em vez desta mensagem.
  'pulseai/age-confirmation-required': 'errors.pulseai_age_confirmation_required',
  // CP-B6: a mensagem nomeia um alérgeno cadastrado. A tela mostra a folha
  // de confirmação em vez desta mensagem.
  'pulseai/allergy-confirmation-required': 'errors.pulseai_allergy_confirmation_required',
} as const satisfies Record<string, TranslationKey>;

/** CP-B6: código do backend que pede a confirmação de alergia (por requisição). */
export const ALLERGY_CONFIRMATION_REQUIRED_CODE = PULSE_AI_ALLERGY_CONFIRMATION_REQUIRED_CODE;

/** CP-B5: código do backend que pede a confirmação única de idade. */
export const AGE_CONFIRMATION_REQUIRED_CODE = 'pulseai/age-confirmation-required';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
  data?: unknown;
}

interface PulseAiChatResponse {
  success: true;
  data: PulseAiRecipeResult | PulseAiLockedPreviewResult;
}

interface PulseAiUnlockPreviewResponse {
  success: true;
  data: PulseAiUnlockedPreview;
}

interface PulseAiAgeConfirmationResponse {
  success: true;
  data: { alcoholAgeConfirmed: boolean };
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
    public readonly apiCode?: string,
    /** CP-B6: alérgenos citados no 428 de alergia (validados pelo schema do shared). */
    public readonly allergens?: AllergenSelection
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
    // CP-B2: tempo esgotado no app vira a mensagem de timeout (como no Pantry),
    // não o erro genérico de servidor.
    const translationKey = error.code === 'ECONNABORTED'
      ? 'errors.network.timeout'
      : mapPulseAiErrorTranslationKey(apiCode);

    return new PulseAiServiceError(
      error.response?.data?.message ?? error.message,
      translationKey,
      apiCode,
      apiCode === ALLERGY_CONFIRMATION_REQUIRED_CODE ? readAllergensFromErrorData(error.response?.data?.data) : undefined,
    );
  }

  return new PulseAiServiceError(
    'Unexpected Pulse AI service error.',
    'errors.network_internal_server_error',
  );
}

/** CP-B6: resposta da folha de alergia para ESTA mensagem (nunca gravada). */
export interface SendMessageAllergyChoice {
  allergyOverride?: AllergenSelection;
  allergyDeclined?: AllergenSelection;
}

export async function sendMessage(
  message: PulseAiChatInput['message'],
  allergyChoice: SendMessageAllergyChoice = {}
): Promise<PulseAiChatResult> {
  const currentLanguage = i18n.language;
  const payload: PulseAiChatInput = {
    message,
    ...(currentLanguage === 'en' || currentLanguage === 'pt-BR'
      ? { language: currentLanguage }
      : {}),
    ...(allergyChoice.allergyOverride ? { allergyOverride: allergyChoice.allergyOverride } : {}),
    ...(allergyChoice.allergyDeclined ? { allergyDeclined: allergyChoice.allergyDeclined } : {}),
  };

  try {
    // CP-B1: a resposta pode levar mais que os 10 s do axios (novas tentativas
    // e sobrecarga do Gemini); o app espera o teto do servidor + folga (só
    // nesta rota).
    const response = await api.post<PulseAiChatResponse>('/pulse-ai/chat', payload, {
      timeout: AI_CLIENT_TIMEOUT_MS.pulseAiChat,
    });
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

/**
 * CP-B5: grava a resposta única "Tenho 21 anos ou mais" / "Não". O backend
 * nunca sobrescreve uma resposta já gravada e devolve a que ficou valendo.
 * Não gasta mensagem do Pulse AI; o app reenvia o pedido depois.
 */
export async function confirmAlcoholAge(isAdult: boolean): Promise<boolean> {
  const payload: PulseAiAgeConfirmationInput = { isAdult };

  try {
    const response = await api.post<PulseAiAgeConfirmationResponse>('/pulse-ai/age-confirmation', payload);
    return response.data.data.alcoholAgeConfirmed;
  } catch (error) {
    throw toPulseAiServiceError(error);
  }
}
