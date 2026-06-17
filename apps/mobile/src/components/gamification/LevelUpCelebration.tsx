import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useGamificationStore } from '../../store/gamification.store';

const PARTICLE_COUNT = 15;
const PARTICLE_DISTANCE_Y = -120;
const PARTICLE_DISTANCE_X = 80;
const PARTICLE_DURATION = 1200;
const PARTICLE_STAGGER = 30;
const SETTLE_DELAY = 100;
const PARTICLE_START_DELAY = 150;
const AUTO_CLOSE_DELAY = 3000;
const OVERLAY_COLOR = 'rgba(0,0,0,0.84)';
const CARD_BACKGROUND_COLOR = 'rgba(28,12,26,0.98)';
const CARD_BORDER_COLOR = 'rgba(211,120,203,0.92)';
const CARD_SHADOW_COLOR = '#000000';
const PARTICLE_COLORS = [
  colors.brand.pulse,
  'rgba(245,158,11,0.90)',
  'rgba(34,197,94,0.80)',
] as const;

type AnimationEndCallback = NonNullable<Parameters<Animated.CompositeAnimation['start']>[0]>;

type ParticleAnimationValues = {
  translateY: Animated.Value;
  translateX: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
};

function createParticleAnimationValues(): ParticleAnimationValues {
  return {
    translateY: new Animated.Value(0),
    translateX: new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(0),
  };
}

function getParticleColor(index: number): string {
  return PARTICLE_COLORS[index % PARTICLE_COLORS.length] ?? colors.brand.pulse;
}

export function LevelUpCelebration() {
  const { t } = useAppTranslation();
  const levelUpData = useGamificationStore((state) => state.levelUpData);
  const dismissLevelUp = useGamificationStore((state) => state.dismissLevelUp);

  const overlayOpacity = useRef(new Animated.Value(0));
  const cardScale = useRef(new Animated.Value(0));
  const cardOpacity = useRef(new Animated.Value(0));
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => createParticleAnimationValues())
  );

  const activeAnimationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particlesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (particlesTimeoutRef.current) {
      clearTimeout(particlesTimeoutRef.current);
      particlesTimeoutRef.current = null;
    }

    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
  }, []);

  const stopAnimations = useCallback(() => {
    activeAnimationsRef.current.forEach((animation) => {
      animation.stop();
    });

    activeAnimationsRef.current = [];
  }, []);

  const resetAnimatedValues = useCallback(() => {
    overlayOpacity.current.setValue(0);
    cardScale.current.setValue(0);
    cardOpacity.current.setValue(0);

    particles.current.forEach((particle) => {
      particle.translateY.setValue(0);
      particle.translateX.setValue(0);
      particle.opacity.setValue(0);
      particle.scale.setValue(0);
    });
  }, []);

  const startTrackedAnimation = useCallback(
    (animation: Animated.CompositeAnimation, onComplete?: AnimationEndCallback) => {
      activeAnimationsRef.current.push(animation);

      animation.start((result) => {
        activeAnimationsRef.current = activeAnimationsRef.current.filter(
          (trackedAnimation) => trackedAnimation !== animation
        );

        onComplete?.(result);
      });
    },
    []
  );

  const finishClose = useCallback(() => {
    stopAnimations();
    resetAnimatedValues();
    isClosingRef.current = false;
    dismissLevelUp();
  }, [dismissLevelUp, resetAnimatedValues, stopAnimations]);

  const handleClose = useCallback(() => {
    if (levelUpData === null || isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    clearTimers();
    stopAnimations();

    startTrackedAnimation(
      Animated.parallel([
        Animated.timing(overlayOpacity.current, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity.current, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      ({ finished }) => {
        if (finished) {
          finishClose();
          return;
        }

        isClosingRef.current = false;
        resetAnimatedValues();
      }
    );
  }, [clearTimers, finishClose, levelUpData, resetAnimatedValues, startTrackedAnimation, stopAnimations]);

  useEffect(() => {
    if (levelUpData === null) {
      clearTimers();
      stopAnimations();
      resetAnimatedValues();
      isClosingRef.current = false;
      return undefined;
    }

    isClosingRef.current = false;
    clearTimers();
    stopAnimations();
    resetAnimatedValues();

    startTrackedAnimation(
      Animated.parallel([
        Animated.timing(overlayOpacity.current, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale.current, {
          toValue: 1.05,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity.current, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ])
    );

    settleTimeoutRef.current = setTimeout(() => {
      if (isClosingRef.current) {
        return;
      }

      startTrackedAnimation(
        Animated.spring(cardScale.current, {
          toValue: 1,
          tension: 120,
          friction: 12,
          useNativeDriver: true,
        })
      );
    }, SETTLE_DELAY);

    particlesTimeoutRef.current = setTimeout(() => {
      if (isClosingRef.current) {
        return;
      }

      particles.current.forEach((particle, index) => {
        const angle = (index * 2 * Math.PI) / PARTICLE_COUNT;

        particle.translateY.setValue(0);
        particle.translateX.setValue(0);
        particle.opacity.setValue(1);
        particle.scale.setValue(1);

        startTrackedAnimation(
          Animated.parallel([
            Animated.timing(particle.translateY, {
              toValue: PARTICLE_DISTANCE_Y,
              duration: PARTICLE_DURATION,
              delay: index * PARTICLE_STAGGER,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(particle.translateX, {
              toValue: Math.cos(angle) * PARTICLE_DISTANCE_X,
              duration: PARTICLE_DURATION,
              delay: index * PARTICLE_STAGGER,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(particle.opacity, {
              toValue: 0,
              duration: PARTICLE_DURATION,
              delay: index * PARTICLE_STAGGER,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(particle.scale, {
              toValue: 0.3,
              duration: PARTICLE_DURATION,
              delay: index * PARTICLE_STAGGER,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ])
        );
      });
    }, PARTICLE_START_DELAY);

    autoCloseTimeoutRef.current = setTimeout(() => {
      handleClose();
    }, AUTO_CLOSE_DELAY);

    return () => {
      clearTimers();
      stopAnimations();
      isClosingRef.current = false;
    };
  }, [clearTimers, handleClose, levelUpData, resetAnimatedValues, startTrackedAnimation, stopAnimations]);

  if (levelUpData === null) {
    return null;
  }

  return (
    <TouchableWithoutFeedback onPress={handleClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: overlayOpacity.current }]} />
        <View style={styles.centerContent}>
          {particles.current.map((particle, index) => (
            <Animated.View
              key={`level-up-particle-${index}`}
              style={[
                styles.particle,
                {
                  backgroundColor: getParticleColor(index),
                  opacity: particle.opacity,
                  transform: [
                    { translateY: particle.translateY },
                    { translateX: particle.translateX },
                    { scale: particle.scale },
                  ],
                },
              ]}
            />
          ))}

          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity.current,
                transform: [{ scale: cardScale.current }],
              },
            ]}
          >
            <Text style={styles.levelNumber}>{levelUpData.newLevel}</Text>
            <Text style={styles.levelName}>
              {t(levelUpData.newLevelNameKey, { level: levelUpData.newLevel })}
            </Text>
            <Text style={styles.levelUpTitle}>{t('gamification.levelUpTitle')}</Text>
          </Animated.View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: OVERLAY_COLOR,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  card: {
    width: 280,
    padding: 32,
    borderRadius: 24,
    backgroundColor: CARD_BACKGROUND_COLOR,
    borderWidth: 1.5,
    borderColor: CARD_BORDER_COLOR,
    alignItems: 'center',
    shadowColor: CARD_SHADOW_COLOR,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
  },
  levelNumber: {
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 64,
    fontWeight: fontWeights.bold,
    letterSpacing: -4,
    textAlign: 'center',
  },
  levelName: {
    marginTop: 8,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  levelUpTitle: {
    marginTop: 4,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    opacity: 0.92,
  },
  particle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
    marginLeft: -4,
  },
});
