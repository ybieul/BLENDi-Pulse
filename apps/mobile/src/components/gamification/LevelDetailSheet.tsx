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

import {
  calculateLevel,
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useGamificationStore } from '../../store/gamification.store';

const SHEET_RADIUS = 24;
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.3)';
const TRACK_COLOR = 'rgba(255,255,255,0.08)';
const TOTAL_XP_OPACITY = 0.65;
const XP_RANGE_OPACITY = 0.45;
const NEXT_LEVEL_COPY_OPACITY = 0.6;

export interface LevelDetailSheetProps {
  visible: boolean;
  onClose: () => void;
}

function formatXP(value: number): string {
  return value.toLocaleString();
}

export function LevelDetailSheet({ visible, onClose }: LevelDetailSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const totalXP = useGamificationStore((state) => state.totalXP);

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const [isMounted, setIsMounted] = useState(visible);

  const levelInfo = useMemo(() => calculateLevel(totalXP), [totalXP]);
  const nextLevelInfo = useMemo(() => calculateLevel(levelInfo.xpForNextLevel), [levelInfo.xpForNextLevel]);

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

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

  useEffect(() => {
    if (!visible) {
      progressAnimation.setValue(0);
      return;
    }

    progressAnimation.setValue(0);

    const animation = Animated.timing(progressAnimation, {
      toValue: levelInfo.progress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [levelInfo.progress, progressAnimation, visible]);

  if (!isMounted) {
    return null;
  }

  const progressWidth = progressAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${levelInfo.progress * 100}%`],
  });

  const levelDetailLabel = t('gamification.levelDetail', { level: levelInfo.level });
  const currentLevelName = t(levelInfo.levelNameKey, { level: levelInfo.level });
  const nextLevelName = t(nextLevelInfo.levelNameKey, { level: nextLevelInfo.level });
  const formattedTotalXP = formatXP(totalXP);
  const formattedCurrentLevelXP = formatXP(levelInfo.xpForCurrentLevel);
  const formattedNextLevelXP = formatXP(levelInfo.xpForNextLevel);
  const formattedXpToNextLevel = formatXP(levelInfo.xpToNextLevel);

  return (
    <Modal transparent visible={isMounted} animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}> 
          <View style={styles.handle} />

          <View style={styles.content}>
            <Text style={styles.levelNumber}>{levelInfo.level}</Text>
            <Text style={styles.levelName}>{levelDetailLabel}</Text>
            <Text style={styles.totalXP}>{t('gamification.currentXp', { xp: formattedTotalXP })}</Text>
            <Text style={styles.nextLevelCopy}>{currentLevelName}</Text>

            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              </View>

              <View style={styles.xpRangeRow}>
                <Text style={styles.xpRangeLabel}>{formattedCurrentLevelXP}</Text>
                <Text style={styles.xpRangeLabel}>{formattedNextLevelXP}</Text>
              </View>
            </View>

            <Text style={styles.nextLevelCopy}>
              {t('gamification.xpToNextLevel', {
                xp: formattedXpToNextLevel,
                levelName: nextLevelName,
              })}
            </Text>
          </View>
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
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    backgroundColor: colors.background.secondary,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
    marginTop: 16,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  levelNumber: {
    marginTop: 16,
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: fontWeights.bold,
    letterSpacing: -3,
    textAlign: 'center',
  },
  levelName: {
    marginTop: 6,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  totalXP: {
    marginTop: 12,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    opacity: TOTAL_XP_OPACITY,
  },
  progressSection: {
    marginTop: 16,
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: TRACK_COLOR,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.pulse,
  },
  xpRangeRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  xpRangeLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    opacity: XP_RANGE_OPACITY,
  },
  nextLevelCopy: {
    marginTop: 12,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
    opacity: NEXT_LEVEL_COPY_OPACITY,
  },
});
