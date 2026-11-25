// CP-B6 — alergias no perfil: schema estrito (limites, duplicados pela
// normalização, texto limpo), PATCH /users/me e GET /users/me, convite único
// e nada do conteúdo nos logs.
// Mesma montagem de user.controller.weightLoss.test.ts (UserModel em memória).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import {
  ALLERGY_CUSTOM_ITEM_MAX_LENGTH,
  ALLERGY_CUSTOM_MAX_ITEMS,
  updateUserSchema,
  userAllergiesSchema,
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

describe('CP-B6 — schema das alergias', () => {
  it('aceita os 8 códigos (sem repetir, na ordem fixa) e o campo livre limpo', () => {
    const parsed = userAllergiesSchema.parse({
      common: ['egg', 'peanut', 'egg'],
      custom: ['  Kiwi  ', 'camarão'],
    });
    assert.deepEqual(parsed, { common: ['peanut', 'egg'], custom: ['Kiwi', 'camarão'] });
  });

  it('remove duplicados pela normalização (acento, caixa, plural), mantendo o primeiro', () => {
    const parsed = userAllergiesSchema.parse({ common: [], custom: ['Kiwi', 'kiwis', 'KIWI', 'Camarão', 'camarao'] });
    assert.deepEqual(parsed.custom, ['Kiwi', 'Camarão']);
  });

  it('texto limpo: controle e marcação viram espaço; vazio depois de limpar é recusado', () => {
    const parsed = userAllergiesSchema.parse({ common: [], custom: ['ki‮wi<script>x</script>', 'a\tb'] });
    assert.deepEqual(parsed.custom, ['ki wi x', 'a b']);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: ['<b></b>'] }).success, false);
  });

  it('limites: até 10 itens de até 40 caracteres', () => {
    const items = Array.from({ length: ALLERGY_CUSTOM_MAX_ITEMS }, (_, index) => `item ${index}`);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: items }).success, true);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: [...items, 'mais um'] }).success, false);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: ['x'.repeat(ALLERGY_CUSTOM_ITEM_MAX_LENGTH)] }).success, true);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: ['x'.repeat(ALLERGY_CUSTOM_ITEM_MAX_LENGTH + 1)] }).success, false);
  });

  it('estrito: código desconhecido, campo a mais, tipo errado e payload gigante são recusados', () => {
    assert.equal(userAllergiesSchema.safeParse({ common: ['coconut'], custom: [] }).success, false);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: [], extra: true }).success, false);
    assert.equal(userAllergiesSchema.safeParse({ common: 'peanut', custom: [] }).success, false);
    assert.equal(userAllergiesSchema.safeParse({ common: [], custom: [42] }).success, false);
    assert.equal(userAllergiesSchema.safeParse({ common: [] }).success, false);
    const huge = userAllergiesSchema.safeParse({ common: Array.from({ length: 4000 }, () => 'x'), custom: [] });
    assert.equal(huge.success, false);
    if (!huge.success) assert.ok(huge.error.issues.length < 5);
  });

  it('o convite só aceita true', () => {
    assert.equal(updateUserSchema.safeParse({ allergyInviteDismissed: true }).success, true);
    assert.equal(updateUserSchema.safeParse({ allergyInviteDismissed: false }).success, false);
  });
});

describe('CP-B6 — PATCH e GET /users/me', () => {
  it('grava e devolve as alergias (substitui o campo inteiro)', async () => {
    const first = await patch({ allergies: { common: ['peanut', 'milk'], custom: ['kiwi'] } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body?.data?.user?.allergies, { common: ['peanut', 'milk'], custom: ['kiwi'] });

    const second = await patch({ allergies: { common: [], custom: ['camarão'] } });
    assert.deepEqual(second.body?.data?.user?.allergies, { common: [], custom: ['camarão'] });

    const profile = await getProfile();
    assert.deepEqual(profile.body?.data?.user?.allergies, { common: [], custom: ['camarão'] });
  });

  it('conta antiga sem o campo: GET devolve sem alergia e sem convite fechado', async () => {
    const profile = await getProfile();
    assert.deepEqual(profile.body?.data?.user?.allergies, { common: [], custom: [] });
    assert.equal(profile.body?.data?.user?.allergyInviteDismissed, false);
  });

  it('fechar o convite grava a data e o GET passa a dizer que foi fechado', async () => {
    const res = await patch({ allergyInviteDismissed: true });
    assert.equal(res.status, 200);
    assert.ok(storedUser?.allergyInviteDismissedAt instanceof Date);
    assert.equal((await getProfile()).body?.data?.user?.allergyInviteDismissed, true);
  });

  it('a preferência nut_free não vira alergia (nem o contrário)', async () => {
    await patch({ dietaryPreferences: ['nut_free'] });
    assert.deepEqual((await getProfile()).body?.data?.user?.allergies, { common: [], custom: [] });

    await patch({ allergies: { common: ['tree_nuts'], custom: [] } });
    assert.deepEqual((await getProfile()).body?.data?.user?.dietaryPreferences, ['nut_free']);
  });

  it('corpo inválido: 400 com chave de erro, sem gravar', async () => {
    const res = await patch({ allergies: { common: ['peanut'], custom: ['x'.repeat(41)] } });
    assert.equal(res.status, 400);
    assert.equal(storedUser?.allergies, undefined);
  });

  it('nada do conteúdo das alergias vai para o log', async () => {
    const logs = await captureLogs(async () => {
      await patch({ allergies: { common: ['peanut'], custom: ['kiwi secreto'] } });
      await patch({ allergies: { common: ['peanut'], custom: ['y'.repeat(60)] } });
      await getProfile();
    });
    assert.doesNotMatch(logs, /peanut|kiwi secreto|yyyyy/);
  });
});
