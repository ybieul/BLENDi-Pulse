import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { BadgeStage, UserBadge } from '../../utils/badges.utils';

const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.3)';
const DESCRIPTION_OPACITY = 0.7;
const TRACK_COLOR = 'rgba(255,255,255,0.08)';
const LOCKED_STAGE_ICON_COLOR = 'rgba(255,255,255,0.22)';
const STAGE_LABEL_OPACITY = 0.78;
const STAGE_REQUIREMENT_OPACITY = 0.6;
const BRONZE_COLOR = 'rgba(205,127,50,0.90)';
const SILVER_COLOR = 'rgba(192,192,192,0.90)';
const GOLD_COLOR = 'rgba(255,215,0,0.90)';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

export interface BadgeDetailSheetProps {
  badge: UserBadge | null;
  onClose: () => void;
}

function getStageLabelKey(stage: UserBadge['currentStage'] | BadgeStage['stage']): TranslationKey {
  switch (stage) {
    case 'bronze':
      return 'me.badges.bronze';
    case 'silver':
      return 'me.badges.silver';
    case 'gold':
      return 'me.badges.gold';
    default:
      return 'me.badges.locked';
  }
}

function getStageColor(stage: BadgeStage['stage']): string {
  switch (stage) {
    case 'bronze':
      return BRONZE_COLOR;
    case 'silver':
      return SILVER_COLOR;
    case 'gold':
      return GOLD_COLOR;
    default:
      return colors.text.secondary;
  }
}

function getNextLockedStage(stages: BadgeStage[]): BadgeStage | null {
  return stages.find(stage => !stage.unlocked) ?? null;
}

function getEstimatedRemainingRequirement(nextLockedStage: BadgeStage, progress: number): number {
  const estimatedCurrentValue = Math.max(
    0,
    Math.min(nextLockedStage.requirement, Math.round(nextLockedStage.requirement * progress))
  );

  return Math.max(0, nextLockedStage.requirement - estimatedCurrentValue);
}

export function BadgeDetailSheet({ badge, onClose }: BadgeDetailSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const [isMounted, setIsMounted] = useState(badge !== null);
  const [renderBadge, setRenderBadge] = useState<UserBadge | null>(badge);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);

  const visible = badge !== null;

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (badge) {
      setRenderBadge(badge);
    }
  }, [badge]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 220,
          damping: 26,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();

      return undefined;
    }

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, translateY, visible]);

  const nextLockedStage = useMemo(
    () => (renderBadge && renderBadge.stages.length === 3 ? getNextLockedStage(renderBadge.stages) : null),
    [renderBadge]
  );

  useEffect(() => {
    if (!visible || !renderBadge || !nextLockedStage) {
      progressAnimation.setValue(0);
      return;
    }

    progressAnimation.setValue(0);

    const animation = Animated.timing(progressAnimation, {
      toValue: renderBadge.progress,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [nextLockedStage, progressAnimation, renderBadge, visible]);

  if (!isMounted || !renderBadge) {
    return null;
  }

  const translateKey = (key: TranslationKey, options?: Record<string, unknown>) => (
    t(key, options)
  );

  const isEarlyAdopterBadge = renderBadge.id === 'early_adopter';
  const shouldShowStageProgression = renderBadge.stages.length === 3;
  const remainingRequirement = nextLockedStage
    ? getEstimatedRemainingRequirement(nextLockedStage, renderBadge.progress)
    : 0;
  const remainingRequirementLabel = nextLockedStage
    ? translateKey(nextLockedStage.requirementKey, { count: remainingRequirement })
    : '';
  const nextStageLabel = nextLockedStage
    ? translateKey(getStageLabelKey(nextLockedStage.stage))
    : '';
  const progressFillColor = nextLockedStage
    ? getStageColor(nextLockedStage.stage)
    : colors.brand.pulse;
  const progressTranslateX = progressAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-progressTrackWidth / 2, 0],
  });

  return (
    <Modal transparent visible={isMounted} animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <Ionicons
            name={renderBadge.icon as IoniconName}
            size={48}
            color={renderBadge.currentStage === 'locked' ? LOCKED_STAGE_ICON_COLOR : renderBadge.iconColor}
            style={styles.badgeIcon}
          />

          <Text style={styles.title}>{translateKey(renderBadge.titleKey)}</Text>
          <Text style={styles.description}>
            {isEarlyAdopterBadge
              ? translateKey('me.badges.earlyAdopterDesc')
              : translateKey(renderBadge.descriptionKey)}
          </Text>

          {shouldShowStageProgression ? (
            <View style={styles.progressionSection}>
              <View style={styles.stagesRow}>
                {renderBadge.stages.map(stage => {
                  const stageColor = getStageColor(stage.stage);

                  return (
                    <View key={stage.stage} style={styles.stageItem}>
                      <Ionicons
                        name={stage.unlocked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={stage.unlocked ? stageColor : LOCKED_STAGE_ICON_COLOR}
                        style={styles.stageIcon}
                      />

                      <Text style={styles.stageTitle}>{translateKey(getStageLabelKey(stage.stage))}</Text>
                      <Text style={styles.stageRequirement}>
                        {translateKey(stage.requirementKey, { count: stage.requirement })}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {nextLockedStage ? (
                <View style={styles.progressBarSection}>
                  <View
                    onLayout={(event) => {
                      setProgressTrackWidth(event.nativeEvent.layout.width);
                    }}
                    style={styles.progressTrack}
                  >
                    <Animated.View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: progressFillColor,
                          transform: [
                            { translateX: progressTranslateX },
                            { scaleX: progressAnimation },
                          ],
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.progressLabel}>
                    {translateKey('me.badges.progressLabel', {
                      count: remainingRequirementLabel,
                      stage: nextStageLabel,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheetContainer: {
    alignItems: 'center',
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER_COLOR,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing['3xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
  },
  badgeIcon: {
    marginTop: spacing.xl,
  },
  title: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
  },
  description: {
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 21,
    opacity: DESCRIPTION_OPACITY,
  },
  progressionSection: {
    width: '100%',
    marginTop: spacing['3xl'],
  },
  stagesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stageItem: {
    flex: 1,
    alignItems: 'center',
  },
  stageIcon: {
    marginBottom: spacing.sm,
  },
  stageTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
    lineHeight: 16,
    textAlign: 'center',
    opacity: STAGE_LABEL_OPACITY,
  },
  stageRequirement: {
    marginTop: 4,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    lineHeight: 15,
    textAlign: 'center',
    opacity: STAGE_REQUIREMENT_OPACITY,
  },
  progressBarSection: {
    marginTop: spacing.xl,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: TRACK_COLOR,
    overflow: 'hidden',
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
  },
  progressLabel: {
    marginTop: spacing.sm,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    textAlign: 'center',
  },
});