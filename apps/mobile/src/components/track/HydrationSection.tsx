import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';

import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useUnits } from '../../hooks/useUnits';
import { useNetworkStore } from '../../store/network.store';
import type { HydrationHistoryDailyBreakdownItem } from '../../services/hydration.service';
import { showToast } from '../../utils/toast.utils';
import { StaleDataIndicator } from '../ui/StaleDataIndicator';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const CARD_BACKGROUND = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const PROGRESS_TRACK = 'rgba(255,255,255,0.08)';
const PROGRESS_FILL = 'rgba(59,130,246,0.70)';
const BAR_DEFAULT_FILL = 'rgba(59,130,246,0.60)';
const BAR_GOAL_FILL = 'rgba(34,197,94,0.70)';
const LABEL_OPACITY = 0.5;
const BUTTON_BACKGROUND = 'rgba(255,255,255,0.07)';
const BUTTON_BORDER = 'rgba(255,255,255,0.10)';
const WATER_ICON_COLOR = 'rgba(59,130,246,0.80)';
const WATER_CONFIRMATION_AMOUNT_ML = 250;
const WATER_CONFIRMATION_DISTANCE = -20;
const WATER_CONFIRMATION_DURATION = 600;
const WATER_ICON_SCALE_UP = 1.4;
const WATER_OFFLINE_ICON_COLOR = 'rgba(255,255,255,0.82)';
const WATER_OFFLINE_ICON_SIZE = 10;
const CARD_RADIUS = 16;
const PROGRESS_RADIUS = 4;
const PROGRESS_HEIGHT = 8;
const QUICK_LOG_BUTTON_HEIGHT = 48;
const CHART_MAX_BAR_HEIGHT = 60;
const CHART_BAR_WIDTH = 16;
const HISTORY_DAYS = 7;
const BAR_ANIMATION_DURATION = 500;

type Locale = 'en' | 'pt-BR';

export interface HydrationSectionProps {
  todayTotal: number;
  dailyTarget: number;
  onLogWater: () => void | Promise<void>;
  history7Days: HydrationHistoryDailyBreakdownItem[];
  dataUpdatedAt: number;
}

function clampProgress(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(current / target, 1));
}

function getIntlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'pt-BR';
}

function buildTrailingSevenDays(history: HydrationHistoryDailyBreakdownItem[]): HydrationHistoryDailyBreakdownItem[] {
  const sortedHistory = [...history]
    .filter((item) => typeof item.date === 'string' && item.date.length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  const latestDateKey = sortedHistory.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const latestDate = new Date(`${latestDateKey}T00:00:00.000Z`);
  const historyByDate = new Map(sortedHistory.map((item) => [item.date, item]));

  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const date = new Date(latestDate);
    date.setUTCDate(latestDate.getUTCDate() - (HISTORY_DAYS - 1 - index));
    const dateKey = date.toISOString().slice(0, 10);

    return historyByDate.get(dateKey) ?? {
      date: dateKey,
      totalMl: 0,
    };
  });
}

function formatWeekdayLabel(dateKey: string, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(getIntlLocale(locale), {
    weekday: 'short',
  });
  const value = formatter.format(new Date(`${dateKey}T12:00:00`)).replace('.', '');

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function HydrationSection({
  todayTotal,
  dailyTarget,
  onLogWater,
  history7Days,
  dataUpdatedAt,
}: HydrationSectionProps) {
  const { t, locale } = useAppTranslation();
  const { displayHydration } = useUnits();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const waterScale = useRef(new Animated.Value(1)).current;
  const waterConfirmationOpacity = useRef(new Animated.Value(0)).current;
  const waterConfirmationTranslateY = useRef(new Animated.Value(0)).current;
  const offlineIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOfflineIndicator, setShowOfflineIndicator] = useState(false);
  const barAnimations = useRef(
    Array.from({ length: HISTORY_DAYS }, () => new Animated.Value(0))
  ).current;

  const progress = clampProgress(todayTotal, dailyTarget);
  const progressText = `${displayHydration(todayTotal)} / ${displayHydration(dailyTarget)}`;
  const quickLogAmount = displayHydration(WATER_CONFIRMATION_AMOUNT_ML);
  const chartData = useMemo(
    () => buildTrailingSevenDays(history7Days),
    [history7Days]
  );
  const maxPeriodTotal = useMemo(
    () => Math.max(...chartData.map((item) => item.totalMl), 0),
    [chartData]
  );

  useEffect(() => {
    let progressAnimationHandle: Animated.CompositeAnimation | null = null;

    progressAnimation.stopAnimation();
    progressAnimation.setValue(0);

    progressAnimationHandle = Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    progressAnimationHandle.start();

    return () => {
      progressAnimationHandle?.stop();
      progressAnimation.stopAnimation();
    };
  }, [progress, progressAnimation]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    barAnimations.forEach((animatedValue) => {
      animatedValue.stopAnimation();
      animatedValue.setValue(0);
    });

    animation = Animated.parallel(
      chartData.map((item, index) => {
        const targetHeight = maxPeriodTotal > 0
          ? (item.totalMl / maxPeriodTotal) * CHART_MAX_BAR_HEIGHT
          : 0;

        return Animated.timing(barAnimations[index], {
          toValue: targetHeight,
          duration: BAR_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        });
      })
    );

    animation.start();

    return () => {
      animation?.stop();
      barAnimations.forEach((animatedValue) => animatedValue.stopAnimation());
    };
  }, [barAnimations, chartData, maxPeriodTotal]);

  useEffect(() => {
    return () => {
      if (offlineIndicatorTimeoutRef.current) {
        clearTimeout(offlineIndicatorTimeoutRef.current);
      }

      waterScale.stopAnimation();
      waterConfirmationOpacity.stopAnimation();
      waterConfirmationTranslateY.stopAnimation();
    };
  }, [waterConfirmationOpacity, waterConfirmationTranslateY, waterScale]);

  const animateWaterConfirmation = (offlineFeedback: boolean) => {
    waterScale.stopAnimation();
    waterConfirmationOpacity.stopAnimation();
    waterConfirmationTranslateY.stopAnimation();

    if (offlineIndicatorTimeoutRef.current) {
      clearTimeout(offlineIndicatorTimeoutRef.current);
    }

    waterScale.setValue(1);
    waterConfirmationOpacity.setValue(1);
    waterConfirmationTranslateY.setValue(0);
    setShowOfflineIndicator(offlineFeedback);

    Animated.sequence([
      Animated.spring(waterScale, {
        toValue: WATER_ICON_SCALE_UP,
        stiffness: 320,
        damping: 16,
        mass: 0.45,
        useNativeDriver: true,
      }),
      Animated.spring(waterScale, {
        toValue: 1,
        stiffness: 260,
        damping: 18,
        mass: 0.4,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.timing(waterConfirmationOpacity, {
        toValue: 0,
        duration: WATER_CONFIRMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(waterConfirmationTranslateY, {
        toValue: WATER_CONFIRMATION_DISTANCE,
        duration: WATER_CONFIRMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();

    offlineIndicatorTimeoutRef.current = setTimeout(() => {
      setShowOfflineIndicator(false);
      offlineIndicatorTimeoutRef.current = null;
    }, WATER_CONFIRMATION_DURATION);
  };

  const handleLogWater = () => {
    const isOffline = !isConnected;

    animateWaterConfirmation(isOffline);

    if (isOffline) {
      showToast(t('common.actionRequiresConnection'));
      return;
    }

    void onLogWater();
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerBlock}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('track.hydration')}</Text>
          <Text style={styles.progressText}>{progressText}</Text>
        </View>
        <View style={styles.staleIndicatorAnchor}>
          <StaleDataIndicator dataUpdatedAt={dataUpdatedAt} />
        </View>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleLogWater}
        style={styles.logButton}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.waterConfirmation,
            {
              opacity: waterConfirmationOpacity,
              transform: [{ translateY: waterConfirmationTranslateY }],
            },
          ]}
        >
          <Text style={styles.waterConfirmationText}>
            {quickLogAmount === '—' ? quickLogAmount : `+${quickLogAmount}`}
          </Text>
          {showOfflineIndicator ? (
            <Ionicons
              name="cloud-offline-outline"
              size={WATER_OFFLINE_ICON_SIZE}
              color={WATER_OFFLINE_ICON_COLOR}
            />
          ) : null}
        </Animated.View>

        <View style={styles.logButtonContent}>
          <Animated.View style={{ transform: [{ scale: waterScale }] }}>
            <Ionicons name="water-outline" size={18} color={WATER_ICON_COLOR} />
          </Animated.View>
          <Text style={styles.logButtonLabel}>{t('track.logWater')}</Text>
        </View>
      </Pressable>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{t('track.last7Days')}</Text>
        {todayTotal >= dailyTarget ? (
          <Text style={styles.goalReachedLabel}>{t('track.goalReached')}</Text>
        ) : null}
      </View>

      <View style={styles.historyRow}>
        {chartData.map((item, index) => {
          const animatedHeight = barAnimations[index];
          const barColor = item.totalMl >= dailyTarget ? BAR_GOAL_FILL : BAR_DEFAULT_FILL;

          return (
            <View key={item.date} style={styles.barColumn}>
              <Svg width={CHART_BAR_WIDTH} height={CHART_MAX_BAR_HEIGHT}>
                <AnimatedRect
                  x={0}
                  width={CHART_BAR_WIDTH}
                  rx={4}
                  fill={barColor}
                  height={animatedHeight}
                  y={animatedHeight.interpolate({
                    inputRange: [0, CHART_MAX_BAR_HEIGHT],
                    outputRange: [CHART_MAX_BAR_HEIGHT, 0],
                  })}
                />
              </Svg>
              <Text style={styles.barLabel}>{formatWeekdayLabel(item.date, locale)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerBlock: {
    position: 'relative',
    paddingBottom: spacing.lg,
  },
  title: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  progressText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
    opacity: 0.85,
  },
  staleIndicatorAnchor: {
    position: 'relative',
    width: '100%',
    minHeight: 12,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_RADIUS,
    backgroundColor: PROGRESS_TRACK,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: PROGRESS_RADIUS,
    backgroundColor: PROGRESS_FILL,
  },
  logButton: {
    height: QUICK_LOG_BUTTON_HEIGHT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BUTTON_BORDER,
    backgroundColor: BUTTON_BACKGROUND,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    overflow: 'visible',
  },
  logButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  logButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  waterConfirmation: {
    position: 'absolute',
    top: -spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  waterConfirmationText: {
    color: WATER_ICON_COLOR,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    opacity: LABEL_OPACITY,
  },
  goalReachedLabel: {
    color: colors.feedback.success,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
    opacity: LABEL_OPACITY,
  },
});