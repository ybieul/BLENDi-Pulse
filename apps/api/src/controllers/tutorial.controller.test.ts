// CP-C2 — Rotas do tutorial (servidor Express real, modelo simulado em
// memória): autenticação, roteiro com ETag/304, validação e teto do PATCH,
// ids desconhecidos descartados, reset e nada do usuário nos logs.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import express from 'express';
import mongoose from 'mongoose';
import { TUTORIAL_MAX_STEPS, tutorialContentSchema } from '@blendi/shared';

import { TutorialProgressModel } from '../models/TutorialProgress';
import { tutorialRouter } from '../routes/tutorial';
import { generateAccessToken } from '../services/auth.service';

const USER_ID = new mongoose.Types.ObjectId().toHexString();
const EMAIL = 'cpc2@test.blendi.local';

type Stored = {
  seenStepIds: string[];
  lastStepId: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  contentVersion: number | null;
};

let stored: Stored | null = null;
const updateCalls: Array<{ filter: unknown; update: Record<string, unknown> }> = [];
const deleteCalls: unknown[] = [];
let failNextWithDuplicate = false;

function leanQuery<T>(value: () => T) {
  return { lean: () => Promise.resolve(value()) };
}

function applyUpdate(update: Record<string, Record<string, unknown>>): Stored {
  const next: Stored = stored
    ? { ...stored, seenStepIds: [...stored.seenStepIds] }
    : { seenStepIds: [], lastStepId: null, completedAt: null, skippedAt: null, contentVersion: null };
  const addToSet = update.$addToSet?.seenStepIds as { $each: string[] } | undefined;
  for (const id of addToSet?.$each ?? []) {
    if (!next.seenStepIds.includes(id)) next.seenStepIds.push(id);
  }
  Object.assign(next, update.$set ?? {});
  const max = update.$max?.contentVersion as number | undefined;
  if (max !== undefined) next.contentVersion = Math.max(next.contentVersion ?? 0, max);
  return next;
}

let server: Server;
let baseUrl: string;
let token: string;
const logged: string[] = [];

before(async () => {
  mock.method(TutorialProgressModel, 'findOne', () => leanQuery(() => stored));
  mock.method(TutorialProgressModel, 'findOneAndUpdate', (filter: unknown, update: Record<string, unknown>) => {
    updateCalls.push({ filter, update });
    return leanQuery(() => {
      if (failNextWithDuplicate) {
        failNextWithDuplicate = false;
        throw Object.assign(new Error('E11000'), { code: 11000 });
      }
      stored = applyUpdate(update as Record<string, Record<string, unknown>>);
      return stored;
    });
  });
  mock.method(TutorialProgressModel, 'deleteOne', (filter: unknown) => {
    deleteCalls.push(filter);
    stored = null;
    return Promise.resolve({ deletedCount: 1 });
  });

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    mock.method(console, level, (...args: unknown[]) => {
      logged.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    });
  }

  token = generateAccessToken(USER_ID, EMAIL);

  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use('/tutorial', tutorialRouter);
  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  mock.restoreAll();
});

beforeEach(() => {
  stored = null;
  updateCalls.length = 0;
  deleteCalls.length = 0;
});

function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.auth !== false) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe('CP-C2 — rotas /tutorial', () => {
  it('as quatro rotas exigem autenticação', async () => {
    const routes: Array<[string, string]> = [
      ['GET', '/tutorial'],
      ['GET', '/tutorial/progress'],
      ['PATCH', '/tutorial/progress'],
      ['POST', '/tutorial/progress/reset'],
    ];
    for (const [method, path] of routes) {
      const res = await call(path, { method, auth: false, body: method === 'PATCH' ? {} : undefined });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
    const invalid = await call('/tutorial', { headers: { Authorization: 'Bearer invalido' }, auth: false });
    assert.equal(invalid.status, 401);
    assert.equal(updateCalls.length + deleteCalls.length, 0);
  });

  it('GET /tutorial devolve o roteiro válido com ETag e cache curto; If-None-Match → 304', async () => {
    const res = await call('/tutorial');
    assert.equal(res.status, 200);
    const etag = res.headers.get('etag');
    assert.ok(etag);
    assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
    const body = (await res.json()) as { success: boolean; data: { content: unknown } };
    assert.equal(body.success, true);
    assert.equal(tutorialContentSchema.safeParse(body.data.content).success, true);

    const cachedRes = await call('/tutorial', { headers: { 'If-None-Match': etag } });
    assert.equal(cachedRes.status, 304);
  });

  it('GET /tutorial/progress sem documento devolve progresso vazio (sem criar documento)', async () => {
    const res = await call('/tutorial/progress');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { progress: unknown } };
    assert.deepEqual(body.data.progress, {
      seenStepIds: [],
      lastStepId: null,
      completedAt: null,
      skippedAt: null,
      contentVersion: null,
    });
    assert.equal(updateCalls.length, 0);
  });

  it('PATCH junta ids válidos, ignora desconhecidos e filtra pelo usuário do token', async () => {
    const res = await call('/tutorial/progress', {
      method: 'PATCH',
      body: { seenStepIds: ['home.welcome', 'nao.existe', 'home.rings'], lastStepId: 'home.rings', contentVersion: 1 },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { progress: { seenStepIds: string[]; lastStepId: string; contentVersion: number } } };
    assert.deepEqual(body.data.progress.seenStepIds, ['home.welcome', 'home.rings']);
    assert.equal(body.data.progress.lastStepId, 'home.rings');
    assert.equal(body.data.progress.contentVersion, 1);
    assert.deepEqual(updateCalls[0]?.filter, { userId: USER_ID });

    const second = await call('/tutorial/progress', { method: 'PATCH', body: { seenStepIds: ['home.rings', 'home.streak'], status: 'completed' } });
    const secondBody = (await second.json()) as { data: { progress: { seenStepIds: string[]; completedAt: string | null } } };
    assert.deepEqual(secondBody.data.progress.seenStepIds, ['home.welcome', 'home.rings', 'home.streak']);
    assert.ok(secondBody.data.progress.completedAt);
  });

  it('PATCH recusa corpo inválido: teto de ids, chave desconhecida, tipo errado, operador Mongo', async () => {
    const bodies: unknown[] = [
      { seenStepIds: Array.from({ length: TUTORIAL_MAX_STEPS + 1 }, (_, i) => `home.step${i}`) },
      { userId: new mongoose.Types.ObjectId().toHexString() },
      { seenStepIds: 'home.rings' },
      { seenStepIds: [{ $ne: null }] },
      { status: 'finished' },
      { contentVersion: -1 },
      { lastStepId: 'x'.repeat(200) },
    ];
    for (const body of bodies) {
      const res = await call('/tutorial/progress', { method: 'PATCH', body });
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      const json = (await res.json()) as { code: string };
      assert.equal(json.code, 'tutorial/invalid-data');
    }
    assert.equal(updateCalls.length, 0);
  });

  it('PATCH concorrente (E11000 no upsert) repete uma vez e responde 200', async () => {
    failNextWithDuplicate = true;
    const res = await call('/tutorial/progress', { method: 'PATCH', body: { seenStepIds: ['home.welcome'] } });
    assert.equal(res.status, 200);
    assert.equal(updateCalls.length, 2);
  });

  it('POST /tutorial/progress/reset apaga só o progresso do usuário do token', async () => {
    stored = { seenStepIds: ['home.welcome'], lastStepId: 'home.welcome', completedAt: new Date(), skippedAt: null, contentVersion: 1 };
    const res = await call('/tutorial/progress/reset', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(deleteCalls, [{ userId: USER_ID }]);
    const body = (await res.json()) as { data: { progress: { seenStepIds: string[]; completedAt: null } } };
    assert.deepEqual(body.data.progress.seenStepIds, []);
    assert.equal(body.data.progress.completedAt, null);
  });

  it('nada do usuário (id, e-mail) nos logs', () => {
    const all = logged.join('\n');
    assert.equal(all.includes(USER_ID), false);
    assert.equal(all.includes(EMAIL), false);
  });
});
