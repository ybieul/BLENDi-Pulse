import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { PulseAiRecipe } from '@blendi/shared';

import { createAppStorage } from '../config/storage';

// Namespace DEDICADO (não o 'blendi-pulse' compartilhado pelo resto do app):
// o middleware `persist` do Zustand lê este storage de forma SÍNCRONA no
// momento em que o store é criado — em import-time, antes que
// `initMMKVEncryptionKey()` (assíncrono, aguardado em App.tsx) tenha
// qualquer chance de resolver. Mesmo raciocínio de locales/i18n.ts: isolar
// aqui confina esse gap a um dado de baixa sensibilidade (duração do timer,
// última receita) sem abrir sem criptografia o namespace compartilhado —
// onde ficam token de fallback, cache de foto, dados de saúde — que
// continua protegido desde a primeira abertura por só ser tocado dentro de
// efeitos/ações do React, já depois do boot aguardar a chave.
const BLEND_STORAGE_NAMESPACE = 'blendi-pulse-blend';
const BLEND_TIMER_DURATION_KEY = 'blend_timer_duration';
const DEFAULT_TIMER_DURATION_SECONDS = 30;
const MIN_TIMER_DURATION_SECONDS = 15;
const MAX_TIMER_DURATION_SECONDS = 90;

const blendStorage = createAppStorage(BLEND_STORAGE_NAMESPACE);

const blendTimerStorage: StateStorage = {
  getItem: (key) => blendStorage.getString(key) ?? null,
  setItem: (key, value) => {
    blendStorage.set(key, value);
  },
  removeItem: (key) => {
    blendStorage.delete(key);
  },
};

interface BlendState {
  activeRecipe: PulseAiRecipe | null;
  activeFavoriteId: string | null;
  timerDuration: number;
  timerStartedAt: Date | null;
  isTimerRunning: boolean;
  lastBlend: PulseAiRecipe | null;
}

interface BlendActions {
  setActiveRecipe: (recipe: PulseAiRecipe | null) => void;
  setActiveFavoriteId: (favoriteId: string | null) => void;
  setTimerDuration: (durationSeconds: number) => void;
  startTimer: () => void;
  stopTimer: () => void;
  completeBlend: () => void;
  resetToFree: () => void;
}

const initialState: BlendState = {
  activeRecipe: null,
  activeFavoriteId: null,
  timerDuration: DEFAULT_TIMER_DURATION_SECONDS,
  timerStartedAt: null,
  isTimerRunning: false,
  lastBlend: null,
};

function isValidTimerDuration(durationSeconds: number): boolean {
  return (
    Number.isInteger(durationSeconds)
    && durationSeconds >= MIN_TIMER_DURATION_SECONDS
    && durationSeconds <= MAX_TIMER_DURATION_SECONDS
  );
}

export const useBlendStore = create<BlendState & BlendActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveRecipe: (activeRecipe) => {
        set({ activeRecipe });
      },

      setActiveFavoriteId: (activeFavoriteId) => {
        set({ activeFavoriteId });
      },

      setTimerDuration: (timerDuration) => {
        if (!isValidTimerDuration(timerDuration)) {
          return;
        }

        set({ timerDuration });
      },

      startTimer: () => {
        set({
          isTimerRunning: true,
          timerStartedAt: new Date(),
        });
      },

      stopTimer: () => {
        set({
          isTimerRunning: false,
          timerStartedAt: null,
        });
      },

      completeBlend: () => {
        const { activeRecipe, lastBlend } = get();

        set({
          isTimerRunning: false,
          timerStartedAt: null,
          lastBlend: activeRecipe ?? lastBlend,
          activeRecipe: null,
          activeFavoriteId: null,
        });
      },

      resetToFree: () => {
        set({ activeRecipe: null, activeFavoriteId: null });
      },
    }),
    {
      name: BLEND_TIMER_DURATION_KEY,
      storage: createJSONStorage(() => blendTimerStorage),
      partialize: (state) => ({
        timerDuration: state.timerDuration,
      }),
    }
  )
);