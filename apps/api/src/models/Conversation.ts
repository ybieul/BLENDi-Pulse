import mongoose, { type Document } from 'mongoose';
import {
  pulseAiRecipePreviewSchema,
  pulseAiRecipeSchema,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from '@blendi/shared';

import { LAST_RECIPE_NAME_MAX_LENGTH } from '../utils/recipeName.utils';

const CONVERSATION_TTL_SECONDS = 7_776_000;
const conversationMessageRoleValues = ['user', 'assistant'] as const;

export type ConversationMessageRole = (typeof conversationMessageRoleValues)[number];

export interface IConversationMessage {
  role: ConversationMessageRole;
  /**
   * user: texto. assistant: receita completa, ou — quando `locked` — só a
   * parte visível da prévia (só macros, pulseAiRecipePreviewSchema).
   */
  content: string | PulseAiRecipe | PulseAiRecipePreview;
  timestamp: Date;
  /**
   * CP-1.1.4a: turno de prévia bloqueada. O conteúdo completo fica só em
   * LockedPreview; este turno nunca guarda ingredientes nem passos.
   */
  locked?: boolean;
  /** Prévia de origem (LockedPreview._id). Fica no turno após o desbloqueio, para idempotência. */
  previewId?: mongoose.Types.ObjectId;
  /** Validade da prévia, para o app mostrar o card bloqueado ao reabrir a conversa. */
  previewExpiresAt?: Date;
}

export interface IConversation {
  userId: mongoose.Types.ObjectId;
  messages: IConversationMessage[];
  lastRecipeName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = Document<unknown, object, IConversation> & IConversation;

function isValidConversationMessageContent(
  role: ConversationMessageRole | undefined,
  value: unknown,
  locked: boolean,
): boolean {
  if (role === 'user') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (role === 'assistant') {
    // Turno bloqueado aceita SÓ a parte visível (schema estrito): uma receita
    // completa aqui seria rejeitada, então o conteúdo escondido não tem como
    // parar na conversa por engano.
    return locked
      ? pulseAiRecipePreviewSchema.safeParse(value).success
      : pulseAiRecipeSchema.safeParse(value).success;
  }

  return false;
}

const conversationMessageSchema = new mongoose.Schema<IConversationMessage>(
  {
    role: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: conversationMessageRoleValues,
      trim: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'errors.validation.required'],
      validate: {
        validator: function (this: IConversationMessage, value: unknown) {
          return isValidConversationMessageContent(this.role, value, this.locked === true);
        },
        message: 'errors.validation.invalid_option',
      },
    },
    timestamp: {
      type: Date,
      required: [true, 'errors.validation.required'],
    },
    locked: {
      type: Boolean,
      required: false,
    },
    previewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LockedPreview',
      required: false,
    },
    previewExpiresAt: {
      type: Date,
      required: false,
    },
  },
  {
    _id: false,
  }
);

const conversationSchema = new mongoose.Schema<IConversation>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    messages: {
      type: [conversationMessageSchema],
      default: [],
    },
    lastRecipeName: {
      type: String,
      required: false,
      trim: true,
      maxlength: [LAST_RECIPE_NAME_MAX_LENGTH, 'errors.validation.too_long'],
    },
  },
  {
    collection: 'conversations',
    timestamps: true,
  }
);

conversationSchema.index({ createdAt: 1 }, { expireAfterSeconds: CONVERSATION_TTL_SECONDS });
conversationSchema.index({ userId: 1, createdAt: -1 });

export const ConversationModel = mongoose.model<IConversation>(
  'Conversation',
  conversationSchema
);