// apps/api/src/middlewares/authenticate.ts
// Middleware de autenticação via JWT (Access Token).
// Deve ser usado como guard em todas as rotas protegidas.
//
// Uso:
//   router.get('/me', authenticate, meController)
//
// Após executado com sucesso, `req.user` contém o payload decodificado:
//   { sub: userId, email, iat, exp }

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenExpiredError } from '../services/auth.service';
import { sendErrorResponse } from '../utils/error.utils';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // 1. Extrair token do header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendErrorResponse(res, {
      statusCode: 401,
      code: 'auth/unauthorized',
      message: 'Unauthorized.',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  // 2. Verificar e decodificar
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    // Token expirado → orientar o cliente a usar o refresh token
    if (isTokenExpiredError(err)) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/session-expired',
        message: 'Session expired.',
      });
      return;
    }

    // Token inválido/adulterado
    sendErrorResponse(res, {
      statusCode: 401,
      code: 'auth/unauthorized',
      message: 'Unauthorized.',
    });
  }
}
