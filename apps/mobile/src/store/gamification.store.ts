import { create } from 'zustand';

export interface LevelUpData {
  newLevel: number;
  newLevelNameKey: string;
}

interface GamificationState {
  totalXP: number;
  levelUpData: LevelUpData | null;
  pendingLevelUp: LevelUpData | null;
  missionToastXP: number | null;
}

interface GamificationActions {
  setTotalXP: (totalXP: number) => void;
  incrementXP: (amount: number) => void;
  triggerLevelUp: (data: LevelUpData) => void;
  dismissLevelUp: () => void;
  setPendingLevelUp: (data: LevelUpData) => void;
  clearPendingLevelUp: () => void;
  triggerMissionToast: (xpAmount: number) => void;
  dismissMissionToast: () => void;
}

function normalizeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export const useGamificationStore = create<GamificationState & GamificationActions>((set) => ({
  totalXP: 0,
  levelUpData: null,
  pendingLevelUp: null,
  missionToastXP: null,

  setTotalXP: (totalXP) => {
    set({ totalXP: normalizeInteger(totalXP) });
  },

  incrementXP: (amount) => {
    const normalizedAmount = normalizeInteger(amount);

    if (normalizedAmount <= 0) {
      return;
    }

    set((state) => ({
      totalXP: state.totalXP + normalizedAmount,
    }));
  },

  triggerLevelUp: (data) => {
    set({
      levelUpData: {
        newLevel: normalizeInteger(data.newLevel),
        newLevelNameKey: data.newLevelNameKey,
      },
    });
  },

  dismissLevelUp: () => {
    set({ levelUpData: null });
  },

  setPendingLevelUp: (data) => {
    set({
      pendingLevelUp: {
        newLevel: normalizeInteger(data.newLevel),
        newLevelNameKey: data.newLevelNameKey,
      },
    });
  },

  clearPendingLevelUp: () => {
    set({ pendingLevelUp: null });
  },

  triggerMissionToast: (xpAmount) => {
    set({ missionToastXP: normalizeInteger(xpAmount) });
  },

  dismissMissionToast: () => {
    set({ missionToastXP: null });
  },
}));
