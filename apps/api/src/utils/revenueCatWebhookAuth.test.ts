// Testes da autenticacao do webhook do RevenueCat (header Authorization estatico).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import type { Request, Response } from 'express';

import {
  authorizeRevenueCatWebhook,
  isWebhookAuthorizationValid,
} from './revenueCatWebhookAuth';

const SECRET = 'whsec_test_0123456789abcdef0123456789abcdef';
const BEARER_SECRET = `Bearer ${SECRET}`;

interface FakeResponseState {
  statusCode?: number;
  body?: Record<string, unknown>;
}

function fakeRequest(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function fakeResponse(): { res: Response; state: FakeResponseState } {
  const state: FakeResponseState = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      state.body = body;
      return res;
    },
  };

  return { res: res as unknown as Response, state };
}

describe('isWebhookAuthorizationValid', () => {
  it('aceita o header identico ao segredo', () => {
    assert.equal(isWebhookAuthorizationValid(SECRET, SECRET), true);
  });

  it('aceita o header identico quando o segredo inclui o prefixo "Bearer "', () => {
    assert.equal(isWebhookAuthorizationValid(BEARER_SECRET, BEARER_SECRET), true);
  });

  it('rejeita header diferente do segredo', () => {
    assert.equal(isWebhookAuthorizationValid('outro-valor', SECRET), false);
  });

  it('rejeita header ausente ou vazio', () => {
    assert.equal(isWebhookAuthorizationValid(undefined, SECRET), false);
    assert.equal(isWebhookAuthorizationValid('', SECRET), false);
  });

  it('nunca valida quando o segredo esta vazio, mesmo com header vazio', () => {
    assert.equal(isWebhookAuthorizationValid('', ''), false);
    assert.equal(isWebhookAuthorizationValid(undefined, ''), false);
    assert.equal(isWebhookAuthorizationValid('qualquer', ''), false);
  });

  it('exige correspondencia exata do prefixo "Bearer " (nao adiciona nem remove)', () => {
    assert.equal(isWebhookAuthorizationValid(BEARER_SECRET, SECRET), false);
    assert.equal(isWebhookAuthorizationValid(SECRET, BEARER_SECRET), false);
  });

  it('diferencia maiusculas de minusculas', () => {
    assert.equal(isWebhookAuthorizationValid(SECRET.toUpperCase(), SECRET), false);
  });

  it('rejeita, sem lancar erro, headers de tamanho diferente (mais curto, mais longo, prefixo)', () => {
    assert.doesNotThrow(() => isWebhookAuthorizationValid(SECRET.slice(0, -1), SECRET));
    assert.equal(isWebhookAuthorizationValid(SECRET.slice(0, -1), SECRET), false);
    assert.equal(isWebhookAuthorizationValid(`${SECRET}x`, SECRET), false);
    assert.equal(isWebhookAuthorizationValid(SECRET.slice(0, 3), SECRET), false);
    assert.equal(isWebhookAuthorizationValid('a'.repeat(10_000), SECRET), false);
  });

  it('compara em tempo constante via timingSafeEqual, inclusive com tamanhos diferentes', () => {
    const spy = mock.method(crypto, 'timingSafeEqual');

    try {
      isWebhookAuthorizationValid(SECRET, SECRET);
      isWebhookAuthorizationValid('curto', SECRET);
      assert.equal(spy.mock.callCount(), 2);
    } finally {
      spy.mock.restore();
    }
  });
});

describe('authorizeRevenueCatWebhook', () => {
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    mock.method(console, 'warn', (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('header correto: autoriza e nao escreve resposta', () => {
    const { res, state } = fakeResponse();

    const authorized = authorizeRevenueCatWebhook(
      fakeRequest({ authorization: SECRET }),
      res,
      SECRET
    );

    assert.equal(authorized, true);
    assert.equal(state.statusCode, undefined);
    assert.equal(state.body, undefined);
    assert.deepEqual(warnings, []);
  });

  it('header incorreto: responde 401 e nao autoriza', () => {
    const { res, state } = fakeResponse();

    const authorized = authorizeRevenueCatWebhook(
      fakeRequest({ authorization: 'Bearer token-errado' }),
      res,
      SECRET
    );

    assert.equal(authorized, false);
    assert.equal(state.statusCode, 401);
    assert.equal(state.body?.['success'], false);
    assert.equal(state.body?.['code'], 'webhooks/unauthorized');
  });

  it('header ausente: responde 401 e nao autoriza', () => {
    const { res, state } = fakeResponse();

    const authorized = authorizeRevenueCatWebhook(fakeRequest({}), res, SECRET);

    assert.equal(authorized, false);
    assert.equal(state.statusCode, 401);
    assert.equal(state.body?.['code'], 'webhooks/unauthorized');
  });

  it('a resposta 401 e identica e generica para header ausente e incorreto (nao revela o motivo)', () => {
    const missing = fakeResponse();
    const wrong = fakeResponse();

    authorizeRevenueCatWebhook(fakeRequest({}), missing.res, SECRET);
    authorizeRevenueCatWebhook(fakeRequest({ authorization: 'errado' }), wrong.res, SECRET);

    assert.deepEqual(missing.state, wrong.state);
    assert.deepEqual(wrong.state, {
      statusCode: 401,
      body: { success: false, code: 'webhooks/unauthorized', message: 'Unauthorized.' },
    });
  });

  it('nao vaza o segredo nem o header recebido na resposta nem no log', () => {
    const received = 'Bearer valor-recebido-sensivel';
    const { res, state } = fakeResponse();

    authorizeRevenueCatWebhook(fakeRequest({ authorization: received }), res, SECRET);

    const observable = JSON.stringify(state) + warnings.join('\n');
    assert.equal(observable.includes(SECRET), false);
    assert.equal(observable.includes('valor-recebido-sensivel'), false);
    assert.equal(warnings.length, 1);
  });

  it('diverge so no prefixo "Bearer ": rejeita e o log indica a divergencia sem valores', () => {
    const { res, state } = fakeResponse();

    const authorized = authorizeRevenueCatWebhook(
      fakeRequest({ authorization: BEARER_SECRET }),
      res,
      SECRET
    );

    assert.equal(authorized, false);
    assert.equal(state.statusCode, 401);
    assert.match(warnings[0] ?? '', /recebido com prefixo "Bearer ": true/);
    assert.match(warnings[0] ?? '', /secret com prefixo "Bearer ": false/);
  });

  it('header ausente: o log registra o motivo real (so no servidor)', () => {
    const { res } = fakeResponse();

    authorizeRevenueCatWebhook(fakeRequest({}), res, SECRET);

    assert.match(warnings[0] ?? '', /header Authorization ausente/);
  });

  it('nao autoriza nada quando o segredo esta vazio', () => {
    const { res, state } = fakeResponse();

    const authorized = authorizeRevenueCatWebhook(fakeRequest({ authorization: '' }), res, '');

    assert.equal(authorized, false);
    assert.equal(state.statusCode, 401);
  });
});
