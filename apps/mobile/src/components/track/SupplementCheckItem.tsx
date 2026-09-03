import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  borderRadius,
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { SupplementStackItem } from '../../services/supplementStack.service';

const CONTAINER_BACKGROUND = 'rgba(255,255,255,0.06)';
const CONTAINER_BORDER = 'rgba(255,255,255,0.08)';
const UNCHECKED_BORDER = 'rgba(255,255,255,0.25)';
const SECONDARY_TEXT_OPACITY = 0.6;
const CHECK_CIRCLE_SIZE = spacing['2xl'] + spacing.md;
const CHECK_CIRCLE_BORDER_WIDTH = spacing.xs;
const ITEM_HEIGHT = spacing['7xl'];
const ITEM_PADDING = spacing.lg + spacing.xs;
const CHECK_ICON_SIZE = 16;
const COUNT_INSIDE_SIZE = 14;
const TOGGLE_ANIMATION_DURATION_MS = 200;
const RIGHT_ZONE_WIDTH = 64;
const PROGRESS_SCALE = 1.12;

function triggerLightHaptic() {
  if (Platform.OS === 'web') {
    return;
  }

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

const TIMING_TRANSLATION_KEYS = {
  morning: 'track.timingMorning',
  preWorkout: 'track.timingPreWorkout',
  postWorkout: 'track.timingPostWorkout',
  evening: 'track.timingEvening',
  withMeal: 'track.timingWithMeal',
} as const;

export interface SupplementCheckItemProps {
  supplement: SupplementStackItem;
  onIncrement: () => void;
  onDecrement: () => void;
  /** `isPending` da mutation compartilhada de progresso — desabilita o check enquanto uma chamada está em voo. */
  isCheckPending?: boolean;
}

export function SupplementCheckItem({
  supplement,
  onIncrement,
  onDecrement,
  isCheckPending = false,
}: SupplementCheckItemProps) {
  const { t } = useAppTranslation();
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
  const consumedTodayCount =
    normalizedConsumedTodayCount <= 0
      ? 0
      : normalizedConsumedTodayCount >= dailyTargetCount
        ? dailyTargetCount
        : normalizedConsumedTodayCount;
  const progressRatio = consumedTodayCount / dailyTargetCount;
  const isComplete = consumedTodayCount >= dailyTargetCount;
  const progressValue = useRef(new Animated.Value(progressRatio)).current;
  const progressScale = useRef(new Animated.Value(1)).current;
  const hasMounted = useRef(false);
  const previousConsumedCountRef = useRef(consumedTodayCount);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      progressValue.setValue(progressRatio);
      progressScale.setValue(1);
      previousConsumedCountRef.current = consumedTodayCount;
      return;
    }

    Animated.timing(progressValue, {
      toValue: progressRatio,
      duration: TOGGLE_ANIMATION_DURATION_MS,
      useNativeDriver: false,
    }).start();

    if (consumedTodayCount > previousConsumedCountRef.current) {
      Animated.sequence([
        Animated.spring(progressScale, {
          toValue: PROGRESS_SCALE,
          stiffness: 320,
          damping: 18,
          mass: 0.45,
          useNativeDriver: false,
        }),
        Animated.spring(progressScale, {
          toValue: 1,
          stiffness: 300,
          damping: 20,
          mass: 0.45,
          useNativeDriver: false,
        }),
      ]).start();
    }

    previousConsumedCountRef.current = consumedTodayCount;

    return () => {
      progressScale.stopAnimation();
    };
  }, [consumedTodayCount, progressRatio, progressScale, progressValue]);

  const handleIncrement = () => {
    if (consumedTodayCount >= dailyTargetCount) {
      return;
    }

    triggerLightHaptic();
    onIncrement();
  };

  const handleDecrement = () => {
    if (consumedTodayCount <= 0) {
      return;
    }

    triggerLightHaptic();
    onDecrement();
  };

  const timingLabel = t(TIMING_TRANSLATION_KEYS[supplement.timing]);
  const progressLabel = `${consumedTodayCount}/${dailyTargetCount}`;

  return (
    <View style={styles.container}>
      <View style={styles.leftZone}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${supplement.name} ${progressLabel}`}
          accessibilityHint="Toque para adicionar uma dose. Segure para desfazer uma dose."
          disabled={isCheckPending}
          hitSlop={spacing.md}
          delayLongPress={220}
          onLongPress={handleDecrement}
          onPress={handleIncrement}
          style={styles.checkPressable}
        >
          <Animated.View
            style={[
              styles.checkCircle,
              {
                borderColor: progressValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [UNCHECKED_BORDER, colors.brand.pulse],
                }),
                backgroundColor: progressValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(0,0,0,0)', colors.brand.pulse],
                }),
                transform: [{ scale: progressScale }],
              },
            ]}
          >
            {isComplete ? (
              <Ionicons name="checkmark" size={CHECK_ICON_SIZE} color={colors.text.primary} />
            ) : consumedTodayCount > 0 ? (
              <Text style={styles.countInsideText}>{consumedTodayCount}</Text>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.contentZone}>
        <Text numberOfLines={1} style={styles.nameText}>
          {supplement.name}
        </Text>

        <Text numberOfLines={1} style={styles.metaText}>
          {`${supplement.dosage} · ${timingLabel}`}
        </Text>
      </View>

      <View style={styles.rightZone}>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.progressCountText,
            isComplete && styles.progressCountTextComplete,
            consumedTodayCount > 0 && !isComplete && styles.progressCountTextPartial,
            { transform: [{ scale: progressScale }] },
          ]}
        >
          {progressLabel}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ITEM_HEIGHT,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: CONTAINER_BORDER,
    backgroundColor: CONTAINER_BACKGROUND,
    padding: ITEM_PADDING,
  },
  leftZone: {
    width: CHECK_CIRCLE_SIZE,
    marginRight: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: CHECK_CIRCLE_SIZE,
    height: CHECK_CIRCLE_SIZE,
    borderRadius: CHECK_CIRCLE_SIZE / 2,
    borderWidth: CHECK_CIRCLE_BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countInsideText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: COUNT_INSIDE_SIZE,
    fontWeight: fontWeights.bold,
  },
  contentZone: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  nameText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    lineHeight: 18,
  },
  metaText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    lineHeight: 16,
    opacity: SECONDARY_TEXT_OPACITY,
  },
  rightZone: {
    width: RIGHT_ZONE_WIDTH,
    marginLeft: spacing.md,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  progressCountText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    opacity: 0.5,
  },
  progressCountTextPartial: {
    color: colors.brand.pulse,
    opacity: 1,
  },
  progressCountTextComplete: {
    color: colors.feedback.success,
    opacity: 1,
  },
});