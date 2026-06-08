import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PantryIngredient } from '@blendi/shared';

import {
  borderRadius,
  colors,
  spacing,
} from '@blendi/shared';

const ROW_BACKGROUND = 'rgba(255,255,255,0.06)';
const ROW_BORDER = 'rgba(255,255,255,0.08)';
const UNCHECKED_BORDER = 'rgba(255,255,255,0.25)';
const QUANTITY_OPACITY = 0.55;
const CHECK_CIRCLE_SIZE = 24;
const CHECK_CIRCLE_BORDER_WIDTH = spacing.xs;
const CHECK_ICON_SIZE = 14;
const ROW_MIN_HEIGHT = 56;
const ROW_HORIZONTAL_PADDING = spacing.xl;
const ROW_VERTICAL_PADDING = spacing.lg;
const CHECKBOX_GAP = spacing.lg;
const MEDIUM_CONFIDENCE_DOT_SIZE = 6;
const CHECK_SCALE_ACTIVE = 1.1;

function triggerLightHaptic() {
  if (Platform.OS === 'web') {
    return;
  }

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export interface IngredientCheckItemProps {
  ingredient: PantryIngredient;
  checked: boolean;
  onToggle: () => void;
}

export function IngredientCheckItem({
  ingredient,
  checked,
  onToggle,
}: IngredientCheckItemProps) {
  const progressValue = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      progressValue.setValue(checked ? 1 : 0);
      scaleValue.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.spring(progressValue, {
        toValue: checked ? 1 : 0,
        stiffness: 320,
        damping: 20,
        mass: 0.45,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.spring(scaleValue, {
          toValue: CHECK_SCALE_ACTIVE,
          stiffness: 320,
          damping: 18,
          mass: 0.45,
          useNativeDriver: false,
        }),
        Animated.spring(scaleValue, {
          toValue: 1,
          stiffness: 300,
          damping: 20,
          mass: 0.45,
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    return () => {
      progressValue.stopAnimation();
      scaleValue.stopAnimation();
    };
  }, [checked, progressValue, scaleValue]);

  const normalizedEstimatedQuantity = ingredient.estimatedQuantity?.trim();
  const showMediumConfidenceDot = ingredient.confidence === 'medium';

  const handleToggle = () => {
    triggerLightHaptic();
    onToggle();
  };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={ingredient.name}
      onPress={handleToggle}
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.checkCircle,
          {
            borderColor: progressValue.interpolate({
              inputRange: [0, 1],
              outputRange: [UNCHECKED_BORDER, colors.brand.pulse],
            }),
            backgroundColor: progressValue.interpolate({
              inputRange: [0, 1],
              outputRange: ['rgba(0,0,0,0)', colors.brand.pulse],
            }),
            transform: [{ scale: scaleValue }],
          },
        ]}
      >
        {checked ? (
          <Ionicons name="checkmark" size={CHECK_ICON_SIZE} color={colors.text.primary} />
        ) : null}
      </Animated.View>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.nameText}>
            {ingredient.name}
          </Text>

          {showMediumConfidenceDot ? <View style={styles.mediumConfidenceDot} /> : null}
        </View>
      </View>

      {normalizedEstimatedQuantity ? (
        <Text numberOfLines={1} style={styles.quantityText}>
          {normalizedEstimatedQuantity}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    backgroundColor: ROW_BACKGROUND,
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    paddingVertical: ROW_VERTICAL_PADDING,
  },
  checkCircle: {
    width: CHECK_CIRCLE_SIZE,
    height: CHECK_CIRCLE_SIZE,
    borderRadius: CHECK_CIRCLE_SIZE / 2,
    borderWidth: CHECK_CIRCLE_BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: CHECKBOX_GAP,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  nameText: {
    flexShrink: 1,
    color: colors.text.primary,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
  },
  mediumConfidenceDot: {
    width: MEDIUM_CONFIDENCE_DOT_SIZE,
    height: MEDIUM_CONFIDENCE_DOT_SIZE,
    borderRadius: MEDIUM_CONFIDENCE_DOT_SIZE / 2,
    backgroundColor: colors.feedback.warning,
    marginLeft: spacing.md,
  },
  quantityText: {
    marginLeft: spacing.lg,
    color: colors.text.primary,
    opacity: QUANTITY_OPACITY,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 0,
    maxWidth: 112,
  },
});