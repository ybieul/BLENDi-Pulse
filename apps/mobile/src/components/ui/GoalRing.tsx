import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  InteractionManager,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
} from '@blendi/shared';
import {
  GOAL_RING_ANIMATION_DURATION,
  HOME_INTERACTION_DELAY,
} from '../../config/cache.config';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import { getRingGeometry, RingArc } from './RingArc';

const LABEL_OPACITY = 0.6;
const SEPARATOR_OPACITY = 0.45;
const CELEBRATION_SCALE = 1.05;
const CELEBRATION_STEP_DURATION = 140;
const GOAL_RING_ANIMATION_DURATION_MS: number = GOAL_RING_ANIMATION_DURATION;
const HOME_INTERACTION_DELAY_MS: number = HOME_INTERACTION_DELAY;

export interface GoalRingProps {
  current: number;
  target: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Quando false, pula a animação de preenchimento progressivo e renderiza
   * o arco já no valor final — usado em snapshots estáticos (ex: relatório
   * semanal) onde não há "chegada" do valor para celebrar. Padrão: true. */
  animate?: boolean;
}

function clampProgress(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(current / target, 1));
}

function createCelebrationAnimation(scale: Animated.Value): Animated.CompositeAnimation {
  return Animated.sequence(
    Array.from({ length: 3 }, () =>
      Animated.sequence([
        Animated.timing(scale, {
          toValue: CELEBRATION_SCALE,
          duration: CELEBRATION_STEP_DURATION,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: CELEBRATION_STEP_DURATION,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )
  );
}

export function GoalRing({
  current,
  target,
  label,
  size = 110,
  strokeWidth = 8,
  color = colors.brand.pulse,
  animate = true,
}: GoalRingProps) {
  const themeColors = useColors();
  const TRACK_STROKE = themeColors.overlay.plum[8];

  const { formatDecimal } = useFormatNumbers();
  const progress = clampProgress(current, target);
  const isComplete = progress >= 1;
  const ringColor = isComplete ? themeColors.feedback.success : color;

  const { circumference } = getRingGeometry(size, strokeWidth);
  const targetDashOffset = circumference * (1 - progress);

  const dashOffset = useRef(new Animated.Value(circumference)).current;
  const celebrationScale = useRef(new Animated.Value(1)).current;
  const hasMounted = useRef(false);

  useEffect(() => {
    celebrationScale.setValue(1);

    if (!animate) {
      dashOffset.setValue(targetDashOffset);
      hasMounted.current = true;
      return;
    }

    if (!hasMounted.current) {
      hasMounted.current = true;
      dashOffset.setValue(circumference);
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let ringAnimation: Animated.CompositeAnimation | null = null;
    let celebrationAnimation: Animated.CompositeAnimation | null = null;

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        ringAnimation = Animated.timing(dashOffset, {
          toValue: targetDashOffset,
          duration: GOAL_RING_ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        });

        ringAnimation.start(({ finished }) => {
          if (!finished || !isComplete) {
            return;
          }

          celebrationAnimation = createCelebrationAnimation(celebrationScale);
          celebrationAnimation.start();
        });
      }, HOME_INTERACTION_DELAY_MS);
    });

    return () => {
      interactionTask.cancel();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      ringAnimation?.stop();
      celebrationAnimation?.stop();
      dashOffset.stopAnimation();
      celebrationScale.stopAnimation();
    };
  }, [
    animate,
    celebrationScale,
    circumference,
    dashOffset,
    isComplete,
    targetDashOffset,
  ]);

  const valueFontSize = Math.max(size * 0.19, fontSizes.xl);
  const targetFontSize = Math.max(size * 0.105, fontSizes.sm);

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      color: themeColors.text.primary,
      lineHeight: fontSizes['3xl'],
    },
    currentValue: {
      color: themeColors.text.primary,
      fontFamily: fonts.display,
      fontWeight: fontWeights.bold,
    },
    separator: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontWeight: fontWeights.regular,
      opacity: SEPARATOR_OPACITY,
      marginHorizontal: 2,
    },
    targetValue: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontWeight: fontWeights.regular,
      opacity: 0.9,
    },
    label: {
      marginTop: 2,
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: fontWeights.regular,
      opacity: LABEL_OPACITY,
    },
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ scale: celebrationScale }],
        },
      ]}
    >
      <RingArc
        size={size}
        strokeWidth={strokeWidth}
        color={ringColor}
        trackColor={TRACK_STROKE}
        dashOffset={dashOffset}
      />

      <View pointerEvents="none" style={styles.content}>
        <Text style={[styles.valueRow, { fontSize: valueFontSize }]}>
          <Text style={[styles.currentValue, { fontSize: valueFontSize }]}>
            {formatDecimal(current)}
          </Text>
          <Text style={[styles.separator, { fontSize: targetFontSize }]}>
            /
          </Text>
          <Text style={[styles.targetValue, { fontSize: targetFontSize }]}>
            {formatDecimal(target)}
          </Text>
        </Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}
