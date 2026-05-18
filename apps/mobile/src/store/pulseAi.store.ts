import { create } from 'zustand';

interface PulseAIState {
  pendingProtocol: string | null;
  setPendingProtocol: (protocol: string | null) => void;
  clearPendingProtocol: () => void;
}

export const usePulseAIStore = create<PulseAIState>((set) => ({
  pendingProtocol: null,
  setPendingProtocol: (protocol) => set({ pendingProtocol: protocol }),
  clearPendingProtocol: () => set({ pendingProtocol: null }),
}));