// CP-C2 — Cópia local do tutorial (MMKV, namespace próprio).
//   - progresso + fila de envio, POR USUÁRIO (troca de conta no mesmo
//     aparelho não mistura progresso);
//   - último roteiro válido do servidor + ETag (abre offline com o roteiro
//     mais novo que já foi baixado, antes de cair na cópia embutida).
// Só ids de etapa, datas e textos do roteiro: nenhum dado pessoal.
import { EMPTY_TUTORIAL_PROGRESS, tutorialProgressSchema } from '@blendi/shared';

import { createAppStorage, type AppStorage } from '../../config/storage';
import type { TutorialLocalState, TutorialMode, TutorialSyncOperation } from './tutorial.types';

export const TUTORIAL_STORAGE_NAMESPACE = 'blendi-pulse-tutorial';
const CONTENT_KEY = 'content';
const CONTENT_ETAG_KEY = 'contentEtag';
const LOCAL_STATE_PREFIX = 'state:';
/** Teto da fila offline: além disso, as operações mais antigas são descartadas. */
export const TUTORIAL_MAX_PENDING_OPERATIONS = 20;

const MODES: ReadonlySet<string> = new Set<TutorialMode>(['full', 'whatsNew', 'review']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSyncOperation(value: unknown): value is TutorialSyncOperation {
  if (!isRecord(value)) return false;
  if (value.type === 'reset') return true;
  if (value.type !== 'patch') return false;
  const { seenStepIds, lastStepId, status, contentVersion } = value;
  return (
    Array.isArray(seenStepIds) &&
    seenStepIds.length <= 1000 &&
    seenStepIds.every((id) => typeof id === 'string') &&
    (lastStepId === undefined || lastStepId === null || typeof lastStepId === 'string') &&
    (status === undefined || status === 'completed' || status === 'skipped') &&
    (contentVersion === undefined || (typeof contentVersion === 'number' && Number.isInteger(contentVersion)))
  );
}

/** Lê o estado salvo; qualquer coisa fora do formato volta ao estado vazio. */
export function parseTutorialLocalState(raw: unknown): TutorialLocalState | null {
  if (!isRecord(raw)) return null;
  const progress = tutorialProgressSchema.safeParse(raw.progress);
  if (!progress.success) return null;
  if (!Array.isArray(raw.pending) || raw.pending.length > TUTORIAL_MAX_PENDING_OPERATIONS) return null;
  if (!raw.pending.every(isSyncOperation)) return null;
  const activeMode = raw.activeMode;
  if (activeMode !== null && !(typeof activeMode === 'string' && MODES.has(activeMode))) return null;
  return {
    progress: progress.data,
    pending: raw.pending,
    activeMode: activeMode as TutorialMode | null,
  };
}

/**
 * Contas excluídas nesta sessão do app: nenhuma gravação atrasada do motor
 * (fila terminando depois da exclusão) recria o estado delas.
 */
const erasedUserIds = new Set<string>();

/**
 * CP-C2a — Apaga o estado local do tutorial (progresso e fila pendente) de
 * um usuário. Chamado depois do DELETE /users/me com sucesso. O roteiro em
 * cache não é da conta e fica.
 */
export function clearTutorialLocalState(
  userId: string,
  backend: AppStorage = createAppStorage(TUTORIAL_STORAGE_NAMESPACE)
): void {
  erasedUserIds.add(userId);
  try {
    backend.delete(`${LOCAL_STATE_PREFIX}${userId}`);
  } catch {
    // Melhor esforço: não bloqueia a exclusão já confirmada pelo servidor.
  }
}

export interface TutorialStorage {
  loadState: (userId: string) => TutorialLocalState;
  saveState: (userId: string, state: TutorialLocalState) => void;
  loadCachedContent: () => { raw: unknown; etag: string | null } | null;
  saveCachedContent: (raw: unknown, etag: string | null) => void;
}

export function emptyTutorialLocalState(): TutorialLocalState {
  return { progress: { ...EMPTY_TUTORIAL_PROGRESS, seenStepIds: [] }, pending: [], activeMode: null };
}

function safeJsonParse(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function createTutorialStorage(backend: AppStorage = createAppStorage(TUTORIAL_STORAGE_NAMESPACE)): TutorialStorage {
  return {
    loadState: (userId) => {
      try {
        return (
          parseTutorialLocalState(safeJsonParse(backend.getString(`${LOCAL_STATE_PREFIX}${userId}`))) ??
          emptyTutorialLocalState()
        );
      } catch {
        return emptyTutorialLocalState();
      }
    },
    saveState: (userId, state) => {
      if (erasedUserIds.has(userId)) return;
      try {
        backend.set(`${LOCAL_STATE_PREFIX}${userId}`, JSON.stringify(state));
      } catch {
        // Melhor esforço: sem disco, o tutorial segue só em memória.
      }
    },
    loadCachedContent: () => {
      try {
        const raw = safeJsonParse(backend.getString(CONTENT_KEY));
        if (raw === undefined) return null;
        return { raw, etag: backend.getString(CONTENT_ETAG_KEY) ?? null };
      } catch {
        return null;
      }
    },
    saveCachedContent: (raw, etag) => {
      try {
        backend.set(CONTENT_KEY, JSON.stringify(raw));
        if (etag) {
          backend.set(CONTENT_ETAG_KEY, etag);
        } else {
          backend.delete(CONTENT_ETAG_KEY);
        }
      } catch {
        // Melhor esforço.
      }
    },
  };
}
