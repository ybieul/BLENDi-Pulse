import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@blendi/shared';

const DOT_SIZE = 6;
const DOT_GAP = 6;
const CURRENT_SCALE = 1.3;

export interface AuthProgressDotsProps {
  /** Etapa atual em base 1. */
  currentStep: number;
  totalSteps: number;
}

function resolveDotState(index: number, currentStep: number): 0 | 1 | 2 {
  const stepNumber = index + 1;

  if (stepNumber === currentStep) {
    return 2;
  }

  if (stepNumber < currentStep) {
    return 1;
  }

  return 0;
}

export function AuthProgressDots({ currentStep, totalSteps }: AuthProgressDotsProps) {
  const clampedTotalSteps = Math.max(0, totalSteps);
  const clampedCurrentStep = clampedTotalSteps === 0
    ? 0
    : Math.min(Math.max(currentStep, 1), clampedTotalSteps);

  const animatedStatesRef = useRef<Animated.Value[]>([]);

  if (animatedStatesRef.current.length !== clampedTotalSteps) {
    animatedStatesRef.current = Array.from({ length: clampedTotalSteps }, (_, index) => {
      const existing = animatedStatesRef.current[index];
      if (existing) {
        return existing;
      }

      return new Animated.Value(resolveDotState(index, clampedCurrentStep));
    });
  }

  useEffect(() => {
    animatedStatesRef.current.forEach((animatedState, index) => {
      Animated.spring(animatedState, {
        toValue: resolveDotState(index, clampedCurrentStep),
        stiffness: 320,
        damping: 24,
        mass: 0.6,
        useNativeDriver: true,
      }).start();
    });
  }, [clampedCurrentStep, clampedTotalSteps]);

  if (clampedTotalSteps === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {animatedStatesRef.current.map((animatedState, index) => {
        const state = resolveDotState(index, clampedCurrentStep);
        const backgroundColor = state === 0 ? colors.text.tertiary : colors.brand.pulse;
        const opacity = animatedState.interpolate({
          inputRange: [0, 1, 2],
          outputRange: [0.3, 0.4, 1],
        });
        const scale = animatedState.interpolate({
          inputRange: [0, 1, 2],
          outputRange: [1, 1, CURRENT_SCALE],
        });

        return (
          <Animated.View
            key={`auth-progress-dot-${index}`}
            style={[
              styles.dot,
              {
                backgroundColor,
                opacity,
                transform: [{ scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});