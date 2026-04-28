// apps/api/src/models/Otp.ts
// Modelo para registros de OTP de redefinição de senha.
//
// ─── Decisões de design ───────────────────────────────────────────────────────
//
// 1. otpHash — nunca o código em texto puro.
//    Mesmo princípio das senhas: comprometimento do banco não expõe o código.
//
// 2. TTL index em expiresAt com expireAfterSeconds: 0
//    O MongoDB remove automaticamente os documentos quando a data de expiração
//    é atingida — nenhum cron job necessário. O cleanup é eventual (MongoDB
//    verifica TTL a cada ~60s), por isso o service também faz verificação
//    explícita de expiração na validação.
//
// 3. used + attempts — garantias de uso único e proteção contra força bruta.
//    Um OTP só pode ser validado com sucesso uma vez (used) e o número de
//    tentativas é limitado (attempts) para impedir ataques de enumeração.
//
// 4. Um OTP ativo por usuário — createOtpRecord deleta os anteriores antes
//    de inserir. Não há necessidade de índice unique em email, pois a janela
//    de tempo entre delete e insert é aceitável neste fluxo.

import mongoose, { type Document } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IOtp {
  /** Email do usuário — identifica para quem o OTP foi emitido. */
  email: string;
  /** Hash Argon2id do código OTP. Nunca armazenar o código em texto puro. */
  otpHash: string;
  /** Data/hora de expiração. MongoDB remove o documento automaticamente via TTL. */
  expiresAt: Date;
  /** true se o OTP já foi utilizado com sucesso. Um OTP só pode ser usado uma vez. */
  used: boolean;
  /** Número de tentativas de verificação. Limitado a 5 para evitar força bruta. */
  attempts: number;
}

export type OtpDocument = Document<unknown, object, IOtp> & IOtp;

// ─── Schema ───────────────────────────────────────────────────────────────────

const otpSchema = new mongoose.Schema<IOtp>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
  },
});

// ─── TTL index ────────────────────────────────────────────────────────────────
// expireAfterSeconds: 0 → MongoDB remove o documento no momento exato de expiresAt.
// O engine de TTL é executado a cada ~60 segundos — para expiração estrita em
// tempo real, o service também verifica explicitamente `expiresAt < new Date()`.

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Modelo ───────────────────────────────────────────────────────────────────

export const OtpModel = mongoose.model<IOtp>('Otp', otpSchema);
