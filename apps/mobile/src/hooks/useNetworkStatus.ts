import NetInfo from '@react-native-community/netinfo';
import { useIsRestoring, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useNetworkStore } from '../store/network.store';
import { getPendingBlends } from '../utils/pendingBlends.utils';
import { triggerReconnectSync } from '../utils/reconnectSync.utils';
import { getDirtyLists } from '../utils/shoppingListSync.utils';

type NetInfoClient = Pick<typeof NetInfo, 'addEventListener' | 'fetch'>;

interface UseNetworkStatusOptions {
  queryClient: QueryClient;
  netInfoClient?: NetInfoClient;
}

export interface UseNetworkStatusResult {
  isConnected: boolean;
  isInternetReachable: boolean;
}

export function useNetworkStatus(
  { queryClient, netInfoClient = NetInfo }: UseNetworkStatusOptions
): UseNetworkStatusResult {
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isInternetReachable = useNetworkStore((state) => state.isInternetReachable);
  const wasOffline = useNetworkStore((state) => state.wasOffline);
  const setConnectionState = useNetworkStore((state) => state.setConnectionState);
  const previousConnectionState = useRef({
    isConnected,
    isInternetReachable,
  });
  const hasCheckedPendingSyncRef = useRef(false);
  const isRestoringQueryCache = useIsRestoring();

  useEffect(() => {
    let isMounted = true;

    void netInfoClient
      .fetch()
      .then((state) => {
        if (isMounted) {
          setConnectionState(state);
        }
      })
      .catch(() => undefined);

    const unsubscribe = netInfoClient.addEventListener((state) => {
      setConnectionState(state);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [netInfoClient, setConnectionState]);

  // Sincronização de startup: cobre o caso de o app fechar abruptamente com
  // dado local não sincronizado (shoppingListDirty, blends offline) e ser
  // reaberto já com conectividade estável. wasOffline sempre começa `false`
  // num processo novo (network.store não persiste), então o efeito abaixo
  // (que depende de uma transição offline→online observada nesta sessão)
  // nunca dispara sozinho nesse cenário — achado de Alta do diagnóstico de
  // resiliência (Tarefa 9).
  //
  // Precisa esperar isRestoringQueryCache virar false antes de checar: o
  // PersistQueryClientProvider (App.tsx) renderiza os filhos ANTES de
  // terminar de restaurar o cache do React Query — se checássemos no mount
  // puro, getDirtyLists() encontraria a lista suja corretamente (MMKV puro,
  // síncrono), mas syncDirtyShoppingLists() leria queryClient.getQueryData()
  // vazio (cache ainda não restaurado) e pularia a lista silenciosamente,
  // mesmo com dado pendente de verdade. hasCheckedPendingSyncRef garante que
  // a checagem rode exatamente uma vez, assim que a restauração terminar —
  // não a cada re-render em que isRestoringQueryCache continuar false.
  useEffect(() => {
    if (isRestoringQueryCache || hasCheckedPendingSyncRef.current) {
      return;
    }

    hasCheckedPendingSyncRef.current = true;

    const hasPendingShoppingListSync = getDirtyLists().length > 0;
    const hasPendingBlendSync = getPendingBlends().length > 0;

    if (hasPendingShoppingListSync || hasPendingBlendSync) {
      void triggerReconnectSync(queryClient).catch(() => undefined);
    }
  }, [isRestoringQueryCache, queryClient]);

  useEffect(() => {
    const reconnectedAfterOffline =
      (!previousConnectionState.current.isConnected && isConnected) ||
      (!previousConnectionState.current.isInternetReachable && isInternetReachable);

    if (wasOffline && reconnectedAfterOffline) {
      void triggerReconnectSync(queryClient).catch(() => undefined);
    }

    previousConnectionState.current = {
      isConnected,
      isInternetReachable,
    };
  }, [isConnected, isInternetReachable, queryClient, wasOffline]);

  return {
    isConnected,
    isInternetReachable,
  };
}