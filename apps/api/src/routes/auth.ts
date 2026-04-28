// apps/api/src/routes/auth.ts

import { Router, type IRouter } from 'express';
import {
  register,
  login,
  refresh,
  updateTimezone,
} from '../controllers/auth.controller';
import {
  getGoogleUrl,
  handleGoogleCallback,
} from '../controllers/google.controller';
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

/**
 * GET /auth/google/url
 * Retorna a URL de autorização do Google para o app mobile abrir no browser.
 * O app abre essa URL via expo-auth-session ou Linking.openURL.
 * Resposta: { success: true, data: { url: string } }
 */
authRouter.get('/google/url', getGoogleUrl);

/**
 * GET /auth/google/callback
 * Endpoint de redirecionamento registrado no Google Cloud Console.
 * Recebe o código de autorização após o usuário aprovar no browser do Google.
 * Query params: code (obrigatório), state (CSRF), error (se o usuário cancelou)
 */
authRouter.get('/google/callback', handleGoogleCallback);
