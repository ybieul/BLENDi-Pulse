import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
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
  // resiliência (Tarefa 9). Roda uma única vez no mount, independente do
  // estado de conectividade atual (triggerReconnectSync já lida com estar
  // offline no momento da chamada) e independente de wasOffline — é uma
  // checagem de "existe dado pendente?", não de "houve transição de rede?".
  useEffect(() => {
    const hasPendingShoppingListSync = getDirtyLists().length > 0;
    const hasPendingBlendSync = getPendingBlends().length > 0;

    if (hasPendingShoppingListSync || hasPendingBlendSync) {
      void triggerReconnectSync(queryClient).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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