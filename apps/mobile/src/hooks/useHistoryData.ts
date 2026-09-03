import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryFunctionContext,
} from '@tanstack/react-query';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { buildHistoryRange, type HistoryPeriod } from '../utils/historyRange.utils';
import {
  getBlendHistory,
  type BlendHistoryData,
} from '../services/blendLog.service';
import {
  getHydrationHistory,
  type HydrationHistoryData,
} from '../services/hydration.service';
import {
  getSupplementHistory,
  type SupplementHistoryData,
} from '../services/supplementLog.service';
import { getDeviceTimezone } from '../services/timezone.service';
import { useAuthStore } from '../store/auth.store';

export type { HistoryPeriod } from '../utils/historyRange.utils';

type BlendSummaryQueryKey = readonly [...typeof QUERY_KEYS.blendHistory, string, HistoryPeriod];
type HydrationSummaryQueryKey = readonly [...typeof QUERY_KEYS.hydrationHistory, string, HistoryPeriod];
type SupplementSummaryQueryKey = readonly [...typeof QUERY_KEYS.supplementHistory, string, HistoryPeriod];
type BlendInfiniteQueryKey = readonly [...typeof QUERY_KEYS.blendHistory, string, HistoryPeriod, 'infinite'];

export function useHistoryData(period: HistoryPeriod) {
  const userTimezone = useAuthStore((state) => state.user?.timezone);
  const timezone = userTimezone ?? getDeviceTimezone();

  const { from, to } = useMemo(
    () => buildHistoryRange(period, timezone),
    [period, timezone],
  );

  const blendSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.blendHistory, timezone, period] as const,
    [period, timezone],
  );
  const hydrationSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.hydrationHistory, timezone, period] as const,
    [period, timezone],
  );
  const supplementSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.supplementHistory, timezone, period] as const,
    [period, timezone],
  );
  const blendInfiniteQueryKey = useMemo(
    () => [...QUERY_KEYS.blendHistory, timezone, period, 'infinite'] as const,
    [period, timezone],
  );

  const fetchBlendSummary: () => Promise<BlendHistoryData> = useCallback(
    () => getBlendHistory(from, to, 1, 7),
    [from, to],
  );

  const fetchHydrationSummary: () => Promise<HydrationHistoryData> = useCallback(
    () => getHydrationHistory(from, to),
    [from, to],
  );

  const fetchSupplementSummary: () => Promise<SupplementHistoryData> = useCallback(
    () => getSupplementHistory(from, to),
    [from, to],
  );

  const fetchBlendHistoryPage = useCallback(
    ({ pageParam }: QueryFunctionContext<BlendInfiniteQueryKey, number>): Promise<BlendHistoryData> =>
      getBlendHistory(from, to, pageParam),
    [from, to],
  );

  const blendSummaryQuery = useQuery<
    BlendHistoryData,
    Error,
    BlendHistoryData,
    BlendSummaryQueryKey
  >({
    queryKey: blendSummaryQueryKey,
    queryFn: fetchBlendSummary,
    staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
    retry: 1,
  });

  const hydrationSummaryQuery = useQuery<
    HydrationHistoryData,
    Error,
    HydrationHistoryData,
    HydrationSummaryQueryKey
  >({
    queryKey: hydrationSummaryQueryKey,
    queryFn: fetchHydrationSummary,
    staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
    retry: 1,
  });

  const supplementSummaryQuery = useQuery<
    SupplementHistoryData,
    Error,
    SupplementHistoryData,
    SupplementSummaryQueryKey
  >({
    queryKey: supplementSummaryQueryKey,
    queryFn: fetchSupplementSummary,
    staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
    retry: 1,
  });

  const blendInfiniteQuery = useInfiniteQuery<
    BlendHistoryData,
    Error,
    InfiniteData<BlendHistoryData, number>,
    BlendInfiniteQueryKey,
    number
  >({
    queryKey: blendInfiniteQueryKey,
    queryFn: fetchBlendHistoryPage,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
    retry: 1,
  });

  return {
    from,
    to,

    blendSummaryData: blendSummaryQuery.data,
    isBlendSummaryLoading: blendSummaryQuery.isLoading,
    isBlendSummaryFetching: blendSummaryQuery.isFetching,
    blendSummaryError: blendSummaryQuery.error,
    refetchBlendSummary: blendSummaryQuery.refetch,

    hydrationSummaryData: hydrationSummaryQuery.data,
    isHydrationSummaryLoading: hydrationSummaryQuery.isLoading,
    isHydrationSummaryFetching: hydrationSummaryQuery.isFetching,
    hydrationSummaryError: hydrationSummaryQuery.error,
    refetchHydrationSummary: hydrationSummaryQuery.refetch,

    supplementSummaryData: supplementSummaryQuery.data,
    isSupplementSummaryLoading: supplementSummaryQuery.isLoading,
    isSupplementSummaryFetching: supplementSummaryQuery.isFetching,
    supplementSummaryError: supplementSummaryQuery.error,
    refetchSupplementSummary: supplementSummaryQuery.refetch,

    blendInfiniteData: blendInfiniteQuery.data,
    isBlendInfiniteLoading: blendInfiniteQuery.isLoading,
    blendInfiniteError: blendInfiniteQuery.error,
    refetchBlendInfinite: blendInfiniteQuery.refetch,
    fetchNextBlendPage: blendInfiniteQuery.fetchNextPage,
    hasNextBlendPage: blendInfiniteQuery.hasNextPage,
    isFetchingNextBlendPage: blendInfiniteQuery.isFetchingNextPage,
  };
}