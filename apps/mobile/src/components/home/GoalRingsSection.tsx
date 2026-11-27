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
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import { useUnits } from '../../hooks/useUnits';
import { StaleDataIndicator } from '../ui/StaleDataIndicator';
import { GoalRing } from '../ui/GoalRing';

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
  const colors = useColors();
  const HYDRATION_TRACK_COLOR = colors.overlay.plum[8];
  // CP-L1: mesma cor de meta batida da barra do Track (overlay.success[70]).
  const HYDRATION_FILL_COLOR = colors.overlay.info[70];
  const HYDRATION_GOAL_FILL_COLOR = colors.overlay.success[70];

  const { t } = useAppTranslation();
  const { formatDecimal } = useFormatNumbers();

  // CP-L1a: rótulo do leitor de tela de cada anel, no formato de número do
  // idioma e com "meta atingida" como na barra de água.
  const ringAccessibilityLabel = (label: string, current: number, target: number, unit: string) => {
    const values = { label, current: formatDecimal(current), target: formatDecimal(target), unit };
    return target > 0 && current >= target
      ? t('home.ringA11yGoalReached', values)
      : t('home.ringA11y', values);
  };
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

  const isHydrationGoalReached = hydrationTarget > 0 && hydrationCurrent >= hydrationTarget;

  // A cor acompanha a animação da largura: fica verde quando a barra chega
  // ao fim (progresso 1 = meta batida), sem animação nova.
  const hydrationAnimatedColor = hydrationAnimatedProgress.interpolate({
    inputRange: [0, 0.999, 1],
    outputRange: [HYDRATION_FILL_COLOR, HYDRATION_FILL_COLOR, HYDRATION_GOAL_FILL_COLOR],
  });

  const hydrationAnimatedWidth = hydrationAnimatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hydrationTrackWidth],
  });

  const hydrationLabelValues = {
    current: displayHydration(hydrationCurrent),
    target: displayHydration(hydrationTarget),
  };
  const hydrationProgressLabel = t('home.hydrationBar', hydrationLabelValues);
  const hydrationAccessibilityLabel = isHydrationGoalReached
    ? t('home.hydrationBarGoalReached', hydrationLabelValues)
    : hydrationProgressLabel;

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

  return (
    <View style={styles.section}>
      <View style={styles.ringsRow}>
        <View style={styles.sideRingSlot}>
          <GoalRing
            current={proteinCurrent}
            target={proteinTarget}
            label={t('home.proteinRing')}
            accessibilityLabel={ringAccessibilityLabel(t('home.proteinRing'), proteinCurrent, proteinTarget, t('common.units.grams'))}
            size={100}
          />
        </View>

        <View style={styles.centerRingSlot}>
          <GoalRing
            current={carbsCurrent}
            target={carbsTarget}
            label={t('home.carbsRing')}
            accessibilityLabel={ringAccessibilityLabel(t('home.carbsRing'), carbsCurrent, carbsTarget, t('common.units.grams'))}
            size={120}
          />
        </View>

        <View style={styles.sideRingSlot}>
          <GoalRing
            current={caloriesCurrent}
            target={calorieTarget}
            label={t('home.caloriesRing')}
            accessibilityLabel={ringAccessibilityLabel(t('home.caloriesRing'), caloriesCurrent, calorieTarget, t('common.units.kilocalories'))}
            size={100}
          />
        </View>
      </View>

      <View
        accessibilityLabel={hydrationAccessibilityLabel}
        style={styles.hydrationRow}
        testID="home-hydration-bar"
      >
        <Ionicons name="water-outline" size={14} color={colors.feedback.info} />

        <View style={styles.hydrationTrackWrapper}>
          <View onLayout={handleHydrationTrackLayout} style={styles.hydrationTrack}>
            <Animated.View
              style={[
                styles.hydrationFill,
                { width: hydrationAnimatedWidth, backgroundColor: hydrationAnimatedColor },
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