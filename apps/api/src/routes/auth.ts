// apps/api/src/routes/auth.ts

import { Router, type IRouter } from 'express';
import { register, login, refresh } from '../controllers/auth.controller';

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
