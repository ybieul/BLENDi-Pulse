// apps/mobile/src/hooks/useGoogleAuth.ts
// Encapsula todo o fluxo de Google Login (CP-1.1.1d — código de uso único):
//   1. Gera o verificador (só em memória) e o desafio (SHA-256 do verificador)
//   2. Obtém a URL de autorização do Google via backend, mandando o desafio
//   3. Abre o browser com expo-web-browser
//   4. O backend processa o OAuth e redireciona para o deep link
//      blendipulse://auth/callback?code=... — só um código de uso único,
//      sem tokens nem dados do usuário na URL
//   5. Troca o código + o verificador pelos tokens e pelo usuário
//      (POST /auth/google/exchange)
//   6. Salva a sessão no store Zustand
//
// Por quê: no Android, outro app instalado pode registrar o esquema
// blendipulse:// e receber o deep link. Sem o verificador, que nunca sai
// deste hook até a troca, o código interceptado não serve para nada.
//
// Nunca registrar a URL do deep link, o código nem o verificador: os logs
// levam no máximo o nome do erro e flags booleanas.
//
// O componente de UI só precisa de: { signInWithGoogle, isLoading, error }

import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { exchangeGoogleCode, getGoogleAuthUrl } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';
import { createPkcePair } from '../utils/pkce.utils';

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
      // ── Passo 1: verificador (só em memória) e desafio ─────────────────────
      // `codeVerifier` é uma variável local: some quando o fluxo termina.
      let codeVerifier: string;
      let codeChallenge: string;
      try {
        ({ codeVerifier, codeChallenge } = await createPkcePair());
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao gerar o verificador do login', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 2: obter a URL de autorização do backend ─────────────────────
      // A URL inclui o state JWT (CSRF + desafio) gerado pelo backend.
      let authUrl: string;
      try {
        authUrl = await getGoogleAuthUrl(codeChallenge);
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao obter URL de autorização', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
        setError('errors.network.server');
        return;
      }

      // ── Passo 3: abrir o browser de autorização ────────────────────────────
      // O redirect URI do backend processa o callback e redireciona de volta
      // para o deep link do app. O expo-web-browser detecta o deep link e
      // fecha o browser automaticamente.
      //
      // redirectUrl: esquema do app que sinaliza ao browser quando fechar.
      const redirectUrl = 'blendipulse://';
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      // ── Passo 4: verificar resultado do browser ────────────────────────────
      if (
        result.type === WebBrowser.WebBrowserResultType.CANCEL ||
        result.type === WebBrowser.WebBrowserResultType.DISMISS
      ) {
        // Usuário fechou o browser sem autorizar — sem erro, sem log
        return;
      }

      if (result.type !== 'success' || !result.url) {
        console.warn('[useGoogleAuth] Resultado inesperado do browser:', result.type);
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 5: ler o código (ou o erro) do deep link ─────────────────────
      //   blendipulse://auth/callback?code=<código de uso único>
      //   blendipulse://auth/callback?error=errors.auth.<chave>
      // Nunca logar `result.url`: ela traz o código de uso único.
      let params: URLSearchParams;
      try {
        params = new URL(result.url).searchParams;
      } catch (err) {
        console.error('[useGoogleAuth] Falha ao parsear URL de deep link', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
        setError('errors.auth.google_auth_failed');
        return;
      }

      const deepLinkError = params.get('error');
      if (deepLinkError) {
        // Backend sinalizou erro (CSRF inválido, código expirado, etc.)
        setError(deepLinkError);
        return;
      }

      const code = params.get('code');
      if (!code) {
        console.error('[useGoogleAuth] Código ausente no deep link', { hasCode: false });
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 6: trocar código + verificador pela sessão ──────────────────
      let session: Awaited<ReturnType<typeof exchangeGoogleCode>>;
      try {
        session = await exchangeGoogleCode({ code, codeVerifier });
      } catch (err) {
        // Só o nome do erro: o objeto do Axios carrega a config da requisição,
        // com o código e o verificador no corpo.
        console.error('[useGoogleAuth] Falha ao trocar o código do login Google', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
        setError('errors.auth.google_auth_failed');
        return;
      }

      // ── Passo 7: salvar sessão no store (SecureStore + Zustand) ───────────
      await _setSession({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isNewUser: session.isNewUser,
      });
      setIsNewUser(session.isNewUser);
    } catch (err) {
      // Captura erros não tratados nos passos anteriores. Só o nome do erro:
      // o objeto pode carregar a sessão ou o código.
      console.error('[useGoogleAuth] Erro inesperado no fluxo Google Login', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      setError('errors.auth.google_auth_failed');
    } finally {
      setIsLoading(false);
    }
  }, [_setSession]);

  const clearError = useCallback(() => setError(null), []);

  return { signInWithGoogle, isLoading, isNewUser, error, clearError };
}
