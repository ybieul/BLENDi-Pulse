// CP-1.1.9 — POST /auth/register com o goal WeightLoss: a conta nasce com
// weightGoal 'lose' (os outros goals continuam com o placeholder 'maintain'),
// e um weightGoal mandado no corpo é ignorado (registerSchema não o aceita).
// Controller real; UserModel, tokens e e-mail simulados.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

const createdDocs: Array<Record<string, unknown>> = [];

const createMock = mock.fn(async (doc: Record<string, unknown>) => {
  createdDocs.push(doc);
  return {
    ...doc,
    id: '665f1b2c3d4e5f6a7b8c9d0e',
    tokenVersion: 0,
    createdAt: new Date(),
    save: async () => undefined,
  };
});

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findOne: () => ({ lean: async () => null }),
      create: createMock,
    },
  },
});
mock.module('../services/auth.service', {
  namedExports: {
    generateAccessToken: () => 'access',
    generateRefreshToken: () => 'refresh',
    verifyRefreshToken: () => null,
    isTokenExpiredError: () => false,
  },
});
mock.module('../services/email.service', {
  namedExports: {
    EmailService: class {
      sendWelcomeEmail() {
        return Promise.resolve();
      }
    },
  },
});

type ControllerModule = typeof import('./auth.controller.js');
let register: ControllerModule['register'];

before(async () => {
  ({ register } = await import('./auth.controller.js'));
});

beforeEach(() => {
  createdDocs.length = 0;
  createMock.mock.resetCalls();
});

async function callRegister(body: Record<string, unknown>) {
  const captured: { status?: number; body?: { code?: string } } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: { code?: string }) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  await register({ body } as Request, res, ((err: unknown) => {
    throw err;
  }) as NextFunction);
  return captured;
}

const BASE = {
  email: 'new@test.local',
  password: 'Password123',
  name: 'New User',
  blendiModel: 'Lite',
  dailyProteinTarget: 150,
  dailyCalorieTarget: 1500,
  timezone: 'UTC',
};

describe('POST /auth/register — goal WeightLoss', () => {
  it('cria a conta com weightGoal lose', async () => {
    const result = await callRegister({ ...BASE, goal: 'WeightLoss' });
    assert.equal(result.status, 201);
    assert.equal(createdDocs[0]?.goal, 'WeightLoss');
    assert.equal(createdDocs[0]?.weightGoal, 'lose');
  });

  it('weightGoal gain no corpo do cadastro é ignorado (fora do schema): continua lose', async () => {
    const result = await callRegister({ ...BASE, goal: 'WeightLoss', weightGoal: 'gain' });
    assert.equal(result.status, 201);
    assert.equal(createdDocs[0]?.weightGoal, 'lose');
  });

  it('os outros goals continuam nascendo com o placeholder maintain', async () => {
    for (const goal of ['Muscle', 'Wellness', 'Energy', 'Recovery']) {
      createdDocs.length = 0;
      await callRegister({ ...BASE, goal });
      assert.equal(createdDocs[0]?.weightGoal, 'maintain', goal);
    }
  });

  it('goal inválido continua recusado na validação', async () => {
    const result = await callRegister({ ...BASE, goal: 'weight_loss' });
    assert.equal(result.status, 400);
    assert.equal(createMock.mock.callCount(), 0);
  });
});

// ─── Teste no build EAS (25-26/11): nome e sobrenome no cadastro por e-mail ──

describe('POST /auth/register — nome e sobrenome', () => {
  const { name: _legacyName, ...BASE_WITHOUT_NAME } = BASE;

  it('app atual: firstName + lastName → gravados e name composto, nunca "a confirmar"', async () => {
    const result = await callRegister({
      ...BASE_WITHOUT_NAME,
      goal: 'Wellness',
      firstName: ' Gabriel ',
      lastName: 'Silva',
    });
    assert.equal(result.status, 201);
    assert.equal(createdDocs[0]?.firstName, 'Gabriel');
    assert.equal(createdDocs[0]?.lastName, 'Silva');
    assert.equal(createdDocs[0]?.name, 'Gabriel Silva');
    assert.equal(createdDocs[0]?.nameNeedsConfirmation, false);
  });

  it('só firstName (sobrenome opcional) → name = firstName', async () => {
    await callRegister({ ...BASE_WITHOUT_NAME, goal: 'Wellness', firstName: 'Ana' });
    assert.equal(createdDocs[0]?.name, 'Ana');
    assert.equal(createdDocs[0]?.lastName, '');
  });

  it('app antigo: só `name` → dividido em nome + sobrenome', async () => {
    await callRegister({ ...BASE, goal: 'Wellness', name: 'Maria Clara Souza' });
    assert.equal(createdDocs[0]?.firstName, 'Maria');
    assert.equal(createdDocs[0]?.lastName, 'Clara Souza');
    assert.equal(createdDocs[0]?.name, 'Maria Clara Souza');
  });

  it('sem firstName nem name → 400 com o campo firstName, nada criado', async () => {
    const result = await callRegister({ ...BASE_WITHOUT_NAME, goal: 'Wellness' });
    assert.equal(result.status, 400);
    assert.equal(createMock.mock.callCount(), 0);
  });

  it('idioma escolhido continua indo para o locale (pt-BR)', async () => {
    await callRegister({ ...BASE_WITHOUT_NAME, goal: 'Wellness', firstName: 'Ana', preferredLanguage: 'pt-BR' });
    assert.equal(createdDocs[0]?.locale, 'pt-BR');
  });
});
