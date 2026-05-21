import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSizes, fontWeights, fonts, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useNetworkStore } from '../../store/network.store';

const BANNER_HEIGHT = 36;
const RECONNECT_VISIBLE_MS = 2500;
const RECONNECT_HIDE_DURATION_MS = 300;
const OFFLINE_BACKGROUND_COLOR = 'rgba(239,68,68,0.95)';
const RECONNECTED_BACKGROUND_COLOR = 'rgba(34,197,94,0.95)';

type BannerState = 'neutral' | 'offline' | 'reconnected';

const webBackdropStyle: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({ backdropFilter: 'blur(12px)' } as unknown as ViewStyle)
    : undefined;

export function OfflineBanner() {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isInternetReachable = useNetworkStore((state) => state.isInternetReachable);
  const connectionType = useNetworkStore((state) => state.connectionType);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [bannerState, setBannerState] = useState<BannerState>('neutral');
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const previousOfflineState = useRef<boolean | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasInitialized && connectionType !== null) {
      setHasInitialized(true);
    }
  }, [connectionType, hasInitialized]);

  useEffect(() => {
    if (!hasInitialized) {
      return;
    }

    const isOffline = !isConnected || !isInternetReachable;
    const wasOffline = previousOfflineState.current;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wasOffline === isOffline) {
      return;
    }

    if (isOffline) {
      setBannerState('offline');
      opacity.setValue(1);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (wasOffline) {
      setBannerState('reconnected');
      translateY.setValue(0);
      opacity.setValue(1);

      reconnectTimeoutRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -BANNER_HEIGHT,
            duration: RECONNECT_HIDE_DURATION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: RECONNECT_HIDE_DURATION_MS,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) {
            setBannerState('neutral');
          }
        });
      }, RECONNECT_VISIBLE_MS);
    } else {
      setBannerState('neutral');
      translateY.setValue(-BANNER_HEIGHT);
      opacity.setValue(0);
    }

    previousOfflineState.current = isOffline;

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [hasInitialized, isConnected, isInternetReachable, opacity, translateY]);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  if (!hasInitialized || bannerState === 'neutral') {
    return null;
  }

  const isOffline = bannerState === 'offline';
  const iconName = isOffline ? 'cloud-offline-outline' : 'checkmark';
  const message = isOffline ? t('common.noConnection') : t('common.backOnline');

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        webBackdropStyle,
        {
          top: insets.top,
          opacity,
          transform: [{ translateY }],
          backgroundColor: isOffline ? OFFLINE_BACKGROUND_COLOR : RECONNECTED_BACKGROUND_COLOR,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons name={iconName} size={14} color={colors.text.primary} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: BANNER_HEIGHT,
    zIndex: 999,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
  },
  message: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});