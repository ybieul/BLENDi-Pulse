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

/**
 * Mensagem genérica para erros não tratados explicitamente em produção.
 * Código dedicado ('unexpected-error', sem prefixo de domínio) para que o
 * mobile resolva a tradução via `errors.unexpected_error` — mesma convenção
 * flat de `code.replace(/[/-]/g, '_')` usada em todo o app
 * (`apps/mobile/src/utils/error.utils.ts`).
 */
const UNEXPECTED_ERROR_CODE = 'unexpected-error';
const UNEXPECTED_ERROR_MESSAGE = 'An unexpected error occurred.';

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev = env.NODE_ENV === 'development';

  // Erro "deliberado": foi construído com `code` explícito no formato
  // 'domínio/erro' (ex: buildInvalidTimezoneError → 'timezone/invalid') —
  // a mensagem já é controlada pelo time e segura para expor em qualquer
  // ambiente. Usamos só `code`, não `statusCode`, como critério: bibliotecas
  // de terceiros também setam `.statusCode` em seus próprios erros por
  // convenção (ex: o `SyntaxError` do body-parser em JSON malformado tem
  // `.statusCode = 400`, mas não é um erro nosso) — usar `statusCode` como
  // critério classificaria esse caso como "deliberado" e vazaria a mensagem
  // crua da biblioteca mesmo em produção, exatamente o problema que esta
  // tarefa resolve. `code`, por outro lado, só é setado por código nosso
  // (nenhuma dependência do projeto usa essa convenção de nomenclatura).
  // Erro "não deliberado": exceção genérica não tratada por um controller
  // (erro de biblioteca, bug de código, falha de conexão do Mongoose) — a
  // mensagem original pode conter detalhe interno e só deve vazar em
  // desenvolvimento, para facilitar debug.
  const isDeliberate = err.code !== undefined;

  const code = isDeliberate ? (err.code ?? DEFAULT_ERROR_CODE) : isDev ? DEFAULT_ERROR_CODE : UNEXPECTED_ERROR_CODE;
  const message = isDeliberate || isDev
    ? err.message || DEFAULT_ERROR_MESSAGE
    : UNEXPECTED_ERROR_MESSAGE;

  res.status(statusCode).json({
    success: false,
    code,
    message,
    // Stack trace apenas em desenvolvimento — nunca exponha em produção
    ...(isDev && { stack: err.stack }),
  });
}
