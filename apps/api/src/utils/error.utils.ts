import type { Response } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export interface SendErrorResponseOptions {
  statusCode: number;
  code: string;
  message: string;
  errors?: unknown;
}

export const DEFAULT_ERROR_CODE = 'network/internal-server-error';
export const DEFAULT_ERROR_MESSAGE = 'Internal server error.';
export const VALIDATION_ERROR_CODE = 'validation/invalid-input';
export const VALIDATION_ERROR_MESSAGE = 'Validation failed.';

export function sendErrorResponse(
  res: Response,
  { statusCode, code, message, errors }: SendErrorResponseOptions
): void {
  res.status(statusCode).json({
    success: false,
    code,
    message,
    ...(errors !== undefined && { errors }),
  });
}