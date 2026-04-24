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
 */
export async function register(input: RegisterInput): Promise<AuthResponse['data']> {
  const response = await api.post<AuthResponse>('/auth/register', input);
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
