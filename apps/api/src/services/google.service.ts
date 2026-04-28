// apps/api/src/services/google.service.ts
// Lógica do fluxo OAuth 2.0 com Google — isolada do controller.
//
// ── Por que sem passport.js? ──────────────────────────────────────────────────
// passport adiciona 3+ dependências e uma camada de abstração desnecessária
// para um fluxo bem definido de duas etapas. `fetch` nativo (Node 18+) e
// `jose` para verificação JWKS/RS256 resolvem o problema com muito mais
// transparência e menos superfície de ataque.
//
// ── Fluxo implementado ────────────────────────────────────────────────────────
// Etapa 1 — Geração da URL:
//   buildGoogleAuthUrl(state) → URL de autorização do Google
//
// Etapa 2 — Callback:
//   getGoogleProfile(code) → GoogleProfile
//     └─ exchangeCodeForTokens(code) → { id_token, ... }
//     └─ verifyIdToken(id_token)     → payload verificado
//
// ── Segurança do id_token ─────────────────────────────────────────────────────
// O Google assina o id_token com RS256 usando chaves rotacionadas publicadas em
// GOOGLE_JWKS_URI. `createRemoteJWKSet` (jose) busca e cacheia essas chaves,
// renovando automaticamente quando a rotação ocorre.
//
// Validações que `jwtVerify` executa:
//   ✅ Assinatura RS256 com a chave pública correta
//   ✅ `iss` deve ser 'accounts.google.com' ou 'https://accounts.google.com'
//   ✅ `aud` deve ser nosso GOOGLE_CLIENT_ID
//   ✅ `exp` — token não expirado

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';

// ─── Constantes ───────────────────────────────────────────────────────────────

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

// Google aceita ambos os formatos de issuer
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// JWKS remoto com cache automático — instanciado uma vez para reutilizar
const googleJWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/**
 * Subconjunto do payload do Google ID token relevante para o BLENDi Pulse.
 * Campos garantidos pelo escopo `openid email profile`.
 */
export interface GoogleProfile {
  /** ID único do usuário no Google — imutável, usado como chave de lookup. */
  sub: string;
  /** Email do usuário. Usar apenas se `email_verified` for true. */
  email: string;
  /** true se o Google verificou a titularidade do email. */
  email_verified: boolean;
  /** Nome completo do usuário. */
  name: string;
  /** Primeiro nome (pode estar ausente em contas corporativas). */
  given_name?: string;
  /** URL da foto de perfil (pode estar ausente). */
  picture?: string;
  /**
   * Locale preferido do usuário no formato BCP 47 (ex: 'en', 'pt-BR', 'pt').
   * Pode estar ausente — normalizar antes de usar como `locale` no MongoDB.
   */
  locale?: string;
}

// ─── Etapa 1: Geração da URL de autorização ───────────────────────────────────

/**
 * Constrói a URL de autorização do Google OAuth 2.0.
 *
 * @param state - Token JWT de curta duração gerado pelo controller para
 *   proteção CSRF. O Google o devolve intacto no callback para verificação.
 * @returns URL completa para redirecionar o usuário ao Google.
 *
 * @example
 *   buildGoogleAuthUrl('eyJhbGci...')
 *   // → 'https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=...'
 */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    // openid: obrigatório para id_token | email: email do usuário | profile: nome e foto
    scope: 'openid email profile',
    state,
    // prompt: 'select_account' — sempre exibe o seletor de conta, mesmo com sessão ativa.
    // Importante para apps com suporte a múltiplas contas Google.
    prompt: 'select_account',
    // access_type: 'offline' para receber refresh_token do Google.
    // Reservado para uso futuro (ex: acesso a Calendar/Fit sem usuário presente).
    access_type: 'offline',
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

// ─── Etapa 2: Troca do código + verificação do id_token ───────────────────────

/**
 * Troca o código de autorização pelos tokens do Google.
 * Chamada interna — não exposta diretamente.
 *
 * @throws Error se o endpoint do Google retornar erro (código inválido,
 *   redirect_uri incorreto, client_secret errado, etc.)
 */
async function exchangeCodeForTokens(code: string): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    // Não logar o body completo — pode conter client_secret em mensagens de erro
    throw new Error(`Google token exchange failed with status ${response.status}`);
  }

  return response.json() as Promise<{ id_token: string }>;
}

/**
 * Verifica a assinatura e os claims do Google ID token usando JWKS remoto.
 * Internamente usado por `getGoogleProfile`.
 *
 * @throws JWTExpired se o token expirou
 * @throws JWTClaimValidationFailed se iss ou aud não conferem
 * @throws JWSSignatureVerificationFailed se a assinatura é inválida
 */
async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: env.GOOGLE_CLIENT_ID,
  });

  // Garantia de tipo: os campos obrigatórios devem estar presentes
  if (typeof payload.sub !== 'string' || typeof payload['email'] !== 'string') {
    throw new Error('Google ID token missing required claims (sub, email)');
  }

  return payload as unknown as GoogleProfile;
}

/**
 * Executa as duas etapas do OAuth e retorna o perfil verificado do usuário.
 *
 * Ponto de entrada principal para o callback handler.
 *
 * @param code - Código de autorização recebido na query string do callback.
 * @returns Perfil do usuário extraído e verificado do Google ID token.
 *
 * @throws Error com mensagem descritiva para qualquer falha no fluxo.
 */
export async function getGoogleProfile(code: string): Promise<GoogleProfile> {
  const { id_token } = await exchangeCodeForTokens(code);
  return verifyIdToken(id_token);
}

/**
 * Normaliza o locale do Google (BCP 47) para o formato suportado pelo app.
 *
 * Google pode retornar: 'en', 'en-US', 'pt', 'pt-BR', 'pt-PT', etc.
 * O app suporta: 'en' | 'pt-BR'
 *
 * @param googleLocale - Locale do Google (pode ser undefined).
 * @returns 'pt-BR' se o locale começa com 'pt', 'en' caso contrário.
 */
export function normalizeGoogleLocale(googleLocale?: string): 'en' | 'pt-BR' {
  if (!googleLocale) return 'en';
  if (googleLocale.startsWith('pt')) return 'pt-BR';
  return 'en';
}
