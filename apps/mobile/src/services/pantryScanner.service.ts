import axios from 'axios';
import { Image } from 'react-native';
import {
  SaveFormat,
  manipulateAsync,
} from 'expo-image-manipulator';
import {
  pantryAnalysisResultSchema,
  type PantryAnalysisResult,
  type PantryScanInput,
} from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

const MAX_IMAGE_DIMENSION = 1024;
const IMAGE_COMPRESSION_QUALITY = 0.7;
const OUTPUT_MIME_TYPE = 'image/jpeg';

const PANTRY_SCANNER_ERROR_TRANSLATION_KEYS = {
  'scanner/monthly-limit-reached': 'errors.scanner_monthly_limit_reached',
  'scanner/invalid-image': 'errors.scanner_invalid_image',
  'scanner/vision-parse-error': 'errors.scanner_vision_parse_error',
  'scanner/vision-unavailable': 'errors.scanner_vision_unavailable',
} as const;

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface PantryScannerAnalyzeResponse {
  success: true;
  data: PantryAnalysisResult;
}

interface LocalImageSize {
  width: number;
  height: number;
}

export class PantryScannerServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'PantryScannerServiceError';
  }
}

export class PantryScannerImageCompressionError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string
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
        reject(error);
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

function mapPantryScannerErrorTranslationKey(apiCode?: string | null): string {
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
): Promise<PantryAnalysisResult> {
  try {
    const response = await api.post<PantryScannerAnalyzeResponse>(
      '/pantry-scanner/analyze',
      {
        imageBase64,
        mimeType,
      }
    );

    return pantryAnalysisResultSchema.parse(response.data.data);
  } catch (error) {
    throw toPantryScannerServiceError(error);
  }
}