// Testes críticos do fluxo de Sign in with Apple (POST /auth/apple). Mocka
// '../models/User', '../services/apple.service', '../services/auth.service' e
// '../services/email.service' para exercitar handleAppleSignIn diretamente
// (sem HTTP real nem MongoDB) — foco nos três casos (login/vincular/criar),
// na proteção contra sobrescrita de appleUserId (achado #9) e no TOCTOU de
// criação concorrente, que são os pontos de maior risco de segurança do fluxo.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';

// ─── Fake de documento Mongoose (suficiente para os campos lidos/escritos) ───

function buildFakeUser(overrides: Record<string, unknown> = {}) {
  const user: Record<string, unknown> = {
    id: 'user-id-1',
    email: 'existing@example.com',
    name: 'Existing User',
    blendiModel: 'Lite',
    goal: 'Wellness',
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'America/New_York',
    dailyProteinTarget: 150,
    dailyCalorieTarget: 2000,
    dailyCarbTarget: 200,
    dailyFatTarget: 67,
    longestStreak: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    tokenVersion: 0,
    appleUserId: undefined,
    appleRefreshToken: undefined,
    ...overrides,
  };
  user.save = mock.fn(async () => user);
  return user;
}

// Imita o encadeamento de uma query do mongoose (.select() é no-op encadeável,
// o resultado final é sempre `resolvedValue`) sem precisar de MongoDB real.
function fakeQuery(resolvedValue: unknown) {
  const query: Record<string, unknown> = {
    select: () => query,
  };
  query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return query;
}

const findOneMock = mock.fn((_filter: unknown) => fakeQuery(null));
const createMock = mock.fn(async (_doc: unknown) => buildFakeUser());

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findOne: findOneMock,
      create: createMock,
    },
  },
});

interface FakeAppleClaims {
  sub: string;
  email: string | undefined;
  emailVerified: boolean;
}

const verifyAppleIdentityTokenMock = mock.fn(
  async (_token: string): Promise<FakeAppleClaims> => ({
    sub: 'apple-sub-1',
    email: 'user@example.com',
    emailVerified: true,
  })
);
const exchangeAppleAuthorizationCodeMock = mock.fn(async (_code: string) => 'apple-refresh-token-xyz');

mock.module('../services/apple.service', {
  namedExports: {
    verifyAppleIdentityToken: verifyAppleIdentityTokenMock,
    exchangeAppleAuthorizationCode: exchangeAppleAuthorizationCodeMock,
  },
});

const generateAccessTokenMock = mock.fn((userId: string, _email: string) => `access-${userId}`);
const generateRefreshTokenMock = mock.fn((userId: string, _tokenVersion: number) => `refresh-${userId}`);

mock.module('../services/auth.service', {
  namedExports: {
    generateAccessToken: generateAccessTokenMock,
    generateRefreshToken: generateRefreshTokenMock,
  },
});

const sendWelcomeEmailMock = mock.fn(async () => undefined);

mock.module('../services/email.service', {
  namedExports: {
    EmailService: class {
      sendWelcomeEmail = sendWelcomeEmailMock;
    },
  },
});

type ControllerModule = typeof import('./apple.controller.js');
let handleAppleSignIn: ControllerModule['handleAppleSignIn'];

before(async () => {
  ({ handleAppleSignIn } = await import('./apple.controller.js'));
});

function buildReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function buildRes() {
  const res: { statusCode?: number; body?: unknown } & Response = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  } as unknown as { statusCode?: number; body?: unknown } & Response;
  return res;
}

const nextMock = mock.fn();

beforeEach(() => {
  findOneMock.mock.resetCalls();
  createMock.mock.resetCalls();
  verifyAppleIdentityTokenMock.mock.resetCalls();
  exchangeAppleAuthorizationCodeMock.mock.resetCalls();
  generateAccessTokenMock.mock.resetCalls();
  generateRefreshTokenMock.mock.resetCalls();
  sendWelcomeEmailMock.mock.resetCalls();
  nextMock.mock.resetCalls();

  findOneMock.mock.mockImplementation(() => fakeQuery(null));
  createMock.mock.mockImplementation(async () => buildFakeUser());
  verifyAppleIdentityTokenMock.mock.mockImplementation(async () => ({
    sub: 'apple-sub-1',
    email: 'user@example.com',
    emailVerified: true,
  }));
  exchangeAppleAuthorizationCodeMock.mock.mockImplementation(async () => 'apple-refresh-token-xyz');
});

const VALID_BODY = {
  identityToken: 'valid.identity.token',
  authorizationCode: 'valid-auth-code',
};

describe('handleAppleSignIn — validação de input', () => {
  it('body vazio → 400 validation/invalid-input, sem chamar a Apple nem o banco', async () => {
    const req = buildReq({});
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { code: string }).code, 'validation/invalid-input');
    assert.equal(verifyAppleIdentityTokenMock.mock.callCount(), 0);
    assert.equal(findOneMock.mock.callCount(), 0);
  });
});

describe('handleAppleSignIn — falhas de verificação Apple', () => {
  it('identityToken inválido → 401 auth/apple-auth-failed, sem tocar no banco', async () => {
    verifyAppleIdentityTokenMock.mock.mockImplementation(async () => {
      throw new Error('signature invalid');
    });
    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { code: string }).code, 'auth/apple-auth-failed');
    assert.equal(findOneMock.mock.callCount(), 0);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it('exchange do authorizationCode falha → 401 auth/apple-auth-failed, sem tocar no banco', async () => {
    exchangeAppleAuthorizationCodeMock.mock.mockImplementation(async () => {
      throw new Error('invalid_grant');
    });
    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { code: string }).code, 'auth/apple-auth-failed');
    assert.equal(findOneMock.mock.callCount(), 0);
  });
});

describe('handleAppleSignIn — Caso 1 (login)', () => {
  it('appleUserId já existe → login direto, atualiza appleRefreshToken, isNewUser=false', async () => {
    const existing = buildFakeUser({ appleUserId: 'apple-sub-1', appleRefreshToken: 'old-token' });
    findOneMock.mock.mockImplementation(() => fakeQuery(existing));

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 200);
    const body = res.body as { data: { isNewUser: boolean; user: { id: string } } };
    assert.equal(body.data.isNewUser, false);
    assert.equal(existing.appleRefreshToken, 'apple-refresh-token-xyz');
    assert.equal((existing.save as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    assert.equal(createMock.mock.callCount(), 0);
  });
});

describe('handleAppleSignIn — Caso 2 (vincular conta existente)', () => {
  it('email verificado + conta existente sem appleUserId → vincula, isNewUser=false', async () => {
    const existing = buildFakeUser({ email: 'user@example.com', appleUserId: undefined });
    findOneMock.mock.mockImplementation((filter: unknown) => {
      const f = filter as Record<string, unknown>;
      if ('appleUserId' in f) return fakeQuery(null);
      if ('email' in f) return fakeQuery(existing);
      return fakeQuery(null);
    });

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 200);
    assert.equal(existing.appleUserId, 'apple-sub-1');
    assert.equal(existing.appleRefreshToken, 'apple-refresh-token-xyz');
    assert.equal((existing.save as ReturnType<typeof mock.fn>).mock.callCount(), 1);
  });

  it('ACHADO #9 — conta já vinculada a OUTRA Apple ID → 409 auth/apple-account-conflict, NÃO sobrescreve nem salva', async () => {
    const existing = buildFakeUser({ email: 'user@example.com', appleUserId: 'apple-sub-DIFFERENTE' });
    findOneMock.mock.mockImplementation((filter: unknown) => {
      const f = filter as Record<string, unknown>;
      if ('appleUserId' in f) return fakeQuery(null);
      if ('email' in f) return fakeQuery(existing);
      return fakeQuery(null);
    });

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 409);
    assert.equal((res.body as { code: string }).code, 'auth/apple-account-conflict');
    // Nunca sobrescreve o vínculo antigo nem salva
    assert.equal(existing.appleUserId, 'apple-sub-DIFFERENTE');
    assert.equal((existing.save as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it('email_verified=false → NÃO tenta vincular por email, cai no Caso 3 (criação)', async () => {
    verifyAppleIdentityTokenMock.mock.mockImplementation(async () => ({
      sub: 'apple-sub-1',
      email: 'user@example.com',
      emailVerified: false,
    }));
    findOneMock.mock.mockImplementation((filter: unknown) => {
      const f = filter as Record<string, unknown>;
      // Mesmo que exista uma conta com esse email, não deve ser consultada
      // nem vinculada quando email_verified=false.
      if ('email' in f) throw new Error('NÃO deveria buscar por email quando email_verified=false');
      return fakeQuery(null);
    });

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 200);
    assert.equal(createMock.mock.callCount(), 1);
    const createdArgs = createMock.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.equal(createdArgs.emailVerified, false);
  });
});

describe('handleAppleSignIn — Caso 3 (criação de conta)', () => {
  it('cria conta nova com defaults, salva emailVerified do claim, dispara welcome email', async () => {
    const req = buildReq({ ...VALID_BODY, fullName: 'Fulano da Silva' });
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 200);
    assert.equal(createMock.mock.callCount(), 1);
    const createdArgs = createMock.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.equal(createdArgs.email, 'user@example.com');
    assert.equal(createdArgs.emailVerified, true);
    assert.equal(createdArgs.appleUserId, 'apple-sub-1');
    assert.equal(createdArgs.appleRefreshToken, 'apple-refresh-token-xyz');
    assert.equal(createdArgs.name, 'Fulano da Silva');
    assert.equal(createdArgs.blendiModel, 'Lite');
    const body = res.body as { data: { isNewUser: boolean } };
    assert.equal(body.data.isNewUser, true);
    assert.equal(sendWelcomeEmailMock.mock.callCount(), 1);
  });

  it('sem fullName → nome cai no fallback da parte local do email', async () => {
    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    const createdArgs = createMock.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.equal(createdArgs.name, 'user');
  });

  it('ACHADO #10 — claims.email ausente → 401 claro, NUNCA chama UserModel.create', async () => {
    verifyAppleIdentityTokenMock.mock.mockImplementation(async () => ({
      sub: 'apple-sub-sem-email',
      email: undefined,
      emailVerified: false,
    }));

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { code: string }).code, 'auth/apple-auth-failed');
    assert.equal(createMock.mock.callCount(), 0);
  });

  it('resposta de sucesso NUNCA inclui appleRefreshToken nem password', async () => {
    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    const body = res.body as { data: { user: Record<string, unknown> } };
    assert.equal('appleRefreshToken' in body.data.user, false);
    assert.equal('password' in body.data.user, false);
    assert.equal('appleUserId' in body.data.user, false);
  });
});

describe('handleAppleSignIn — TOCTOU (corrida de criação concorrente)', () => {
  it('duplicate key no create → recupera a conta já criada pela outra requisição, isNewUser=false', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    createMock.mock.mockImplementation(async () => {
      throw duplicateKeyError;
    });

    const recovered = buildFakeUser({ appleUserId: 'apple-sub-1', email: 'user@example.com' });
    findOneMock.mock.mockImplementation((filter: unknown) => {
      const f = filter as Record<string, unknown>;
      if ('$or' in f) return fakeQuery(recovered);
      return fakeQuery(null);
    });

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(res.statusCode, 200);
    const body = res.body as { data: { isNewUser: boolean } };
    assert.equal(body.data.isNewUser, false);
  });

  it('duplicate key SEM conta recuperável → propaga o erro original pro errorHandler (next)', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    createMock.mock.mockImplementation(async () => {
      throw duplicateKeyError;
    });
    findOneMock.mock.mockImplementation((filter: unknown) => {
      const f = filter as Record<string, unknown>;
      if ('$or' in f) return fakeQuery(null);
      return fakeQuery(null);
    });

    const req = buildReq(VALID_BODY);
    const res = buildRes();

    await handleAppleSignIn(req, res, nextMock);

    assert.equal(nextMock.mock.callCount(), 1);
    assert.equal(nextMock.mock.calls[0]?.arguments[0], duplicateKeyError);
  });
});
