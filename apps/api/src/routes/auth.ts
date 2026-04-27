// apps/api/src/routes/auth.ts

import { Router, type IRouter } from 'express';
import { register, login, refresh, updateTimezone } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';

export const authRouter: IRouter = Router();

/**
 * POST /auth/register
 * Cria um novo usuário. Body: RegisterInput (ver packages/shared/src/schemas/auth.ts)
 */
authRouter.post('/register', register);

/**
 * POST /auth/login
 * Autentica um usuário existente. Body: LoginInput
 */
authRouter.post('/login', login);

/**
 * POST /auth/refresh
 * Refresh Token Rotation — retorna novo par de tokens. Body: { refreshToken }
 */
authRouter.post('/refresh', refresh);

/**
 * PATCH /auth/timezone  🔒 autenticado
 * Atualiza o timezone IANA do usuário. Body: { timezone: string }
 * Chamado automaticamente pelo app quando detecta divergência de timezone.
 */
authRouter.patch('/timezone', authenticate, updateTimezone);
