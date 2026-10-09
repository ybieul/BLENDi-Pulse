import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { createAppStorage } from '../config/storage';

// Namespace DEDICADO — mesmo raciocínio de blend.store.ts: o middleware
// `persist` do Zustand lê este storage de forma SÍNCRONA em import-time,
// antes de initMMKVEncryptionKey() (assíncrono, aguardado em App.tsx) ter
// qualquer chance de resolver. Isolar aqui confina esse gap a uma
// preferência de sensibilidade nula (tema claro/escuro), sem tocar o
// namespace compartilhado fora de hora.
const THEME_STORAGE_NAMESPACE = 'blendi-pulse-theme';
const THEME_PREFERENCE_KEY = 'theme_preference';

const themeStorageBackend = createAppStorage(THEME_STORAGE_NAMESPACE);

const themeStorage: StateStorage = {
  getItem: (key) => themeStorageBackend.getString(key) ?? null,
  setItem: (key, value) => {
    themeStorageBackend.set(key, value);
  },
  removeItem: (key) => {
    themeStorageBackend.delete(key);
  },
};

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
}

interface ThemeActions {
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState & ThemeActions>()(
  persist(
    (set) => ({
      mode: 'light', // tema atual do app — zero disrupção pra quem nunca abriu o toggle

      setMode: (mode) => {
        set({ mode });
      },
    }),
    {
      name: THEME_PREFERENCE_KEY,
      storage: createJSONStorage(() => themeStorage),
      // skipHydration: a hidratação automática do persist rodaria em
      // import-time, antes do MMKV real estar disponível. App.tsx dispara a
      // hidratação manualmente via useThemeStore.persist.rehydrate() dentro
      // de AppShell, já depois do gate isStorageReady — mesmo padrão de
      // blend.store.ts.
      skipHydration: true,
    }
  )
);
