import axios from 'axios';
import { Image } from 'react-native';
import {
  SaveFormat,
  manipulateAsync,
} from 'expo-image-manipulator';
import {
  calculateLevel,
  pantryAnalysisResultSchema,
  pantryLockedPreviewResultSchema,
  pantryPreviewUnlockResultSchema,
  type PantryAnalysisResult,
  type PantryLockedPreviewResult,
  type PantryPreviewUnlockResult,
  type PantryScanInput,
} from '@blendi/shared';

import { api } from '../config/api';
import { trackEvent } from './analytics.service';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import { handleMissionResponse, handleXPResponse } from '../utils/xp.utils';
import type { TranslationKey } from '../locales/i18n';

 void calculateLevel;

const MAX_IMAGE_DIMENSION = 1024;
const IMAGE_COMPRESSION_QUALITY = 0.7;
const OUTPUT_MIME_TYPE = 'image/jpeg';

const PANTRY_SCANNER_ERROR_TRANSLATION_KEYS = {
  'scanner/monthly-limit-reached': 'errors.scanner_monthly_limit_reached',
  'scanner/invalid-image': 'errors.scanner_invalid_image',
  'scanner/vision-parse-error': 'errors.scanner_vision_parse_error',
  'scanner/vision-unavailable': 'errors.scanner_vision_unavailable',
  // CP-1.1.1c: todas as receitas violaram a dieta (ou trouxeram gelo para o
  // Lite) mesmo após o retry; o backend devolveu o scan.
  'scanner/dietary-restriction-unmet': 'errors.scanner_dietary_restriction_unmet',
  // CP-1.1.4b: desbloqueio da prévia — expirada/inexistente e ainda não Pro.
  'scanner/preview-not-found': 'errors.scanner_preview_expired',
  'scanner/preview-locked': 'errors.scanner_preview_locked',
} as const satisfies Record<string, TranslationKey>;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

/** CP-1.1.4b: código do desbloqueio para prévia expirada, inexistente ou de outro recurso. */
export const PANTRY_PREVIEW_NOT_FOUND_CODE = 'scanner/preview-not-found';

interface PantryScannerAnalyzeResponse {
  success: true;
  data:
    | (PantryAnalysisResult & {
        locked?: undefined;
        xpAwarded: number;
        missionsUpdated?: string[];
      })
    | PantryLockedPreviewResult;
}

interface PantryPreviewUnlockResponse {
  success: true;
  data: PantryPreviewUnlockResult;
}

/**
 * CP-1.1.4b: resultado de um scan. Prévia bloqueada (grátis, depois dos scans
 * do ciclo) traz `locked: true`, os ingredientes detectados e só os macros de
 * cada receita; o resto fica no servidor até o desbloqueio de quem é Pro.
 */
export type PantryScanResult = PantryAnalysisResult | PantryLockedPreviewResult;

export function isPantryLockedPreview(result: PantryScanResult): result is PantryLockedPreviewResult {
  return 'locked' in result && result.locked === true;
}

interface LocalImageSize {
  width: number;
  height: number;
}

export class PantryScannerServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: TranslationKey,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'PantryScannerServiceError';
  }
}

export class PantryScannerImageCompressionError extends Error {
  constructor(
    message: string,
    public readonly translationKey: TranslationKey
  ) {
    super(message);
    this.name = 'PantryScannerImageCompressionError';
  }
}

export type CompressAndEncodeImageResult =
  | {
      ok: true;
      imageBase64: string;
      mimeType: typeof OUTPUT_MIME_TYPE;
    }
  | {
      ok: false;
      error: PantryScannerImageCompressionError;
    };

function getImageSize(uri: string): Promise<LocalImageSize> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function getResizeDimensions({ width, height }: LocalImageSize): LocalImageSize {
  const largestDimension = Math.max(width, height);

  if (largestDimension <= MAX_IMAGE_DIMENSION) {
    return { width, height };
  }

  const scale = MAX_IMAGE_DIMENSION / largestDimension;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function mapPantryScannerErrorTranslationKey(apiCode?: string | null): TranslationKey {
  const normalizedCode = apiCode?.trim().toLowerCase();

  if (normalizedCode && normalizedCode in PANTRY_SCANNER_ERROR_TRANSLATION_KEYS) {
    return PANTRY_SCANNER_ERROR_TRANSLATION_KEYS[
      normalizedCode as keyof typeof PANTRY_SCANNER_ERROR_TRANSLATION_KEYS
    ];
  }

  return getApiErrorTranslationKey(apiCode);
}

function toPantryScannerServiceError(error: unknown): PantryScannerServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    const translationKey = error.code === 'ECONNABORTED'
      ? 'errors.network.timeout'
      : !error.response
        ? 'errors.network.offline'
        : mapPantryScannerErrorTranslationKey(apiCode);

    return new PantryScannerServiceError(
      error.response?.data?.message ?? error.message,
      translationKey,
      apiCode,
    );
  }

  return new PantryScannerServiceError(
    'Unexpected pantry scanner service error.',
    'errors.network_internal_server_error',
  );
}

export async function compressAndEncodeImage(
  uri: string
): Promise<CompressAndEncodeImageResult> {
  try {
    const imageSize = await getImageSize(uri);
    const targetSize = getResizeDimensions(imageSize);
    const manipulatedImage = await manipulateAsync(
      uri,
      [
        {
          resize: {
            width: targetSize.width,
            height: targetSize.height,
          },
        },
      ],
      {
        base64: true,
        compress: IMAGE_COMPRESSION_QUALITY,
        format: SaveFormat.JPEG,
      }
    );

    const imageBase64 = manipulatedImage.base64?.trim();

    if (!imageBase64) {
      return {
        ok: false,
        error: new PantryScannerImageCompressionError(
          'Image compression did not return base64 data.',
          'errors.scanner_image_processing_failed',
        ),
      };
    }

    return {
      ok: true,
      imageBase64,
      mimeType: OUTPUT_MIME_TYPE,
    };
  } catch (error) {
    return {
      ok: false,
      error: new PantryScannerImageCompressionError(
        error instanceof Error ? error.message : 'Failed to compress image.',
        'errors.scanner_image_processing_failed',
      ),
    };
  }
}

export async function analyzePantry(
  imageBase64: PantryScanInput['imageBase64'],
  mimeType: PantryScanInput['mimeType']
): Promise<PantryScanResult> {
  try {
    const response = await api.post<PantryScannerAnalyzeResponse>(
      '/pantry-scanner/analyze',
      {
        imageBase64,
        mimeType,
      }
    );

    // Prévia: sem XP, sem missão e sem pantry_scan_completed (que conta só
    // scans entregues de verdade). O schema estrito descarta qualquer campo a
    // mais; o paywall_preview_shown é disparado pela tela que mostra os cards.
    if (response.data.data.locked === true) {
      return pantryLockedPreviewResultSchema.parse(response.data.data);
    }

    handleXPResponse(response.data.data);
    handleMissionResponse(response.data.data);
    const result = pantryAnalysisResultSchema.parse(response.data.data);
    trackEvent('pantry_scan_completed');
    return result;
  } catch (error) {
    throw toPantryScannerServiceError(error);
  }
}

/**
 * CP-1.1.4b: desbloqueia a prévia do Pantry. O backend só devolve as receitas
 * para o dono que já é Pro (403 scanner/preview-locked caso contrário) e
 * responde 404 scanner/preview-not-found para expirada ou inexistente.
 */
export async function unlockPantryPreview(previewId: string): Promise<PantryPreviewUnlockResult> {
  try {
    const response = await api.get<PantryPreviewUnlockResponse>(
      `/pantry-scanner/previews/${encodeURIComponent(previewId)}`,
    );
    return pantryPreviewUnlockResultSchema.parse(response.data.data);
  } catch (error) {
    throw toPantryScannerServiceError(error);
  }
}
