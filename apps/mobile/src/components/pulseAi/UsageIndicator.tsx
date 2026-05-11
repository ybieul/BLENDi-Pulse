import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const DAILY_QUERY_LIMIT = 3;
const DOT_SIZE = 8;
const FILLED_DOT_COLOR = 'rgba(154,72,147,0.92)';
const FILLED_DOT_BORDER = 'rgba(154,72,147,1)';
const OUTLINED_DOT_BORDER = 'rgba(255,255,255,0.26)';
const OUTLINED_DOT_BACKGROUND = 'transparent';
const TEXT_OPACITY = 0.68;
const ANIMATION_FADE_START = 0.45;
const ANIMATION_SCALE_START = 0.84;
const ANIMATION_DURATION_MS = 220;

interface DotAnimation {
  opacity: Animated.Value;
  scale: Animated.Value;
}

export interface UsageIndicatorProps {
  usageRemaining: number | null;
}

function clampUsageRemaining(usageRemaining: number): number {
  return Math.max(0, Math.min(DAILY_QUERY_LIMIT, usageRemaining));
}

function buildDotAnimations(): DotAnimation[] {
  return Array.from({ length: DAILY_QUERY_LIMIT }, () => ({
    opacity: new Animated.Value(1),
    scale: new Animated.Value(1),
  }));
}

export function UsageIndicator({ usageRemaining }: UsageIndicatorProps) {
  const { t } = useAppTranslation();
  const dotAnimations = useRef(buildDotAnimations()).current;
  const previousUsedCount = useRef<number | null>(null);
  const clampedRemaining = usageRemaining == null ? DAILY_QUERY_LIMIT : clampUsageRemaining(usageRemaining);
  const usedCount = DAILY_QUERY_LIMIT - clampedRemaining;
  const shouldRender = usageRemaining != null && clampedRemaining > 0;

  useEffect(() => {
    if (usageRemaining == null) {
      previousUsedCount.current = null;
      return;
    }

    if (previousUsedCount.current == null) {
      previousUsedCount.current = usedCount;
      return;
    }

    if (previousUsedCount.current === usedCount) {
      return;
    }

    const startIndex = Math.min(previousUsedCount.current, usedCount);
    const endIndex = Math.max(previousUsedCount.current, usedCount);

    for (let index = startIndex; index < endIndex; index += 1) {
      const animation = dotAnimations[index];

      animation.opacity.stopAnimation();
      animation.scale.stopAnimation();
      animation.opacity.setValue(ANIMATION_FADE_START);
      animation.scale.setValue(ANIMATION_SCALE_START);

      Animated.parallel([
        Animated.timing(animation.opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.spring(animation.scale, {
          toValue: 1,
          stiffness: 320,
          damping: 22,
          mass: 0.5,
          useNativeDriver: true,
        }),
      ]).start();
    }

    previousUsedCount.current = usedCount;
  }, [dotAnimations, usageRemaining, usedCount]);

  if (!shouldRender) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {dotAnimations.map((animation, index) => {
          const isUsed = index < usedCount;

          return (
            <Animated.View
              key={`usage-dot-${index}`}
              style={{
                opacity: animation.opacity,
                transform: [{ scale: animation.scale }],
              }}
            >
              <View
                style={[
                  styles.dot,
                  isUsed ? styles.dotUsed : styles.dotRemaining,
                ]}
              />
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.label}>{t('pulseAi.queriesRemaining', { count: clampedRemaining })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
  },
  dotUsed: {
    backgroundColor: FILLED_DOT_COLOR,
    borderColor: FILLED_DOT_BORDER,
  },
  dotRemaining: {
    backgroundColor: OUTLINED_DOT_BACKGROUND,
    borderColor: OUTLINED_DOT_BORDER,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    opacity: TEXT_OPACITY,
  },
});