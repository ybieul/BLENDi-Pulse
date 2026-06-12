import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSizes, fonts, shadows, spacing } from '@blendi/shared';

import { subscribeToToasts, type ToastPayload } from './toast.events';

export { showPersistentToast, showToast } from './toast.events';

const IOS_TOAST_ENTRY_OFFSET = -12;
const IOS_TOAST_BORDER_COLOR = 'rgba(255,107,107,0.22)';
const IOS_TOAST_BACKGROUND_COLOR = 'rgba(60,24,24,0.94)';
const TOAST_ACTION_BACKGROUND_COLOR = colors.brand.pulse;

export function ToastViewport() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(IOS_TOAST_ENTRY_OFFSET)).current;

  const dismissToast = (toastId: number) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: IOS_TOAST_ENTRY_OFFSET,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToast((currentToast) => (currentToast?.id === toastId ? null : currentToast));
      }
    });
  };

  useEffect(() => {
    return subscribeToToasts((payload) => {
      setToast(payload);
    });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    opacity.setValue(0);
    translateY.setValue(IOS_TOAST_ENTRY_OFFSET);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    if (toast.duration === null) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      dismissToast(toast.id);
    }, toast.duration);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  const handleActionPress = () => {
    toast.action?.onPress();
    dismissToast(toast.id);
  };

  const handleToastPress = () => {
    if (toast.dismissOnPress !== true) {
      return;
    }

    dismissToast(toast.id);
  };

  return (
    <View pointerEvents="box-none" style={[styles.viewport, { top: insets.top + spacing.lg }]}>
      <Pressable onPress={handleToastPress}>
        <Animated.View
          pointerEvents={toast.action || toast.dismissOnPress ? 'auto' : 'none'}
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
        >
          {toast.title ? <Text style={styles.toastTitle}>{toast.title}</Text> : null}
          <Text style={styles.toastText}>{toast.message}</Text>
          {toast.action ? (
            <Pressable onPress={handleActionPress} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 200,
  },
  toast: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: IOS_TOAST_BORDER_COLOR,
    backgroundColor: IOS_TOAST_BACKGROUND_COLOR,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: shadows.high.shadowColor,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
  },
  toastTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.md,
    marginBottom: spacing.xs,
  },
  toastText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: TOAST_ACTION_BACKGROUND_COLOR,
  },
  actionButtonText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});