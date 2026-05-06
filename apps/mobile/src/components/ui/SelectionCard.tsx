import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

const CARD_RADIUS = 16;
const BORDER_ANIMATION_DURATION = 200;
const CHECK_ANIMATION_DURATION = 150;
const SCALE_SELECTED = 1.02;
const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_HIGHLIGHT = 'rgba(255,255,255,0.04)';
const CARD_BORDER_IDLE = 'rgba(255,255,255,0.10)';
const CARD_BORDER_SELECTED = 'rgba(154,72,147,0.65)';

export interface SelectionCardProps extends Pick<PressableProps, 'testID' | 'accessibilityHint'> {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}

export function SelectionCard({
  title,
  subtitle,
  icon,
  badge,
  selected,
  onPress,
  testID,
  accessibilityHint,
}: SelectionCardProps) {
  const borderProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(selected ? SCALE_SELECTED : 1)).current;
  const checkOpacity = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(borderProgress, {
      toValue: selected ? 1 : 0,
      duration: BORDER_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [borderProgress, selected]);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? SCALE_SELECTED : 1,
      stiffness: 320,
      damping: 24,
      mass: 0.6,
      useNativeDriver: false,
    }).start();
  }, [scale, selected]);

  useEffect(() => {
    Animated.timing(checkOpacity, {
      toValue: selected ? 1 : 0,
      duration: CHECK_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [checkOpacity, selected]);

  const animatedBorderColor = borderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_BORDER_IDLE, CARD_BORDER_SELECTED],
  });

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.cardOuter,
          {
            borderColor: animatedBorderColor,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={styles.cardInner}>
          <View style={styles.cardHighlight} />

          <Animated.View pointerEvents="none" style={[styles.checkIcon, { opacity: checkOpacity }]}>
            <AntDesign name="checkcircle" size={18} color={colors.brand.pulse} />
          </Animated.View>

          {icon || badge ? (
            <View style={styles.metaRow}>
              {icon ? <View style={styles.iconSlot}>{icon}</View> : <View />}
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.contentBlock}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  cardOuter: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardInner: {
    position: 'relative',
    minHeight: 132,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    backgroundColor: CARD_BACKGROUND,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: CARD_HIGHLIGHT,
  },
  checkIcon: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconSlot: {
    minHeight: 24,
    minWidth: 24,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  badge: {
    maxWidth: '80%',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badgeText: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  contentBlock: {
    gap: spacing.sm,
    paddingRight: spacing['3xl'],
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: 22,
  },
});