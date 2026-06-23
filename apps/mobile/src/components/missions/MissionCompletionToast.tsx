import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';

interface MissionCompletionToastProps {
  xpAmount: number;
  visible: boolean;
  onDismiss: () => void;
}

const TOAST_BACKGROUND = 'rgba(34,197,94,0.92)';
const TOAST_TOP = 60;
const ENTRY_DURATION = 250;
const VISIBLE_DURATION = 2000;
const EXIT_DURATION = 200;
const HIDDEN_TRANSLATE_Y = -20;

export function MissionCompletionToast({ xpAmount, visible, onDismiss }: MissionCompletionToastProps) {
  const { t } = useAppTranslation();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(HIDDEN_TRANSLATE_Y)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const latestOnDismissRef = useRef(onDismiss);

  latestOnDismissRef.current = onDismiss;

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      activeAnimationRef.current?.stop();
      activeAnimationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    activeAnimationRef.current?.stop();
    activeAnimationRef.current = null;

    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(HIDDEN_TRANSLATE_Y);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(HIDDEN_TRANSLATE_Y);

    const enterAnimation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTRY_DURATION,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ENTRY_DURATION,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]);

    activeAnimationRef.current = enterAnimation;

    enterAnimation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      hideTimeoutRef.current = setTimeout(() => {
        const exitAnimation = Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: EXIT_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: HIDDEN_TRANSLATE_Y,
            duration: EXIT_DURATION,
            useNativeDriver: true,
          }),
        ]);

        activeAnimationRef.current = exitAnimation;

        exitAnimation.start(({ finished: exitFinished }) => {
          activeAnimationRef.current = null;
          hideTimeoutRef.current = null;

          if (exitFinished) {
            latestOnDismissRef.current();
          }
        });
      }, VISIBLE_DURATION);
    });
  }, [onDismiss, opacity, translateY, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons name="checkmark-circle" size={16} color={colors.text.primary} />
        <Text numberOfLines={1} style={styles.text}>
          {t('home.missionComplete', { xp: xpAmount })}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: TOAST_TOP,
    alignSelf: 'center',
    zIndex: 999,
    borderRadius: 20,
    backgroundColor: TOAST_BACKGROUND,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
});
