import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fontSizes, fonts, shadows, spacing } from '@blendi/shared';

const IOS_TOAST_DURATION_MS = 3200;
const IOS_TOAST_ENTRY_OFFSET = -12;
const IOS_TOAST_BORDER_COLOR = 'rgba(255,107,107,0.22)';
const IOS_TOAST_BACKGROUND_COLOR = 'rgba(60,24,24,0.94)';

interface ToastPayload {
  id: number;
  message: string;
  duration: number;
}

type ToastListener = (payload: ToastPayload) => void;

const toastListeners = new Set<ToastListener>();

function emitToast(payload: ToastPayload): void {
  toastListeners.forEach((listener) => {
    listener(payload);
  });
}

export function showToast(message: string, duration = IOS_TOAST_DURATION_MS): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, duration >= 3500 ? ToastAndroid.LONG : ToastAndroid.SHORT);
    return;
  }

  emitToast({
    id: Date.now(),
    message,
    duration,
  });
}

export function ToastViewport() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(IOS_TOAST_ENTRY_OFFSET)).current;

  useEffect(() => {
    const listener: ToastListener = (payload) => {
      setToast(payload);
    };

    toastListeners.add(listener);

    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!toast || Platform.OS === 'android') {
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

    const timeoutId = setTimeout(() => {
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
          setToast((currentToast) => (currentToast?.id === toast.id ? null : currentToast));
        }
      });
    }, toast.duration);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [opacity, toast, translateY]);

  if (Platform.OS === 'android' || !toast) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.viewport, { top: insets.top + spacing.lg }]}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text style={styles.toastText}>{toast.message}</Text>
      </Animated.View>
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
  toastText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
});