import { MMKV } from 'react-native-mmkv';

export interface AppStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | number | boolean) => void;
  delete: (key: string) => void;
}

const memoryNamespaces = new Map<string, Map<string, string>>();
const warnedNamespaces = new Set<string>();

function createMemoryStorage(namespace: string): AppStorage {
  const backingStore = memoryNamespaces.get(namespace) ?? new Map<string, string>();
  memoryNamespaces.set(namespace, backingStore);

  return {
    getString: (key) => backingStore.get(key),
    set: (key, value) => {
      backingStore.set(key, String(value));
    },
    delete: (key) => {
      backingStore.delete(key);
    },
  };
}

export function createAppStorage(namespace: string): AppStorage {
  try {
    return new MMKV({ id: namespace });
  } catch (error) {
    if (!warnedNamespaces.has(namespace)) {
      warnedNamespaces.add(namespace);
      console.warn(
        `[storage] MMKV indisponivel para '${namespace}'. Usando fallback em memoria.`,
        error
      );
    }

    return createMemoryStorage(namespace);
  }
}