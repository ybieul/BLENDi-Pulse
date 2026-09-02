// apps/api/src/routes/auth.ts

import { Router, type IRouter } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  updateTimezone,
} from '../controllers/auth.controller';
import {
  getGoogleUrl,
  handleGoogleCallback,
} from '../controllers/google.controller';
import {
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/password.controller';
import { authenticate } from '../middlewares/authenticate';
import { authLoginLimiter, authRegisterLimiter } from '../middlewares/rateLimiter';

export const authRouter: IRouter = Router();

/**
 * POST /auth/register  🔒 rate limited (5/60min por IP)
 * Cria um novo usuário. Body: RegisterInput (ver packages/shared/src/schemas/auth.ts)
 */
authRouter.post('/register', authRegisterLimiter, register);

/**
 * POST /auth/login  🔒 rate limited (10/15min por IP+email)
 * Autentica um usuário existente. Body: LoginInput
 */
authRouter.post('/login', authLoginLimiter, login);

/**
 * POST /auth/refresh
 * Refresh Token Rotation — retorna novo par de tokens. Body: { refreshToken }
 */
authRouter.post('/refresh', refresh);

/**
 * POST /auth/logout  🔒 autenticado
 * Revoga a sessão atual: incrementa tokenVersion, invalidando todos os
 * refresh tokens já emitidos para este usuário.
 */
authRouter.post('/logout', authenticate, logout);

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

// ─── Redefinição de senha via OTP ─────────────────────────────────────────────

/**
 * POST /auth/forgot-password
 * Inicia o fluxo de redefinição de senha: gera OTP e envia por e-mail.
 * Responde sempre com 200 (email enumeration prevention).
 * Body: { email }
 */
authRouter.post('/forgot-password', forgotPassword);

/**
 * POST /auth/verify-otp
 * Valida o OTP recebido por e-mail. Se válido, retorna um resetToken JWT (10 min).
 * Body: { email, otp }
 */
authRouter.post('/verify-otp', verifyOtp);

/**
 * PATCH /auth/reset-password
 * Redefine a senha usando o resetToken obtido em /verify-otp.
 * Não requer JWT de sessão — o resetToken é a própria forma de autorização.
 * Body: { resetToken, newPassword }
 */
authRouter.patch('/reset-password', resetPassword);
