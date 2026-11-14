// apps/api/src/models/LockedPreview.ts
// Armazenamento de prévias bloqueadas do "Wow Moment Paywall" (CP-1.1.4a).
//
// Quando o usuário grátis passa do limite, a IA roda mesmo assim, mas só a
// parte visível do resultado sai do servidor. O conteúdo completo fica aqui
// até o usuário assinar (e pedir o desbloqueio) ou até expirar. A coleção é
// genérica: `kind` diz de qual recurso é a prévia ('pulse_ai' no CP-1.1.4a,
// 'pantry_scanner' no CP-1.1.4b). Cada desbloqueio filtra pelo próprio kind,
// então o endpoint de um recurso nunca abre prévia do outro.

import mongoose, { type Document } from 'mongoose';

export const lockedPreviewKindValues = ['pulse_ai', 'pantry_scanner'] as const;
export type LockedPreviewKind = (typeof lockedPreviewKindValues)[number];

const HOUR_MS = 60 * 60 * 1000;

/**
 * Validade de uma prévia bloqueada, por recurso: depois disso o índice TTL
 * apaga sozinho. Pulse AI: 24h (CP-1.1.4a). Pantry Scanner: 7 dias (CP-1.1.4b).
 */
export const LOCKED_PREVIEW_TTL_MS_BY_KIND: Readonly<Record<LockedPreviewKind, number>> = {
  pulse_ai: 24 * HOUR_MS,
  pantry_scanner: 7 * 24 * HOUR_MS,
};

export interface ILockedPreview {
  kind: LockedPreviewKind;
  /** Dono da prévia: só ele pode desbloquear. */
  userId: mongoose.Types.ObjectId;
  /**
   * Conteúdo completo (no Pulse AI, a receita inteira; no Pantry, `{ recipes }`
   * com as receitas inteiras). Nunca sai para não Pro.
   */
  content: Record<string, unknown>;
  /**
   * Dados do recurso para concluir o desbloqueio. No Pulse AI: conversationId,
   * userMessage e userSentAt, para gravar o turno completo na conversa. No
   * Pantry: `{ ingredients }`, os ingredientes detectados, devolvidos junto com
   * as receitas no desbloqueio.
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
