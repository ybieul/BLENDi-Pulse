import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useUnits } from '../../hooks/useUnits';
import type { AppTabNavigationProp } from '../../navigation/types';
import { useBlendStore } from '../../store/blend.store';

const BUTTON_GAP = 12;
const BUTTON_HEIGHT = 52;
const BUTTON_RADIUS = 14;
const BUTTON_BACKGROUND = 'rgba(255,255,255,0.07)';
const BUTTON_BORDER = 'rgba(255,255,255,0.10)';
const WATER_ICON_COLOR = 'rgba(59,130,246,0.80)';
const WATER_CONFIRMATION_AMOUNT_ML = 250;
const WATER_CONFIRMATION_DISTANCE = -20;
const WATER_CONFIRMATION_DURATION = 600;
const WATER_ICON_SCALE_UP = 1.4;

export interface QuickActionTriggerProps {
  onLogWater: () => void | Promise<void>;
}

export function QuickActionTrigger({
  onLogWater,
}: QuickActionTriggerProps) {
  const { t } = useAppTranslation();
  const { displayVolume } = useUnits();
  const navigation = useNavigation<AppTabNavigationProp<'Home'>>();
  const lastBlend = useBlendStore((state) => state.lastBlend);
  const waterScale = useRef(new Animated.Value(1)).current;
  const waterConfirmationOpacity = useRef(new Animated.Value(0)).current;
  const waterConfirmationTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      waterScale.stopAnimation();
      waterConfirmationOpacity.stopAnimation();
      waterConfirmationTranslateY.stopAnimation();
    };
  }, [waterConfirmationOpacity, waterConfirmationTranslateY, waterScale]);

  const animateWaterConfirmation = () => {
    waterScale.stopAnimation();
    waterConfirmationOpacity.stopAnimation();
    waterConfirmationTranslateY.stopAnimation();

    waterScale.setValue(1);
    waterConfirmationOpacity.setValue(1);
    waterConfirmationTranslateY.setValue(0);

    Animated.sequence([
      Animated.spring(waterScale, {
        toValue: WATER_ICON_SCALE_UP,
        stiffness: 320,
        damping: 16,
        mass: 0.45,
        useNativeDriver: true,
      }),
      Animated.spring(waterScale, {
        toValue: 1,
        stiffness: 260,
        damping: 18,
        mass: 0.4,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.timing(waterConfirmationOpacity, {
        toValue: 0,
        duration: WATER_CONFIRMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(waterConfirmationTranslateY, {
        toValue: WATER_CONFIRMATION_DISTANCE,
        duration: WATER_CONFIRMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleLogWaterPress = () => {
    animateWaterConfirmation();
    void onLogWater();
  };

  const handleBlendPress = () => {
    if (lastBlend !== null) {
      navigation.navigate('Blend', { recipe: lastBlend });
      return;
    }

    navigation.navigate('Blend');
  };

  const waterConfirmationText = displayVolume(WATER_CONFIRMATION_AMOUNT_ML);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={handleLogWaterPress}
        accessibilityRole="button"
        style={styles.button}
      >
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.waterConfirmation,
            {
              opacity: waterConfirmationOpacity,
              transform: [{ translateY: waterConfirmationTranslateY }],
            },
          ]}
        >
          {waterConfirmationText === '—' ? waterConfirmationText : `+${waterConfirmationText}`}
        </Animated.Text>

        <View style={styles.buttonContent}>
          <Animated.View style={{ transform: [{ scale: waterScale }] }}>
            <Ionicons name="water-outline" size={18} color={WATER_ICON_COLOR} />
          </Animated.View>
          <Text style={styles.buttonLabel}>{t('home.logWater')}</Text>
        </View>
      </Pressable>

      <Pressable
        onPress={handleBlendPress}
        accessibilityRole="button"
        style={styles.button}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="flash-outline" size={18} color={colors.brand.pulse} />
          <Text style={styles.buttonLabel}>
            {lastBlend !== null ? t('home.lastBlend') : t('home.startBlend')}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BUTTON_GAP,
  },
  button: {
    flex: 1,
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: BUTTON_BORDER,
    backgroundColor: BUTTON_BACKGROUND,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    overflow: 'visible',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  buttonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  waterConfirmation: {
    position: 'absolute',
    top: -spacing.lg,
    alignSelf: 'center',
    color: WATER_ICON_COLOR,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
});