// apps/api/src/services/cache.service.ts
// Porta única de acesso ao cache persistido de respostas do Pulse AI.
// Controllers e outros services devem depender deste módulo, nunca do modelo diretamente.

import { createHash } from 'node:crypto';
import type mongoose from 'mongoose';
import { CACHE_CONFIG } from '../config/cache.config';
import { AiCacheModel, type IAiCache } from '../models/AiCache';

export interface CacheKeyInput {
  userId: string;
  model: string;
  goal: string;
  language: string;
  unitSystem: string;
  // Opcional (default 'none'): mesmo motivo de PulseAiPromptUserContext.weightGoal
  // ser opcional em promptBuilder.service.ts — contas sem esse campo persistido
  // ainda geram uma cacheKey determinística.
  weightGoal?: string;
  aiProvider: string;
  aiModel: string;
  rawMessage: string;
  dietaryFlags?: string[];
  /**
   * CP-B3: conta sem BLENDi ('other'/'none') recebe receita com texto neutro;
   * a chave ganha o sufixo ':generic' para não reaproveitar a receita que cita
   * o BLENDi (nem o contrário). Ausente/false = chave igual à de antes.
   */
  genericBlender?: boolean;
  /**
   * CP-B5: o texto do prompt muda para quem tem 21+ confirmado (álcool só
   * se pedido) e para quem não tem. A chave ganha ':alcohol21' ou
   * ':noalcohol' no fim. Como o chat sempre passa este campo, as entradas
   * gravadas antes do CP-B5 (prompt sem a regra de pedido explícito) deixam
   * de ser lidas e expiram pelo TTL. Ausente = chave igual à de antes.
   */
  alcoholTier?: AlcoholCacheTier;
  /**
   * CP-B6: alergias cadastradas e a escolha desta requisição (confirmadas e
   * recusadas na folha). Entram na chave só como hash (':allergy-<sha256>'
   * no fim): mudar as alergias ou a resposta da folha muda a chave. Vazio ou
   * ausente = chave igual à de antes (quem não tem alergia não perde o cache).
   */
  allergyParts?: readonly string[];
}

export type AlcoholCacheTier = 'of-age' | 'not-of-age';

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
 * Saída: cacheKey estável no formato userId:model:goal:language:unitSystem:weightGoal:aiProvider:aiModel:messageHash:dietaryFlagsHash,
 * com ':generic' no fim para conta sem BLENDi (CP-B3), ':alcohol21'/':noalcohol'
 * (CP-B5) e ':allergy-<hash>' por último (CP-B6, só com alergia cadastrada).
 */
export function generateCacheKey({
  userId,
  model,
  goal,
  language,
  unitSystem,
  weightGoal = 'none',
  aiProvider,
  aiModel,
  rawMessage,
  dietaryFlags = [],
  genericBlender = false,
  alcoholTier,
  allergyParts = [],
}: CacheKeyInput): string {
  const messageHash = sha256(normalizeText(rawMessage));
  const dietaryFlagsHash = buildDietaryFlagsHash(dietaryFlags);

  return [
    userId.trim(),
    model.trim(),
    goal.trim(),
    language.trim(),
    unitSystem.trim(),
    weightGoal.trim(),
    aiProvider.trim(),
    aiModel.trim(),
    messageHash,
    dietaryFlagsHash,
    ...(genericBlender ? ['generic'] : []),
    ...(alcoholTier ? [alcoholTier === 'of-age' ? 'alcohol21' : 'noalcohol'] : []),
    ...(allergyParts.length > 0 ? [`allergy-${sha256(allergyParts.join('|'))}`] : []),
  ].join(':');
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
 * Entrada: cacheKey já gerada por generateCacheKey.
 * Saída: remove a entrada (ex.: receita em cache que deixou de passar na
 * validação de restrições — CP-1.1.1c). Sem efeito se a entrada não existe.
 */
export async function deleteFromCache(cacheKey: string): Promise<void> {
  await AiCacheModel.deleteOne({ cacheKey: cacheKey.trim() }).exec();
}

/**
 * Entrada: cacheKey, metadados da query original e a resposta estruturada do provider configurado.
 * Saída: persiste ou atualiza a entrada de cache com TTL calculado a partir do config central.
 */
export async function setInCache({
  cacheKey,
  userId,
  model,
  goal,
  language,
  unitSystem,
  weightGoal = 'none',
  aiProvider,
  aiModel,
  rawMessage,
  dietaryFlags = [],
  genericBlender = false,
  alcoholTier,
  allergyParts = [],
  response,
}: SetInCacheInput): Promise<void> {
  const expectedCacheKey = generateCacheKey({
    userId,
    model,
    goal,
    language,
    unitSystem,
    weightGoal,
    aiProvider,
    aiModel,
    rawMessage,
    dietaryFlags,
    genericBlender,
    alcoholTier,
    allergyParts,
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
 * Entrada: userId do dono das entradas de cache. `session` opcional permite
 * chamar esta função dentro de uma transação do Mongoose (ex: exclusão de conta).
 * Saída: quantidade de documentos removidos para invalidar todo o contexto de cache do usuário.
 */
export async function invalidateUserCache(
  userId: string,
  session?: mongoose.ClientSession
): Promise<number> {
  const result = await AiCacheModel.deleteMany(
    { userId: userId.trim() },
    session ? { session } : undefined
  ).exec();
  return result.deletedCount ?? 0;
}