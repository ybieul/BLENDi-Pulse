// CP-L1 — Logs de erro sem dado da conta: o helper tira o objeto bruto
// (payload do jose, keyValue do Mongo, destinatário do nodemailer, tokens) e
// um guarda varre todo console.error/console.warn da API.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import { describeErrorForLog, redactForLog } from './logSafety.utils';

const EMAIL = 'pessoa.real@exemplo.com';
const USER_ID = '665f1b2c3d4e5f6a7b8c9d0e';

describe('CP-L1 — describeErrorForLog / redactForLog', () => {
  it('erro do jose com payload: só nome, código e mensagem', () => {
    const err = Object.assign(new Error('"aud" claim check failed'), {
      name: 'JWTClaimValidationFailed',
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      payload: { email: EMAIL, sub: 'apple-sub-123' },
    });
    const info = describeErrorForLog(err, { includeMessage: true });
    assert.deepEqual(info, {
      errorName: 'JWTClaimValidationFailed',
      errorCode: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
      errorMessage: '"aud" claim check failed',
    });
    assert.equal(JSON.stringify(info).includes(EMAIL), false);
  });

  it('chave duplicada do Mongo: sem keyValue nem mensagem por padrão', () => {
    const err = Object.assign(new Error(`E11000 duplicate key error dup key: { email: "${EMAIL}" }`), {
      name: 'MongoServerError',
      code: 11000,
      keyValue: { email: EMAIL, userId: USER_ID },
    });
    const info = describeErrorForLog(err);
    assert.deepEqual(info, { errorName: 'MongoServerError', errorCode: 11000 });
  });

  it('nodemailer: código e status SMTP, nunca o destinatário', () => {
    const err = Object.assign(new Error(`Recipient address rejected: ${EMAIL}`), {
      code: 'EENVELOPE',
      responseCode: 550,
      envelope: { to: [EMAIL] },
    });
    assert.deepEqual(describeErrorForLog(err), { errorName: 'Error', errorCode: 'EENVELOPE', statusCode: 550 });
  });

  it('mensagem incluída é mascarada (e-mail, JWT, token de push, credencial de URI)', () => {
    const text = `x ${EMAIL} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc ExponentPushToken[abc123] mongodb+srv://admin:s3cr3t@cluster0.mongodb.net/db`;
    const redacted = redactForLog(text);
    for (const secret of [EMAIL, 'eyJhbGci', 'abc123', 's3cr3t', 'admin:']) {
      assert.equal(redacted.includes(secret), false, secret);
    }
  });

  it('não-Error vira só o tipo', () => {
    assert.deepEqual(describeErrorForLog({ email: EMAIL }), { errorName: 'NonErrorObject' });
    assert.deepEqual(describeErrorForLog('texto'), { errorName: 'string' });
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

describe('CP-L1 — guarda dos logs de erro da API', () => {
  const SRC = join(__dirname, '..');
  const calls = sourceFiles(SRC).flatMap(path => {
    const code = readFileSync(path, 'utf8');
    return [...code.matchAll(/console\.(?:error|warn)\(([\s\S]*?)\);/g)].map(match => ({
      path: relative(SRC, path),
      args: match[1] ?? '',
    }));
  });

  it('o guarda enxerga os logs', () => {
    assert.ok(calls.length > 50, String(calls.length));
  });

  it('nenhum log de erro leva userId, e-mail, sub, id do usuário ou token', () => {
    const hits = calls
      .filter(({ args }) =>
        /\buserId\b|\bemail\b|\bsub\b|user\._id|\bpushToken\b|refreshToken|identityToken\s*[,}]/.test(
          args.replace(/'[^']*'|`[^`]*`|"[^"]*"/g, '')
        )
      )
      .map(({ path, args }) => `${path}: ${args.slice(0, 80)}`);
    assert.deepEqual(hits, []);
  });

  it('nenhum log de erro leva o objeto de erro bruto (err/error/reason)', () => {
    const hits = calls
      .filter(({ args }) => {
        // Só conta o objeto como VALOR (argumento solto ou campo do log):
        // `fn(err)` (describeErrorForLog, getters de status) é seguro.
        const code = args.replace(/'[^']*'|`[^`]*`|"[^"]*"/g, "''");
        return /(?:^|[,{]\s*)(?:err|error|reason)\s*(?:$|[,}])/m.test(code);
      })
      .map(({ path, args }) => `${path}: ${args.slice(0, 80)}`);
    assert.deepEqual(hits, []);
  });
});
