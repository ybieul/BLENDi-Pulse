// Testes do login Google com código de uso único + verificador (CP-1.1.1d).
// Mocka o modelo User, o google.service (sem rede), o auth.service, o e-mail
// e o modelo GoogleAuthCode (store em memória com findOneAndDelete atômico).
// O googleAuthCode.service e o controller rodam de verdade.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

// ─── Store em memória do GoogleAuthCode ──────────────────────────────────────

interface StoredCode {
  codeHash: string;
  userId: string;
  codeChallenge: string;
  isNewUser: boolean;
  expiresAt: Date;
}

let codeStore: StoredCode[] = [];

mock.module('../models/GoogleAuthCode', {
  namedExports: {
    GoogleAuthCodeModel: {
      create: async (doc: StoredCode) => {
        codeStore.push({ ...doc, userId: String(doc.userId) });
        return doc;
      },
      findOneAndDelete: (filter: { codeHash: string }) => ({
        lean: async () => {
          const index = codeStore.findIndex(entry => entry.codeHash === filter.codeHash);
          if (index === -1) return null;
          const [removed] = codeStore.splice(index, 1);
          return removed;
        },
      }),
    },
  },
});

// ─── Usuário ──────────────────────────────────────────────────────────────────

const USER_ID = '665f1c2e8b3a4d0012345678';

function leanUser() {
  return {
    _id: USER_ID,
    email: 'google-user@example.com',
    name: 'Google User',
    blendiModel: 'ProPlus',
    blendiOwnership: 'blendi',
    dietaryPreferences: ['vegan'],
    otherBlenderModel: null,
    goal: 'Muscle',
    locale: 'pt-BR',
    unitSystem: 'metric',
    timezone: 'America/Sao_Paulo',
    dailyProteinTarget: 160,
    dailyCalorieTarget: 2200,
    dailyCarbTarget: 220,
    dailyFatTarget: 70,
    totalXP: 120,
    blendCount: 3,
    currentStreak: 2,
    longestStreak: 5,
    tokenVersion: 4,
    isPro: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildFakeUserDoc() {
  const doc: Record<string, unknown> = {
    id: USER_ID,
    email: 'google-user@example.com',
    name: 'Google User',
    googleId: 'google-sub-1',
    tokenVersion: 4,
  };
  doc.save = async () => doc;
  return doc;
}

let existingUserDoc: Record<string, unknown> | null = null;
let leanUserById: Record<string, unknown> | null = null;

function thenable(value: unknown) {
  const query: Record<string, unknown> = { select: () => query };
  query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return query;
}

const userCreateMock = mock.fn(async (_doc: unknown) => buildFakeUserDoc());

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findOne: (filter: Record<string, unknown>) =>
        thenable('googleId' in filter ? existingUserDoc : null),
      create: userCreateMock,
      findById: (_id: string) => ({ lean: async () => leanUserById }),
    },
  },
});

// ─── Serviços externos ────────────────────────────────────────────────────────

mock.module('../services/google.service', {
  namedExports: {
    getAuthorizationUrl: (state: string) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
    exchangeCodeForTokens: async () => 'google-id-token',
    getUserInfoFromToken: async () => ({
      googleId: 'google-sub-1',
      email: 'google-user@example.com',
      emailVerified: true,
      name: 'Google User',
    }),
  },
});

const generateAccessTokenMock = mock.fn((userId: string, _email: string) => `access-${userId}`);
const generateRefreshTokenMock = mock.fn(
  (userId: string, tokenVersion: number) => `refresh-${userId}-${tokenVersion}`
);

mock.module('../services/auth.service', {
  namedExports: {
    generateAccessToken: generateAccessTokenMock,
    generateRefreshToken: generateRefreshTokenMock,
  },
});

mock.module('../services/email.service', {
  namedExports: {
    EmailService: class {
      sendWelcomeEmail = async () => undefined;
    },
  },
});

type ControllerModule = typeof import('./google.controller.js');
let getGoogleUrl: ControllerModule['getGoogleUrl'];
let handleGoogleCallback: ControllerModule['handleGoogleCallback'];
let exchangeGoogleCode: ControllerModule['exchangeGoogleCode'];

before(async () => {
  ({ getGoogleUrl, handleGoogleCallback, exchangeGoogleCode } = await import(
    './google.controller.js'
  ));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FakeRes {
  statusCode?: number;
  body?: Record<string, unknown>;
  redirectUrl?: string;
}

async function call(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>
): Promise<FakeRes> {
  const out: FakeRes = {};
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      out.body = body;
      return res;
    },
    redirect(url: string) {
      out.redirectUrl = url;
      return res;
    },
  };
  let nextError: unknown;
  await handler(req as Request, res as unknown as Response, (err?: unknown) => {
    nextError = err;
  });
  if (nextError) throw nextError;
  return out;
}

function newVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function stateFor(codeChallenge: string): Promise<string> {
  const res = await call(getGoogleUrl, { query: { codeChallenge } });
  assert.equal(res.statusCode, 200);
  const url = new URL((res.body?.data as { url: string }).url);
  return url.searchParams.get('state') ?? '';
}

/** Roda URL + callback e devolve o código do deep link. */
async function loginAndGetCode(verifier: string): Promise<string> {
  const state = await stateFor(challengeOf(verifier));
  const res = await call(handleGoogleCallback, { query: { code: 'google-auth-code', state } });
  const url = new URL(res.redirectUrl ?? '');
  return url.searchParams.get('code') ?? '';
}

async function exchange(body: unknown) {
  return call(exchangeGoogleCode, { body } as Partial<Request>);
}

const GENERIC_FAILURE = {
  statusCode: 401,
  body: {
    success: false,
    code: 'auth/google-exchange-failed',
    message: 'Google sign-in could not be completed. Please try again.',
  },
};

function assertGenericFailure(res: FakeRes) {
  assert.deepEqual({ statusCode: res.statusCode, body: res.body }, GENERIC_FAILURE);
}

beforeEach(() => {
  codeStore = [];
  existingUserDoc = buildFakeUserDoc();
  leanUserById = leanUser();
  generateAccessTokenMock.mock.resetCalls();
  generateRefreshTokenMock.mock.resetCalls();
  userCreateMock.mock.resetCalls();
});

// ─── GET /auth/google/url ─────────────────────────────────────────────────────

describe('GET /auth/google/url — desafio obrigatório', () => {
  it('sem desafio: 400 e nenhuma URL', async () => {
    const res = await call(getGoogleUrl, { query: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.code, 'validation/invalid-input');
    assert.equal(res.body?.data, undefined);
  });

  for (const [label, value] of [
    ['curto demais', 'abc'],
    ['44 caracteres', `${'a'.repeat(44)}`],
    ['com padding', `${'a'.repeat(42)}=`],
    ['caractere fora do base64url', `${'a'.repeat(42)}+`],
    ['array na query', ['a'.repeat(43), 'b'.repeat(43)]],
  ] as const) {
    it(`desafio inválido (${label}): 400`, async () => {
      const res = await call(getGoogleUrl, { query: { codeChallenge: value } as never });
      assert.equal(res.statusCode, 400);
    });
  }

  it('desafio válido: state assinado leva { csrf, codeChallenge }', async () => {
    const challenge = challengeOf(newVerifier());
    const state = await stateFor(challenge);
    const payload = JSON.parse(Buffer.from(state.split('.')[1] ?? '', 'base64url').toString());
    assert.equal(payload.csrf, true);
    assert.equal(payload.codeChallenge, challenge);
    assert.deepEqual(Object.keys(payload).sort(), ['codeChallenge', 'csrf', 'exp', 'iat']);
  });
});

// ─── GET /auth/google/callback ───────────────────────────────────────────────

describe('GET /auth/google/callback — só o código no deep link', () => {
  it('cria o código e não põe tokens nem usuário na URL', async () => {
    const verifier = newVerifier();
    const state = await stateFor(challengeOf(verifier));

    const res = await call(handleGoogleCallback, { query: { code: 'google-auth-code', state } });

    const url = new URL(res.redirectUrl ?? '');
    assert.equal(`${url.protocol}//${url.host}${url.pathname}`, 'blendipulse://auth/callback');
    assert.deepEqual([...url.searchParams.keys()], ['code']);
    const code = url.searchParams.get('code') ?? '';
    assert.match(code, /^[A-Za-z0-9_-]{43}$/);

    for (const forbidden of ['accessToken', 'refreshToken', 'user', 'isNewUser', 'google-user@example.com']) {
      assert.equal(res.redirectUrl?.includes(forbidden), false, forbidden);
    }
    assert.equal(generateAccessTokenMock.mock.callCount(), 0);
    assert.equal(generateRefreshTokenMock.mock.callCount(), 0);

    // Só o hash do código fica guardado, ligado ao usuário e ao desafio.
    assert.equal(codeStore.length, 1);
    const stored = codeStore[0];
    assert.equal(stored?.codeHash, createHash('sha256').update(code).digest('hex'));
    assert.notEqual(stored?.codeHash, code);
    assert.equal(stored?.userId, USER_ID);
    assert.equal(stored?.codeChallenge, challengeOf(verifier));
    assert.equal(stored?.isNewUser, false);
    const ttl = (stored?.expiresAt.getTime() ?? 0) - Date.now();
    assert.ok(ttl > 100_000 && ttl <= 120_000, `validade ~2 min (${ttl} ms)`);
  });

  it('conta nova: isNewUser true guardado no código', async () => {
    existingUserDoc = null;
    await loginAndGetCode(newVerifier());
    assert.equal(userCreateMock.mock.callCount(), 1);
    assert.equal(codeStore[0]?.isNewUser, true);
  });

  it('state antigo, sem desafio: invalid_state e nenhum código', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { env } = await import('../config/env.js');
    const oldState = jwt.sign({ csrf: true }, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });

    const res = await call(handleGoogleCallback, { query: { code: 'google-auth-code', state: oldState } });

    assert.equal(res.redirectUrl, 'blendipulse://auth/callback?error=errors.auth.invalid_state');
    assert.equal(codeStore.length, 0);
  });

  it('redirecionamentos de erro continuam iguais', async () => {
    const cancelled = await call(handleGoogleCallback, { query: { error: 'access_denied' } });
    assert.equal(cancelled.redirectUrl, 'blendipulse://auth/callback?error=errors.auth.google_cancelled');

    const noState = await call(handleGoogleCallback, { query: { code: 'x' } });
    assert.equal(noState.redirectUrl, 'blendipulse://auth/callback?error=errors.auth.invalid_state');

    const badState = await call(handleGoogleCallback, { query: { code: 'x', state: 'not-a-jwt' } });
    assert.equal(badState.redirectUrl, 'blendipulse://auth/callback?error=errors.auth.invalid_state');
  });
});

// ─── POST /auth/google/exchange ──────────────────────────────────────────────

describe('POST /auth/google/exchange', () => {
  it('código válido + verificador certo: tokens e usuário completo (serializador do getMe)', async () => {
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);

    const res = await exchange({ code, codeVerifier: verifier });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
    const data = res.body?.data as Record<string, unknown>;
    assert.equal(data.accessToken, `access-${USER_ID}`);
    assert.equal(data.refreshToken, `refresh-${USER_ID}-4`);
    assert.equal(data.isNewUser, false);

    const { serializeUserProfile } = await import('../utils/userProfile.utils.js');
    assert.deepEqual(data.user, serializeUserProfile(leanUser() as never));
    const user = data.user as Record<string, unknown>;
    assert.equal(user.id, USER_ID);
    assert.equal(user.preferredLanguage, 'pt-BR');
    assert.deepEqual(user.dietaryPreferences, ['vegan']);
    assert.equal(user.isPro, true);
    assert.equal(user.currentLevel !== undefined, true);
    assert.equal(codeStore.length, 0, 'código consumido');
  });

  it('conta nova: isNewUser true chega na resposta', async () => {
    existingUserDoc = null;
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);

    const res = await exchange({ code, codeVerifier: verifier });

    assert.equal((res.body?.data as { isNewUser: boolean }).isNewUser, true);
  });

  it('código inexistente: erro genérico', async () => {
    assertGenericFailure(
      await exchange({ code: randomBytes(32).toString('base64url'), codeVerifier: newVerifier() })
    );
  });

  it('verificador errado: erro genérico', async () => {
    const code = await loginAndGetCode(newVerifier());
    assertGenericFailure(await exchange({ code, codeVerifier: newVerifier() }));
  });

  it('código expirado: erro genérico (mesmo antes do TTL do banco apagar)', async () => {
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);
    codeStore[0]!.expiresAt = new Date(Date.now() - 1);

    assertGenericFailure(await exchange({ code, codeVerifier: verifier }));
  });

  it('o mesmo código não funciona duas vezes', async () => {
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);

    assert.equal((await exchange({ code, codeVerifier: verifier })).statusCode, 200);
    assertGenericFailure(await exchange({ code, codeVerifier: verifier }));
  });

  it('tentativa com verificador errado queima o código: o certo depois também falha', async () => {
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);

    assertGenericFailure(await exchange({ code, codeVerifier: newVerifier() }));
    assertGenericFailure(await exchange({ code, codeVerifier: verifier }));
    assert.equal(generateAccessTokenMock.mock.callCount(), 0);
  });

  it('usuário apagado entre o callback e a troca: erro genérico', async () => {
    const verifier = newVerifier();
    const code = await loginAndGetCode(verifier);
    leanUserById = null;

    assertGenericFailure(await exchange({ code, codeVerifier: verifier }));
  });

  for (const [label, body] of [
    ['corpo vazio', {}],
    ['sem verificador', { code: randomBytes(32).toString('base64url') }],
    ['verificador curto', { code: randomBytes(32).toString('base64url'), codeVerifier: 'short' }],
    ['código com formato errado', { code: 'abc', codeVerifier: 'a'.repeat(43) }],
    ['injeção NoSQL no código', { code: { $ne: null }, codeVerifier: 'a'.repeat(43) }],
  ] as const) {
    it(`${label}: mesmo erro genérico`, async () => {
      assertGenericFailure(await exchange(body));
    });
  }

  it('todas as falhas são indistinguíveis entre si', async () => {
    const verifier = newVerifier();
    const used = await loginAndGetCode(verifier);
    await exchange({ code: used, codeVerifier: verifier });
    const wrong = await loginAndGetCode(newVerifier());

    const responses = [
      await exchange({ code: randomBytes(32).toString('base64url'), codeVerifier: verifier }),
      await exchange({ code: wrong, codeVerifier: verifier }),
      await exchange({ code: used, codeVerifier: verifier }),
    ];

    const serialized = responses.map(r => JSON.stringify({ s: r.statusCode, b: r.body }));
    assert.equal(new Set(serialized).size, 1);
  });
});
