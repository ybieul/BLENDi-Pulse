import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAuthStore } from '../../store/auth.store';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { type LevelUpData, useGamificationStore } from '../../store/gamification.store';
import { generateAndShare } from '../../utils/shareCard.utils';
import {
  AchievementShareCard,
  type AchievementShareCardHandle,
} from '../shareCards/AchievementShareCard';

const PARTICLE_COUNT = 15;
const PARTICLE_DISTANCE_Y = -120;
const PARTICLE_DISTANCE_X = 80;
const PARTICLE_DURATION = 1200;
const PARTICLE_STAGGER = 30;
const SETTLE_DELAY = 100;
const PARTICLE_START_DELAY = 150;
const SHARE_START_DELAY = 300;
// Transparência embutida na própria cor, não na opacidade animada (ver nota
// no JSX do backdrop) — 0.82 deixa a tela de trás perceptível como pano de
// fundo escurecido, sem apagá-la por completo.
const OVERLAY_COLOR = 'rgba(0,0,0,0.82)';
const CARD_BACKGROUND_COLOR = '#1C0C1A';
const CARD_BORDER_COLOR = 'rgba(211,120,203,1)';
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
  const authUser = useAuthStore((state) => state.user);
  const levelUpData = useGamificationStore((state) => state.levelUpData);
  const dismissLevelUp = useGamificationStore((state) => state.dismissLevelUp);

  const cardScale = useRef(new Animated.Value(0));
  const shareCardRef = useRef<AchievementShareCardHandle | null>(null);
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => createParticleAnimationValues())
  );

  const activeAnimationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particlesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);
  const isShareQueuedRef = useRef(false);
  const closeCompletionActionRef = useRef<(() => void) | null>(null);
  const [pendingShareData, setPendingShareData] = useState<LevelUpData | null>(null);

  const clearOverlayTimers = useCallback(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (particlesTimeoutRef.current) {
      clearTimeout(particlesTimeoutRef.current);
      particlesTimeoutRef.current = null;
    }
  }, []);

  const clearShareTimer = useCallback(() => {
    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = null;
    }
  }, []);

  const stopAnimations = useCallback(() => {
    activeAnimationsRef.current.forEach((animation) => {
      animation.stop();
    });

    activeAnimationsRef.current = [];
  }, []);

  const resetAnimatedValues = useCallback(() => {
    cardScale.current.setValue(0);

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
    const completionAction = closeCompletionActionRef.current;
    closeCompletionActionRef.current = null;
    completionAction?.();
  }, [dismissLevelUp, resetAnimatedValues, stopAnimations]);

  // Fecha imediatamente — não há mais fade de opacidade pra esperar (ver
  // nota no JSX sobre opacity fixa em 1). finishClose() já cuida de parar
  // animações em andamento, resetar os valores e disparar onComplete.
  const handleClose = useCallback((onComplete?: () => void) => {
    if (levelUpData === null || isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    closeCompletionActionRef.current = onComplete ?? null;
    clearOverlayTimers();
    finishClose();
  }, [clearOverlayTimers, finishClose, levelUpData]);

  const handleShareMoment = useCallback(() => {
    if (levelUpData === null || isClosingRef.current) {
      return;
    }

    isShareQueuedRef.current = true;
    setPendingShareData({
      newLevel: levelUpData.newLevel,
      newLevelNameKey: levelUpData.newLevelNameKey,
    });

    handleClose(() => {
      shareTimeoutRef.current = setTimeout(() => {
        shareTimeoutRef.current = null;

        void (async () => {
          await generateAndShare(shareCardRef);
          isShareQueuedRef.current = false;
          setPendingShareData(null);
        })();
      }, SHARE_START_DELAY);
    });
  }, [handleClose, levelUpData]);

  // Renderizado como View absoluta comum (ver JSX abaixo), não <Modal> —
  // mesma técnica do MissionCompletionToast. A opacidade do backdrop/card é
  // fixa (ver JSX); só a escala do card é animada aqui.
  useEffect(() => {
    if (levelUpData === null) {
      clearOverlayTimers();
      stopAnimations();
      resetAnimatedValues();
      isClosingRef.current = false;

      if (!isShareQueuedRef.current && closeCompletionActionRef.current === null) {
        clearShareTimer();
        setPendingShareData(null);
      }

      return undefined;
    }

    isClosingRef.current = false;
    clearOverlayTimers();
    stopAnimations();
    resetAnimatedValues();

    startTrackedAnimation(
      Animated.spring(cardScale.current, {
        toValue: 1.05,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      })
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

    return () => {
      clearOverlayTimers();
      if (!isShareQueuedRef.current) {
        clearShareTimer();
      }
      stopAnimations();
      isClosingRef.current = false;
    };
  }, [clearOverlayTimers, clearShareTimer, levelUpData, resetAnimatedValues, startTrackedAnimation, stopAnimations]);

  // Repõe, sem <Modal>, a interceptação do botão voltar do Android que
  // <Modal onRequestClose> fazia antes — agora via handleClose(), que anima
  // a saída (o onRequestClose antigo pulava direto para dismissLevelUp(),
  // sem animação, inconsistente com o toque fora do card).
  useEffect(() => {
    if (levelUpData === null) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [handleClose, levelUpData]);

  if (levelUpData === null && pendingShareData === null) {
    return null;
  }

  return (
    <>
      {levelUpData ? (
        <Pressable
          accessibilityViewIsModal
          onPress={() => handleClose()}
          style={styles.overlay}
        >
          {/* View comum, não Animated — testes confirmaram que animar a
              opacidade do backdrop nunca converge de verdade no device real
              (trava num valor intermediário indefinidamente, independente de
              Modal, native driver ou timing). A transparência vem só do
              alpha embutido em OVERLAY_COLOR. */}
          <View style={styles.backdrop} />
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

            <Pressable onPress={() => {}}>
              {/* Sem opacity animada — mesmo motivo do backdrop acima.
                  CARD_BACKGROUND_COLOR já é opaco de propósito (o card
                  precisa ser sólido/legível); só a escala é animada. */}
              <Animated.View
                style={[
                  styles.card,
                  { transform: [{ scale: cardScale.current }] },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.actions.close')}
                  onPress={() => handleClose()}
                  style={styles.closeButton}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={20} color={colors.text.primary} />
                </Pressable>

                <Text style={styles.levelNumber}>{levelUpData.newLevel}</Text>
                <Text style={styles.levelName}>
                  {t(levelUpData.newLevelNameKey, { level: levelUpData.newLevel })}
                </Text>
                <Text style={styles.levelUpTitle}>{t('gamification.levelUpTitle')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleShareMoment}
                  style={styles.shareButton}
                >
                  <Text style={styles.shareButtonText}>{t('share.shareMoment')}</Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

      {pendingShareData ? (
        <AchievementShareCard
          ref={shareCardRef}
          level={pendingShareData.newLevel}
          levelNameKey={pendingShareData.newLevelNameKey}
          user={{
            userId: authUser?.id,
            name: authUser?.name ?? '',
            hasProfilePhoto: authUser?.hasProfilePhoto ?? false,
            profilePhotoUpdatedAt: authUser?.profilePhotoUpdatedAt ?? null,
          }}
        />
      ) : null}
    </>
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
    elevation: 1000,
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
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  shareButton: {
    marginTop: 18,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  shareButtonText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
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
