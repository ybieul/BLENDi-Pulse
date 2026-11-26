// Teste no build EAS (25-26/11) — nome e sobrenome no perfil:
// schema (limpeza, limites, tipo errado recusado), PATCH /users/me (name
// sempre "firstName lastName", marca "nome a confirmar"), leitura tolerante
// de conta antiga (sem firstName/lastName) e nada do nome nos logs.
// Mesma montagem de user.allergies.test.ts (UserModel em memória).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import {
  FIRST_NAME_MAX_LENGTH,
  LAST_NAME_MAX_LENGTH,
  composeFullName,
  getDisplayFirstName,
  looksLikeDerivedName,
  splitFullName,
  updateUserSchema,
} from '@blendi/shared';

const USER_ID = '665f1b2c3d4e5f6a7b8c9d0e';
const BIRTH_DATE = new Date('1990-06-15T00:00:00.000Z');

type UserDoc = Record<string, unknown>;

function fullBodyUser(overrides: UserDoc = {}): UserDoc {
  return {
    _id: USER_ID,
    email: 'user@test.local',
    name: 'User',
    blendiModel: 'ProPlus',
    blendiOwnership: 'blendi',
    dietaryPreferences: [],
    goal: 'Muscle',
    weightGoal: 'maintain',
    locale: 'en',
    unitSystem: 'metric',
    timezone: 'UTC',
    weight: 80,
    height: 175,
    birthDate: BIRTH_DATE,
    biologicalSex: 'female',
    activityLevel: 'moderatelyActive',
    dailyProteinTarget: 160,
    dailyCalorieTarget: 2200,
    dailyCarbTarget: 200,
    dailyFatTarget: 70,
    ...overrides,
  };
}

let storedUser: UserDoc | null = null;
/** Roda entre a leitura (findById) e a escrita — simula outra requisição concorrente. */
let beforeWrite: (() => void) | null = null;

function query<T>(value: () => T) {
  const chain = {
    select: () => chain,
    lean: () => Promise.resolve(value()),
  };
  return chain;
}

function matches(filter: Record<string, unknown>): boolean {
  if (!storedUser) return false;
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '_id') return true;
    if (condition && typeof condition === 'object' && '$ne' in condition) {
      return storedUser?.[key] !== (condition as { $ne: unknown }).$ne;
    }
    return storedUser?.[key] === condition;
  });
}

interface MongoUpdate {
  $set?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
  $push?: Record<string, unknown>;
}

function applyUpdate(update: MongoUpdate) {
  if (!storedUser) return;
  Object.assign(storedUser, update.$set ?? {});
  for (const key of Object.keys(update.$unset ?? {})) delete storedUser[key];
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    storedUser[key] = [...((storedUser[key] as unknown[]) ?? []), value];
  }
}

const findOneAndUpdateMock = mock.fn((filter: Record<string, unknown>, update: MongoUpdate) => {
  beforeWrite?.();
  beforeWrite = null;
  return query(() => {
    if (!matches(filter)) return null;
    applyUpdate(update);
    return { ...storedUser };
  });
});

mock.module('../models/User', {
  namedExports: {
    UserModel: {
      findById: () => query(() => (storedUser ? { ...storedUser } : null)),
      findOneAndUpdate: findOneAndUpdateMock,
      updateOne: async (filter: Record<string, unknown>, update: MongoUpdate) => {
        if (matches(filter)) applyUpdate(update);
        return { acknowledged: true };
      },
      exists: async () => (storedUser ? { _id: USER_ID } : null),
    },
  },
});
mock.module('../services/apple.service', {
  namedExports: { revokeAppleRefreshToken: async () => undefined },
});

type ControllerModule = typeof import('./user.controller.js');
let updateMe: ControllerModule['updateMe'];
let getMe: ControllerModule['getMe'];

before(async () => {
  ({ updateMe, getMe } = await import('./user.controller.js'));
});

beforeEach(() => {
  storedUser = fullBodyUser();
  beforeWrite = null;
  findOneAndUpdateMock.mock.resetCalls();
});

interface Captured {
  status?: number;
  body?: {
    success: boolean;
    code?: string;
    errors?: Array<{ field: string; message: string }>;
    data?: Record<string, unknown> & { user?: Record<string, unknown> };
  };
  nextError?: unknown;
}

async function call(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  body: unknown
): Promise<Captured> {
  const captured: Captured = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Captured['body']) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  await handler({ body, user: { sub: USER_ID } } as unknown as Request, res, (err?: unknown) => {
    captured.nextError = err;
  });
  assert.equal(captured.nextError, undefined, `next(err): ${String(captured.nextError)}`);
  return captured;
}

const patch = (body: unknown) => call(updateMe, body);
const getProfile = () => call(getMe, undefined);

async function captureLogs(run: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const restore = (['info', 'warn', 'error', 'log'] as const).map(level => {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      lines.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    };
    return () => {
      console[level] = original;
    };
  });
  try {
    await run();
  } finally {
    restore.forEach(fn => fn());
  }
  return lines.join('\n');
}

describe('personName (shared) — regras de texto', () => {
  it('composeFullName: "nome sobrenome" ou só o nome', () => {
    assert.equal(composeFullName('Gabriel', 'Silva'), 'Gabriel Silva');
    assert.equal(composeFullName('Gabriel', ''), 'Gabriel');
    assert.equal(composeFullName('  Gabriel ', undefined), 'Gabriel');
  });

  it('splitFullName: primeira palavra = nome, o resto = sobrenome; vazio → vazio', () => {
    assert.deepEqual(splitFullName('Maria  Clara Souza'), { firstName: 'Maria', lastName: 'Clara Souza' });
    assert.deepEqual(splitFullName('biel782003'), { firstName: 'biel782003', lastName: '' });
    assert.deepEqual(splitFullName(''), { firstName: '', lastName: '' });
  });

  it('getDisplayFirstName: firstName gravado; sem ele, a primeira palavra do name', () => {
    assert.equal(getDisplayFirstName({ firstName: 'Gabi', name: 'Gabriel Silva' }), 'Gabi');
    assert.equal(getDisplayFirstName({ name: 'Gabriel Barboza da Silva' }), 'Gabriel');
    assert.equal(getDisplayFirstName({}), '');
  });

  it('looksLikeDerivedName: começo do e-mail ou "Apple User" = a confirmar', () => {
    assert.equal(looksLikeDerivedName('biel782003', 'biel782003@gmail.com'), true);
    assert.equal(looksLikeDerivedName('Apple User', 'x@privaterelay.appleid.com'), true);
    assert.equal(looksLikeDerivedName('Gabriel', 'biel782003@gmail.com'), false);
  });
});

describe('updateUserSchema — firstName/lastName', () => {
  it('limpa controle, marcação e espaços; mantém acento, apóstrofo e hífen', () => {
    const parsed = updateUserSchema.parse({ firstName: '  Ana-Clara\u202E <b>x</b> ', lastName: " D'Ávila  " });
    assert.equal(parsed.firstName, 'Ana-Clara x');
    assert.equal(parsed.lastName, "D'Ávila");
  });

  it('firstName vazio (ou só espaços) → required; lastName vazio é aceito (sem sobrenome)', () => {
    assert.equal(updateUserSchema.safeParse({ firstName: '   ' }).success, false);
    assert.equal(updateUserSchema.parse({ lastName: '' }).lastName, '');
  });

  it('limites: até o teto passa, um a mais → too_long', () => {
    assert.equal(updateUserSchema.safeParse({ firstName: 'a'.repeat(FIRST_NAME_MAX_LENGTH) }).success, true);
    const tooLong = updateUserSchema.safeParse({ firstName: 'a'.repeat(FIRST_NAME_MAX_LENGTH + 1) });
    assert.equal(tooLong.success, false);
    assert.equal(tooLong.error?.issues[0]?.message, 'errors.validation.too_long');
    assert.equal(updateUserSchema.safeParse({ lastName: 'a'.repeat(LAST_NAME_MAX_LENGTH + 1) }).success, false);
  });

  it('tipo errado → recusado', () => {
    for (const value of [123, null, ['Ana'], { first: 'Ana' }]) {
      assert.equal(updateUserSchema.safeParse({ firstName: value }).success, false, JSON.stringify(value));
      assert.equal(updateUserSchema.safeParse({ lastName: value }).success, false, JSON.stringify(value));
    }
  });
});

describe('PATCH /users/me — nome e sobrenome', () => {
  it('firstName + lastName → grava os dois e name = "firstName lastName"', async () => {
    const res = await patch({ firstName: 'Gabriel', lastName: 'Barboza da Silva' });

    assert.equal(res.status, 200);
    assert.equal(storedUser?.firstName, 'Gabriel');
    assert.equal(storedUser?.lastName, 'Barboza da Silva');
    assert.equal(storedUser?.name, 'Gabriel Barboza da Silva');
    assert.equal(res.body?.data?.user?.firstName, 'Gabriel');
    assert.equal(res.body?.data?.user?.name, 'Gabriel Barboza da Silva');
  });

  it('só firstName numa conta antiga (sem firstName/lastName) → mantém o sobrenome derivado do name', async () => {
    storedUser = fullBodyUser({ name: 'Maria Clara Souza' });
    await patch({ firstName: 'Mariana' });

    assert.equal(storedUser?.firstName, 'Mariana');
    assert.equal(storedUser?.lastName, 'Clara Souza');
    assert.equal(storedUser?.name, 'Mariana Clara Souza');
  });

  it('lastName vazio → só o nome em name', async () => {
    storedUser = fullBodyUser({ name: 'Ana Souza', firstName: 'Ana', lastName: 'Souza' });
    await patch({ lastName: '' });

    assert.equal(storedUser?.lastName, '');
    assert.equal(storedUser?.name, 'Ana');
  });

  it('conta "a confirmar" (nome do e-mail): firstName tira a marca', async () => {
    storedUser = fullBodyUser({
      email: 'biel782003@gmail.com',
      name: 'biel782003',
      firstName: 'biel782003',
      nameNeedsConfirmation: true,
    });
    const res = await patch({ firstName: 'Gabriel', lastName: 'Silva' });

    assert.equal(storedUser?.nameNeedsConfirmation, false);
    assert.equal(res.body?.data?.user?.nameNeedsConfirmation, false);
  });

  it('só lastName numa conta "a confirmar" NÃO tira a marca (o nome ainda é o do e-mail)', async () => {
    storedUser = fullBodyUser({ name: 'biel782003', firstName: 'biel782003', nameNeedsConfirmation: true });
    await patch({ lastName: 'Silva' });

    assert.equal(storedUser?.nameNeedsConfirmation, true);
    assert.equal(storedUser?.name, 'biel782003 Silva');
  });

  it('nome inválido → 400 e nada gravado', async () => {
    const res = await patch({ firstName: '' });
    assert.equal(res.status, 400);
    assert.equal(findOneAndUpdateMock.mock.callCount(), 0);
    assert.equal(storedUser?.name, 'User');
  });

  it('PATCH sem nome não toca em name/firstName/lastName', async () => {
    await patch({ unitSystem: 'imperial' });
    const update = findOneAndUpdateMock.mock.calls[0]?.arguments[1] as { $set: Record<string, unknown> };
    assert.equal('name' in update.$set, false);
    assert.equal('firstName' in update.$set, false);
    assert.equal('lastName' in update.$set, false);
  });

  it('nome nunca aparece nos logs', async () => {
    const logs = await captureLogs(() => patch({ firstName: 'NomeSecretoXyz', lastName: 'SobrenomeSecretoXyz' }));
    assert.equal(logs.includes('NomeSecretoXyz'), false);
    assert.equal(logs.includes('SobrenomeSecretoXyz'), false);
  });
});

describe('GET /users/me — leitura tolerante do nome', () => {
  it('conta antiga sem firstName/lastName → derivados do name, sem migração', async () => {
    storedUser = fullBodyUser({ name: 'Gabriel Barboza da Silva' });
    const res = await getProfile();
    const user = res.body?.data?.user;

    assert.equal(user?.name, 'Gabriel Barboza da Silva');
    assert.equal(user?.firstName, 'Gabriel');
    assert.equal(user?.lastName, 'Barboza da Silva');
    assert.equal(user?.nameNeedsConfirmation, false);
    assert.equal('firstName' in (storedUser ?? {}), false);
  });

  it('conta antiga com o nome = começo do e-mail → nameNeedsConfirmation true (deduzido)', async () => {
    storedUser = fullBodyUser({ email: 'biel782003@gmail.com', name: 'biel782003' });
    const res = await getProfile();

    assert.equal(res.body?.data?.user?.nameNeedsConfirmation, true);
  });

  it('marca gravada vence a dedução', async () => {
    storedUser = fullBodyUser({ email: 'ana@x.com', name: 'ana', firstName: 'ana', nameNeedsConfirmation: false });
    const res = await getProfile();

    assert.equal(res.body?.data?.user?.nameNeedsConfirmation, false);
  });
});
