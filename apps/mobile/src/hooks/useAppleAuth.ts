// apps/mobile/src/hooks/useAppleAuth.ts
// Encapsula todo o fluxo de Sign in with Apple:
//   1. Abre o painel nativo via expo-apple-authentication, solicitando
//      os scopes FULL_NAME e EMAIL
//   2. O SDK já devolve identityToken e authorizationCode diretamente
//      (sem browser/redirect, diferente do Google)
//   3. Monta o fullName (quando disponível) e envia ao backend via
//      signInWithApple (services/auth.service.ts)
//   4. Salva a sessão no store Zustand
//
// O componente de UI só precisa de: { signInWithApple, isLoading, error }

import { useState, useCallback } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple as signInWithAppleRequest } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

// ─── Tipo de retorno do hook ──────────────────────────────────────────────────

export interface UseAppleAuthReturn {
  /** Inicia o fluxo completo de Sign in with Apple. */
  signInWithApple: () => Promise<void>;
  /** true enquanto o fluxo estiver em andamento. */
  isLoading: boolean;
  /** true quando o login Apple acabou de criar uma nova conta. */
  isNewUser: boolean;
  /** Chave i18n do erro, ou null se não houver erro. */
  error: string | null;
  /** Limpa o erro atual. */
  clearError: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppleAuth(): UseAppleAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const _setSession = useAuthStore((s) => s._setSession);

  const signInWithApple = useCallback(async () => {
    setIsLoading(true);
    setIsNewUser(false);
    setError(null);

    try {
      // ── Passo 1: abrir o painel nativo da Apple ────────────────────────────
      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
          // Usuário cancelou no painel nativo — sem erro, sem log
          return;
        }
        console.error('[useAppleAuth] Falha ao abrir painel nativo da Apple:', err);
        setError('errors.auth.apple_auth_failed');
        return;
      }

      // ── Passo 2: validar campos obrigatórios do credential ─────────────────
      const { identityToken, authorizationCode, fullName: credentialFullName } = credential;

      if (!identityToken || !authorizationCode) {
        // Nunca logar `credential` diretamente: se só um dos dois campos
        // estiver ausente, o outro pode ser um token/code real e válido.
        console.error('[useAppleAuth] identityToken ou authorizationCode ausentes no resultado', {
          hasIdentityToken: !!identityToken,
          hasAuthorizationCode: !!authorizationCode,
        });
        setError('errors.auth.apple_auth_failed');
        return;
      }

      // ── Passo 3: montar fullName (só vem preenchido no primeiro signInAsync) ─
      let fullName: string | undefined;
      if (credentialFullName) {
        const parts = [credentialFullName.givenName, credentialFullName.familyName].filter(
          (part): part is string => !!part
        );
        if (parts.length > 0) {
          fullName = parts.join(' ');
        }
      }

      // ── Passo 4: enviar ao backend ──────────────────────────────────────────
      let data: Awaited<ReturnType<typeof signInWithAppleRequest>>;
      try {
        data = await signInWithAppleRequest({ identityToken, authorizationCode, fullName });
      } catch (err) {
        // Nunca logar `err` diretamente: se for um AxiosError, `err.config.data`
        // é o body serializado da requisição — inclui o identityToken e o
        // authorizationCode reais.
        console.error('[useAppleAuth] Falha ao autenticar com o backend', {
          message: err instanceof Error ? err.message : String(err),
        });
        setError('errors.auth.apple_auth_failed');
        return;
      }

      // ── Passo 5: salvar sessão no store (SecureStore + Zustand) ────────────
      await _setSession(data);
      setIsNewUser(data.isNewUser);
    } catch (err) {
      // Captura erros não tratados nos passos anteriores
      console.error('[useAppleAuth] Erro inesperado no fluxo Apple Sign In:', err);
      setError('errors.auth.apple_auth_failed');
    } finally {
      setIsLoading(false);
    }
  }, [_setSession]);

  const clearError = useCallback(() => setError(null), []);

  return { signInWithApple, isLoading, isNewUser, error, clearError };
}
