// CP-C2 — Progresso com cópia local e envio em fila (funciona offline).
//
// Toda mudança vale na hora no aparelho (otimista) e entra numa fila; a fila
// é enviada em ordem quando há rede. Resposta do servidor + o que ainda está
// na fila = estado local. Falha de rede nunca trava o tour.
import type { TutorialProgress, UpdateTutorialProgressInput } from '@blendi/shared';

import type { TutorialLocalState, TutorialMode, TutorialSyncOperation } from './tutorial.types';
import { TUTORIAL_MAX_PENDING_OPERATIONS, emptyTutorialLocalState, type TutorialStorage } from './tutorialStorage';

export interface TutorialProgressRemote {
  fetchProgress: () => Promise<TutorialProgress>;
  patchProgress: (input: UpdateTutorialProgressInput) => Promise<TutorialProgress>;
  resetProgress: () => Promise<TutorialProgress>;
}

/** Aplica uma operação sobre um progresso (mesma regra do servidor, sem filtro de ids). */
export function applyTutorialOperation(
  progress: TutorialProgress,
  operation: TutorialSyncOperation,
  nowIso: string
): TutorialProgress {
  if (operation.type === 'reset') {
    return { seenStepIds: [], lastStepId: null, completedAt: null, skippedAt: null, contentVersion: null };
  }

  const seen = [...progress.seenStepIds];
  for (const id of operation.seenStepIds) {
    if (!seen.includes(id)) seen.push(id);
  }

  return {
    seenStepIds: seen,
    lastStepId: operation.lastStepId === undefined ? progress.lastStepId : operation.lastStepId,
    completedAt: operation.status === 'completed' ? nowIso : progress.completedAt,
    skippedAt: operation.status === 'skipped' ? nowIso : progress.skippedAt,
    contentVersion:
      operation.contentVersion === undefined
        ? progress.contentVersion
        : Math.max(progress.contentVersion ?? 0, operation.contentVersion),
  };
}

/** Junta dois patches seguidos num só (a fila não cresce a cada etapa). */
function mergePatches(
  first: Extract<TutorialSyncOperation, { type: 'patch' }>,
  second: Extract<TutorialSyncOperation, { type: 'patch' }>
): Extract<TutorialSyncOperation, { type: 'patch' }> {
  const seenStepIds = [...first.seenStepIds];
  for (const id of second.seenStepIds) {
    if (!seenStepIds.includes(id)) seenStepIds.push(id);
  }
  const contentVersion =
    first.contentVersion === undefined
      ? second.contentVersion
      : second.contentVersion === undefined
        ? first.contentVersion
        : Math.max(first.contentVersion, second.contentVersion);

  return {
    type: 'patch',
    seenStepIds,
    ...(second.lastStepId !== undefined
      ? { lastStepId: second.lastStepId }
      : first.lastStepId !== undefined && { lastStepId: first.lastStepId }),
    ...((second.status ?? first.status) !== undefined && { status: second.status ?? first.status }),
    ...(contentVersion !== undefined && { contentVersion }),
  };
}

export function enqueueTutorialOperation(
  pending: TutorialSyncOperation[],
  operation: TutorialSyncOperation
): TutorialSyncOperation[] {
  if (operation.type === 'reset') {
    // Reset apaga tudo o que veio antes: o que estava na fila não importa mais.
    return [operation];
  }

  const last = pending[pending.length - 1];
  if (last?.type === 'patch') {
    return [...pending.slice(0, -1), mergePatches(last, operation)];
  }

  const next = [...pending, operation];
  return next.length > TUTORIAL_MAX_PENDING_OPERATIONS ? next.slice(-TUTORIAL_MAX_PENDING_OPERATIONS) : next;
}

function toPatchInput(operation: Extract<TutorialSyncOperation, { type: 'patch' }>): UpdateTutorialProgressInput {
  return {
    ...(operation.seenStepIds.length > 0 && { seenStepIds: operation.seenStepIds.slice(0, 100) }),
    ...(operation.lastStepId !== undefined && { lastStepId: operation.lastStepId }),
    ...(operation.status !== undefined && { status: operation.status }),
    ...(operation.contentVersion !== undefined && { contentVersion: operation.contentVersion }),
  };
}

export class TutorialProgressSync {
  private state: TutorialLocalState;
  private flushing: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly userId: string,
    private readonly storage: TutorialStorage,
    private readonly remote: TutorialProgressRemote,
    private readonly now: () => Date = () => new Date()
  ) {
    this.state = storage.loadState(userId);
  }

  get progress(): TutorialProgress {
    return this.state.progress;
  }

  get activeMode(): TutorialMode | null {
    return this.state.activeMode;
  }

  get hasPending(): boolean {
    return this.state.pending.length > 0;
  }

  dispose(): void {
    this.disposed = true;
  }

  setActiveMode(mode: TutorialMode | null): void {
    this.state = { ...this.state, activeMode: mode };
    this.persist();
  }

  /** Busca o servidor; com fila pendente, o que está na fila vale por cima. */
  async hydrateFromServer(): Promise<void> {
    try {
      const server = await this.remote.fetchProgress();
      if (this.disposed) return;
      this.state = { ...this.state, progress: this.replayPending(server) };
      this.persist();
    } catch {
      // Offline: fica a cópia local.
    }
    void this.flush();
  }

  apply(operation: TutorialSyncOperation): void {
    const nowIso = this.now().toISOString();
    this.state = {
      ...this.state,
      progress: applyTutorialOperation(this.state.progress, operation, nowIso),
      pending: enqueueTutorialOperation(this.state.pending, operation),
    };
    this.persist();
    void this.flush();
  }

  /** Envia a fila em ordem. Para no primeiro erro (tenta de novo depois). */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;

    this.flushing = (async () => {
      while (!this.disposed && this.state.pending.length > 0) {
        const operation = this.state.pending[0];
        let server: TutorialProgress;
        try {
          server =
            operation.type === 'reset'
              ? await this.remote.resetProgress()
              : await this.remote.patchProgress(toPatchInput(operation));
        } catch {
          return;
        }
        if (this.disposed) return;
        // Só tira da fila a operação enviada (outra pode ter entrado no meio).
        const remaining = this.state.pending[0] === operation ? this.state.pending.slice(1) : this.state.pending;
        this.state = { ...this.state, pending: remaining };
        this.state = { ...this.state, progress: this.replayPending(server) };
        this.persist();
      }
    })().finally(() => {
      this.flushing = null;
    });

    return this.flushing;
  }

  private replayPending(server: TutorialProgress): TutorialProgress {
    const nowIso = this.now().toISOString();
    return this.state.pending.reduce(
      (progress, operation) => applyTutorialOperation(progress, operation, nowIso),
      server
    );
  }

  private persist(): void {
    if (this.disposed) return;
    this.storage.saveState(this.userId, this.state);
  }
}

export { emptyTutorialLocalState };
