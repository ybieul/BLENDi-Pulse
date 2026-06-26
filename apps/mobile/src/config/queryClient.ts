import {
  QueryClient,
  defaultShouldDehydrateQuery,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  PersistedClient,
  PersistQueryClientOptions,
} from '@tanstack/query-persist-client-core';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

import {
  CACHE_CONFIG,
  PERSISTABLE_QUERY_KEYS,
  PERSISTED_QUERY_MAX_AGES,
  QUERY_KEYS,
} from './cache.config';
import { createAppStorage } from './storage';

const QUERY_CACHE_STORAGE_ID = 'blendi-pulse';
const QUERY_CACHE_STORAGE_KEY = 'blendi_query_cache';
const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const MAX_PERSISTED_QUERY_AGE = CACHE_CONFIG.FAVORITES_TTL;

const queryCacheStorage = createAppStorage(QUERY_CACHE_STORAGE_ID);

type PersistableQueryRoot = keyof typeof QUERY_KEYS;

const persistableQueryRoots = new Set<PersistableQueryRoot>(PERSISTABLE_QUERY_KEYS);

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

function getPersistedQueryMaxAge(queryKey: QueryKey): number {
  const rootKey = getQueryRoot(queryKey);

  if (rootKey === null) {
    return MAX_PERSISTED_QUERY_AGE;
  }

  return PERSISTED_QUERY_MAX_AGES[rootKey] ?? MAX_PERSISTED_QUERY_AGE;
}

function isWithinPersistedQueryMaxAge(
  queryKey: QueryKey,
  dataUpdatedAt: number,
  now = Date.now()
): boolean {
  if (!Number.isFinite(dataUpdatedAt) || dataUpdatedAt <= 0) {
    return true;
  }

  return now - dataUpdatedAt <= getPersistedQueryMaxAge(queryKey);
}

function pruneExpiredPersistedQueries(persistedClient: PersistedClient): PersistedClient {
  const queries = persistedClient.clientState?.queries;

  if (!queries) {
    return persistedClient;
  }

  const now = Date.now();

  return {
    ...persistedClient,
    clientState: {
      ...persistedClient.clientState,
      queries: queries.filter((query) =>
        isWithinPersistedQueryMaxAge(query.queryKey, query.state.dataUpdatedAt, now)
      ),
    },
  };
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
    serialize: persistedClient => JSON.stringify(pruneExpiredPersistedQueries(persistedClient)),
    deserialize: value => pruneExpiredPersistedQueries(JSON.parse(value) as PersistedClient),
  });
}

export const queryPersister = createMMKVPersister();

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: MAX_PERSISTED_QUERY_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: query =>
      defaultShouldDehydrateQuery(query)
      && shouldPersistQuery(query.queryKey)
      && isWithinPersistedQueryMaxAge(query.queryKey, query.state.dataUpdatedAt),
  },
};