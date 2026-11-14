// apps/api/src/models/LockedPreview.ts
// Armazenamento de prévias bloqueadas do "Wow Moment Paywall" (CP-1.1.4a).
//
// Quando o usuário grátis passa do limite, a IA roda mesmo assim, mas só a
// parte visível do resultado sai do servidor. O conteúdo completo fica aqui
// até o usuário assinar (e pedir o desbloqueio) ou até expirar. A coleção é
// genérica: `kind` diz de qual recurso é a prévia, para o Pantry Scanner
// reaproveitar no CP-1.1.4b sem coleção nova.

import mongoose, { type Document } from 'mongoose';

/** Validade de uma prévia bloqueada: depois disso o índice TTL apaga sozinho. */
export const LOCKED_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export const lockedPreviewKindValues = ['pulse_ai'] as const;
export type LockedPreviewKind = (typeof lockedPreviewKindValues)[number];

export interface ILockedPreview {
  kind: LockedPreviewKind;
  /** Dono da prévia: só ele pode desbloquear. */
  userId: mongoose.Types.ObjectId;
  /** Conteúdo completo (no Pulse AI, a receita inteira). Nunca sai para não Pro. */
  content: Record<string, unknown>;
  /**
   * Dados do recurso para concluir o desbloqueio. No Pulse AI: conversationId,
   * userMessage e userSentAt, para gravar o turno completo na conversa.
   */
  context: Record<string, unknown>;
  /** Fim da validade; usado pelo índice TTL. */
  expiresAt: Date;
  createdAt: Date;
}

export type LockedPreviewDocument = Document<unknown, object, ILockedPreview> & ILockedPreview;

const isPlainObject = (value: unknown) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const lockedPreviewSchema = new mongoose.Schema<ILockedPreview>(
  {
    kind: {
      type: String,
      required: true,
      enum: lockedPreviewKindValues,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: { validator: isPlainObject, message: 'content must be an object' },
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: { validator: isPlainObject, message: 'context must be an object' },
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'locked_previews',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Desbloqueio busca por _id + dono; este índice cobre listagens por usuário.
lockedPreviewSchema.index({ userId: 1, kind: 1 });

// Remoção automática no instante de expiresAt. O monitor de TTL do Mongo roda
// a cada ~60s, então as consultas também filtram expiresAt > agora.
lockedPreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LockedPreviewModel = mongoose.model<ILockedPreview>(
  'LockedPreview',
  lockedPreviewSchema
);
