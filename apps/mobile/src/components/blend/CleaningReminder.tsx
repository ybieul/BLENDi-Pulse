import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  borderRadius,
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { markCleaned } from '../../services/user.service';
import { useAuthStore } from '../../store/auth.store';

const REMINDER_BACKGROUND = 'rgba(245,158,11,0.12)';
const REMINDER_BORDER = 'rgba(245,158,11,0.25)';
const REMINDER_AUTO_DISMISS_MS = 5000;
const REMINDER_STALE_DAYS = 7;

interface CleaningReminderStoreSnapshot {
  user?: {
    lastCleanedAt?: unknown;
  } | null;
  updateUserProfile: (updates: { lastCleanedAt?: string | null }) => void;
}

export interface CleaningReminderProps {
  visible: boolean;
}

function normalizeLastCleanedAt(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function shouldShowReminder(lastCleanedAt?: string | null): boolean {
  if (!lastCleanedAt) {
    return true;
  }

  const cleanedAt = new Date(lastCleanedAt);
  const now = new Date();
  const staleAt = new Date(cleanedAt.getTime() + REMINDER_STALE_DAYS * 24 * 60 * 60 * 1000);

  return staleAt.getTime() <= now.getTime();
}

export function CleaningReminder({ visible }: CleaningReminderProps) {
  const { t } = useAppTranslation();
  const authState = useAuthStore.getState() as CleaningReminderStoreSnapshot;
  const lastCleanedAt = normalizeLastCleanedAt(authState.user?.lastCleanedAt);
  const updateUserProfile = useAuthStore.getState().updateUserProfile;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  const [isRendered, setIsRendered] = useState(false);

  const isEligible = useMemo(
    () => visible && shouldShowReminder(lastCleanedAt),
    [lastCleanedAt, visible]
  );

  useEffect(() => {
    if (!isEligible) {
      const exitAnimation = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 16,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

      exitAnimation.start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });

      return () => {
        exitAnimation.stop();
      };
    }

    setIsRendered(true);
    opacity.setValue(0);
    translateY.setValue(16);

    const entryAnimation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    entryAnimation.start();

    const timeoutId = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });
    }, REMINDER_AUTO_DISMISS_MS);

    return () => {
      clearTimeout(timeoutId);
      entryAnimation.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [isEligible, opacity, translateY]);

  const handleMarkCleaned = async () => {
    try {
      const nextLastCleanedAt = await markCleaned();
      updateUserProfile({ lastCleanedAt: nextLastCleanedAt });

      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });
    } catch {
      return;
    }
  };

  if (!isRendered) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons color={colors.feedback.warning} name="sparkles-outline" size={20} />

      <View style={styles.textContainer}>
        <Text style={styles.message}>{t('blend.cleanReminder')}</Text>

        <Pressable accessibilityRole="button" onPress={() => { void handleMarkCleaned(); }}>
          <Text style={styles.action}>{t('blend.markCleaned')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: REMINDER_BORDER,
    backgroundColor: REMINDER_BACKGROUND,
    padding: 14,
  },
  textContainer: {
    flex: 1,
    gap: spacing.sm,
  },
  message: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
  },
  action: {
    color: colors.feedback.warning,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
});