// Testes da checagem de profundidade do corpo e da cadeia
// parser → rejectDeeplyNestedBody → sanitizeRequest (mesma ordem do index.ts).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';

import { VALIDATION_ERROR_CODE } from '../utils/error.utils';
import {
  BODY_TOO_DEEP_MESSAGE,
  MAX_REQUEST_BODY_DEPTH,
  exceedsMaxDepth,
  rejectDeeplyNestedBody,
  sanitizeRequest,
} from './requestSanitization';

/** Objeto com exatamente `depth` níveis: { a: { a: ... {} } }. */
function nestedObject(depth: number): unknown {
  let value: Record<string, unknown> = {};
  for (let level = 1; level < depth; level += 1) {
    value = { a: value };
  }
  return value;
}

/** JSON com `depth` arrays aninhados, montado como texto (sem recursão). */
function nestedArrayJson(depth: number): string {
  return `${'['.repeat(depth)}${']'.repeat(depth)}`;
}

/** JSON com `depth` objetos aninhados ({"a":{"a":...{}}}), montado como texto. */
function nestedObjectJson(depth: number): string {
  return `${'{"a":'.repeat(depth - 1)}{}${'}'.repeat(depth - 1)}`;
}

describe('exceedsMaxDepth', () => {
  it('primitivos e null têm profundidade 0', () => {
    for (const value of [null, undefined, 0, 'texto', true]) {
      assert.equal(exceedsMaxDepth(value, 0), false);
    }
  });

  it('conta objeto e array como um nível cada', () => {
    assert.equal(exceedsMaxDepth({}, 1), false);
    assert.equal(exceedsMaxDepth({}, 0), true);
    assert.equal(exceedsMaxDepth({ a: [{}] }, 3), false);
    assert.equal(exceedsMaxDepth({ a: [{}] }, 2), true);
    assert.equal(exceedsMaxDepth({ a: [1, 'x', null] }, 2), false);
  });

  it('profundidade exatamente no limite passa; limite + 1 falha', () => {
    assert.equal(exceedsMaxDepth(nestedObject(MAX_REQUEST_BODY_DEPTH), MAX_REQUEST_BODY_DEPTH), false);
    assert.equal(exceedsMaxDepth(nestedObject(MAX_REQUEST_BODY_DEPTH + 1), MAX_REQUEST_BODY_DEPTH), true);
    assert.equal(
      exceedsMaxDepth(JSON.parse(nestedArrayJson(MAX_REQUEST_BODY_DEPTH)), MAX_REQUEST_BODY_DEPTH),
      false,
    );
    assert.equal(
      exceedsMaxDepth(JSON.parse(nestedArrayJson(MAX_REQUEST_BODY_DEPTH + 1)), MAX_REQUEST_BODY_DEPTH),
      true,
    );
  });

  it('acha o ramo profundo mesmo quando não é o primeiro nem o último', () => {
    const body = { first: { x: 1 }, deep: nestedObject(MAX_REQUEST_BODY_DEPTH), last: [1, 2] };
    assert.equal(exceedsMaxDepth(body, MAX_REQUEST_BODY_DEPTH), true);
  });

  it('10.000 e 100.000 níveis não estouram a pilha da própria checagem', () => {
    assert.doesNotThrow(() => {
      assert.equal(exceedsMaxDepth(nestedObject(10_000), MAX_REQUEST_BODY_DEPTH), true);
      assert.equal(exceedsMaxDepth(JSON.parse(nestedArrayJson(100_000)), MAX_REQUEST_BODY_DEPTH), true);
    });
    // Mesmo com o limite "infinito", percorre tudo sem recursão.
    assert.equal(exceedsMaxDepth(nestedObject(10_000), Number.POSITIVE_INFINITY), false);
  });

  it('o corpo legítimo mais profundo da API (favorito) fica muito abaixo do limite', () => {
    const favorite = {
      recipeName: 'Shake',
      ingredients: [{ name: 'Banana', amount: '1' }],
      steps: [{ text: 'Bata', pulseCount: 3 }],
      protein: 30,
    };
    assert.equal(exceedsMaxDepth(favorite, 3), false);
  });
});

describe('rejectDeeplyNestedBody + sanitizeRequest (cadeia do index.ts)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    const largeJsonParser = express.json({ limit: '4mb' });
    const defaultJsonParser = express.json({ limit: '50kb' });
    app.use((req, res, next) => {
      const parser = req.path === '/large' ? largeJsonParser : defaultJsonParser;
      parser(req, res, next);
    });
    app.use(express.urlencoded({ extended: true, limit: '4mb' }));
    app.use(rejectDeeplyNestedBody);
    app.use(sanitizeRequest);
    app.post(['/echo', '/large'], (req, res) => {
      res.status(200).json({ success: true, body: req.body as unknown });
    });
    app.get('/query', (req, res) => {
      res.status(200).json({ query: req.query as unknown });
    });
    // Igual ao errorHandler real: usa o statusCode do erro (o body-parser
    // marca os seus com 400/413) e cai em 500 no resto — um RangeError da
    // sanitização apareceria aqui como 500.
    app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err.statusCode ?? 500).json({ success: false, name: err.name });
    });

    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const postJson = (path: string, body: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

  it('5.000 e 10.000 níveis (objeto e array) respondem 400 no formato padrão, não 500', async () => {
    for (const body of [nestedObjectJson(5_000), nestedArrayJson(5_000), nestedArrayJson(10_000)]) {
      const response = await postJson('/echo', body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        success: false,
        code: VALIDATION_ERROR_CODE,
        message: BODY_TOO_DEEP_MESSAGE,
      });
    }
  });

  it('vale também na rota do parser de 4 MB', async () => {
    const response = await postJson('/large', nestedArrayJson(200_000));
    assert.equal(response.status, 400);
  });

  it('limite exato passa; limite + 1 dá 400', async () => {
    const ok = await postJson('/echo', nestedObjectJson(MAX_REQUEST_BODY_DEPTH));
    assert.equal(ok.status, 200);

    const tooDeep = await postJson('/echo', nestedObjectJson(MAX_REQUEST_BODY_DEPTH + 1));
    assert.equal(tooDeep.status, 400);
  });

  it('corpo normal segue para a rota e continua sanitizado', async () => {
    const response = await postJson(
      '/echo',
      JSON.stringify({ email: 'a@b.com', password: { $ne: null }, ingredients: [{ name: 'x' }] }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      body: { email: 'a@b.com', password: {}, ingredients: [{ name: 'x' }] },
    });
  });

  it('urlencoded aninhado além do depth do body-parser é recusado com 400 pelo próprio parser', async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `a${'[a]'.repeat(40)}=1`,
    });
    assert.equal(response.status, 400);
  });

  it('query string não aninha (parser simple do Express 5)', async () => {
    const response = await fetch(`${baseUrl}/query?a[b][c]=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { query: { 'a[b][c]': '1' } });
  });
});
