// apps/api/src/middlewares/errorHandler.ts
// Middleware global de tratamento de erros — deve ser o ÚLTIMO middleware registrado.
// Captura qualquer erro não tratado e retorna resposta JSON padronizada.

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import {
  DEFAULT_ERROR_CODE,
  DEFAULT_ERROR_MESSAGE,
  type ApiError,
} from '../utils/error.utils';

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev = env.NODE_ENV === 'development';
  const code = err.code ?? DEFAULT_ERROR_CODE;
  const message = err.message || DEFAULT_ERROR_MESSAGE;

  res.status(statusCode).json({
    success: false,
    code,
    message,
    // Stack trace apenas em desenvolvimento — nunca exponha em produção
    ...(isDev && { stack: err.stack }),
  });
}
