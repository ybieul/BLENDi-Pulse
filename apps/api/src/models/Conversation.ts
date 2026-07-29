import mongoose, { type Document } from 'mongoose';
import {
  pulseAiRecipeSchema,
  type PulseAiRecipe,
} from '@blendi/shared';

const CONVERSATION_TTL_SECONDS = 7_776_000;
const conversationMessageRoleValues = ['user', 'assistant'] as const;

export type ConversationMessageRole = (typeof conversationMessageRoleValues)[number];

export interface IConversationMessage {
  role: ConversationMessageRole;
  content: string | PulseAiRecipe;
  timestamp: Date;
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
): boolean {
  if (role === 'user') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (role === 'assistant') {
    return pulseAiRecipeSchema.safeParse(value).success;
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
          return isValidConversationMessageContent(this.role, value);
        },
        message: 'errors.validation.invalid_option',
      },
    },
    timestamp: {
      type: Date,
      required: [true, 'errors.validation.required'],
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
      maxlength: [100, 'errors.validation.too_long'],
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