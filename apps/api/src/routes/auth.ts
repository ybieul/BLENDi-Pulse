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
  exchangeGoogleCode,
  getGoogleUrl,
  handleGoogleCallback,
} from '../controllers/google.controller';
import { handleAppleSignIn } from '../controllers/apple.controller';
import {
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/password.controller';
import { authenticate } from '../middlewares/authenticate';
import {
  authLoginLimiter,
  authRegisterLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  verifyOtpLimiter,
} from '../middlewares/rateLimiter';

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
 * GET /auth/google/url?codeChallenge=<base64url(SHA-256(verificador))>
 * Retorna a URL de autorização do Google para o app mobile abrir no browser.
 * O desafio é obrigatório (400 sem ele) e vai dentro do state assinado.
 * Resposta: { success: true, data: { url: string } }
 */
authRouter.get('/google/url', getGoogleUrl);

/**
 * GET /auth/google/callback
 * Endpoint de redirecionamento registrado no Google Cloud Console.
 * Recebe o código de autorização após o usuário aprovar no browser do Google.
 * Query params: code (obrigatório), state (CSRF), error (se o usuário cancelou)
 * Redireciona para blendipulse://auth/callback?code=<código de uso único>
 * (ou ?error=<chave i18n>) — nunca com tokens nem usuário na URL.
 */
authRouter.get('/google/callback', handleGoogleCallback);

/**
 * POST /auth/google/exchange  🔒 rate limited (10/15min, mesmo limiter do /auth/login)
 * Troca o código de uso único do deep link + o verificador PKCE pela sessão.
 * Body: { code, codeVerifier }
 * Resposta: { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 * Qualquer falha: 401 auth/google-exchange-failed (genérico, sem o motivo).
 *
 * Sem `email` no body, o keyGenerator do authLoginLimiter cai no IP; com
 * skipSuccessfulRequests, só as trocas que falham contam para o limite.
 */
authRouter.post('/google/exchange', authLoginLimiter, exchangeGoogleCode);

/**
 * POST /auth/apple  🔒 rate limited (10/15min, mesmo limiter do /auth/login)
 * Login/registro via Sign in with Apple — fluxo nativo (sem browser/redirect).
 * Body: { identityToken, authorizationCode, fullName? }
 * Resposta: { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 *
 * authLoginLimiter normalmente combina IP+email, mas o body aqui não tem
 * `email` — o keyGenerator (rateLimiter.ts) cai no fallback e a chave vira
 * só o IP, igual ao authRegisterLimiter.
 */
authRouter.post('/apple', authLoginLimiter, handleAppleSignIn);

// ─── Redefinição de senha via OTP ─────────────────────────────────────────────

/**
 * POST /auth/forgot-password  🔒 rate limited (10/60min por IP + 3/60min por e-mail)
 * Inicia o fluxo de redefinição de senha: gera OTP e envia por e-mail.
 * Responde sempre com 200 (email enumeration prevention).
 * Body: { email }
 */
authRouter.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  forgotPassword
);

/**
 * POST /auth/verify-otp  🔒 rate limited (10/15min por IP)
 * Valida o OTP recebido por e-mail. Se válido, retorna um resetToken JWT (10 min).
 * Body: { email, otp }
 */
authRouter.post('/verify-otp', verifyOtpLimiter, verifyOtp);

/**
 * PATCH /auth/reset-password
 * Redefine a senha usando o resetToken obtido em /verify-otp.
 * Não requer JWT de sessão — o resetToken é a própria forma de autorização.
 * Body: { resetToken, newPassword }
 */
authRouter.patch('/reset-password', resetPassword);
