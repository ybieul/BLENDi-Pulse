import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export interface AppStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | number | boolean) => void;
  delete: (key: string) => void;
}

const MMKV_ENCRYPTION_KEY_STORAGE_KEY = 'mmkv_encryption_key';
const MMKV_ENCRYPTION_KEY_BYTES = 32;

const memoryNamespaces = new Map<string, Map<string, string>>();
const warnedNamespaces = new Set<string>();

// ─── Chave de criptografia compartilhada por todas as instâncias MMKV ────────
//
// expo-secure-store é assíncrono; react-native-mmkv precisa da chave de forma
// síncrona no momento em que cada instância é aberta (`new MMKV({...})`).
// `initMMKVEncryptionKey` resolve (ou gera, na primeira instalação) a chave
// UMA VEZ, o mais cedo possível no boot do app — ver App.tsx, que aguarda
// esta função com a splash screen visível antes de renderizar qualquer tela.
//
// `createAppStorage` cria as instâncias MMKV de forma PREGUIÇOSA (lazy): a
// chamada em si (feita em import-time por vários módulos — auth.store.ts,
// queryClient.ts, etc.) só monta um wrapper; o `new MMKV(...)` real só
// acontece na primeira leitura/escrita de fato, que tipicamente ocorre
// dentro de uma ação de usuário ou efeito do React, já depois do boot
// aguardar a chave. Isso evita a "corrida" entre a inicialização síncrona
// de módulos e a resolução assíncrona da chave.
let resolvedEncryptionKey: string | undefined;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Resolve a chave de criptografia do MMKV, gerando uma nova na primeira
 * instalação. Deve ser chamada e aguardada uma única vez, o quanto antes no
 * boot do app. Chamadas subsequentes retornam o valor já resolvido em
 * memória, sem tocar o SecureStore de novo.
 *
 * Se a leitura/geração falhar por qualquer motivo (SecureStore indisponível),
 * retorna `undefined` — as instâncias MMKV criadas a partir daí caem no
 * fallback sem criptografia, com um `console.warn` visível em dev.
 */
export async function initMMKVEncryptionKey(): Promise<string | undefined> {
  if (resolvedEncryptionKey) {
    return resolvedEncryptionKey;
  }

  try {
    const existingKey = await SecureStore.getItemAsync(MMKV_ENCRYPTION_KEY_STORAGE_KEY);
    if (existingKey) {
      resolvedEncryptionKey = existingKey;
      return existingKey;
    }

    const randomBytes = await Crypto.getRandomBytesAsync(MMKV_ENCRYPTION_KEY_BYTES);
    const generatedKey = bytesToHex(randomBytes);
    await SecureStore.setItemAsync(MMKV_ENCRYPTION_KEY_STORAGE_KEY, generatedKey);

    resolvedEncryptionKey = generatedKey;
    return generatedKey;
  } catch (error) {
    console.warn(
      '[storage] Falha ao inicializar a chave de criptografia do MMKV — instâncias criadas a partir de agora ficarão sem criptografia.',
      error
    );
    return undefined;
  }
}

function createMemoryStorage(namespace: string): AppStorage {
  const backingStore = memoryNamespaces.get(namespace) ?? new Map<string, string>();
  memoryNamespaces.set(namespace, backingStore);

  return {
    getString: key => backingStore.get(key),
    set: (key, value) => {
      backingStore.set(key, String(value));
    },
    delete: key => {
      backingStore.delete(key);
    },
  };
}

function warnUnencrypted(namespace: string): void {
  if (warnedNamespaces.has(namespace)) {
    return;
  }
  warnedNamespaces.add(namespace);
  console.warn(
    `[storage] MMKV '${namespace}' inicializado SEM encryptionKey — a chave ainda não estava disponível neste ponto do boot (ver initMMKVEncryptionKey em App.tsx).`
  );
}

function openMMKVInstance(namespace: string): AppStorage {
  try {
    if (resolvedEncryptionKey) {
      return new MMKV({ id: namespace, encryptionKey: resolvedEncryptionKey });
    }

    warnUnencrypted(namespace);
    return new MMKV({ id: namespace });
  } catch (error) {
    if (!warnedNamespaces.has(`${namespace}:unavailable`)) {
      warnedNamespaces.add(`${namespace}:unavailable`);
      console.warn(
        `[storage] MMKV indisponivel para '${namespace}'. Usando fallback em memoria.`,
        error
      );
    }

    return createMemoryStorage(namespace);
  }
}

/**
 * Cria um storage por namespace, com criptografia em disco via MMKV quando
 * a chave já estiver disponível (ver `initMMKVEncryptionKey`). A instância
 * MMKV real só é aberta na primeira leitura/escrita (lazy) — a chamada a
 * `createAppStorage` em si é sempre síncrona e segura de usar em import-time.
 */
export function createAppStorage(namespace: string): AppStorage {
  let instance: AppStorage | null = null;

  function getInstance(): AppStorage {
    if (!instance) {
      instance = openMMKVInstance(namespace);
    }
    return instance;
  }

  return {
    getString: key => getInstance().getString(key),
    set: (key, value) => getInstance().set(key, value),
    delete: key => getInstance().delete(key),
  };
}
