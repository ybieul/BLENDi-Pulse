import type { CreateBlendLogInput } from '@blendi/shared';
import type { QueryClient } from '@tanstack/react-query';

import i18n from '../locales/i18n';
import { QUERY_KEYS } from '../config/cache.config';
import { createBlendLog } from '../services/blendLog.service';
import { useNetworkStore } from '../store/network.store';
import {
  addPendingBlend,
  getPendingBlends,
  removePendingBlend,
  type PendingBlendLog,
} from './pendingBlends.utils';
import { showPersistentToast } from './toast.utils';

function toCreateBlendLogInput(pendingBlend: PendingBlendLog): CreateBlendLogInput {
  const { localId, queuedAt, attemptCount, ...blendInput } = pendingBlend;
  return blendInput;
}

function getSyncFailureMessage(pendingBlend: PendingBlendLog): string {
  const recipeName = pendingBlend.recipeName?.trim();
  const baseMessage = String(i18n.t('blend.syncFailed'));

  if (recipeName) {
    return `${recipeName} · ${baseMessage}`;
  }

  return baseMessage;
}

function requeueForManualRetry(pendingBlend: PendingBlendLog): void {
  addPendingBlend(toCreateBlendLogInput(pendingBlend));
}

async function processPendingBlendQueue(): Promise<void> {
  const pendingBlends = getPendingBlends();

  for (const pendingBlend of pendingBlends) {
    try {
      await createBlendLog(toCreateBlendLogInput(pendingBlend));
      removePendingBlend(pendingBlend.localId);
    } catch {
      const nextAttemptCount = pendingBlend.attemptCount + 1;

      removePendingBlend(pendingBlend.localId);

      if (nextAttemptCount >= 3) {
        showPersistentToast(getSyncFailureMessage(pendingBlend), {
          label: String(i18n.t('common.actions.retry')),
          onPress: () => {
            requeueForManualRetry(pendingBlend);
          },
        });
        continue;
      }

      addPendingBlend({
        ...pendingBlend,
        attemptCount: nextAttemptCount,
      });
    }
  }
}

async function invalidateCriticalQueries(queryClient: QueryClient): Promise<void> {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.blendLogsToday }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplementStack }),
  ]);
}

export async function triggerReconnectSync(queryClient: QueryClient): Promise<void> {
  try {
    await processPendingBlendQueue();
  } catch {
    // O reconnect sync é best-effort: falhas da fila não devem interromper
    // os próximos passos de revalidação do estado do app.
  }

  try {
    await invalidateCriticalQueries(queryClient);
  } catch {
    // Invalidação de cache falha em silêncio; a próxima navegação ou ação do
    // usuário ainda pode disparar refetch normalmente.
  }

  try {
    useNetworkStore.getState().markSyncCompleted();
  } catch {
    // A limpeza da flag local não deve propagar erro para a camada de hook.
  }
}