// apps/api/src/services/googleAuthCode.service.ts
// Código de uso único + verificador (no espírito do PKCE, RFC 7636) que
// entrega a sessão do login Google ao app (CP-1.1.1d).
//
//   1. GET /auth/google/url recebe o desafio (SHA-256 do verificador) e o
//      guarda no state assinado.
//   2. O callback resolve o usuário e chama createGoogleAuthCode: só o hash do
//      código vai para o banco, ligado ao usuário, ao desafio e ao isNewUser.
//      O deep link leva apenas o código.
//   3. POST /auth/google/exchange chama consumeGoogleAuthCode com o código e o
//      verificador: o registro é apagado de forma atômica ANTES da checagem
//      (uso único mesmo em falha), e o verificador é conferido em tempo
//      constante. Qualquer falha devolve null — o controller responde sempre
//      com o mesmo erro genérico.
//
// Nunca registrar código, verificador nem desafio em log.

import crypto from 'crypto';
import type { Types } from 'mongoose';
import { GoogleAuthCodeModel } from '../models/GoogleAuthCode';

/** Validade do código: tempo de o browser fechar e o app fazer a troca. */
export const GOOGLE_AUTH_CODE_TTL_MS = 2 * 60 * 1000;

const GOOGLE_AUTH_CODE_BYTES = 32;
const SHA256_BYTES = 32;

export function hashGoogleAuthCode(code: string): string {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Desafio PKCE S256: base64url(SHA-256(verificador)), sem padding. */
export function computeCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

function verifierMatchesChallenge(codeVerifier: string, storedChallenge: string): boolean {
  const expected = Buffer.from(storedChallenge, 'base64url');
  const actual = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest();

  // timingSafeEqual exige o mesmo tamanho; um desafio malformado nunca bate.
  if (expected.length !== SHA256_BYTES) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Cria o código de uso único e devolve o código em texto puro, para o
 * redirect. Depois disso ele não pode ser recuperado, só consumido.
 */
export async function createGoogleAuthCode(params: {
  userId: string | Types.ObjectId;
  codeChallenge: string;
  isNewUser: boolean;
}): Promise<string> {
  const code = crypto.randomBytes(GOOGLE_AUTH_CODE_BYTES).toString('base64url');

  await GoogleAuthCodeModel.create({
    codeHash: hashGoogleAuthCode(code),
    userId: params.userId,
    codeChallenge: params.codeChallenge,
    isNewUser: params.isNewUser,
    expiresAt: new Date(Date.now() + GOOGLE_AUTH_CODE_TTL_MS),
  });

  return code;
}

export interface ConsumedGoogleAuthCode {
  userId: string;
  isNewUser: boolean;
}

/**
 * Consome o código. Devolve null em qualquer falha — inexistente, já usado,
 * expirado ou verificador errado — sem distinguir o motivo.
 */
export async function consumeGoogleAuthCode(
  code: string,
  codeVerifier: string
): Promise<ConsumedGoogleAuthCode | null> {
  // findOneAndDelete é atômico: duas trocas concorrentes com o mesmo código
  // nunca recebem o registro as duas. Apaga antes de conferir o verificador,
  // então uma tentativa com verificador errado também queima o código.
  const record = await GoogleAuthCodeModel.findOneAndDelete({
    codeHash: hashGoogleAuthCode(code),
  }).lean();

  if (!record) {
    return null;
  }

  // O TTL do MongoDB tem atraso de até ~60s; a validade é conferida aqui.
  if (record.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (!verifierMatchesChallenge(codeVerifier, record.codeChallenge)) {
    return null;
  }

  return { userId: String(record.userId), isNewUser: record.isNewUser };
}
