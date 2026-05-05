// apps/api/src/models/AiCache.ts
// Cache persistido das respostas do Pulse AI.
// Esta coleção existe para evitar recomputar prompts idênticos quando o mesmo
// usuário repete uma consulta com o mesmo contexto de modelo, goal, idioma e flags.

import mongoose, { type Document } from 'mongoose';

export interface IAiCache {
  /** Chave composta única usada para lookup O(1) do cache. */
  cacheKey: string;
  /** Dono da entrada de cache. */
  userId: mongoose.Types.ObjectId;
  /** Modelo BLENDi ativo no momento da consulta. */
  model: string;
  /** Objetivo ativo do usuário no momento da consulta. */
  goal: string;
  /** Idioma usado para gerar a resposta. */
  language: string;
  /** SHA-256 da mensagem normalizada do usuário. */
  messageHash: string;
  /** Preferências dietéticas futuras, normalizadas para maximizar cache hits. */
  dietaryFlags: string[];
  /** Resposta estruturada do GPT-4o; o shape específico será definido no CP1.5. */
  response: Record<string, unknown>;
  /** Data de expiração real da entrada; usada pelo índice TTL do MongoDB. */
  expiresAt: Date;
  /** Timestamp de criação automática da entrada. */
  createdAt: Date;
}

export type AiCacheDocument = Document<unknown, object, IAiCache> & IAiCache;

const aiCacheSchema = new mongoose.Schema<IAiCache>(
  {
    cacheKey: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    goal: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
    },
    messageHash: {
      type: String,
      required: true,
    },
    dietaryFlags: {
      type: [String],
      default: [],
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (value: unknown) =>
          value !== null && typeof value === 'object' && !Array.isArray(value),
        message: 'response must be an object',
      },
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'ai_cache',
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

// Lookup principal do cache. Mantém unicidade por chave composta já materializada.
aiCacheSchema.index({ cacheKey: 1 }, { unique: true });

// Expiração automática exatamente no instante de expiresAt.
aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiCacheModel = mongoose.model<IAiCache>('AiCache', aiCacheSchema);