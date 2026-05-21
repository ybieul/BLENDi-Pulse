import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useNetworkStore } from '../store/network.store';
import { triggerReconnectSync } from '../utils/reconnectSync.utils';

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