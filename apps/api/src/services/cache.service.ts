// apps/api/src/services/cache.service.ts
// Porta única de acesso ao cache persistido de respostas do Pulse AI.
// Controllers e outros services devem depender deste módulo, nunca do modelo diretamente.

import { createHash } from 'node:crypto';
import { CACHE_CONFIG } from '../config/cache.config';
import { AiCacheModel, type IAiCache } from '../models/AiCache';

export interface CacheKeyInput {
  userId: string;
  model: string;
  goal: string;
  language: string;
  rawMessage: string;
  dietaryFlags?: string[];
}

export interface SetInCacheInput extends CacheKeyInput {
  cacheKey: string;
  response: IAiCache['response'];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDietaryFlags(dietaryFlags: string[]): string[] {
  return [...new Set(dietaryFlags.map(flag => normalizeText(flag)).filter(Boolean))].sort();
}

function buildDietaryFlagsHash(dietaryFlags: string[]): string {
  return sha256(normalizeDietaryFlags(dietaryFlags).join('|'));
}

/**
 * Entrada: metadados determinísticos da query do usuário.
 * Saída: cacheKey estável no formato userId:model:goal:language:messageHash:dietaryFlagsHash.
 */
export function generateCacheKey({
  userId,
  model,
  goal,
  language,
  rawMessage,
  dietaryFlags = [],
}: CacheKeyInput): string {
  const messageHash = sha256(normalizeText(rawMessage));
  const dietaryFlagsHash = buildDietaryFlagsHash(dietaryFlags);

  return [userId.trim(), model.trim(), goal.trim(), language.trim(), messageHash, dietaryFlagsHash].join(':');
}

/**
 * Entrada: cacheKey já gerada por generateCacheKey.
 * Saída: o campo response quando a entrada existe e ainda não expirou; null caso contrário.
 */
export async function getFromCache(cacheKey: string): Promise<IAiCache['response'] | null> {
  const cacheEntry = await AiCacheModel.findOne({ cacheKey: cacheKey.trim() })
    .select('response expiresAt')
    .exec();

  if (!cacheEntry) {
    return null;
  }

  if (cacheEntry.expiresAt.getTime() <= Date.now()) {
    await AiCacheModel.deleteOne({ _id: cacheEntry._id }).exec();
    return null;
  }

  return cacheEntry.response;
}

/**
 * Entrada: cacheKey, metadados da query original e a resposta estruturada do GPT-4o.
 * Saída: persiste ou atualiza a entrada de cache com TTL calculado a partir do config central.
 */
export async function setInCache({
  cacheKey,
  userId,
  model,
  goal,
  language,
  rawMessage,
  dietaryFlags = [],
  response,
}: SetInCacheInput): Promise<void> {
  const expectedCacheKey = generateCacheKey({
    userId,
    model,
    goal,
    language,
    rawMessage,
    dietaryFlags,
  });

  if (cacheKey !== expectedCacheKey) {
    throw new Error('[cache.service] cacheKey does not match the provided query metadata');
  }

  const expiresAt = new Date(Date.now() + CACHE_CONFIG.PULSE_AI_RESPONSES_TTL * 1000);

  await AiCacheModel.findOneAndUpdate(
    { cacheKey },
    {
      cacheKey,
      userId: userId.trim(),
      model: model.trim(),
      goal: goal.trim(),
      language: language.trim(),
      messageHash: sha256(normalizeText(rawMessage)),
      dietaryFlags: normalizeDietaryFlags(dietaryFlags),
      response,
      expiresAt,
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).exec();
}

/**
 * Entrada: userId do dono das entradas de cache.
 * Saída: quantidade de documentos removidos para invalidar todo o contexto de cache do usuário.
 */
export async function invalidateUserCache(userId: string): Promise<number> {
  const result = await AiCacheModel.deleteMany({ userId: userId.trim() }).exec();
  return result.deletedCount ?? 0;
}