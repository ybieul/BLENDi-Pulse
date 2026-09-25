// Testes da rota do webhook do RevenueCat com caminho nao previsivel
// (/webhooks/revenuecat/<REVENUECAT_WEBHOOK_PATH_SECRET>).
// O segredo e gerado em runtime em cada execucao: nenhum valor fixo nos testes.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import express from 'express';

import {
  buildRevenueCatWebhookPath,
  REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN,
} from '../config/revenuecat.config';
import { createRevenueCatWebhookRouter } from './revenueCatWebhookRoute';

describe('REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN / buildRevenueCatWebhookPath', () => {
  it('aceita o formato gerado por randomBytes(32) em hex e em base64url', () => {
    const hex = randomBytes(32).toString('hex');
    const base64url = randomBytes(32).toString('base64url');

    assert.equal(REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN.test(hex), true);
    assert.equal(REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN.test(base64url), true);
    assert.equal(buildRevenueCatWebhookPath(hex), `/revenuecat/${hex}`);
  });

  it('rejeita valor vazio, curto demais e com caracteres que alterariam a rota', () => {
    const valid = randomBytes(32).toString('hex');
    const invalid = [
      '',
      'curto',
      valid.slice(0, 31),
      `${valid}/extra`,
      `${valid}:param`,
      `${valid}*`,
      `${valid}(x)`,
      `${valid}?`,
      `${valid}..`,
      `${valid} `,
      `${valid}\n`,
    ];

    for (const value of invalid) {
      assert.equal(REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN.test(value), false, JSON.stringify(value));
      assert.throws(() => buildRevenueCatWebhookPath(value), /REVENUECAT_WEBHOOK_PATH_SECRET invalido/);
    }
  });

  it('createRevenueCatWebhookRouter nao cria rota (lanca) com segredo invalido', () => {
    assert.throws(() => createRevenueCatWebhookRouter('', () => undefined));
    assert.throws(() => createRevenueCatWebhookRouter('curto', () => undefined));
  });
});

describe('createRevenueCatWebhookRouter (servidor Express real)', () => {
  const pathSecret = randomBytes(32).toString('hex');
  let server: Server;
  let baseUrl: string;
  let handlerCalls = 0;

  before(async () => {
    const app = express();
    // Mesmo mount e parser de index.ts
    app.use(
      '/webhooks',
      express.raw({ type: 'application/json', limit: '1mb' }),
      createRevenueCatWebhookRouter(pathSecret, (_req, res) => {
        handlerCalls += 1;
        res.status(200).json({ success: true });
      })
    );
    app.use((_req, res) => {
      res.status(404).json({ success: false, code: 'resource/not-found' });
    });

    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(() => {
    handlerCalls = 0;
  });

  const post = (path: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

  it('o caminho exato com o segredo chega ao handler', async () => {
    const res = await post(`/webhooks/revenuecat/${pathSecret}`);

    assert.equal(res.status, 200);
    assert.equal(handlerCalls, 1);
  });

  it('o caminho antigo, fixo, nao existe mais (404, handler nao e chamado)', async () => {
    assert.equal((await post('/webhooks/revenuecat')).status, 404);
    assert.equal((await post('/webhooks/revenuecat/')).status, 404);
    assert.equal(handlerCalls, 0);
  });

  it('segredo errado ou parcial nao casa (404)', async () => {
    const other = randomBytes(32).toString('hex');

    assert.equal((await post(`/webhooks/revenuecat/${other}`)).status, 404);
    assert.equal((await post(`/webhooks/revenuecat/${pathSecret.slice(0, -1)}`)).status, 404);
    assert.equal((await post(`/webhooks/revenuecat/${pathSecret}0`)).status, 404);
    assert.equal(handlerCalls, 0);
  });

  it('nao aceita sub-caminhos, prefixo, barra final nem outra caixa (casamento exato)', async () => {
    assert.equal((await post(`/webhooks/revenuecat/${pathSecret}/extra`)).status, 404);
    assert.equal((await post(`/webhooks/revenuecat/${pathSecret}/`)).status, 404);
    assert.equal((await post(`/webhooks/revenuecat/${pathSecret.toUpperCase()}`)).status, 404);
    assert.equal((await post(`/webhooks/REVENUECAT/${pathSecret}`)).status, 404);
    assert.equal((await post(`/revenuecat/${pathSecret}`)).status, 404);
    assert.equal(handlerCalls, 0);
  });

  it('so responde a POST (GET no caminho correto cai no 404)', async () => {
    const res = await fetch(`${baseUrl}/webhooks/revenuecat/${pathSecret}`);

    assert.equal(res.status, 404);
    assert.equal(handlerCalls, 0);
  });
});
