// apps/api/src/services/apple.service.ts
// Encapsula toda a comunicação com a API do Sign in with Apple.
// Esta é a ÚNICA parte do código que conhece os detalhes do protocolo Apple.
//
// ── Fluxo (Authorization Code, nativo via expo-apple-authentication) ─────────
//
// Diferente do Google (login.controller/google.service), o app nativo da
// Apple não usa browser/redirect: o SDK nativo (mobile, CP separada) entrega
// identityToken + authorizationCode direto pro app, que manda os dois num
// único POST pro backend.
//
//   1. verifyAppleIdentityToken(identityToken)        → claims verificados (sub, email, email_verified)
//   2. generateAppleClientSecret()                     → JWT ES256 de curta duração (ver abaixo)
//   3. exchangeAppleAuthorizationCode(code)             → refresh_token da Apple
//   4. (na exclusão de conta) revokeAppleRefreshToken()  → revoga o acesso concedido
//
// ── Por que um client_secret gerado a cada chamada? ──────────────────────────
// A Apple não aceita um client_secret estático como o Google: exige um JWT
// assinado com ES256 pela Key privada do portal (Key ID + Team ID, ver
// config/env.ts), com validade de minutos. Esse JWT é o "client_secret" que
// a Apple espera nos endpoints /auth/token e /auth/revoke.
//
// ── Por que import() dinâmico em vez de `import ... from 'jose'`? ────────────
// jose 6.x é um pacote ESM-only (sem build CJS — ver seu package.json,
// "type": "module", sem campo "require" em "exports"). apps/api compila para
// CommonJS (tsconfig "module": "Node16", sem "type": "module" no
// package.json, executado via `node dist/index.js`), e um `import` estático
// de valor gera um `require('jose')` no JS emitido — que falha em runtime
// com ERR_REQUIRE_ESM. Mesmo um `import type` precisa do atributo
// `resolution-mode: "import"` abaixo, já que o moduleResolution "Node16"
// precisa saber se resolve 'jose' pelas regras de CJS ou ESM e o
// package.json de 'jose' diverge do de apps/api. Só os valores em si
// (createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT) precisam do
// import() dinâmico, que é a forma suportada pelo Node de carregar ESM a
// partir de um módulo CJS.
import type { CryptoKey } from 'jose' with { 'resolution-mode': 'import' };
import { env } from '../config/env';

type JoseModule = typeof import('jose', { with: { 'resolution-mode': 'import' } });

let joseModulePromise: Promise<JoseModule> | undefined;

function loadJose(): Promise<JoseModule> {
  joseModulePromise ??= import('jose');
  return joseModulePromise;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

// Timeout explícito — mesmo motivo do GOOGLE_OAUTH_REQUEST_TIMEOUT_MS
// (google.service.ts) e do REVENUECAT_REQUEST_TIMEOUT_MS (revenueCat.service.ts):
// nenhuma chamada a um provedor externo deve ficar pendurada indefinidamente.
const APPLE_REQUEST_TIMEOUT_MS = 10_000;

// client_secret de vida curta — a Apple recomenda minutos, não horas. 5
// minutos cobre com folga a janela entre geração e uso (chamada imediata ao
// /auth/token ou /auth/revoke) e minimiza o impacto de um valor exposto.
const APPLE_CLIENT_SECRET_TTL = '5m';

// JWKS remoto da Apple — jose cacheia e revalida automaticamente conforme o
// Cache-Control da resposta, então uma única instância é reaproveitada por
// toda verificação (mesmo padrão de singleton do oauth2Client em google.service.ts).
let appleJwksPromise: Promise<ReturnType<JoseModule['createRemoteJWKSet']>> | undefined;

function getAppleJwks(): Promise<ReturnType<JoseModule['createRemoteJWKSet']>> {
  appleJwksPromise ??= loadJose().then(({ createRemoteJWKSet }) =>
    createRemoteJWKSet(new URL(APPLE_KEYS_URL), { timeoutDuration: APPLE_REQUEST_TIMEOUT_MS })
  );
  return appleJwksPromise;
}

// ─── Claims extraídos do identityToken ────────────────────────────────────────

/**
 * Claims relevantes do identityToken da Apple, já verificados.
 */
export interface AppleIdentityTokenClaims {
  /** Identificador estável do usuário na Apple (claim `sub`) — chave de lookup no MongoDB. */
  sub: string;
  /**
   * Endereço de email. Só vem ausente em cenários que não ocorrem no fluxo
   * nativo padrão (a Apple sempre inclui `email` no identityToken, mesmo
   * quando é um endereço de retransmissão "Hide My Email").
   */
  email?: string;
  /**
   * Reflete o claim `email_verified`. O controller DEVE rejeitar o fluxo
   * quando `false` antes de qualquer lookup no banco — mesmo motivo do
   * `emailVerified` de google.service.ts: usar `email` para vincular a uma
   * conta existente sem essa checagem permite assumir a conta de outra
   * pessoa que já tenha esse endereço cadastrado.
   */
  emailVerified: boolean;
}

/**
 * Verifica a assinatura e os claims do identityToken emitido pela Apple.
 *
 * O que entra: `identityToken` — JWT (ES256) recebido do SDK nativo da Apple
 *   no app mobile (expo-apple-authentication), repassado sem alteração pelo
 *   controller.
 *
 * O que sai: `AppleIdentityTokenClaims` com sub, email e emailVerified.
 *
 * O que acontece internamente: `jwtVerify` busca a chave pública
 *   correspondente ao `kid` do header no JWKS remoto da Apple
 *   (appleid.apple.com/auth/keys), valida a assinatura ES256 e, via as
 *   opções `issuer`/`audience`, valida explicitamente que:
 *   ✅ `iss` é exatamente 'https://appleid.apple.com'
 *   ✅ `aud` é o nosso bundle id (APPLE_CLIENT_ID = com.blendi.pulse)
 *   ✅ `exp`/`nbf` — o token não está expirado (checado automaticamente)
 *
 * @throws Error se a assinatura for inválida, o token expirado, os claims
 *   iss/aud não corresponderem, ou o claim obrigatório `sub` estiver ausente.
 */
export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<AppleIdentityTokenClaims> {
  const { jwtVerify } = await loadJose();
  const jwks = await getAppleJwks();

  const { payload } = await jwtVerify(identityToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: env.APPLE_CLIENT_ID,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Apple identityToken missing required field: sub');
  }

  const email = typeof payload.email === 'string' ? payload.email : undefined;
  // A Apple já emitiu este claim como string ("true"/"false") em versões
  // antigas do token e como boolean nas atuais — aceita os dois formatos.
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

  return {
    sub: payload.sub,
    email,
    emailVerified,
  };
}

// ─── client_secret: chave privada (importada e cacheada em memória) ─────────

// dotenv (16.4.x) aceita o conteúdo real do .p8 multilinha quando o .env usa
// aspas duplas multilinha — mas, se o valor for colado com o escape literal
// "\n" (2 caracteres, comum em painéis que só aceitam uma linha), o parser de
// PEM do jose não reconhece como quebra de linha real. Normaliza os dois
// formatos antes de importar a chave.
let cachedApplePrivateKey: Promise<CryptoKey> | undefined;

function getApplePrivateKey(): Promise<CryptoKey> {
  if (!cachedApplePrivateKey) {
    const pem = env.APPLE_PRIVATE_KEY.includes('\\n')
      ? env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : env.APPLE_PRIVATE_KEY;
    cachedApplePrivateKey = loadJose().then(({ importPKCS8 }) => importPKCS8(pem, 'ES256'));
  }
  return cachedApplePrivateKey;
}

/**
 * Gera o client_secret (JWT ES256 de curta duração) exigido pela Apple nos
 * endpoints /auth/token e /auth/revoke.
 *
 * O que sai: string JWT assinado com a Key privada do portal
 *   (APPLE_PRIVATE_KEY), issuer = Team ID, subject/audience = bundle id,
 *   com o Key ID correto no header (`kid`), válido por APPLE_CLIENT_SECRET_TTL.
 */
export async function generateAppleClientSecret(): Promise<string> {
  const { SignJWT } = await loadJose();
  const privateKey = await getApplePrivateKey();

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(APPLE_CLIENT_SECRET_TTL)
    .sign(privateKey);
}

// ─── Troca do authorizationCode por refresh_token ────────────────────────────

interface AppleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

/**
 * Troca o authorizationCode (recebido do SDK nativo da Apple) por um
 * refresh_token, via POST para https://appleid.apple.com/auth/token.
 *
 * O que entra: `authorizationCode` — código de uso único entregue pelo SDK
 *   nativo da Apple ao app mobile junto do identityToken.
 *
 * O que sai: string com o refresh_token da Apple — guardado no usuário
 *   (`appleRefreshToken`) só para permitir a revogação futura na exclusão
 *   de conta (ver `revokeAppleRefreshToken`).
 *
 * @throws Error se a Apple rejeitar o código (inválido, expirado ou já
 *   utilizado) ou não retornar um refresh_token na resposta.
 */
export async function exchangeAppleAuthorizationCode(authorizationCode: string): Promise<string> {
  const clientSecret = await generateAppleClientSecret();

  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => ({}))) as AppleTokenResponse;

  if (!response.ok || !body.refresh_token) {
    throw new Error(
      `Apple token exchange failed: ${body.error ?? `HTTP ${response.status}`}`
    );
  }

  return body.refresh_token;
}

// ─── Revogação do acesso ──────────────────────────────────────────────────────

/**
 * Revoga o refresh_token da Apple — chamado na exclusão de conta (ver
 * `deleteAccount`, user.controller.ts) para que a Apple deixe de considerar
 * o BLENDi um app autorizado para este usuário.
 *
 * O que entra: `refreshToken` — o `appleRefreshToken` armazenado no usuário.
 *
 * O que acontece internamente: POST para
 *   https://appleid.apple.com/auth/revoke com token_type_hint=refresh_token,
 *   o token armazenado, client_id e um client_secret novo (gerado na hora —
 *   o client_secret anterior pode já ter expirado).
 *
 * @throws Error se a Apple rejeitar a revogação. O chamador (deleteAccount)
 *   trata esta chamada como melhor esforço e nunca deve deixar essa falha
 *   bloquear a exclusão da conta.
 */
export async function revokeAppleRefreshToken(refreshToken: string): Promise<void> {
  const clientSecret = await generateAppleClientSecret();

  const response = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as AppleTokenResponse;
    throw new Error(`Apple token revocation failed: ${body.error ?? `HTTP ${response.status}`}`);
  }
}
