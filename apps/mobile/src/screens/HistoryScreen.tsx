import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { AuroraBackground } from '../components/ui/AuroraBackground';
import { BlendLogItem } from '../components/history/BlendLogItem';
import { HydrationBarChart } from '../components/history/HydrationBarChart';
import { MacroBarChart } from '../components/history/MacroBarChart';
import { PeriodSelector } from '../components/history/PeriodSelector';
import { StatCard } from '../components/history/StatCard';
import { SupplementHeatmap } from '../components/history/SupplementHeatmap';
import { SkeletonLoader } from '../components/ui';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useHistoryData, type HistoryPeriod } from '../hooks/useHistoryData';
import { useUnits } from '../hooks/useUnits';
import type { TrackStackScreenProps } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';

const SECTION_HEADER_COLOR = 'rgba(255,255,255,0.90)';
const SUBTITLE_COLOR = 'rgba(255,255,255,0.65)';
const ERROR_ICON_COLOR = 'rgba(239,68,68,0.70)';
const HYDRATION_ICON_COLOR = 'rgba(59,130,246,0.80)';
const SUPPLEMENT_ICON_COLOR = 'rgba(34,197,94,0.80)';
const LOAD_MORE_BACKGROUND = 'rgba(255,255,255,0.05)';
const LOAD_MORE_BORDER = 'rgba(255,255,255,0.12)';
const ERROR_BACKGROUND = 'rgba(239,68,68,0.06)';
const ERROR_BORDER = 'rgba(239,68,68,0.18)';
const RETRY_BACKGROUND = 'rgba(255,255,255,0.07)';
const RETRY_BORDER = 'rgba(255,255,255,0.14)';
const EMPTY_STATE_BACKGROUND = 'rgba(255,255,255,0.04)';
const EMPTY_STATE_BORDER = 'rgba(255,255,255,0.08)';
const EMPTY_STATE_ICON_COLOR = 'rgba(154,72,147,0.40)';

const HYDRATION_SCROLL_THRESHOLD = 450;
const SUPPLEMENTS_SCROLL_THRESHOLD = 850;

interface SectionErrorProps {
  onRetry: () => void;
}

function SectionError({ onRetry }: SectionErrorProps) {
  const { t } = useAppTranslation();

  return (
    <View style={errorStyles.container}>
      <Ionicons name="alert-circle-outline" size={20} color={ERROR_ICON_COLOR} />
      <Text style={errorStyles.message}>{t('history.loadError')}</Text>
      <Pressable onPress={onRetry} style={errorStyles.retryButton} accessibilityRole="button">
        <Text style={errorStyles.retryText}>{t('common.actions.retry')}</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    backgroundColor: ERROR_BACKGROUND,
    borderWidth: 1,
    borderColor: ERROR_BORDER,
    borderRadius: 12,
  },
  message: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: SUBTITLE_COLOR,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: RETRY_BACKGROUND,
    borderWidth: 1,
    borderColor: RETRY_BORDER,
    borderRadius: 8,
  },
  retryText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 12,
    color: colors.text.primary,
  },
});

export function HistoryScreen({ navigation }: TrackStackScreenProps<'History'>) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const calorieTarget = useAuthStore((state) => state.user?.dailyCalorieTarget ?? 2000);
  const { displayVolume } = useUnits();

  const [period, setPeriod] = useState<HistoryPeriod>(7);
  const [nutritionVisible, setNutritionVisible] = useState(false);
  const [hydrationVisible, setHydrationVisible] = useState(false);
  const [supplementsVisible, setSupplementsVisible] = useState(false);

  const {
    blendSummaryData,
    isBlendSummaryLoading,
    isBlendSummaryFetching,
    blendSummaryError,
    refetchBlendSummary,
    hydrationSummaryData,
    isHydrationSummaryLoading,
    isHydrationSummaryFetching,
    hydrationSummaryError,
    refetchHydrationSummary,
    supplementSummaryData,
    isSupplementSummaryLoading,
    isSupplementSummaryFetching,
    supplementSummaryError,
    refetchSupplementSummary,
    blendInfiniteData,
    isBlendInfiniteLoading,
    blendInfiniteError,
    fetchNextBlendPage,
    hasNextBlendPage,
    isFetchingNextBlendPage,
    refetchBlendInfinite,
  } = useHistoryData(period);

  const isRefreshing = isBlendSummaryFetching || isHydrationSummaryFetching || isSupplementSummaryFetching;

  const handleRefresh = useCallback(() => {
    void refetchBlendSummary();
    void refetchHydrationSummary();
    void refetchSupplementSummary();
    void refetchBlendInfinite();
  }, [refetchBlendSummary, refetchHydrationSummary, refetchSupplementSummary, refetchBlendInfinite]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      if (y > 0 && !nutritionVisible) {
        setNutritionVisible(true);
      }
      if (y > HYDRATION_SCROLL_THRESHOLD && !hydrationVisible) {
        setHydrationVisible(true);
      }
      if (y > SUPPLEMENTS_SCROLL_THRESHOLD && !supplementsVisible) {
        setSupplementsVisible(true);
      }
    },
    [nutritionVisible, hydrationVisible, supplementsVisible],
  );

  // ── Nutrition data ────────────────────────────────────────────────────────
  const blendCount = blendSummaryData?.summary.blendCount ?? 0;
  const avgProtein = blendSummaryData?.summary.averageDailyProtein ?? 0;
  const totalCalories = blendSummaryData?.summary.totalCalories ?? 0;

  const bestDayCalories = useMemo(() => {
    const breakdown = blendSummaryData?.dailyBreakdown ?? [];
    if (breakdown.length === 0) return 0;
    return Math.max(...breakdown.map((d) => d.calories));
  }, [blendSummaryData]);

  const macroChartData = useMemo(() => {
    return (blendSummaryData?.dailyBreakdown ?? []).map((d) => ({
      date: d.date,
      protein: d.protein,
      carbs: d.carbs,
      fat: 0,
      calories: d.calories,
    }));
  }, [blendSummaryData]);

  const blendLogs = useMemo(
    () => blendInfiniteData?.pages.flatMap((page) => page.logs) ?? [],
    [blendInfiniteData],
  );
  const isBlendListEmpty = !isBlendSummaryLoading && blendCount === 0;

  // ── Hydration data ────────────────────────────────────────────────────────
  const dailyHydrationTarget = hydrationSummaryData?.dailyHydrationTarget ?? 2000;
  const totalMl = hydrationSummaryData?.summary.totalMl ?? 0;
  const avgDailyMl = hydrationSummaryData?.summary.averageDailyMl ?? 0;

  const daysGoalReached = useMemo(() => {
    const breakdown = hydrationSummaryData?.dailyBreakdown ?? [];
    return breakdown.filter((d) => d.totalMl >= dailyHydrationTarget).length;
  }, [hydrationSummaryData, dailyHydrationTarget]);

  const hydrationChartData = hydrationSummaryData?.dailyBreakdown ?? [];

  // ── Supplement data ───────────────────────────────────────────────────────
  const avgAdherence = supplementSummaryData?.summary.averageAdherence ?? 0;
  const supplementHistory = supplementSummaryData?.history ?? [];

  const perfectDays = useMemo(
    () => supplementHistory.filter((d) => d.adherenceRate >= 1).length,
    [supplementHistory],
  );

  const topSupplement = useMemo(() => {
    const counts: Record<string, number> = {};
    supplementHistory.forEach((day) => {
      day.checkedSupplements.forEach((s) => {
        counts[s.name] = (counts[s.name] ?? 0) + 1;
      });
    });
    const entries = Object.entries(counts);
    if (entries.length === 0) return '-';
    return entries.reduce((best, curr) => (curr[1] > best[1] ? curr : best))[0];
  }, [supplementHistory]);

  const heatmapData = useMemo(
    () =>
      supplementHistory.map((day) => ({
        date: day.date,
        adherenceRate: day.adherenceRate,
        checkedSupplements: day.checkedSupplements.map((s) => s.name),
        missedSupplements: day.missedSupplements.map((s) => s.name),
      })),
    [supplementHistory],
  );

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />
      <ScrollView
        removeClippedSubviews
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand.pulse}
          />
        }
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 16 }]}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
            onPress={navigation.goBack}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.title}>{t('history.title')}</Text>
        </View>

        {/* ── Period Selector ───────────────────────────────────────────── */}
        <View style={styles.periodRow}>
          <PeriodSelector selected={period} onChange={setPeriod} />
        </View>

        {/* ── Nutrition ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="fitness-outline" size={18} color={colors.brand.pulse} />
            <Text style={styles.sectionTitle}>{t('history.nutrition')}</Text>
          </View>

          {blendSummaryError ? (
            <SectionError onRetry={refetchBlendSummary} />
          ) : (
            <>
              <View style={styles.statRow}>
                <StatCard
                  value={String(blendCount)}
                  label={t('history.totalBlends')}
                  isLoading={isBlendSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={`${avgProtein.toFixed(0)}${t('common.units.grams')}`}
                  label={t('history.avgProtein')}
                  isLoading={isBlendSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={`${totalCalories.toFixed(0)}`}
                  label={t('history.totalCalories')}
                  isLoading={isBlendSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={`${bestDayCalories.toFixed(0)}`}
                  label={t('history.bestDay')}
                  isLoading={isBlendSummaryLoading}
                />
              </View>

              <View style={styles.chartContainer}>
                <MacroBarChart
                  data={macroChartData}
                  period={period}
                  calorieTarget={calorieTarget}
                  animate={nutritionVisible}
                  isLoading={isBlendSummaryLoading}
                />
              </View>

              <Text style={styles.listSubtitle}>{t('history.allBlends')}</Text>

              {isBlendListEmpty ? (
                <View style={styles.emptyStateCard}>
                  <Ionicons name="flask-outline" size={28} color={EMPTY_STATE_ICON_COLOR} />
                  <Text style={styles.emptyStateTitle}>{t('track.history.empty_title')}</Text>
                  <Text style={styles.emptyStateMessage}>{t('track.history.empty_message')}</Text>
                </View>
              ) : isBlendInfiniteLoading ? (
                <View>
                  <SkeletonLoader variant="card" style={styles.blendItemSkeleton} />
                  <View style={styles.itemGap} />
                  <SkeletonLoader variant="card" style={styles.blendItemSkeleton} />
                  <View style={styles.itemGap} />
                  <SkeletonLoader variant="card" style={styles.blendItemSkeleton} />
                </View>
              ) : blendInfiniteError ? (
                <SectionError onRetry={() => { void refetchBlendInfinite(); }} />
              ) : (
                <View>
                  {blendLogs.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 && <View style={styles.itemGap} />}
                      <BlendLogItem item={item} />
                    </View>
                  ))}
                </View>
              )}

              {hasNextBlendPage && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => fetchNextBlendPage()}
                  style={styles.loadMoreButton}
                >
                  {isFetchingNextBlendPage ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>{t('history.loadMore')}</Text>
                  )}
                </Pressable>
              )}

              {!isBlendListEmpty && blendLogs.length > 0 && !hasNextBlendPage ? (
                <Text style={styles.allLoadedText}>{t('history.allLoaded')}</Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── Hydration ─────────────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionSpacing]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="water-outline" size={18} color={HYDRATION_ICON_COLOR} />
            <Text style={styles.sectionTitle}>{t('history.hydration')}</Text>
          </View>

          {hydrationSummaryError ? (
            <SectionError onRetry={refetchHydrationSummary} />
          ) : (
            <>
              <View style={styles.statRow}>
                <StatCard
                  value={displayVolume(totalMl)}
                  label={t('history.totalConsumed')}
                  isLoading={isHydrationSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={String(daysGoalReached)}
                  label={t('history.daysGoalReached')}
                  isLoading={isHydrationSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={displayVolume(avgDailyMl)}
                  label={t('history.avgDaily')}
                  isLoading={isHydrationSummaryLoading}
                />
              </View>

              <View style={styles.chartContainer}>
                <HydrationBarChart
                  data={hydrationChartData}
                  period={period}
                  dailyTarget={dailyHydrationTarget}
                  animate={hydrationVisible}
                  isLoading={isHydrationSummaryLoading}
                />
              </View>
            </>
          )}
        </View>

        {/* ── Supplements ───────────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionSpacing]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={18} color={SUPPLEMENT_ICON_COLOR} />
            <Text style={styles.sectionTitle}>{t('history.supplements')}</Text>
          </View>

          {supplementSummaryError ? (
            <SectionError onRetry={refetchSupplementSummary} />
          ) : (
            <>
              <View style={styles.statRow}>
                <StatCard
                  value={`${(avgAdherence * 100).toFixed(0)}%`}
                  label={t('history.avgAdherence')}
                  isLoading={isSupplementSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={String(perfectDays)}
                  label={t('history.perfectDays')}
                  isLoading={isSupplementSummaryLoading}
                />
                <View style={styles.cardGap} />
                <StatCard
                  value={topSupplement}
                  label={t('history.topSupplement')}
                  isLoading={isSupplementSummaryLoading}
                />
              </View>

              <View style={styles.chartContainer}>
                <SupplementHeatmap data={heatmapData} period={period} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 20,
    color: colors.text.primary,
  },
  periodRow: {
    paddingTop: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionSpacing: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 16,
    color: SECTION_HEADER_COLOR,
  },
  statRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  cardGap: {
    width: 8,
  },
  chartContainer: {
    overflow: 'hidden',
  },
  listSubtitle: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 13,
    color: SUBTITLE_COLOR,
    marginTop: 16,
    marginBottom: 10,
  },
  emptyStateCard: {
    marginTop: 4,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: EMPTY_STATE_BORDER,
    backgroundColor: EMPTY_STATE_BACKGROUND,
    alignItems: 'center',
  },
  emptyStateTitle: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontWeight: fontWeights.bold,
    fontSize: 14,
    color: colors.text.primary,
  },
  emptyStateMessage: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 13,
    lineHeight: 18,
    color: SUBTITLE_COLOR,
    textAlign: 'center',
  },
  itemGap: {
    height: 8,
  },
  blendItemSkeleton: {
    height: 82,
  },
  loadMoreButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    backgroundColor: LOAD_MORE_BACKGROUND,
    borderWidth: 1,
    borderColor: LOAD_MORE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 14,
    color: colors.text.primary,
  },
  allLoadedText: {
    marginTop: 12,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 12,
    color: SUBTITLE_COLOR,
    textAlign: 'center',
  },
});
