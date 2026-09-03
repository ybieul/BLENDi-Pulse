import type { CreateBlendLogInput } from '@blendi/shared';
import type { ShoppingListDetail } from '@blendi/shared';
import type { QueryClient } from '@tanstack/react-query';

import i18n from '../locales/i18n';
import { QUERY_KEYS } from '../config/cache.config';
import { createBlendLog } from '../services/blendLog.service';
import { updateItems } from '../services/shoppingList.service';
import { useNetworkStore } from '../store/network.store';
import {
  addPendingBlend,
  getPendingBlends,
  removePendingBlend,
  type PendingBlendLog,
} from './pendingBlends.utils';
import { getDirtyLists, markListClean, markListDirty } from './shoppingListSync.utils';
import { showPersistentToast } from './toast.events';

const SHOPPING_LIST_SYNC_MAX_ATTEMPTS = 3;

// Contagem de tentativas de sync por lista — só de sessão (não persistida).
// A flag "dirty" em si já é persistida no MMKV via shoppingListSync.utils;
// este Map só limita quantos reconnects seguidos tentam a mesma lista antes
// de avisar o usuário.
const shoppingListSyncAttempts = new Map<string, number>();

function toCreateBlendLogInput(pendingBlend: PendingBlendLog): CreateBlendLogInput {
  return {
    recipeName: pendingBlend.recipeName,
    protein: pendingBlend.protein,
    carbs: pendingBlend.carbs,
    fat: pendingBlend.fat,
    calories: pendingBlend.calories,
    blendiModel: pendingBlend.blendiModel,
    durationSeconds: pendingBlend.durationSeconds,
    ...(pendingBlend.rating !== undefined ? { rating: pendingBlend.rating } : {}),
  };
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

function buildRetryAction(
  pendingBlend: PendingBlendLog
): Parameters<typeof showPersistentToast>[1] {
  return {
    label: String(i18n.t('common.actions.retry')),
    onPress: () => {
      requeueForManualRetry(pendingBlend);
    },
  };
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
        showPersistentToast(getSyncFailureMessage(pendingBlend), buildRetryAction(pendingBlend));
        continue;
      }

      const retryablePendingBlend: PendingBlendLog = {
        ...pendingBlend,
        attemptCount: nextAttemptCount,
      };

      addPendingBlend(retryablePendingBlend);
    }
  }
}

async function invalidateCriticalQueries(queryClient: QueryClient): Promise<void> {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.blendLogsToday }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.blendHistory }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplementStack }),
  ]);
}

function getShoppingListSyncFailureMessage(shoppingList: ShoppingListDetail): string {
  const listName = shoppingList.name.trim();
  const baseMessage = String(i18n.t('shoppingList.syncFailedPersistent'));

  if (listName) {
    return `${listName} · ${baseMessage}`;
  }

  return baseMessage;
}

function buildShoppingListRetryAction(listId: string): Parameters<typeof showPersistentToast>[1] {
  return {
    label: String(i18n.t('common.actions.retry')),
    onPress: () => {
      shoppingListSyncAttempts.delete(listId);
      markListDirty(listId);
    },
  };
}

async function syncDirtyShoppingLists(queryClient: QueryClient): Promise<void> {
  const dirtyListIds = getDirtyLists();

  for (const listId of dirtyListIds) {
    const shoppingList = queryClient.getQueryData<ShoppingListDetail>([
      ...QUERY_KEYS.shoppingListDetail,
      listId,
    ]);

    if (!shoppingList) {
      continue;
    }

    try {
      const updatedShoppingList = await updateItems(listId, shoppingList.items);

      queryClient.setQueryData(
        [...QUERY_KEYS.shoppingListDetail, listId],
        updatedShoppingList,
      );

      shoppingListSyncAttempts.delete(listId);
      markListClean(listId);
    } catch {
      const nextAttemptCount = (shoppingListSyncAttempts.get(listId) ?? 0) + 1;

      if (nextAttemptCount >= SHOPPING_LIST_SYNC_MAX_ATTEMPTS) {
        shoppingListSyncAttempts.delete(listId);
        // Para de tentar sozinho — o dado fica divergente do servidor até o
        // usuário intervir manualmente pelo toast (mesmo padrão do blend log).
        markListClean(listId);
        showPersistentToast(
          getShoppingListSyncFailureMessage(shoppingList),
          buildShoppingListRetryAction(listId),
        );
        continue;
      }

      shoppingListSyncAttempts.set(listId, nextAttemptCount);
      // Mantém a flag dirty para nova tentativa no próximo reconnect.
    }
  }
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

  try {
    await syncDirtyShoppingLists(queryClient);
  } catch {
    // A sincronização de listas também é best-effort e não deve quebrar o fluxo.
  }
}