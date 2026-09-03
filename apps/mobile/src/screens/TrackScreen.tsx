// apps/mobile/src/screens/TrackScreen.tsx
// CP1.8 — Tela principal do fluxo Track.
//
// Dados:
//   • hydrationToday  → GET /hydration-logs/today
//   • supplementStack → GET /supplement-stack
//   • hydrationHistory (7d) → GET /hydration-logs/history
//
// Mutations:
//   • logWater         → invalida hydrationToday + hydrationHistory
//   • toggleSupplement → UI otimista no cache do supplementStack
//   • updateStack      → invalida supplementStack (add/delete/toggleActive)

import { useCallback, useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { useAppTranslation } from '../hooks/useAppTranslation';

import {
  logWater,
  getHydrationToday,
  getHydrationHistory,
  type HydrationHistoryData,
  type HydrationHistoryDailyBreakdownItem,
  type HydrationTodayResponse,
} from '../services/hydration.service';
import {
  getStack,
  checkSupplement,
  uncheckSupplement,
} from '../services/supplementStack.service';
import type { SupplementStackItem } from '../services/supplementStack.service';
import {
  getLists,
  type ShoppingListsResult,
} from '../services/shoppingList.service';

import type { TrackStackScreenProps } from '../navigation/types';
import { getDeviceTimezone } from '../services/timezone.service';
import { useAuthStore } from '../store/auth.store';

import { AuroraBackground } from '../components/ui/AuroraBackground';
import { RecipeCardSkeleton } from '../components/ui';
import { HydrationSection } from '../components/track/HydrationSection';
import { MyStackSection } from '../components/track/MyStackSection';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_HYDRATION_TARGET_ML = 2000;
const SHOPPING_LIST_BADGE_SIZE = 16;
const SHOPPING_LIST_BADGE_FONT_SIZE = 10;
const SHOPPING_LIST_BADGE_FONT_SIZE_OVERFLOW = 8;
const RETRY_BUTTON_BORDER_COLOR = 'rgba(255,255,255,0.15)';
const HISTORY_BUTTON_BACKGROUND = 'rgba(255,255,255,0.05)';
const HISTORY_BUTTON_BORDER_COLOR = 'rgba(255,255,255,0.12)';

type TrackHydrationHistoryQueryKey = readonly [...typeof QUERY_KEYS.hydrationHistory, string, '7days'];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getLocalDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDateRange7Days(timezone: string): { from: string; to: string } {
  const to = getLocalDateKey(new Date(), timezone);
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 6);

  return {
    from: from.toISOString().slice(0, 10),
    to,
  };
}

function getNormalizedSupplementProgress(
  supplement: SupplementStackItem,
): { dailyTargetCount: number; consumedTodayCount: number } {
  const rawDailyTargetCount = (supplement as { dailyTargetCount?: unknown }).dailyTargetCount;
  const dailyTargetCount =
    typeof rawDailyTargetCount === 'number'
    && Number.isSafeInteger(rawDailyTargetCount)
    && rawDailyTargetCount >= 1
      ? rawDailyTargetCount
      : 1;
  const rawConsumedTodayCount = (supplement as { consumedTodayCount?: unknown }).consumedTodayCount;
  const fallbackConsumedTodayCount = supplement.checkedToday === true ? dailyTargetCount : 0;
  const normalizedConsumedTodayCount =
    typeof rawConsumedTodayCount === 'number' && Number.isFinite(rawConsumedTodayCount)
      ? Math.floor(rawConsumedTodayCount)
      : fallbackConsumedTodayCount;

  return {
    dailyTargetCount,
    consumedTodayCount:
      normalizedConsumedTodayCount <= 0
        ? 0
        : normalizedConsumedTodayCount >= dailyTargetCount
          ? dailyTargetCount
          : normalizedConsumedTodayCount,
  };
}

function isHydrationHistoryDailyBreakdownItem(
  value: unknown,
): value is HydrationHistoryDailyBreakdownItem {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { date?: unknown }).date === 'string'
    && typeof (value as { totalMl?: unknown }).totalMl === 'number'
  );
}

function toHydrationHistoryFetcher(
  value: unknown,
): (
  from: string,
  to: string,
  page?: number,
  limit?: number,
) => Promise<HydrationHistoryData> {
  return value as (
    from: string,
    to: string,
    page?: number,
    limit?: number,
  ) => Promise<HydrationHistoryData>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function TrackScreen({ navigation }: TrackStackScreenProps<'TrackMain'>) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const userTimezone = useAuthStore((state) => state.user?.timezone);
  const historyTimezone = userTimezone ?? getDeviceTimezone();

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: hydrationTodayResponse,
    isLoading: isLoadingHydration,
    isFetching: isFetchingHydration,
    isError: isErrorHydration,
    refetch: refetchHydration,
    dataUpdatedAt: hydrationTodayUpdatedAt,
  } = useQuery<
    HydrationTodayResponse,
    Error,
    HydrationTodayResponse,
    typeof QUERY_KEYS.hydrationToday
  >({
    queryKey: QUERY_KEYS.hydrationToday,
    queryFn: getHydrationToday,
    staleTime: CACHE_CONFIG.HYDRATION_TODAY_TTL,
    retry: 1,
  });

  const {
    data: supplementStack,
    isLoading: isLoadingStack,
    isFetching: isFetchingStack,
    isError: isErrorStack,
    refetch: refetchStack,
  } = useQuery<
    SupplementStackItem[],
    Error,
    SupplementStackItem[],
    typeof QUERY_KEYS.supplementStack
  >({
    queryKey: QUERY_KEYS.supplementStack,
    queryFn: getStack,
    staleTime: CACHE_CONFIG.SUPPLEMENT_STACK_TTL,
    retry: 1,
  });

  const shoppingListsQuery = useQuery<
    ShoppingListsResult,
    Error,
    ShoppingListsResult,
    typeof QUERY_KEYS.shoppingLists
  >({
    queryKey: QUERY_KEYS.shoppingLists,
    queryFn: getLists,
    staleTime: CACHE_CONFIG.SHOPPING_LISTS_TTL,
    retry: 1,
  });

  const { from: historyFrom, to: historyTo } = useMemo(
    () => getDateRange7Days(historyTimezone),
    [historyTimezone],
  );
  const historyQueryKey = useMemo(
    () => [...QUERY_KEYS.hydrationHistory, historyTimezone, '7days'] as const,
    [historyTimezone],
  );

  const hydrationHistoryFetcher = toHydrationHistoryFetcher(getHydrationHistory);

  const fetchHydrationHistory: () => Promise<HydrationHistoryData> = useCallback(
    () => hydrationHistoryFetcher(historyFrom, historyTo, 1, 7),
    [historyFrom, historyTo, hydrationHistoryFetcher],
  );

  const hydrationHistoryQuery = useQuery<
    HydrationHistoryData,
    Error,
    HydrationHistoryData,
    TrackHydrationHistoryQueryKey
  >({
    queryKey: historyQueryKey,
    queryFn: fetchHydrationHistory,
    staleTime: CACHE_CONFIG.HYDRATION_TODAY_TTL,
    retry: 1,
  });
  const isLoadingHistory = hydrationHistoryQuery.isLoading;
  const isFetchingHistory = hydrationHistoryQuery.isFetching;
  const isErrorHistory = hydrationHistoryQuery.isError;
  const refetchHistory = hydrationHistoryQuery.refetch;

  const isLoading = isLoadingHydration || isLoadingStack || isLoadingHistory;
  const isError = isErrorHydration || isErrorStack || isErrorHistory;
  const isRefreshing = isFetchingHydration || isFetchingStack || isFetchingHistory;

  // ── Mutation: log water ───────────────────────────────────────────────────

  const { mutate: mutateLogWater, isPending: isLogWaterPending } = useMutation({
    mutationFn: () => logWater(250),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationHistory });
    },
  });

  // ── Mutation: supplement progress (optimistic) ───────────────────────────

  interface ProgressVars {
    supplementId: string;
    direction: 'increment' | 'decrement';
    consumedTodayCount: number;
    dailyTargetCount: number;
  }

  interface ProgressContext {
    snapshot: SupplementStackItem[] | undefined;
  }

  const { mutate: mutateProgress, isPending: isSupplementProgressPending } = useMutation<
    void,
    Error,
    ProgressVars,
    ProgressContext
  >({
    mutationFn: async ({ supplementId, direction }): Promise<void> => {
      if (direction === 'decrement') {
        await uncheckSupplement(supplementId);
        return;
      }

      await checkSupplement(supplementId);
    },

    onMutate: async ({ supplementId, direction, consumedTodayCount, dailyTargetCount }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.supplementStack });

      const snapshot = queryClient.getQueryData<SupplementStackItem[]>(
        QUERY_KEYS.supplementStack,
      );

      const nextConsumedTodayCount = direction === 'increment'
        ? Math.min(consumedTodayCount + 1, dailyTargetCount)
        : Math.max(consumedTodayCount - 1, 0);

      queryClient.setQueryData<SupplementStackItem[]>(
        QUERY_KEYS.supplementStack,
        (prev) =>
          prev?.map((item) =>
            item.supplementId === supplementId
              ? {
                  ...item,
                  consumedTodayCount: nextConsumedTodayCount,
                  checkedToday: nextConsumedTodayCount >= dailyTargetCount,
                  checkedAt: nextConsumedTodayCount === 0 ? null : item.checkedAt ?? new Date().toISOString(),
                }
              : item,
          ) ?? [],
      );

      return { snapshot };
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(QUERY_KEYS.supplementStack, context.snapshot);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplementStack });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplementHistory });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleLogWater = useCallback(() => {
    mutateLogWater();
  }, [mutateLogWater]);

  const handleIncrementSupplement = useCallback(
    (supplement: SupplementStackItem) => {
      const { dailyTargetCount, consumedTodayCount } = getNormalizedSupplementProgress(supplement);

      if (consumedTodayCount >= dailyTargetCount) {
        return;
      }

      mutateProgress({
        supplementId: supplement.supplementId,
        direction: 'increment',
        consumedTodayCount,
        dailyTargetCount,
      });
    },
    [mutateProgress],
  );

  const handleDecrementSupplement = useCallback(
    (supplement: SupplementStackItem) => {
      const { dailyTargetCount, consumedTodayCount } = getNormalizedSupplementProgress(supplement);

      if (consumedTodayCount <= 0) {
        return;
      }

      mutateProgress({
        supplementId: supplement.supplementId,
        direction: 'decrement',
        consumedTodayCount,
        dailyTargetCount,
      });
    },
    [mutateProgress],
  );

  const handleManage = useCallback(() => {
    navigation.navigate('ManageStack');
  }, [navigation]);

  const handleViewHistory = useCallback(() => {
    navigation.navigate('History');
  }, [navigation]);

  const handleViewShoppingLists = useCallback(() => {
    navigation.navigate('ShoppingLists');
  }, [navigation]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const rawHydrationTodayTotalMl = (hydrationTodayResponse as { data?: { totalMl?: unknown } } | undefined)
    ?.data?.totalMl;
  const hydrationToday =
    typeof rawHydrationTodayTotalMl === 'number' && Number.isFinite(rawHydrationTodayTotalMl)
      ? rawHydrationTodayTotalMl
      : 0;
  const rawHydrationGoalMl = (hydrationTodayResponse as { data?: { goalMl?: unknown } } | undefined)
    ?.data?.goalMl;
  const hydrationTarget =
    typeof rawHydrationGoalMl === 'number' && Number.isFinite(rawHydrationGoalMl)
      ? rawHydrationGoalMl
      : DEFAULT_HYDRATION_TARGET_ML;
  const rawHistoryDailyBreakdown = (
    hydrationHistoryQuery as { data?: { dailyBreakdown?: unknown } } | undefined
  )?.data?.dailyBreakdown;
  const history7Days: HydrationHistoryDailyBreakdownItem[] = useMemo(
    () =>
      Array.isArray(rawHistoryDailyBreakdown)
        ? rawHistoryDailyBreakdown.filter(isHydrationHistoryDailyBreakdownItem)
        : [],
    [rawHistoryDailyBreakdown],
  );
  const activeStack: SupplementStackItem[] = (supplementStack ?? []).filter((item) => item.isActive);
  const pendingShoppingListItemsTotal = useMemo(
    () => shoppingListsQuery.data?.lists.reduce((total, list) => total + list.pendingItems, 0) ?? 0,
    [shoppingListsQuery.data],
  );

  // ── Retry all ─────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    void refetchHydration();
    void refetchStack();
    void refetchHistory();
  }, [refetchHydration, refetchStack, refetchHistory]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />

      <ScrollView
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRetry}
            tintColor={colors.brand.pulse}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16 },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('track.title')}</Text>

          <View style={styles.headerRightActions}>
            <View style={styles.headerActionWithBadge}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={String(t('shoppingList.title'))}
                onPress={handleViewShoppingLists}
                style={styles.headerButton}
              >
                <Ionicons name="cart-outline" size={22} color={colors.text.secondary} />
              </Pressable>

              {pendingShoppingListItemsTotal > 0 ? (
                <View style={styles.shoppingListBadge}>
                  <Text style={[
                    styles.shoppingListBadgeText,
                    pendingShoppingListItemsTotal > 9 && styles.shoppingListBadgeTextOverflow,
                  ]}>
                    {pendingShoppingListItemsTotal > 9 ? '9+' : String(pendingShoppingListItemsTotal)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={String(t('history.title'))}
              onPress={handleViewHistory}
              style={styles.headerButton}
            >
              <Ionicons name="time-outline" size={22} color={colors.text.secondary} />
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          // ── Skeleton ──────────────────────────────────────────────────────
          <View style={styles.skeletonContainer}>
            <RecipeCardSkeleton />
            <View style={styles.skeletonSpacer} />
            <RecipeCardSkeleton />
          </View>
        ) : isError ? (
          // ── Error state ───────────────────────────────────────────────────
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{t('common.states.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleRetry}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>{t('common.actions.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          // ── Content ───────────────────────────────────────────────────────
          <>
            <View style={styles.sectionSpacing}>
              <HydrationSection
                todayTotal={hydrationToday}
                dailyTarget={hydrationTarget}
                onLogWater={handleLogWater}
                history7Days={history7Days}
                dataUpdatedAt={hydrationTodayUpdatedAt}
                isLogWaterPending={isLogWaterPending}
              />
            </View>

            <View style={styles.sectionSpacingSmall}>
              <MyStackSection
                supplements={activeStack}
                onIncrement={handleIncrementSupplement}
                onDecrement={handleDecrementSupplement}
                onManage={handleManage}
                isCheckPending={isSupplementProgressPending}
              />
            </View>

            <View style={styles.historyButtonSection}>
              <Pressable
                accessibilityRole="button"
                onPress={handleViewHistory}
                style={styles.historyButton}
              >
                <View style={styles.historyButtonContent}>
                  <Ionicons name="bar-chart-outline" size={18} color={colors.brand.pulse} />
                  <Text style={styles.historyButtonLabel}>{t('track.viewHistory')}</Text>
                </View>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: fontWeights.bold,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerActionWithBadge: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingListBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: SHOPPING_LIST_BADGE_SIZE,
    height: SHOPPING_LIST_BADGE_SIZE,
    borderRadius: SHOPPING_LIST_BADGE_SIZE / 2,
    backgroundColor: colors.brand.pulse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingListBadgeText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: SHOPPING_LIST_BADGE_FONT_SIZE,
    fontWeight: fontWeights.bold,
    lineHeight: SHOPPING_LIST_BADGE_FONT_SIZE + 2,
    includeFontPadding: false,
  },
  shoppingListBadgeTextOverflow: {
    fontSize: SHOPPING_LIST_BADGE_FONT_SIZE_OVERFLOW,
    lineHeight: SHOPPING_LIST_BADGE_FONT_SIZE_OVERFLOW + 2,
  },

  // Sections
  sectionSpacing: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionSpacingSmall: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  historyButtonSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  historyButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HISTORY_BUTTON_BORDER_COLOR,
    backgroundColor: HISTORY_BUTTON_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  historyButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  skeletonSpacer: {
    height: 16,
  },

  // Error
  errorContainer: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
    gap: spacing.lg,
  },
  errorText: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlign: 'center',
    opacity: 0.8,
  },
  retryButton: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: RETRY_BUTTON_BORDER_COLOR,
  },
  retryLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
});