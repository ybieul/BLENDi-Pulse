// Apoio aos testes do Pantry Scanner (CP-B7): PantryRead falso em memória
// e o fluxo de duas etapas (POST /read → POST /generate) que substituiu o
// antigo POST /analyze. Não é um arquivo de teste (não roda sozinho).
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

type Filter = Record<string, unknown>;

export interface FakePantryReadDoc {
  _id: mongoose.Types.ObjectId;
  userId: string;
  ingredients: Array<{ name: string; estimatedQuantity?: string; confidence: string; isAlcoholic: boolean; blendSuitable?: boolean }>;
  hasLiquid: boolean;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

function chain(resolve: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'sort', 'limit', 'lean']) {
    query[method] = () => query;
  }
  query.exec = async () => resolve();
  return query;
}

function copy(doc: FakePantryReadDoc): FakePantryReadDoc {
  return {
    ...doc,
    _id: new mongoose.Types.ObjectId(doc._id.toHexString()),
    ingredients: doc.ingredients.map(ingredient => ({ ...ingredient })),
    consumedAt: doc.consumedAt ? new Date(doc.consumedAt) : null,
    expiresAt: new Date(doc.expiresAt),
    createdAt: new Date(doc.createdAt),
  };
}

function matches(doc: FakePantryReadDoc, filter: Filter): boolean {
  if (filter._id !== undefined && String(filter._id) !== doc._id.toHexString()) return false;
  if (filter.userId !== undefined && String(filter.userId) !== doc.userId) return false;
  const expires = filter.expiresAt as { $gt?: Date } | undefined;
  if (expires?.$gt && !(doc.expiresAt.getTime() > expires.$gt.getTime())) return false;
  if ('consumedAt' in filter && filter.consumedAt === null && doc.consumedAt !== null) return false;
  return true;
}

function applySet(doc: FakePantryReadDoc, update: Filter) {
  const set = (update.$set ?? {}) as Partial<FakePantryReadDoc>;
  Object.assign(doc, set);
}

/** PantryRead falso. `docs` é o estado (zerar com reset()). */
export function createFakePantryReadModel() {
  const state = { docs: [] as FakePantryReadDoc[] };

  const model = {
    create: async (input: Omit<FakePantryReadDoc, '_id' | 'createdAt' | 'consumedAt' | 'userId'> & { userId: unknown }) => {
      const doc: FakePantryReadDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: String(input.userId),
        ingredients: input.ingredients.map(ingredient => ({ ...ingredient })),
        hasLiquid: input.hasLiquid,
        consumedAt: null,
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(),
      };
      state.docs.push(doc);
      return copy(doc);
    },
    findOne: (filter: Filter) =>
      chain(() => {
        const doc = state.docs.find(candidate => matches(candidate, filter));
        return doc ? copy(doc) : null;
      }),
    findOneAndUpdate: (filter: Filter, update: Filter) =>
      chain(() => {
        const doc = state.docs.find(candidate => matches(candidate, filter));
        if (!doc) return null;
        applySet(doc, update);
        return copy(doc);
      }),
    updateOne: (filter: Filter, update: Filter) =>
      chain(() => {
        const doc = state.docs.find(candidate => matches(candidate, filter));
        if (!doc) return { matchedCount: 0 };
        applySet(doc, update);
        return { matchedCount: 1 };
      }),
  };

  return {
    model,
    state,
    reset: () => {
      state.docs = [];
    },
  };
}

export interface FakeHttpResult {
  statusCode?: number;
  body?: Record<string, unknown>;
  nextError?: unknown;
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export async function invokeHandler(handler: Handler, req: Record<string, unknown>): Promise<FakeHttpResult> {
  const result: FakeHttpResult = {};
  const res: Partial<Response> = {};
  res.status = ((code: number) => {
    result.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = ((body: Record<string, unknown>) => {
    result.body = body;
    return res as Response;
  }) as Response['json'];

  await handler(req as unknown as Request, res as Response, ((error: unknown) => {
    result.nextError = error;
  }) as NextFunction);

  return result;
}

// '/9j/' decodifica para FF D8 FF (assinatura JPEG).
export const TEST_JPEG_BASE64 = `/9j/${'A'.repeat(200)}`;

export interface ReadAndGenerateResult {
  read: FakeHttpResult;
  /** Ausente quando a leitura não devolveu readId (erro, sem comida, sem usável). */
  generate?: FakeHttpResult;
  /** A resposta final do fluxo: a da geração, ou a da leitura quando não houve geração. */
  final: FakeHttpResult;
}

/**
 * O fluxo de hoje: lê a foto e gera com TODOS os ingredientes lidos marcados,
 * sem adicionados, sem líquido e sem pedido (o equivalente ao antigo /analyze).
 */
export async function readAndGenerate(params: {
  readPantry: Handler;
  generatePantry: Handler;
  userId: string;
  generateBody?: (read: { readId: string; ingredients: Array<{ name: string }> }) => Record<string, unknown>;
}): Promise<ReadAndGenerateResult> {
  const read = await invokeHandler(params.readPantry, {
    body: { imageBase64: TEST_JPEG_BASE64, mimeType: 'image/jpeg' },
    user: { sub: params.userId },
  });
  const data = read.body?.data as { readId?: string; ingredients?: Array<{ name: string }> } | undefined;

  if (read.statusCode !== 200 || !data?.readId) {
    return { read, final: read };
  }

  const readInfo = { readId: data.readId, ingredients: data.ingredients ?? [] };
  const body = params.generateBody
    ? params.generateBody(readInfo)
    : { readId: readInfo.readId, selected: readInfo.ingredients.map(ingredient => ingredient.name), added: [] };
  const generate = await invokeHandler(params.generatePantry, { body, user: { sub: params.userId } });

  return { read, generate, final: generate };
}
