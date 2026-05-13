import { useEffect, useRef, useState } from 'react';
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

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.3)';
const SUBTITLE_OPACITY = 0.6;
const SKIP_OPACITY = 0.5;
const STAR_GAP = 12;
const STAR_SELECTED_COLOR = '#facc15';
const STAR_IDLE_COLOR = 'rgba(255,255,255,0.24)';

export interface RatingBottomSheetProps {
  visible: boolean;
  recipeName?: string;
  onRate: (rating: number) => void;
  onSkip: () => void;
}

export function RatingBottomSheet({
  visible,
  recipeName,
  onRate,
  onSkip,
}: RatingBottomSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const starScales = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current;

  const [isMounted, setIsMounted] = useState(visible);
  const [selectedRating, setSelectedRating] = useState(0);

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
        setSelectedRating(0);
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, translateY, visible]);

  const closeSheet = (callback: () => void) => {
    Animated.parallel([
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
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setIsMounted(false);
      setSelectedRating(0);
      callback();
    });
  };

  const handleRate = (rating: number) => {
    setSelectedRating(rating);

    const scale = starScales[rating - 1];

    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.3,
        stiffness: 300,
        damping: 12,
        mass: 0.45,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 320,
        damping: 18,
        mass: 0.5,
        useNativeDriver: true,
      }),
    ]).start();

    closeSheet(() => {
      onRate(rating);
    });
  };

  const handleSkip = () => {
    closeSheet(onSkip);
  };

  if (!isMounted) {
    return null;
  }

  const title = recipeName
    ? t('blend.rateYourBlendWithName', { recipeName })
    : t('blend.rateYourBlend');

  return (
    <Modal transparent visible={isMounted} animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{t('blend.howWasIt')}</Text>

          <View style={styles.starsRow}>
            {starScales.map((scale, index) => {
              const ratingValue = index + 1;
              const isSelected = ratingValue <= selectedRating;

              return (
                <Pressable
                  key={ratingValue}
                  accessibilityRole="button"
                  onPress={() => {
                    handleRate(ratingValue);
                  }}
                >
                  <Animated.View style={{ transform: [{ scale }] }}>
                    <Ionicons
                      color={isSelected ? STAR_SELECTED_COLOR : STAR_IDLE_COLOR}
                      name="star"
                      size={36}
                    />
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>

          <Pressable accessibilityRole="button" onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipLabel}>{t('blend.skip')}</Text>
          </Pressable>
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
  title: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    opacity: SUBTITLE_OPACITY,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: STAR_GAP,
    marginTop: spacing['4xl'],
  },
  skipButton: {
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skipLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    opacity: SKIP_OPACITY,
  },
});