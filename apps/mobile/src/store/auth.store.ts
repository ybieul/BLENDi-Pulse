// apps/mobile/src/store/auth.store.ts
// Fonte da verdade sobre o estado de autenticação no app.
//
// ─── Decisões técnicas ────────────────────────────────────────────────────────
//
// 1. ACCESS TOKEN em memória (Zustand), nunca em disco.
//    Tokens de curta duração (15 min) não precisam sobreviver a reinicializações.
//    Mantê-los só na RAM reduz a superfície de ataque — não podem ser extraídos
//    por leitura do AsyncStorage/MMKV mesmo em dispositivos sem jailbreak.
//
// 2. REFRESH TOKEN no expo-secure-store (Keychain iOS / Keystore Android).
//    Único token que precisa persistir entre sessões. O Secure Store usa
//    encriptação nativa da plataforma — é o local mais seguro disponível no Expo.
//    Chave: 'blendi_refresh_token'
//    Opções: requireAuthentication: false (login silencioso sem Face ID/PIN),
//            keychainAccessible: AFTER_FIRST_UNLOCK (disponível após desbloqueio,
//            mas não antes — protege contra extração cold-boot).
//
// 3. INTERCEPTORS registrados pelo próprio store (setupAxiosInterceptors).
//    Isso garante que o interceptor de request sempre leia o token mais recente
//    do estado Zustand via getState(), sem closures desatualizados.
//    Deve ser chamado uma única vez na inicialização do app (App.tsx).
//
// 4. RETRY 401 com flag _isRetry.
//    O interceptor de response detecta 401, tenta refresh uma única vez.
//    Se o refresh falhar, chama logout() e navega para login.
//    A flag evita loops infinitos de retry.
//
// 5. isAuthenticated é DERIVADO do accessToken — nunca armazenado como boolean
//    separado para evitar estados inconsistentes (ex: token presente mas
//    isAuthenticated = false por bug de sincronização).

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { api } from '../config/api';
import { createAppStorage } from '../config/storage';
import * as AuthService from '../services/auth.service';
import type { AuthResponse, AuthUser } from '../services/auth.service';
import type { RegisterInput, LoginInput } from '@blendi/shared';

// ─── Constantes ───────────────────────────────────────────────────────────────

const REFRESH_TOKEN_KEY = 'blendi_refresh_token';
const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const authStorage = createAppStorage('blendi-pulse');

/** Opções de segurança máxima disponíveis no Expo Secure Store. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  // Disponível após o primeiro desbloqueio do dispositivo.
  // Mais restritivo que o padrão (AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY limita
  // a restaurações de backup, mas é excessivo para refresh tokens).
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

type AuthSessionData = AuthResponse['data'] & {
  isNewUser?: boolean;
};

interface CurrentUserProfileResponse {
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string;
      profilePhoto?: string;
      lastCleanedAt?: string | null;
      blendiModel: AuthUser['blendiModel'];
      goal: AuthUser['goal'];
      preferredLanguage: AuthUser['locale'];
      unitSystem: AuthUser['unitSystem'];
      timezone: string;
      dailyProteinTarget: number;
      dailyCalorieTarget: number;
      dailyCarbTarget: number;
      longestStreak: number;
      createdAt: string;
    };
  };
}

async function fetchCurrentUserProfile(): Promise<AuthUser> {
  const response = await api.get<CurrentUserProfileResponse>('/users/me');
  const { user } = response.data.data;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profilePhoto: user.profilePhoto,
    lastCleanedAt: user.lastCleanedAt ?? null,
    blendiModel: user.blendiModel,
    goal: user.goal,
    locale: user.preferredLanguage,
    unitSystem: user.unitSystem,
    timezone: user.timezone,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCalorieTarget: user.dailyCalorieTarget,
    dailyCarbTarget: user.dailyCarbTarget,
    longestStreak: user.longestStreak,
    createdAt: user.createdAt,
  };
}

function hasPendingOnboarding(): boolean {
  return authStorage.getString(ONBOARDING_COMPLETED_KEY) === 'false';
}

function persistOnboardingCompletion(isCompleted: boolean): void {
  authStorage.set(ONBOARDING_COMPLETED_KEY, isCompleted);
}

async function setRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      REFRESH_TOKEN_KEY,
      token,
      SECURE_STORE_OPTIONS
    );
    return;
  } catch {
    authStorage.set(REFRESH_TOKEN_KEY, token);
  }
}

async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(
      REFRESH_TOKEN_KEY,
      SECURE_STORE_OPTIONS
    );
  } catch {
    return authStorage.getString(REFRESH_TOKEN_KEY) ?? null;
  }
}

async function deleteRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch {
    authStorage.delete(REFRESH_TOKEN_KEY);
  }
}

// ─── Tipos do store ───────────────────────────────────────────────────────────

interface AuthState {
  /** Dados públicos do usuário autenticado, ou null se não autenticado. */
  user: AuthUser | null;
  /** Access token JWT em memória — NUNCA persiste em disco. */
  accessToken: string | null;
  /** Derivado: true se accessToken não for null. */
  isAuthenticated: boolean;
  /** true quando a sessão atual foi criada por um primeiro login via Google. */
  isNewUser: boolean;
  /** true durante operações assíncronas de auth (login, register, restoreSession). */
  isLoading: boolean;
  /**
   * true enquanto o boot ainda está restaurando a sessão persistida.
   * Começa como true para evitar flicker do fluxo público antes do refresh.
   */
  isRestoringSession: boolean;
}

interface AuthActions {
  /** Registra um novo usuário e inicia a sessão. */
  register: (input: RegisterInput) => Promise<void>;
  /** Autentica um usuário existente e inicia a sessão. */
  login: (input: LoginInput) => Promise<void>;
  /** Limpa a sessão local e remove o refresh token do Secure Store. */
  logout: () => Promise<void>;
  /**
   * Tenta restaurar a sessão a partir do refresh token persistido.
   * Deve ser chamada no boot do app (App.tsx) antes de exibir qualquer tela.
   * Não lança exceção — se falhar, o usuário permanece deslogado.
    * Após refresh bem-sucedido, tenta hidratar o perfil via GET /users/me.
    * Se essa etapa falhar temporariamente, a sessão continua restaurada e o
    * perfil pode ser recarregado mais tarde por outras queries da aplicação.
   */
  restoreSession: () => Promise<void>;
  /** @internal Usado pelo interceptor do Axios. Não chamar diretamente em componentes. */
  _setAccessToken: (token: string | null) => void;
  /**
   * @internal Persiste uma sessão completa recebida da API.
    * Salva o refresh token no Secure Store e atualiza user + accessToken no estado.
   * Usado pelo useGoogleAuth após OAuth bem-sucedido.
   * Não chamar diretamente em componentes.
   */
    _setSession: (data: AuthSessionData) => Promise<void>;
  /**
   * Atualiza o campo timezone no perfil do usuário no store após uma
   * sincronização bem-sucedida com o backend (PATCH /auth/timezone).
   * Chamada por timezone.service.ts — não chamar diretamente em componentes.
   */
  updateTimezone: (timezone: string) => void;
  updateUserProfile: (updates: Partial<AuthUser>) => void;
  /** Marca o onboarding como concluído e libera o acesso ao app principal. */
  completeOnboarding: () => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // Estado inicial
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isNewUser: false,
  isLoading: false,
  isRestoringSession: true,

  // ── register ─────────────────────────────────────────────────────────────

  register: async (input) => {
    set({ isLoading: true });
    try {
      const data = await AuthService.register(input);

      await setRefreshToken(data.refreshToken);

      set({
        user: data.user,
        accessToken: data.accessToken,
        isAuthenticated: true,
        isNewUser: true,
      });
      persistOnboardingCompletion(false);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── login ─────────────────────────────────────────────────────────────────

  login: async (input) => {
    set({ isLoading: true });
    try {
      const data = await AuthService.login(input);

      await setRefreshToken(data.refreshToken);

      set({
        user: {
          ...data.user,
          longestStreak: data.user.longestStreak,
        },
        accessToken: data.accessToken,
        isAuthenticated: true,
        isNewUser: hasPendingOnboarding(),
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── logout ────────────────────────────────────────────────────────────────

  logout: async () => {
    // Remove do Secure Store (melhor esforço — não bloqueia o logout se falhar)
    await deleteRefreshToken();

    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isNewUser: false,
    });
  },

  // ── restoreSession ────────────────────────────────────────────────────────

  restoreSession: async () => {
    set({ isLoading: true, isRestoringSession: true });
    try {
      const storedRefreshToken = await getRefreshToken();

      if (!storedRefreshToken) {
        // Nenhuma sessão prévia — usuário precisa fazer login
        return;
      }

      // Tenta obter um novo par de tokens com o refresh token persistido
      const tokens = await AuthService.refreshTokens(storedRefreshToken);

      // Persiste o novo refresh token (rotação)
      await setRefreshToken(tokens.refreshToken);

      set({
        user: null,
        accessToken: tokens.accessToken,
        isAuthenticated: true,
        isNewUser: hasPendingOnboarding(),
      });

      try {
        const user = await fetchCurrentUserProfile();
        set({ user });
      } catch {
        // Preserva a sessão restaurada mesmo se o perfil não puder ser hidratado agora.
      }
    } catch {
      // Refresh token inválido/expirado — limpa sessão silenciosamente
      await get().logout();
    } finally {
      set({ isLoading: false, isRestoringSession: false });
    }
  },

  // ── _setAccessToken ───────────────────────────────────────────────────────

  _setAccessToken: (token) => {
    set({
      accessToken: token,
      isAuthenticated: token !== null,
    });
  },

  // ── _setSession ───────────────────────────────────────────────────────────

  _setSession: async (data) => {
    const shouldShowOnboarding = data.isNewUser === true || hasPendingOnboarding();

    await setRefreshToken(data.refreshToken);

    if (data.isNewUser === true) {
      persistOnboardingCompletion(false);
    }

    set({
      user: data.user,
      accessToken: data.accessToken,
      isAuthenticated: true,
      isNewUser: shouldShowOnboarding,
    });
  },

  // ── updateTimezone ────────────────────────────────────────────────────────

  updateTimezone: (timezone) => {
    const { user } = get();
    // Só atualiza se houver um perfil de usuário carregado em memória.
    // Se a hidratação do perfil ainda não tiver acontecido, a atualização
    // local é ignorada e o valor correto será buscado depois no backend.
    if (user === null) return;
    set({ user: { ...user, timezone } });
  },

  updateUserProfile: (updates) => {
    const { user } = get();

    if (user === null) {
      return;
    }

    set({ user: { ...user, ...updates } });
  },

  // ── completeOnboarding ───────────────────────────────────────────────────

  completeOnboarding: () => {
    persistOnboardingCompletion(true);
    set({ isNewUser: false });
    return Promise.resolve();
  },
}));

// ─── Interceptors do Axios ────────────────────────────────────────────────────
// Deve ser chamado UMA VEZ na inicialização do app (App.tsx).
// Usar getState() em vez de closure garante leitura do token mais recente.

// Tipo interno para rastrear se uma requisição já foi retentada
interface RetryableRequest extends InternalAxiosRequestConfig {
  _isRetry?: boolean;
}

let interceptorsRegistered = false;

export function setupAxiosInterceptors(
  onSessionExpired: () => void
): void {
  // Guard: não registra duas vezes (ex: React StrictMode monta duas vezes em dev)
  if (interceptorsRegistered) return;
  interceptorsRegistered = true;

  // ── Interceptor de REQUEST: attach token ──────────────────────────────────
  api.interceptors.request.use((config) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
  });

  // ── Interceptor de RESPONSE: retry 401 ────────────────────────────────────
  api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as RetryableRequest | undefined;

      // Só tenta refresh em erros 401 e se ainda não foi tentado
      const is401 = error.response?.status === 401;
      const alreadyRetried = originalRequest?._isRetry === true;

      if (!is401 || alreadyRetried || !originalRequest) {
        return Promise.reject(error);
      }

      // Marca a requisição como retentada para evitar loop infinito
      originalRequest._isRetry = true;

      try {
        // Lê o refresh token do Secure Store
        const storedRefreshToken = await getRefreshToken();

        if (!storedRefreshToken) {
          throw new Error('No refresh token available');
        }

        // Obtém novo par de tokens
        const tokens = await AuthService.refreshTokens(storedRefreshToken);

        // Persiste novo refresh token (rotação)
        await setRefreshToken(tokens.refreshToken);

        // Atualiza access token no store
        useAuthStore.getState()._setAccessToken(tokens.accessToken);

        // Refaz a requisição original com o novo token
        originalRequest.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        return api(originalRequest);
      } catch {
        // Refresh falhou — sessão expirada, redireciona para login
        await useAuthStore.getState().logout();
        onSessionExpired();
        return Promise.reject(error);
      }
    }
  );
}
