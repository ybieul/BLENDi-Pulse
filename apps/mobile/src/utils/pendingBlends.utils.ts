import type { CreateBlendLogInput } from '@blendi/shared';

import { createAppStorage } from '../config/storage';

const PENDING_BLEND_STORAGE_ID = 'blendi-pulse';
const PENDING_BLEND_STORAGE_KEY = 'pending_blend_logs';

const pendingBlendStorage = createAppStorage(PENDING_BLEND_STORAGE_ID);

export interface PendingBlendLog extends CreateBlendLogInput {
  localId: string;
  queuedAt: string;
  attemptCount: number;
}

function isPendingBlendLog(value: unknown): value is PendingBlendLog {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PendingBlendLog>;

  return (
    typeof candidate.localId === 'string' &&
    typeof candidate.queuedAt === 'string' &&
    typeof candidate.attemptCount === 'number'
  );
}

function persistPendingBlends(blends: PendingBlendLog[]): void {
  if (blends.length === 0) {
    pendingBlendStorage.delete(PENDING_BLEND_STORAGE_KEY);
    return;
  }

  pendingBlendStorage.set(PENDING_BLEND_STORAGE_KEY, JSON.stringify(blends));
}

function createPendingBlendLog(input: CreateBlendLogInput | PendingBlendLog): PendingBlendLog {
  if (isPendingBlendLog(input)) {
    return {
      ...input,
    };
  }

  return {
    ...input,
    localId: Date.now().toString(),
    queuedAt: new Date().toISOString(),
    attemptCount: 0,
  };
}

export function getPendingBlends(): PendingBlendLog[] {
  const serializedPendingBlends = pendingBlendStorage.getString(PENDING_BLEND_STORAGE_KEY);

  if (!serializedPendingBlends) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(serializedPendingBlends);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isPendingBlendLog);
  } catch {
    return [];
  }
}

export function addPendingBlend(input: CreateBlendLogInput): PendingBlendLog;
export function addPendingBlend(input: PendingBlendLog): PendingBlendLog;
export function addPendingBlend(
  input: CreateBlendLogInput | PendingBlendLog
): PendingBlendLog {
  const pendingBlend = createPendingBlendLog(input);
  const currentPendingBlends = getPendingBlends();

  persistPendingBlends([...currentPendingBlends, pendingBlend]);

  return pendingBlend;
}

export function removePendingBlend(localId: string): void {
  const nextPendingBlends = getPendingBlends().filter((item) => item.localId !== localId);

  persistPendingBlends(nextPendingBlends);
}

export function clearAllPendingBlends(): void {
  pendingBlendStorage.delete(PENDING_BLEND_STORAGE_KEY);
}