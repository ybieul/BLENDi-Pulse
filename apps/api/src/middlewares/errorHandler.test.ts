// Testes do errorHandler global com um servidor Express real e os mesmos parsers
// do index.ts (json 50kb e raw 1mb): erros do body-parser saem com código próprio,
// e não como erro interno. Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it, mock } from 'node:test';

import express from 'express';

const envMock = { NODE_ENV: 'production' };
mock.module('../config/env', { namedExports: { env: envMock } });

let server: Server;
let baseUrl: string;

before(async () => {
  const { errorHandler } = await import('./errorHandler.js');
  const app = express();
  app.post('/raw', express.raw({ type: 'application/json', limit: '1mb' }), (_req, res) => {
    res.json({ success: true });
  });
  app.use(express.json({ limit: '50kb' }));
  app.post('/json', (_req, res) => {
    res.json({ success: true });
  });
  app.get('/boom', () => {
    throw new Error('segredo interno do banco');
  });
  app.get('/deliberate', () => {
    throw Object.assign(new Error('Fuso inválido.'), { statusCode: 400, code: 'timezone/invalid' });
  });
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

for (const nodeEnv of ['production', 'development']) {
  describe(`errorHandler (${nodeEnv})`, () => {
    before(() => {
      envMock.NODE_ENV = nodeEnv;
    });

    it('JSON acima de 50kb: 413 request/payload-too-large, sem stack', async () => {
      const result = await post('/json', JSON.stringify({ productId: 'a'.repeat(60_000) }));

      assert.equal(result.status, 413);
      assert.deepEqual(result.body, {
        success: false,
        code: 'request/payload-too-large',
        message: 'Request body is too large.',
      });
    });

    it('corpo cru acima de 1mb (rota do webhook): 413 request/payload-too-large', async () => {
      const result = await post('/raw', JSON.stringify({ x: 'a'.repeat(1_100_000) }));

      assert.equal(result.status, 413);
      assert.equal(result.body.code, 'request/payload-too-large');
    });

    it('JSON malformado: 400 request/invalid-json, sem vazar a mensagem do parser', async () => {
      const result = await post('/json', '{"productId": ');

      assert.equal(result.status, 400);
      assert.deepEqual(result.body, {
        success: false,
        code: 'request/invalid-json',
        message: 'Request body is not valid JSON.',
      });
    });

    it('corpo dentro do limite continua passando', async () => {
      const result = await post('/json', JSON.stringify({ productId: 'a'.repeat(40_000) }));

      assert.equal(result.status, 200);
    });

    it('erro deliberado continua com o próprio código', async () => {
      const res = await fetch(`${baseUrl}/deliberate`);
      const body = (await res.json()) as Record<string, unknown>;

      assert.equal(res.status, 400);
      assert.equal(body.code, 'timezone/invalid');
    });
  });
}

describe('errorHandler — erro não tratado continua igual', () => {
  it('em produção: 500 unexpected-error, sem a mensagem original', async () => {
    envMock.NODE_ENV = 'production';
    const res = await fetch(`${baseUrl}/boom`);
    const body = (await res.json()) as Record<string, unknown>;

    assert.equal(res.status, 500);
    assert.equal(body.code, 'unexpected-error');
    assert.equal(body.message, 'An unexpected error occurred.');
    assert.equal(body.stack, undefined);
  });

  it('em desenvolvimento: 500 network/internal-server-error com a mensagem', async () => {
    envMock.NODE_ENV = 'development';
    const res = await fetch(`${baseUrl}/boom`);
    const body = (await res.json()) as Record<string, unknown>;

    assert.equal(res.status, 500);
    assert.equal(body.code, 'network/internal-server-error');
    assert.equal(body.message, 'segredo interno do banco');
  });
});
