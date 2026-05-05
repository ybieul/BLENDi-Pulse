// apps/mobile/src/hooks/useGoogleAuth.ts
// Encapsula todo o fluxo de Google Login:
//   1. Obtém a URL de autorização do Google via backend
//   2. Abre o browser com expo-web-browser
//   3. Aguarda o usuário autorizar; o backend processa o OAuth e redireciona
//      para o deep link blendipulse://auth/callback com os tokens na query string
//   4. Extrai accessToken, refreshToken, isNewUser e user do deep link
//   5. Decodifica o payload do usuário (base64 → JSON)
//   6. Salva a sessão no store Zustand
//
// O componente de UI só precisa de: { signInWithGoogle, isLoading, error }

import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { getGoogleAuthUrl, type AuthUser } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

// Necessário para fechar o browser corretamente no Android após o redirect
WebBrowser.maybeCompleteAuthSession();

// ─── Tipo de retorno do hook ──────────────────────────────────────────────────

export interface UseGoogleAuthReturn {
  /** Inicia o fluxo completo de Google Login. */
  signInWithGoogle: () => Promise<void>;
  /** true enquanto o fluxo estiver em andamento. */
  isLoading: boolean;
  /** true quando o login Google acabou de criar uma nova conta. */
  isNewUser: boolean;
  /** Chave i18n do erro, ou null se não houver erro. */
  error: string | null;
  /** Limpa o erro atual. */
  clearError: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const _setSession = useAuthStore((s) => s._setSession);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    setIsNewUser(false);
    setError(null);

    try {
      // ── Passo 1: obter a URL de autorização do backend ─────────────────────
      // A URL inclui o state JWT (CSRF) gerado pelo backend.
      let authUrl: string;
      try {
        authUrl = await getGoogleAuthUrl();
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao obter URL de autorização:', err);
        setError('errors.network.server');
        return;
      }

      // ── Passo 2: abrir o browser de autorização ────────────────────────────
      // O redirect URI do backend (http://localhost:3000/auth/google/callback)
      // processa o callback e redireciona de volta para o deep link do app.
      // O expo-web-browser detecta o deep link e fecha o browser automaticamente.
      //
      // redirectUrl: esquema do app que sinaliza ao browser quando fechar.
      // Em desenvolvimento (Expo Go): exp://127.0.0.1:8081
      // Em produção (build EAS): blendipulse://
      const redirectUrl = 'blendipulse://';
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      // ── Passo 3: verificar resultado do browser ────────────────────────────
      if (result.type === 'cancel' || result.type === 'dismiss') {
        // Usuário fechou o browser sem autorizar — sem erro, sem log
        return;
      }

      if (result.type !== 'success' || !result.url) {
        console.warn('[useGoogleAuth] Resultado inesperado do browser:', result.type);
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 4: parsear URL e extrair params do deep link ────────────────
      // O backend processa o OAuth e redireciona para:
      //   blendipulse://auth/callback?accessToken=...&refreshToken=...&isNewUser=...&user=<base64>
      // Em caso de erro:
      //   blendipulse://auth/callback?error=errors.auth.<chave>
      let params: URLSearchParams;
      try {
        params = new URL(result.url).searchParams;
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao parsear URL de deep link:', result.url, err);
        setError('errors.auth.google_auth_failed');
        return;
      }

      const deepLinkError = params.get('error');
      if (deepLinkError) {
        // Backend sinalizou erro (CSRF inválido, código expirado, etc.)
        setError(deepLinkError);
        return;
      }

      const accessToken = params.get('accessToken');
      const refreshToken = params.get('refreshToken');
      const isNewUser = params.get('isNewUser') === 'true';
      const userBase64 = params.get('user');

      if (!accessToken || !refreshToken || !userBase64) {
        console.error('[useGoogleAuth] Params obrigatórios ausentes no deep link:', result.url);
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 5: decodificar payload do usuário ───────────────────────────
      // atob() está disponível no Hermes desde RN 0.64.
      // O backend serializa o user como JSON → base64 via Buffer.from().toString('base64').
      let user: AuthUser;
      try {
        user = JSON.parse(atob(userBase64)) as AuthUser;
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao decodificar payload do usuário:', err);
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 6: salvar sessão no store (SecureStore + Zustand) ───────────
      await _setSession({ user, accessToken, refreshToken, isNewUser });
      setIsNewUser(isNewUser);
    } catch (err) {
      // Captura erros não tratados nos passos anteriores
      console.error('[useGoogleAuth] Erro inesperado no fluxo Google Login:', err);
      setError('errors.auth.google_auth_failed');
    } finally {
      setIsLoading(false);
    }
  }, [_setSession]);

  const clearError = useCallback(() => setError(null), []);

  return { signInWithGoogle, isLoading, isNewUser, error, clearError };
}
