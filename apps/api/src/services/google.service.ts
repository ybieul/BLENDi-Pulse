// apps/api/src/services/google.service.ts
// Encapsula toda a comunicação com a API do Google OAuth 2.0.
// Esta é a ÚNICA parte do código que conhece os detalhes do SDK googleapis.
//
// ── Fluxo OAuth 2.0 (Authorization Code) ─────────────────────────────────────
//
//   1. getAuthorizationUrl(state)       → URL para redirecionar o usuário ao Google
//   2. exchangeCodeForTokens(code)      → id_token assinado pelo Google
//   3. getUserInfoFromToken(idToken)    → dados do usuário extraídos e verificados
//
// ── Por que googleapis em vez de fetch + jose? ────────────────────────────────
// O SDK oficial gerencia automaticamente:
//   • Expiração e rotação das chaves JWKS do Google
//   • Serialização do body (application/x-www-form-urlencoded) no token endpoint
//   • Verificação da assinatura RS256 e dos claims (iss, aud, exp)
//
// Isso reduz o boilerplate e concentra a responsabilidade de verificação em
// uma biblioteca mantida pelo próprio Google.

import { google } from 'googleapis';
import { env } from '../config/env';

// ─── Cliente OAuth2 (singleton) ───────────────────────────────────────────────
// Instanciado uma vez no início do módulo e reutilizado em todas as requisições.
// Parâmetros: clientId, clientSecret, redirectUri — lidos do env validado.
const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);

// ─── Interface de retorno ─────────────────────────────────────────────────────

/**
 * Campos do perfil Google relevantes para o BLENDi Pulse.
 * Todos garantidos pelos escopos `email` e `profile`.
 */
export interface GoogleUserInfo {
  /** ID único e imutável do usuário no Google — chave de lookup no MongoDB. */
  googleId: string;
  /** Endereço de email — apenas usar após confirmar verificação no controller. */
  email: string;
  /** Nome completo do usuário. */
  name: string;
  /** URL da foto de perfil (pode estar ausente em contas sem foto). */
  picture?: string;
}

// ─── Passo 1: Geração da URL de autorização ───────────────────────────────────

/**
 * Gera a URL completa para redirecionar o usuário à tela de login do Google.
 *
 * O que entra: `state` — token JWT de curta duração gerado pelo controller para
 *   proteção CSRF. O Google o devolve intacto no callback para verificação.
 *
 * O que sai: string com a URL de autorização do Google, incluindo os parâmetros
 *   client_id, redirect_uri, response_type=code, scope, state e prompt.
 *
 * O que acontece internamente: `oauth2Client.generateAuthUrl` monta a URL com
 *   os escopos `email` e `profile`, que concedem acesso ao email verificado,
 *   nome completo e foto de perfil — tudo que o BLENDi Pulse precisa.
 *   `prompt: 'select_account'` sempre exibe o seletor de contas Google, mesmo
 *   quando o usuário já tem sessão ativa, permitindo troca de conta.
 */
export function getAuthorizationUrl(state: string): string {
  return oauth2Client.generateAuthUrl({
    scope: ['email', 'profile'],
    prompt: 'select_account',
    state,
  });
}

// ─── Passo 2: Troca do código pelo id_token ───────────────────────────────────

/**
 * Troca o código de autorização pelo token de identidade emitido pelo Google.
 *
 * O que entra: `code` — string de uso único recebida na query string do
 *   callback OAuth (?code=4/...). Válido por ~10 minutos após geração.
 *
 * O que sai: string com o id_token JWT assinado pelo Google (RS256).
 *   Este token contém os dados do usuário e será verificado no passo 3.
 *
 * O que acontece internamente: `oauth2Client.getToken(code)` faz um POST para
 *   https://oauth2.googleapis.com/token com client_id, client_secret,
 *   redirect_uri e grant_type=authorization_code. O Google responde com
 *   access_token, refresh_token e id_token. Apenas o id_token é retornado
 *   — os demais não são necessários para o fluxo de autenticação do BLENDi.
 *
 * @throws Error se o código for inválido, expirado ou já utilizado.
 * @throws Error se o Google não retornar um id_token (não deveria acontecer
 *   com os escopos corretos, mas é verificado defensivamente).
 */
export async function exchangeCodeForTokens(code: string): Promise<string> {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.id_token) {
    // Não deveria acontecer com escopos email+profile, mas é garantia defensiva
    throw new Error('Google did not return an id_token — check OAuth scopes');
  }

  return tokens.id_token;
}

// ─── Passo 3: Extração dos dados do usuário ───────────────────────────────────

/**
 * Verifica a assinatura do id_token e extrai os dados do usuário.
 *
 * O que entra: `idToken` — string JWT retornada por `exchangeCodeForTokens`.
 *
 * O que sai: objeto `GoogleUserInfo` com googleId, email, name e picture.
 *
 * O que acontece internamente: `oauth2Client.verifyIdToken` valida:
 *   ✅ Assinatura RS256 usando as chaves públicas do Google (JWKS automático)
 *   ✅ `aud` (audience) deve ser o nosso GOOGLE_CLIENT_ID
 *   ✅ `iss` deve ser 'accounts.google.com' ou 'https://accounts.google.com'
 *   ✅ `exp` — o token não está expirado
 *   Em seguida, `ticket.getPayload()` extrai o payload com os campos do usuário.
 *
 * @throws Error se a assinatura for inválida, o token expirado ou os claims
 *   não corresponderem às nossas credenciais.
 * @throws Error se os campos obrigatórios (sub, email, name) estiverem ausentes.
 */
export async function getUserInfoFromToken(idToken: string): Promise<GoogleUserInfo> {
  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.name) {
    throw new Error('Google id_token missing required fields: sub, email or name');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture ?? undefined,
  };
}
