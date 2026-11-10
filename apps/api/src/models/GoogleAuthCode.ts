// apps/api/src/models/GoogleAuthCode.ts
// Código de uso único que entrega a sessão do login Google ao app (CP-1.1.1d).
//
// O callback do Google não põe mais tokens nem usuário no deep link
// (blendipulse://auth/callback): só este código. O app troca o código e o
// verificador (PKCE) por tokens em POST /auth/google/exchange.
//
// ─── Decisões de design ───────────────────────────────────────────────────────
//
// 1. codeHash — nunca o código em texto puro (mesmo princípio do Otp).
//    SHA-256 em vez de Argon2: o código tem 256 bits aleatórios, então não
//    há força bruta offline viável, e o hash determinístico é o que permite
//    achar o registro direto pelo índice e consumi-lo de forma atômica.
//
// 2. TTL index em expiresAt (expireAfterSeconds: 0), como no Otp. O TTL do
//    MongoDB roda a cada ~60s, por isso a troca também confere expiresAt.
//
// 3. Uso único: a troca consome o registro com findOneAndDelete ANTES de
//    conferir o verificador — uma tentativa errada também queima o código.

import mongoose, { type Document, type Types } from 'mongoose';

export interface IGoogleAuthCode {
  /** SHA-256 (hex) do código entregue no deep link. */
  codeHash: string;
  userId: Types.ObjectId;
  /** Desafio PKCE (SHA-256 do verificador, base64url) vindo do state assinado. */
  codeChallenge: string;
  /** Repassado ao app na troca (evento sign_up e onboarding). */
  isNewUser: boolean;
  /** MongoDB remove o documento automaticamente via TTL. */
  expiresAt: Date;
}

export type GoogleAuthCodeDocument = Document<unknown, object, IGoogleAuthCode> & IGoogleAuthCode;

const googleAuthCodeSchema = new mongoose.Schema<IGoogleAuthCode>({
  codeHash: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  codeChallenge: {
    type: String,
    required: true,
  },
  isNewUser: {
    type: Boolean,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

googleAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GoogleAuthCodeModel = mongoose.model<IGoogleAuthCode>(
  'GoogleAuthCode',
  googleAuthCodeSchema
);
