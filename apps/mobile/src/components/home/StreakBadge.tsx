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
  spacing,
} from '@blendi/shared';
import { imagePlaceholderStyles } from '../../assets';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const SWIRL_SIZE = 28;
const ENTRY_DURATION = 320;
const ENTRY_INITIAL_SCALE = 0.92;
const STAGE_ONE_OPACITY = 0.5;
const STAGE_TWO_OPACITY = 1;
const STAGE_THREE_ROTATION_DURATION = 3000;
const LABEL_OPACITY = 0.6;

export interface StreakBadgeProps {
  streakDays: number;
}

function getStageOpacity(streakDays: number): number {
  if (streakDays >= 7) {
    return STAGE_TWO_OPACITY;
  }

  return STAGE_ONE_OPACITY;
}

export function StreakBadge({ streakDays }: StreakBadgeProps) {
  const { t } = useAppTranslation();
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryScale = useRef(new Animated.Value(ENTRY_INITIAL_SCALE)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  const isLegendaryStage = streakDays >= 30;

  useEffect(() => {
    let entryAnimation: Animated.CompositeAnimation | null = null;

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      entryAnimation = Animated.parallel([
        Animated.timing(entryOpacity, {
          toValue: 1,
          duration: ENTRY_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(entryScale, {
          toValue: 1,
          duration: ENTRY_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

      entryAnimation.start();
    });

    return () => {
      interactionTask.cancel();
      entryAnimation?.stop();
      entryOpacity.stopAnimation();
      entryScale.stopAnimation();
    };
  }, [entryOpacity, entryScale]);

  useEffect(() => {
    if (!isLegendaryStage) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return;
    }

    rotation.setValue(0);
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: STAGE_THREE_ROTATION_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      rotation.stopAnimation();
    };
  }, [isLegendaryStage, rotation]);

  const rotationValue = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const swirlPlaceholder = (
    <View
      style={[
        styles.swirlPlaceholder,
        imagePlaceholderStyles.swirl,
        { opacity: isLegendaryStage ? STAGE_TWO_OPACITY : getStageOpacity(streakDays) },
      ]}
    />
  );

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: entryOpacity,
          transform: [{ scale: entryScale }],
        },
      ]}
    >
      {/* TODO: substituir por Image quando swirl.png for adicionado a assets/images/. */}
      {isLegendaryStage ? (
        <Animated.View style={{ transform: [{ rotate: rotationValue }] }}>
          {swirlPlaceholder}
        </Animated.View>
      ) : swirlPlaceholder}

      <View style={styles.textBlock}>
        <Text style={styles.streakValue}>{streakDays}</Text>
        <Text style={styles.streakLabel}>{t('home.dayStreak')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  swirlPlaceholder: {
    width: SWIRL_SIZE,
    height: SWIRL_SIZE,
    borderRadius: 999,
  },
  textBlock: {
    marginLeft: spacing.md,
    gap: spacing.xs,
  },
  streakValue: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: fontWeights.bold,
    lineHeight: 28,
  },
  streakLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    opacity: LABEL_OPACITY,
    lineHeight: 18,
  },
});