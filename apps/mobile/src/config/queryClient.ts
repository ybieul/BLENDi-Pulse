import {
  QueryClient,
  defaultShouldDehydrateQuery,
  type QueryKey,
} from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/query-persist-client-core';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

import { CACHE_CONFIG, QUERY_KEYS } from './cache.config';
import { createAppStorage } from './storage';

const QUERY_CACHE_STORAGE_ID = 'blendi-pulse';
const QUERY_CACHE_STORAGE_KEY = 'blendi_query_cache';
const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const MAX_PERSISTED_QUERY_AGE = CACHE_CONFIG.FAVORITES_TTL;

const queryCacheStorage = createAppStorage(QUERY_CACHE_STORAGE_ID);

type PersistableQueryRoot = keyof typeof QUERY_KEYS;

const persistableQueryRoots = new Set<PersistableQueryRoot>(
  Object.keys(QUERY_KEYS) as PersistableQueryRoot[]
);

function isPersistableQueryRoot(value: unknown): value is PersistableQueryRoot {
  return typeof value === 'string' && value in QUERY_KEYS;
}

function getQueryRoot(queryKey: QueryKey): PersistableQueryRoot | null {
  const [rootKey] = queryKey;
  return isPersistableQueryRoot(rootKey) ? rootKey : null;
}

function shouldPersistQuery(queryKey: QueryKey): boolean {
  const rootKey = getQueryRoot(queryKey);
  return rootKey !== null && persistableQueryRoots.has(rootKey);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: CACHE_CONFIG.FAVORITES_TTL,
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30_000),
    },
  },
});

export function createMMKVPersister() {
  return createSyncStoragePersister({
    storage: {
      getItem: key => queryCacheStorage.getString(key) ?? null,
      setItem: (key, value) => {
        queryCacheStorage.set(key, value);
      },
      removeItem: key => {
        queryCacheStorage.delete(key);
      },
    },
    key: QUERY_CACHE_STORAGE_KEY,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });
}

export const queryPersister = createMMKVPersister();

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: MAX_PERSISTED_QUERY_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: query =>
      defaultShouldDehydrateQuery(query) && shouldPersistQuery(query.queryKey),
  },
};