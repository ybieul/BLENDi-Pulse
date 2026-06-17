import { create } from 'zustand';

export interface LevelUpData {
  newLevel: number;
  newLevelNameKey: string;
}

interface GamificationState {
  totalXP: number;
  levelUpData: LevelUpData | null;
}

interface GamificationActions {
  setTotalXP: (totalXP: number) => void;
  incrementXP: (amount: number) => void;
  triggerLevelUp: (data: LevelUpData) => void;
  dismissLevelUp: () => void;
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
}));
