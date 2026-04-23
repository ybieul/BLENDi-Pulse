// apps/api/src/middlewares/requestLogger.ts
// Logger de requisições para ambiente de desenvolvimento.
// Exibe: método, rota, status code e tempo de resposta.

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const METHOD_COLORS: Record<string, string> = {
  GET: '\x1b[32m',     // verde
  POST: '\x1b[34m',    // azul
  PUT: '\x1b[33m',     // amarelo
  PATCH: '\x1b[33m',   // amarelo
  DELETE: '\x1b[31m',  // vermelho
};

const RESET = '\x1b[0m';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'development') return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const color = METHOD_COLORS[req.method] ?? RESET;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';

    console.log(
      `${color}${req.method}${RESET} ${req.path} ` +
      `${statusColor}${res.statusCode}${RESET} ` +
      `\x1b[90m${duration}ms${RESET}`
    );
  });

  next();
}
