import type { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import { create } from 'zustand';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  connectionType: NetInfoStateType | null;
  wasOffline: boolean;
}

interface NetworkActions {
  setConnectionState: (state: NetInfoState) => void;
  markSyncCompleted: () => void;
}

function resolveIsConnected(state: NetInfoState): boolean {
  if (typeof state.isConnected === 'boolean') {
    return state.isConnected;
  }

  return true;
}

function resolveIsInternetReachable(state: NetInfoState, isConnected: boolean): boolean {
  if (typeof state.isInternetReachable === 'boolean') {
    return state.isInternetReachable;
  }

  return isConnected;
}

export const useNetworkStore = create<NetworkState & NetworkActions>((set) => ({
  isConnected: true,
  isInternetReachable: true,
  connectionType: null,
  wasOffline: false,

  setConnectionState: (state) => {
    const isConnected = resolveIsConnected(state);
    const isInternetReachable = resolveIsInternetReachable(state, isConnected);
    const connectionType = state.type ?? null;
    const isOffline = !isConnected || !isInternetReachable;

    set((currentState) => ({
      isConnected,
      isInternetReachable,
      connectionType,
      wasOffline: currentState.wasOffline || isOffline,
    }));
  },

  markSyncCompleted: () => {
    set({ wasOffline: false });
  },
}));