// apps/api/src/services/auth.service.ts
// Funções puras de autenticação: geração/verificação de JWT e hash de senha.
// Sem efeitos colaterais de banco de dados — use os controllers para isso.
//
// Algoritmo de hash: Argon2id
//   - Vencedor do Password Hashing Competition (2015)
//   - Parâmetros alinhados às recomendações OWASP 2025
//   - Resistente a ataques side-channel, GPU e ASIC

import jwt, { type JsonWebTokenError, type TokenExpiredError } from 'jsonwebtoken';
import argon2 from 'argon2';
import { authConfig } from '../config/auth';
import { env } from '../config/env';

// ─── Tipos dos payloads JWT ───────────────────────────────────────────────────

export interface AccessTokenPayload {
  /** ID do usuário no MongoDB (ObjectId como string) */
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface ResetTokenPayload {
  /** Email do usuário */
  sub: string;
  /** Identifica o propósito do token — deve ser 'password_reset' */
  purpose: string;
  iat: number;
  exp: number;
}

// ─── Argon2id — parâmetros OWASP 2025 ────────────────────────────────────────

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

// ─── JWT: geração ─────────────────────────────────────────────────────────────

/**
 * Gera um access token JWT assinado.
 * Payload: sub (userId), email, iat (automático pelo jwt.sign).
 * Expiração: 15 minutos.
 */
export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, authConfig.accessToken.secret, {
    expiresIn: authConfig.accessToken.expiresIn,
  });
}

/**
 * Gera um refresh token JWT assinado.
 * Payload mínimo: apenas sub (userId) — menos dados = menor superfície se vazado.
 * Expiração: 30 dias.
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, authConfig.refreshToken.secret, {
    expiresIn: authConfig.refreshToken.expiresIn,
  });
}

// ─── JWT: verificação ─────────────────────────────────────────────────────────

/**
 * Verifica e decodifica um access token.
 * @throws {TokenExpiredError} se o token estiver expirado
 * @throws {JsonWebTokenError} se o token for inválido
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, authConfig.accessToken.secret) as AccessTokenPayload;
}

/**
 * Verifica e decodifica um refresh token.
 * @throws {TokenExpiredError} se o token estiver expirado
 * @throws {JsonWebTokenError} se o token for inválido
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, authConfig.refreshToken.secret) as RefreshTokenPayload;
}

// ─── Utilitário de tipo para erros JWT ───────────────────────────────────────

export function isTokenExpiredError(err: unknown): err is TokenExpiredError {
  return (err as JsonWebTokenError)?.name === 'TokenExpiredError';
}

// ─── JWT: token de reset de senha ─────────────────────────────────────────────

/**
 * Gera um token JWT de curta duração para autorizar a redefinição de senha.
 * Payload: sub (email), purpose: 'password_reset'.
 * Expiração: 10 minutos — janela mínima para não frustrar o usuário.
 * Secret dedicado (JWT_RESET_SECRET) para isolamento de segurança.
 */
export function generateResetToken(email: string): string {
  return jwt.sign({ sub: email, purpose: 'password_reset' }, env.JWT_RESET_SECRET, {
    expiresIn: '10m',
  });
}

/**
 * Verifica e decodifica um token de reset.
 * @throws {TokenExpiredError} se o token estiver expirado
 * @throws {JsonWebTokenError} se o token for inválido
 */
export function verifyResetToken(token: string): ResetTokenPayload {
  return jwt.verify(token, env.JWT_RESET_SECRET) as ResetTokenPayload;
}

// ─── Senha: hash e verificação ────────────────────────────────────────────────

/**
 * Gera o hash Argon2id de uma senha em texto puro.
 * Use em registros ou trocas de senha fora do fluxo do modelo Mongoose.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Compara uma senha em texto puro com um hash Argon2 armazenado.
 * Retorna true se corresponderem, false caso contrário.
 * Nunca lança exceção por credencial incorreta — apenas false.
 */
export async function comparePassword(
  plaintext: string,
  storedHash: string
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
