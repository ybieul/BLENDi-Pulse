// apps/api/src/middlewares/errorHandler.ts
// Middleware global de tratamento de erros — deve ser o ÚLTIMO middleware registrado.
// Captura qualquer erro não tratado e retorna resposta JSON padronizada.

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev = env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Erro interno do servidor',
    // Stack trace apenas em desenvolvimento — nunca exponha em produção
    ...(isDev && { stack: err.stack }),
  });
}
