import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  InteractionManager,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import {
  GOAL_RING_ANIMATION_DURATION,
  HOME_INTERACTION_DELAY,
} from '../../config/cache.config';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useUnits } from '../../hooks/useUnits';
import { StaleDataIndicator } from '../ui/StaleDataIndicator';
import { GoalRing } from '../ui/GoalRing';

const HYDRATION_TRACK_COLOR = 'rgba(255,255,255,0.08)';
const HYDRATION_FILL_COLOR = 'rgba(59,130,246,0.70)';
const HYDRATION_TEXT_OPACITY = 0.6;
const HYDRATION_BAR_HEIGHT = 6;
const HYDRATION_BAR_RADIUS = 3;
const HYDRATION_BAR_SPACING = 20;
const GOAL_RING_ANIMATION_DURATION_MS: number = GOAL_RING_ANIMATION_DURATION;
const HOME_INTERACTION_DELAY_MS: number = HOME_INTERACTION_DELAY;

export interface GoalRingsSectionProps {
  proteinCurrent: number;
  proteinTarget: number;
  carbsCurrent: number;
  carbsTarget: number;
  caloriesCurrent: number;
  calorieTarget: number;
  hydrationCurrent: number;
  hydrationTarget: number;
  dataUpdatedAt: number;
}

function clampProgress(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(current / target, 1));
}

export function GoalRingsSection({
  proteinCurrent,
  proteinTarget,
  carbsCurrent,
  carbsTarget,
  caloriesCurrent,
  calorieTarget,
  hydrationCurrent,
  hydrationTarget,
  dataUpdatedAt,
}: GoalRingsSectionProps) {
  const { t } = useAppTranslation();
  const { displayHydration } = useUnits();
  const [hydrationTrackWidth, setHydrationTrackWidth] = useState(0);
  const hydrationProgress = useMemo(
    () => clampProgress(hydrationCurrent, hydrationTarget),
    [hydrationCurrent, hydrationTarget]
  );
  const hydrationAnimatedProgress = useRef(new Animated.Value(0)).current;
  const hasMounted = useRef(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let hydrationAnimation: Animated.CompositeAnimation | null = null;

    if (!hasMounted.current) {
      hasMounted.current = true;
      hydrationAnimatedProgress.setValue(0);
    }

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        hydrationAnimation = Animated.timing(hydrationAnimatedProgress, {
          toValue: hydrationProgress,
          duration: GOAL_RING_ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        });

        hydrationAnimation.start();
      }, HOME_INTERACTION_DELAY_MS);
    });

    return () => {
      interactionTask.cancel();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      hydrationAnimation?.stop();
      hydrationAnimatedProgress.stopAnimation();
    };
  }, [hydrationAnimatedProgress, hydrationProgress]);

  const handleHydrationTrackLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setHydrationTrackWidth((currentWidth) => (
      currentWidth === nextWidth ? currentWidth : nextWidth
    ));
  };

  const hydrationAnimatedWidth = hydrationAnimatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hydrationTrackWidth],
  });

  const hydrationProgressLabel = t('home.hydrationBar', {
    current: displayHydration(hydrationCurrent),
    target: displayHydration(hydrationTarget),
  });

  return (
    <View style={styles.section}>
      <View style={styles.ringsRow}>
        <View style={styles.sideRingSlot}>
          <GoalRing
            current={proteinCurrent}
            target={proteinTarget}
            label={t('home.proteinRing')}
            size={100}
          />
        </View>

        <View style={styles.centerRingSlot}>
          <GoalRing
            current={carbsCurrent}
            target={carbsTarget}
            label={t('home.carbsRing')}
            size={120}
          />
        </View>

        <View style={styles.sideRingSlot}>
          <GoalRing
            current={caloriesCurrent}
            target={calorieTarget}
            label={t('home.caloriesRing')}
            size={100}
          />
        </View>
      </View>

      <View
        accessibilityLabel={hydrationProgressLabel}
        style={styles.hydrationRow}
      >
        <Ionicons name="water-outline" size={14} color={colors.feedback.info} />

        <View style={styles.hydrationTrackWrapper}>
          <View onLayout={handleHydrationTrackLayout} style={styles.hydrationTrack}>
            <Animated.View
              style={[
                styles.hydrationFill,
                { width: hydrationAnimatedWidth },
              ]}
            />
          </View>
        </View>

        <Text style={styles.hydrationText}>
          {hydrationProgressLabel}
        </Text>
      </View>

      <View style={styles.staleIndicatorAnchor}>
        <StaleDataIndicator dataUpdatedAt={dataUpdatedAt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    position: 'relative',
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideRingSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRingSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
  },
  hydrationRow: {
    marginTop: HYDRATION_BAR_SPACING,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hydrationTrackWrapper: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.md,
  },
  hydrationTrack: {
    height: HYDRATION_BAR_HEIGHT,
    borderRadius: HYDRATION_BAR_RADIUS,
    backgroundColor: HYDRATION_TRACK_COLOR,
    overflow: 'hidden',
  },
  hydrationFill: {
    height: HYDRATION_BAR_HEIGHT,
    borderRadius: HYDRATION_BAR_RADIUS,
    backgroundColor: HYDRATION_FILL_COLOR,
  },
  hydrationText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    opacity: HYDRATION_TEXT_OPACITY,
  },
  staleIndicatorAnchor: {
    position: 'relative',
    alignSelf: 'center',
    width: '100%',
    minHeight: spacing.xl,
    marginTop: spacing.sm,
  },
});