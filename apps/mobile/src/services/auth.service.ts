// apps/mobile/src/services/auth.service.ts
// Cliente HTTP para os endpoints de autenticação da API BLENDi Pulse.
//
// Este serviço é STATELESS — não sabe nada sobre tokens ou sessão.
// O gerenciamento de estado é responsabilidade exclusiva de auth.store.ts.
//
// Tipagem de entrada: schemas compartilhados de @blendi/shared.
// Tipagem de saída: interfaces locais alinhadas ao contrato da API.

import type { RegisterInput, LoginInput } from '@blendi/shared';
import { api } from '../config/api';

// ─── Tipos de resposta da API ─────────────────────────────────────────────────
// Espelham a estrutura retornada pelos controllers (apps/api/src/controllers/auth.controller.ts)

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  blendiModel: 'Lite' | 'ProPlus' | 'Steel';
  goal: 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
  locale: 'en' | 'pt-BR';
  /** Timezone IANA do usuário (ex: 'America/Sao_Paulo'). Sincronizado com o dispositivo. */
  timezone: string;
  dailyProteinTarget: number;
  dailyCalorieTarget: number;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  success: true;
  data: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  };
}

export interface RefreshResponse {
  success: true;
  data: AuthTokens;
}

// ─── Funções do serviço ───────────────────────────────────────────────────────

/**
 * Registra um novo usuário.
 * POST /auth/register → 201 { user, accessToken, refreshToken }
 *
 * O timezone é capturado automaticamente via Intl e injetado no body,
 * garantindo que o servidor armazene o fuso correto desde o primeiro registro —
 * independente do que o formulário de cadastro tenha passado no input.
 */
export async function register(input: RegisterInput): Promise<AuthResponse['data']> {
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await api.post<AuthResponse>('/auth/register', {
    ...input,
    timezone: deviceTimezone,
  });
  return response.data.data;
}

/**
 * Autentica um usuário existente.
 * POST /auth/login → 200 { user, accessToken, refreshToken }
 */
export async function login(input: LoginInput): Promise<AuthResponse['data']> {
  const response = await api.post<AuthResponse>('/auth/login', input);
  return response.data.data;
}

/**
 * Troca um refresh token por um novo par de tokens (Refresh Token Rotation).
 * POST /auth/refresh → 200 { accessToken, refreshToken }
 *
 * Chamada diretamente pelo interceptor do Axios no auth.store.ts — não chame
 * esta função em componentes ou outros stores.
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const response = await api.post<RefreshResponse>('/auth/refresh', { refreshToken });
  return response.data.data;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * Obtém a URL de autorização do Google via backend.
 * GET /auth/google/url → 200 { url: string }
 *
 * A URL inclui o state JWT (CSRF) gerado pelo backend.
 * O app abre essa URL no browser via expo-web-browser.
 */
export async function getGoogleAuthUrl(): Promise<string> {
  const response = await api.get<{ success: true; data: { url: string } }>('/auth/google/url');
  return response.data.data.url;
}
