// apps/api/src/routes/auth.ts

import { Router, type IRouter } from 'express';
import {
  register,
  login,
  refresh,
  updateTimezone,
  googleAuthUrl,
  googleCallback,
} from '../controllers/auth.controller';
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
 * GET /auth/google
 * Retorna a URL de autorização do Google para o app mobile abrir no browser.
 * O app abre essa URL via expo-auth-session ou Linking.openURL.
 * Resposta: { success: true, data: { url: string } }
 */
authRouter.get('/google', googleAuthUrl);

/**
 * GET /auth/google/callback
 * Endpoint de redirecionamento registrado no Google Cloud Console.
 * Recebe o código de autorização após o usuário aprovar no browser do Google.
 * Query params: code (obrigatório), state (CSRF), error (se o usuário cancelou)
 *
 * ⚠️  Parte 3 (mobile): adicionará redirect para deep link blendipulse://
 */
authRouter.get('/google/callback', googleCallback);
