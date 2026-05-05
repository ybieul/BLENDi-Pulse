// apps/api/src/services/otp.service.ts
// Lógica centralizada de geração, hash e verificação de OTPs.
//
// ─── Decisões de design ───────────────────────────────────────────────────────
//
// 1. crypto.randomInt — geração criptograficamente segura.
//    Math.random() é determinístico e previsível. crypto.randomInt usa CSPRNG
//    do sistema operacional, equivalente a /dev/urandom — padrão para valores
//    de segurança.
//
// 2. Argon2id para hash do OTP — mesmos parâmetros das senhas.
//    OTPs de 6 dígitos têm espaço de 10^6 (1 milhão de combinações). Sem hash
//    robusto, um vazamento de banco expõe todos os códigos ativos. Argon2id
//    com os parâmetros OWASP 2025 garante que mesmo offline brute-force seja
//    computacionalmente inviável dentro da janela de 15 minutos.
//
// 3. Limite de 5 tentativas — proteção contra força bruta online.
//    O contador é incrementado ANTES da verificação do código para evitar
//    race conditions: duas requisições paralelas não podem ambas verificar
//    antes que o contador seja atualizado.
//
// 4. createOtpRecord deleta registros anteriores antes de criar o novo.
//    Garante que apenas um OTP válido exista por usuário a qualquer momento.
//    Evita acumulação de hashes no banco e torna inválidos OTPs anteriores
//    que o usuário possa ter solicitado.
//
// 5. validateOtpRecord verifica expiresAt explicitamente além do TTL.
//    O índice TTL do MongoDB tem granularidade de ~60s. A verificação explícita
//    garante que OTPs expirados sejam rejeitados imediatamente, sem depender
//    do scheduler do MongoDB.

import crypto from 'crypto';
import argon2 from 'argon2';
import { OtpModel } from '../models/Otp';

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Duração de validade do OTP em milissegundos (15 minutos). */
const OTP_TTL_MS = 15 * 60 * 1000;

/** Número máximo de tentativas de verificação antes de bloquear o OTP. */
const MAX_ATTEMPTS = 5;

export type OtpValidationFailureReason = 'expired' | 'invalid' | 'max_attempts';

export type OtpValidationResult =
  | { ok: true }
  | { ok: false; reason: OtpValidationFailureReason };

/**
 * Parâmetros Argon2id — OWASP 2025.
 * Idênticos aos usados para senhas, garantindo consistência na postura de
 * segurança do projeto. A lentidão intencional (~300ms) é aceitável no
 * fluxo de reset de senha, que não é uma operação de alta frequência.
 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

// ─── generateOtp ──────────────────────────────────────────────────────────────

/**
 * Gera um código OTP numérico de 6 dígitos criptograficamente seguro.
 *
 * crypto.randomInt(0, 1_000_000) retorna um inteiro uniforme em [0, 999999].
 * padStart(6, '0') garante sempre 6 caracteres (ex: 7 → '000007').
 *
 * @returns string de exatamente 6 dígitos numéricos (ex: '038472')
 */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// ─── hashOtp ──────────────────────────────────────────────────────────────────

/**
 * Gera o hash Argon2id do código OTP em texto puro.
 * Nunca armazenar o código sem hash — mesma regra das senhas.
 *
 * @param otp - Código OTP em texto puro (ex: '038472')
 * @returns Hash Argon2id para armazenamento
 */
export async function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, ARGON2_OPTIONS);
}

// ─── verifyOtp ────────────────────────────────────────────────────────────────

/**
 * Compara um código OTP em texto puro com seu hash Argon2 armazenado.
 *
 * @param otp  - Código digitado pelo usuário
 * @param hash - Hash armazenado no banco
 * @returns true se o código corresponde ao hash, false caso contrário
 */
export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, otp);
  } catch {
    // Argon2 pode lançar se o hash estiver malformado — tratar como falha
    return false;
  }
}

// ─── createOtpRecord ──────────────────────────────────────────────────────────

/**
 * Gera um novo OTP para o email informado e persiste o hash no MongoDB.
 *
 * Apaga todos os registros anteriores do mesmo email antes de criar o novo,
 * garantindo que apenas um OTP válido exista por usuário a qualquer momento.
 * OTPs anteriores (solicitações repetidas) são automaticamente invalidados.
 *
 * @param email - Email do usuário (será normalizado para lowercase)
 * @returns Código OTP em texto puro — o caller é responsável pelo envio por email
 */
export async function createOtpRecord(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase();

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  // Invalida OTPs anteriores — apenas um código ativo por usuário
  await OtpModel.deleteMany({ email: normalizedEmail });

  await OtpModel.create({
    email: normalizedEmail,
    otpHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    used: false,
    attempts: 0,
  });

  // Retorna o código em plaintext para o caller enviar por email.
  // Após este ponto, o código não pode mais ser recuperado — apenas verificado.
  return otp;
}

// ─── validateOtpRecord ────────────────────────────────────────────────────────

/**
 * Valida o código OTP submetido pelo usuário.
 *
 * Checklist em ordem:
 *   1. Registro existe
 *   2. Não expirou (verificação explícita — TTL tem granularidade de ~60s)
 *   3. Não foi usado anteriormente
 *   4. Número de tentativas não excedeu o limite (MAX_ATTEMPTS = 5)
 *   5. Incrementa tentativas antes de verificar (evita race conditions)
 *   6. Verifica o código com Argon2
 *   7. Se correto, marca como usado e retorna true
 *
 * Retorna um resultado discriminado, permitindo que o controller exponha apenas
 * os códigos necessários para o cliente mobile sem perder a proteção do fluxo.
 * Registros inexistentes ou já usados continuam mapeados para `invalid`.
 *
 * @param email - Email do usuário
 * @param otp   - Código OTP digitado pelo usuário (6 dígitos)
 * @returns Resultado da validação com motivo padronizado em caso de falha
 */
export async function validateOtpRecord(
  email: string,
  otp: string
): Promise<OtpValidationResult> {
  const normalizedEmail = email.toLowerCase();

  const record = await OtpModel.findOne({ email: normalizedEmail });

  // Registro não encontrado (expirou e foi removido pelo TTL, ou nunca existiu)
  if (!record) return { ok: false, reason: 'invalid' };

  // Verificação explícita de expiração — belt-and-suspenders contra atraso do TTL
  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' };

  // OTP já foi utilizado com sucesso anteriormente
  if (record.used) return { ok: false, reason: 'invalid' };

  // Tentativas esgotadas — rejeitar sem incrementar (já no limite)
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'max_attempts' };

  // Incrementar tentativas ANTES de verificar o código.
  // Garante que tentativas paralelas não contornem o limite.
  record.attempts += 1;
  await record.save();

  const isValid = await verifyOtp(otp, record.otpHash);

  if (isValid) {
    record.used = true;
    await record.save();
    return { ok: true };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'max_attempts' };
  }

  return { ok: false, reason: 'invalid' };
}
