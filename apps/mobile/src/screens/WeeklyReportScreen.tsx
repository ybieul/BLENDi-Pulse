import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WeeklyReportSummary } from '@blendi/shared';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { GoalRing } from '../components/ui/GoalRing';
import { SkeletonLoader } from '../components/ui/SkeletonLoader';
import { HydrationBarChart, type HydrationBarChartDatum } from '../components/history/HydrationBarChart';
import { HighlightRecipeCard } from '../components/weeklyReport/HighlightRecipeCard';
import {
  WeeklyShareCard,
  type WeeklyShareCardHandle,
  type WeeklyShareCardProps,
} from '../components/shareCards/WeeklyShareCard';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useDateFormat } from '../hooks/useDateFormat';
import { useUnits } from '../hooks/useUnits';
import { QUERY_KEYS } from '../config/cache.config';
import { getAllReportDates, getReportByWeek, WeeklyReportServiceError } from '../services/weeklyReport.service';
import { generateAndShare } from '../utils/shareCard.utils';
import { showToast } from '../utils/toast.utils';
import { useAuthStore } from '../store/auth.store';
import type { RootStackParamList } from '../navigation/types';

type WeeklyReportScreenProps = NativeStackScreenProps<RootStackParamList, 'WeeklyReport'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type PendingShare = Omit<WeeklyShareCardProps, 'user'>;

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const SUBTITLE_COLOR = 'rgba(255,255,255,0.65)';
const HYDRATION_ICON_COLOR = 'rgba(59,130,246,0.80)';
const SUPPLEMENT_ICON_COLOR = 'rgba(34,197,94,0.80)';
const GAMIFICATION_ICON_COLOR = 'rgba(245,158,11,0.85)';
const LEVEL_UP_BACKGROUND = 'rgba(154,72,147,0.15)';
const EMPTY_ICON_COLOR = 'rgba(255,255,255,0.35)';
const POSITIVE_COLOR = 'rgba(34,197,94,0.95)';
const NEGATIVE_COLOR = 'rgba(245,158,11,0.95)';
const PROGRESS_TRACK_COLOR = 'rgba(255,255,255,0.08)';
const CHEVRON_DISABLED_OPACITY = 0.3;
const SHARE_DELAY_MS = 300;
const PAYWALL_BORDER_COLOR = 'rgba(245,158,11,0.60)';
const PAYWALL_BACKGROUND = 'rgba(43,20,41,0.95)';
const PAYWALL_BADGE_BACKGROUND = '#F59E0B';
const PAYWALL_BADGE_TEXT_COLOR = '#2D1600';

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function buildWeekDates(weekStartDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(weekStartDate, index));
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof WeeklyReportServiceError && error.apiCode === 'weeklyReport/not-found';
}

interface SectionCardProps {
  icon: IoniconName;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}

function SectionCard({ icon, iconColor, title, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ComparisonRow({ deltaPercent }: { deltaPercent: number }) {
  const { t } = useAppTranslation();
  const isPositive = deltaPercent >= 0;
  const roundedAbs = Math.round(Math.abs(deltaPercent));

  return (
    <Text style={[styles.comparisonText, { color: isPositive ? POSITIVE_COLOR : NEGATIVE_COLOR }]}>
      {isPositive
        ? t('weeklyReport.comparisonUp', { amount: `${roundedAbs}%` })
        : t('weeklyReport.comparisonDown', { amount: `-${roundedAbs}%` })}
    </Text>
  );
}

function ReportSkeleton() {
  return (
    <View>
      <SkeletonLoader variant="card" style={styles.skeletonCard} />
      <SkeletonLoader variant="card" style={styles.skeletonCard} />
      <SkeletonLoader variant="card" style={styles.skeletonCard} />
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  subtitle: string;
}

function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="bar-chart-outline" size={48} color={EMPTY_ICON_COLOR} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  const { t } = useAppTranslation();

  return (
    <View style={styles.errorState}>
      <Ionicons name="alert-circle-outline" size={20} color={NEGATIVE_COLOR} />
      <Text style={styles.errorText}>{t('history.loadError')}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>{t('common.actions.retry')}</Text>
      </Pressable>
    </View>
  );
}

export function WeeklyReportScreen({ navigation }: WeeklyReportScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { formatShortDate, formatWeekdayShort } = useDateFormat();
  const { displayVolume } = useUnits();
  const authUser = useAuthStore((state) => state.user);
  const isPro = Boolean(authUser?.isPro);

  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const shareCardRef = useRef<WeeklyShareCardHandle | null>(null);

  const datesQuery = useQuery({
    queryKey: QUERY_KEYS.weeklyReportDates,
    queryFn: getAllReportDates,
  });

  const dates = useMemo(() => datesQuery.data ?? [], [datesQuery.data]);

  useEffect(() => {
    if (selectedWeekStart !== null || dates.length === 0) {
      return;
    }
    setSelectedWeekStart(dates[dates.length - 1]);
  }, [dates, selectedWeekStart]);

  const reportQuery = useQuery<WeeklyReportSummary, WeeklyReportServiceError>({
    queryKey: [...QUERY_KEYS.weeklyReport, selectedWeekStart ?? ''] as const,
    queryFn: () => getReportByWeek(selectedWeekStart as string),
    enabled: Boolean(selectedWeekStart),
  });

  const currentIndex = selectedWeekStart ? dates.indexOf(selectedWeekStart) : -1;
  const canGoOlder = currentIndex > 0;
  const canGoNewer = currentIndex >= 0 && currentIndex < dates.length - 1;

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedWeekStart(dates[currentIndex - 1]);
    }
  }, [currentIndex, dates]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < dates.length - 1) {
      setSelectedWeekStart(dates[currentIndex + 1]);
    }
  }, [currentIndex, dates]);

  const weekRangeLabel = useMemo(() => {
    if (!selectedWeekStart) {
      return '';
    }
    const weekEnd = addDaysToDateKey(selectedWeekStart, 6);
    return `${formatShortDate(selectedWeekStart)} – ${formatShortDate(weekEnd)}`;
  }, [selectedWeekStart, formatShortDate]);

  const report = reportQuery.data;

  const hydrationChartData = useMemo<HydrationBarChartDatum[]>(() => {
    if (!report) {
      return [];
    }
    return buildWeekDates(report.weekStartDate).map((date, index) => ({
      date,
      totalMl: report.data.hydration.dailyBreakdown[index] ?? 0,
    }));
  }, [report]);

  const handleShare = useCallback(() => {
    if (!report || isShareLoading) {
      return;
    }

    setIsShareLoading(true);
    setPendingShare({
      weekStart: report.weekStartDate,
      weekEnd: report.weekEndDate,
      totalBlends: report.data.nutrition.blendCount,
      averageDailyProtein: report.data.nutrition.avgProteinPerDay,
      currentStreak: report.data.gamification.currentStreak,
      supplementAdherenceRate: report.data.supplements.adherenceRate * 100,
    });
  }, [report, isShareLoading]);

  const handleSharePress = useCallback(() => {
    if (!isPro) {
      showToast(t('weeklyReport.shareLocked'));
      return;
    }
    handleShare();
  }, [isPro, handleShare, t]);

  useEffect(() => {
    if (!pendingShare) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        await generateAndShare(shareCardRef);
        setPendingShare(null);
        setIsShareLoading(false);
      })();
    }, SHARE_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingShare]);

  const dailyProteinTarget = authUser?.dailyProteinTarget ?? 0;
  const dailyHydrationTarget = authUser?.dailyHydrationTarget ?? 2500;
  const proteinProgress = dailyProteinTarget > 0
    ? Math.min((report?.data.nutrition.avgProteinPerDay ?? 0) / dailyProteinTarget, 1)
    : 0;

  const showEmptyNoReports = !datesQuery.isLoading && dates.length === 0;
  const showReportNotFound = reportQuery.isError && isNotFoundError(reportQuery.error);
  const showReportError = reportQuery.isError && !isNotFoundError(reportQuery.error);

  const restCards = report ? (
    <>
      <SectionCard icon="water-outline" iconColor={HYDRATION_ICON_COLOR} title={t('weeklyReport.sectionHydration')}>
        <Text style={styles.bigNumber}>{displayVolume(report.data.hydration.totalMl)}</Text>
        <Text style={styles.bigNumberLabel}>
          {t('weeklyReport.totalHydration', { amount: displayVolume(report.data.hydration.totalMl) })}
        </Text>

        <View style={styles.chartContainer}>
          <HydrationBarChart data={hydrationChartData} period={7} dailyTarget={dailyHydrationTarget} />
        </View>

        <Text style={styles.detailText}>
          {t('weeklyReport.avgDaily', { amount: displayVolume(report.data.hydration.avgDailyMl) })}
        </Text>
        <Text style={styles.detailText}>{t('weeklyReport.goalHitDays', { days: report.data.hydration.goalHitDays })}</Text>
      </SectionCard>

      <SectionCard icon="medical-outline" iconColor={SUPPLEMENT_ICON_COLOR} title={t('weeklyReport.sectionSupplements')}>
        <View style={styles.supplementRow}>
          <View style={styles.supplementInfo}>
            <Text style={styles.bigNumber}>{Math.round(report.data.supplements.adherenceRate * 100)}%</Text>
            <Text style={styles.bigNumberLabel}>
              {t('weeklyReport.adherenceRate', { percent: Math.round(report.data.supplements.adherenceRate * 100) })}
            </Text>
            <Text style={styles.detailText}>{t('weeklyReport.perfectDays', { days: report.data.supplements.perfectDays })}</Text>
            <Text style={styles.detailText}>
              {t('weeklyReport.topSupplement', { name: report.data.supplements.topSupplement })}
            </Text>
            <Text style={styles.detailText}>
              {t('weeklyReport.bottomSupplement', { name: report.data.supplements.bottomSupplement })}
            </Text>
          </View>

          <GoalRing
            animate={false}
            current={Math.round(report.data.supplements.adherenceRate * 100)}
            target={100}
            label=""
            size={90}
            color={SUPPLEMENT_ICON_COLOR}
          />
        </View>
      </SectionCard>

      <SectionCard icon="trophy-outline" iconColor={GAMIFICATION_ICON_COLOR} title={t('weeklyReport.sectionGamification')}>
        <Text style={styles.bigNumber}>{report.data.gamification.xpEarned}</Text>
        <Text style={styles.bigNumberLabel}>{t('weeklyReport.xpEarned', { amount: report.data.gamification.xpEarned })}</Text>

        <Text style={styles.detailText}>
          {t('weeklyReport.missionsCompleted', { count: report.data.gamification.missionsCompleted })}
        </Text>

        {report.data.gamification.levelUpOccurred ? (
          <View style={styles.levelUpCard}>
            <Ionicons name="sparkles" size={16} color={colors.brand.pulse} />
            <Text style={styles.levelUpText}>
              {t('weeklyReport.levelUpText', { level: report.data.gamification.currentLevel })}
            </Text>
          </View>
        ) : null}

        {report.data.gamification.streakBrokenOnDate ? (
          <Text style={styles.streakBrokenText}>
            {t('weeklyReport.streakBroken', { day: formatWeekdayShort(report.data.gamification.streakBrokenOnDate) })}
          </Text>
        ) : null}
      </SectionCard>

      {report.data.nutrition.highlightRecipe ? (
        <SectionCard icon="restaurant-outline" iconColor={colors.brand.pulse} title={t('weeklyReport.sectionHighlight')}>
          <HighlightRecipeCard recipe={report.data.nutrition.highlightRecipe} />
        </SectionCard>
      ) : null}
    </>
  ) : null;

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.header}>
          {navigation.canGoBack() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.back')}
              onPress={navigation.goBack}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={18} color={colors.text.primary} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{t('weeklyReport.title')}</Text>
        </View>

        {!showEmptyNoReports && selectedWeekStart ? (
          <View style={styles.weekSelector}>
            <Pressable
              accessibilityRole="button"
              disabled={!canGoOlder}
              onPress={handlePrev}
              style={styles.chevronButton}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.text.primary}
                style={!canGoOlder && styles.chevronDisabled}
              />
            </Pressable>
            <Text style={styles.weekRangeText}>{weekRangeLabel}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!canGoNewer}
              onPress={handleNext}
              style={styles.chevronButton}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.text.primary}
                style={!canGoNewer && styles.chevronDisabled}
              />
            </Pressable>
          </View>
        ) : null}

        {datesQuery.isLoading ? (
          <ReportSkeleton />
        ) : showEmptyNoReports || showReportNotFound ? (
          <EmptyState title={t('weeklyReport.emptyTitle')} subtitle={t('weeklyReport.emptySubtitle')} />
        ) : showReportError ? (
          <ErrorState onRetry={() => void reportQuery.refetch()} />
        ) : reportQuery.isLoading || !report ? (
          <ReportSkeleton />
        ) : (
          <>
            <SectionCard icon="nutrition-outline" iconColor={colors.brand.pulse} title={t('weeklyReport.sectionNutrition')}>
              <Text style={styles.bigNumber}>{report.data.nutrition.blendCount}</Text>
              <Text style={styles.bigNumberLabel}>{t('weeklyReport.totalBlends', { count: report.data.nutrition.blendCount })}</Text>

              <Text style={styles.detailText}>
                {t('weeklyReport.avgProtein', { amount: Math.round(report.data.nutrition.avgProteinPerDay) })}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${proteinProgress * 100}%` }]} />
              </View>

              <Text style={styles.detailText}>
                {t('weeklyReport.goalHitDays', { days: report.data.nutrition.proteinGoalHitDays })}
              </Text>
              <Text style={styles.detailText}>
                {t('weeklyReport.bestDay')} — {formatWeekdayShort(report.data.nutrition.bestDay.date)}{' '}
                ({Math.round(report.data.nutrition.bestDay.proteinAmount)}g)
              </Text>

              {report.previousWeekComparison ? (
                <ComparisonRow deltaPercent={report.previousWeekComparison.avgProteinPerDayDeltaPercent} />
              ) : null}
            </SectionCard>

            {isPro ? (
              restCards
            ) : (
              <View style={styles.blurredCluster}>
                <View pointerEvents="none">{restCards}</View>
                <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="box-none" style={styles.paywallOverlay}>
                  <View style={styles.paywallCard}>
                    <View style={styles.paywallBadge}>
                      <Text style={styles.paywallBadgeText}>{t('home.proPlan')}</Text>
                    </View>
                    <Text style={styles.paywallTitle}>{t('weeklyReport.paywallTitle')}</Text>
                    <Text style={styles.paywallSubtitle}>{t('weeklyReport.paywallSubtitle')}</Text>
                    <AuthButton onPress={() => navigation.navigate('Upgrade')} style={styles.paywallButton}>
                      {t('weeklyReport.paywallButton')}
                    </AuthButton>
                  </View>
                </View>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={handleSharePress}
              style={[styles.shareButton, !isPro && styles.shareButtonLocked]}
            >
              <Ionicons name="share-social-outline" size={18} color={colors.text.primary} />
              <Text style={styles.shareButtonText}>{t('weeklyReport.shareWeek')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {pendingShare ? (
        <WeeklyShareCard
          ref={shareCardRef}
          weekStart={pendingShare.weekStart}
          weekEnd={pendingShare.weekEnd}
          totalBlends={pendingShare.totalBlends}
          averageDailyProtein={pendingShare.averageDailyProtein}
          currentStreak={pendingShare.currentStreak}
          supplementAdherenceRate={pendingShare.supplementAdherenceRate}
          user={{
            userId: authUser?.id,
            name: authUser?.name ?? '',
            hasProfilePhoto: authUser?.hasProfilePhoto ?? false,
            profilePhotoUpdatedAt: authUser?.profilePhotoUpdatedAt ?? null,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
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
    fontSize: 18,
    color: colors.text.primary,
  },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chevronButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronDisabled: {
    opacity: CHEVRON_DISABLED_OPACITY,
  },
  weekRangeText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 14,
    color: colors.text.primary,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  bigNumber: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 28,
    color: colors.text.primary,
  },
  bigNumberLabel: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 13,
    color: SUBTITLE_COLOR,
    marginBottom: 10,
  },
  detailText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 13,
    color: colors.text.primary,
    opacity: 0.85,
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: PROGRESS_TRACK_COLOR,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.brand.pulse,
  },
  comparisonText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 12,
    marginTop: 2,
  },
  chartContainer: {
    overflow: 'hidden',
    marginBottom: 10,
    alignItems: 'center',
  },
  supplementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  supplementInfo: {
    flex: 1,
  },
  levelUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: LEVEL_UP_BACKGROUND,
  },
  levelUpText: {
    flex: 1,
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 13,
    color: colors.text.primary,
  },
  streakBrokenText: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 12,
    color: SUBTITLE_COLOR,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
  },
  shareButtonLocked: {
    opacity: 0.4,
  },
  shareButtonText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 14,
    color: colors.text.primary,
  },
  skeletonCard: {
    height: 140,
    borderRadius: 16,
    marginBottom: 12,
  },
  emptyState: {
    marginTop: 24,
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 14,
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 13,
    lineHeight: 18,
    color: SUBTITLE_COLOR,
    textAlign: 'center',
  },
  errorState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: SUBTITLE_COLOR,
  },
  retryButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
  },
  retryText: {
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: 12,
    color: colors.text.primary,
  },
  blurredCluster: {
    position: 'relative',
  },
  paywallOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  paywallCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PAYWALL_BORDER_COLOR,
    backgroundColor: PAYWALL_BACKGROUND,
    padding: 24,
    alignItems: 'center',
  },
  paywallBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: PAYWALL_BADGE_BACKGROUND,
    marginBottom: 12,
  },
  paywallBadgeText: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 14,
    color: PAYWALL_BADGE_TEXT_COLOR,
  },
  paywallTitle: {
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    fontSize: 18,
    color: colors.text.primary,
    textAlign: 'center',
  },
  paywallSubtitle: {
    marginTop: 8,
    marginBottom: 16,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    fontSize: 14,
    color: colors.text.primary,
    opacity: 0.7,
    textAlign: 'center',
  },
  paywallButton: {
    width: '100%',
  },
});
