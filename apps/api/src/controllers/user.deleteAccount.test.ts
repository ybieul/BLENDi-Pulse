// CP-B8a — DELETE /users/me apaga TODOS os dados do usuário. O teste percorre
// todos os modelos registrados no mongoose: cada um que guarda `userId` tem
// que ser apagado pelo userId (um modelo novo que guarde userId e não entre
// na exclusão quebra este teste). O código de verificação (Otp) é ligado pelo
// e-mail. Sem banco: deleteMany/findById/sessão são simulados.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it, mock } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

const USER_ID = new mongoose.Types.ObjectId().toHexString();
const EMAIL = 'cpb8a@test.blendi.local';

type Controller = typeof import('./user.controller.js');
let deleteAccount: Controller['deleteAccount'];

// deleteMany chamado por modelo: nome → filtros.
const deleteCalls = new Map<string, Array<Record<string, unknown>>>();
let userDeleted = false;

function thenable<T>(value: T) {
  const query = {
    select: () => query,
    session: () => query,
    lean: () => query,
    exec: async () => value,
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

before(async () => {
  // Registra todos os modelos do diretório (o mesmo que a API registra ao subir).
  const modelsDir = join(__dirname, '..', 'models');
  for (const file of readdirSync(modelsDir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    await import(join(modelsDir, file));
  }

  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    mock.method(model, 'deleteMany', (filter: Record<string, unknown>) => {
      deleteCalls.set(name, [...(deleteCalls.get(name) ?? []), filter]);
      return thenable({ deletedCount: 1 });
    });
  }

  const User = mongoose.model('User');
  mock.method(User, 'findById', () => thenable({ _id: USER_ID, email: EMAIL }));
  mock.method(User, 'findByIdAndDelete', () => {
    userDeleted = true;
    return thenable({ _id: USER_ID });
  });
  mock.method(User.db, 'startSession', async () => ({
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => undefined,
  }));

  ({ deleteAccount } = await import('./user.controller.js'));
});

async function callDelete() {
  const res: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) { res.statusCode = code; return this; },
    json(body: unknown) { res.body = body; return this; },
  } as unknown as Response;
  let error: unknown;
  await deleteAccount({ user: { sub: USER_ID } } as unknown as Request, response, (e => { error = e; }) as NextFunction);
  if (error) throw error;
  return res;
}

describe('CP-B8a — DELETE /users/me apaga todos os dados do usuário', () => {
  it('todo modelo com userId é apagado pelo userId; o Otp pelo e-mail; o usuário por último', async () => {
    const res = await callDelete();
    assert.equal(res.statusCode, 200);
    assert.equal(userDeleted, true);

    const withUserId = mongoose.modelNames().filter(name => mongoose.model(name).schema.path('userId') !== undefined);
    // Lista explícita, para o relatório e para notar um modelo novo.
    assert.deepEqual([...withUserId].sort(), [
      'AiCache', 'BlendLog', 'Conversation', 'DailyMission', 'Favorite', 'GoogleAuthCode', 'HydrationLog',
      'LockedPreview', 'NotificationLog', 'PantryRead', 'ShoppingList', 'SupplementLog', 'UserPhoto',
      'WeeklyReport', 'XPLog',
    ]);
    for (const name of withUserId) {
      const calls = deleteCalls.get(name) ?? [];
      assert.ok(
        calls.some(filter => String(filter.userId) === USER_ID),
        `${name} não é apagado pelo userId`
      );
    }

    assert.deepEqual(deleteCalls.get('Otp'), [{ email: EMAIL }]);
    // Os únicos modelos sem userId são o próprio User e o Otp.
    assert.deepEqual(
      mongoose.modelNames().filter(name => !withUserId.includes(name)).sort(),
      ['Otp', 'User']
    );
  });
});
