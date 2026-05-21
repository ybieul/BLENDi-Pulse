import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryFunctionContext,
} from '@tanstack/react-query';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
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

export type HistoryPeriod = 7 | 30 | 90;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type BlendSummaryQueryKey = readonly [...typeof QUERY_KEYS.blendHistory, HistoryPeriod];
type HydrationSummaryQueryKey = readonly [...typeof QUERY_KEYS.hydrationHistory, HistoryPeriod];
type SupplementSummaryQueryKey = readonly [...typeof QUERY_KEYS.supplementHistory, HistoryPeriod];
type BlendInfiniteQueryKey = readonly [...typeof QUERY_KEYS.blendHistory, HistoryPeriod, 'infinite'];

function getParts(utcDate: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
  const hour = get('hour') === 24 ? 0 : get('hour');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

function buildUTCFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const naiveDate = new Date(naive);
  const localParts = getParts(naiveDate, timezone);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const gotMs = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
  );

  return new Date(naive + (wantedMs - gotMs));
}

function toLocalDate(utcDate: Date, timezone: string): Date {
  const { year, month, day, hour, minute, second } = getParts(utcDate, timezone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function getMidnightUTC(timezone: string): Date {
  const now = new Date();
  const { year, month, day } = getParts(now, timezone);
  return buildUTCFromLocal(year, month, day, 0, 0, 0, timezone);
}

function buildHistoryRange(period: HistoryPeriod, timezone: string): { from: string; to: string } {
  const startOfTodayUtc = getMidnightUTC(timezone);
  const startOfTodayLocal = toLocalDate(startOfTodayUtc, timezone);

  const fromDate = new Date(startOfTodayLocal);
  fromDate.setUTCDate(fromDate.getUTCDate() - (period - 1));
  fromDate.setUTCHours(0, 0, 0, 0);

  const toDate = new Date(startOfTodayLocal);
  toDate.setUTCHours(23, 59, 59, 999);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

export function useHistoryData(period: HistoryPeriod) {
  const timezone = getDeviceTimezone();

  const { from, to } = useMemo(
    () => buildHistoryRange(period, timezone),
    [period, timezone],
  );

  const blendSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.blendHistory, period] as const,
    [period],
  );
  const hydrationSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.hydrationHistory, period] as const,
    [period],
  );
  const supplementSummaryQueryKey = useMemo(
    () => [...QUERY_KEYS.supplementHistory, period] as const,
    [period],
  );
  const blendInfiniteQueryKey = useMemo(
    () => [...QUERY_KEYS.blendHistory, period, 'infinite'] as const,
    [period],
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
    blendSummaryError: blendSummaryQuery.error,
    refetchBlendSummary: blendSummaryQuery.refetch,

    hydrationSummaryData: hydrationSummaryQuery.data,
    isHydrationSummaryLoading: hydrationSummaryQuery.isLoading,
    hydrationSummaryError: hydrationSummaryQuery.error,
    refetchHydrationSummary: hydrationSummaryQuery.refetch,

    supplementSummaryData: supplementSummaryQuery.data,
    isSupplementSummaryLoading: supplementSummaryQuery.isLoading,
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