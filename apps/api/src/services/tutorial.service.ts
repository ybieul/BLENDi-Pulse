// CP-C2 — Roteiro e progresso do tutorial guiado.
//
// O roteiro vem de @blendi/shared (TUTORIAL_CONTENT, a mesma cópia que o app
// leva embutida) e é validado uma vez, na primeira requisição. Roteiro
// inválido não derruba a API: GET /tutorial responde 503 e o app usa a cópia
// embutida (o teste tutorialContent.test.ts impede isso de chegar ao deploy).
import { createHash } from 'node:crypto';
import {
  EMPTY_TUTORIAL_PROGRESS,
  TUTORIAL_CONTENT,
  tutorialContentSchema,
  type TutorialContent,
  type TutorialProgress,
  type UpdateTutorialProgressInput,
} from '@blendi/shared';

export interface LoadedTutorialContent {
  content: TutorialContent;
  etag: string;
  knownStepIds: ReadonlySet<string>;
}

let cached: LoadedTutorialContent | null | undefined;

/** Valida o roteiro e calcula o ETag. `raw` só é passado nos testes. */
export function loadTutorialContent(raw: unknown = TUTORIAL_CONTENT): LoadedTutorialContent | null {
  const parsed = tutorialContentSchema.safeParse(raw);
  if (!parsed.success) {
    // Só o caminho dos campos com problema, nunca o conteúdo.
    console.error('[tutorial] roteiro inválido', parsed.error.issues.map(issue => issue.path.join('.')));
    return null;
  }

  const content = parsed.data;
  // ETag pelo conteúdo, não só pela contentVersion: um texto corrigido sem
  // subir a versão também invalida o cache do app.
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('base64url').slice(0, 16);

  return {
    content,
    etag: `"tutorial-${content.schemaVersion}-${content.contentVersion}-${hash}"`,
    knownStepIds: new Set(content.steps.map(step => step.id)),
  };
}

export function getTutorialContent(): LoadedTutorialContent | null {
  if (cached === undefined) {
    cached = loadTutorialContent();
  }
  return cached;
}

/** If-None-Match pode vir com vários ETags separados por vírgula, ou "*". */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map(value => value.trim().replace(/^W\//, ''))
    .some(value => value === '*' || value === etag);
}

export interface TutorialProgressRecord {
  seenStepIds?: string[] | null;
  lastStepId?: string | null;
  completedAt?: Date | null;
  skippedAt?: Date | null;
  contentVersion?: number | null;
}

export function serializeTutorialProgress(record: TutorialProgressRecord | null | undefined): TutorialProgress {
  if (!record) {
    return { ...EMPTY_TUTORIAL_PROGRESS, seenStepIds: [] };
  }

  return {
    seenStepIds: [...(record.seenStepIds ?? [])],
    lastStepId: record.lastStepId ?? null,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    skippedAt: record.skippedAt ? record.skippedAt.toISOString() : null,
    contentVersion: record.contentVersion ?? null,
  };
}

export interface TutorialProgressMongoUpdate {
  $setOnInsert?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $addToSet?: { seenStepIds: { $each: string[] } };
  $max?: { contentVersion: number };
}

/**
 * Monta o update do PATCH a partir do corpo JÁ validado pelo schema.
 *   - ids fora do roteiro atual são descartados (não grava lixo);
 *   - ids só se juntam ($addToSet), nunca são apagados por PATCH;
 *   - contentVersion só sobe ($max) e nunca passa da versão do servidor;
 *   - lastStepId desconhecido é ignorado; null limpa.
 */
export function buildTutorialProgressUpdate(
  input: UpdateTutorialProgressInput,
  loaded: LoadedTutorialContent,
  now: Date
): TutorialProgressMongoUpdate {
  const update: TutorialProgressMongoUpdate = {};
  const set: Record<string, unknown> = {};

  const seen = [...new Set(input.seenStepIds ?? [])].filter(id => loaded.knownStepIds.has(id));
  if (seen.length > 0) {
    update.$addToSet = { seenStepIds: { $each: seen } };
  } else {
    // Documento novo sem nenhum id válido ainda: começa com lista vazia.
    update.$setOnInsert = { seenStepIds: [] };
  }

  if (input.lastStepId === null) {
    set.lastStepId = null;
  } else if (input.lastStepId !== undefined && loaded.knownStepIds.has(input.lastStepId)) {
    set.lastStepId = input.lastStepId;
  }

  if (input.status === 'completed') {
    set.completedAt = now;
  } else if (input.status === 'skipped') {
    set.skippedAt = now;
  }

  if (input.contentVersion !== undefined) {
    update.$max = { contentVersion: Math.min(input.contentVersion, loaded.content.contentVersion) };
  }

  if (Object.keys(set).length > 0) {
    update.$set = set;
  }

  return update;
}
