import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useAuthStore } from '../../store/auth.store';
import { useNetworkStore } from '../../store/network.store';
import type { AppTabNavigationProp, RootStackParamList } from '../../navigation/types';

const BASE_TAB_BAR_HEIGHT = 88;
const CHAT_FIELD_HEIGHT = 56;
const CHAT_FIELD_RADIUS = 24;
const CONTAINER_FADE_HEIGHT = 16;
const SEND_ICON_ANIMATION_DURATION = 150;
const SEND_ICON_SCALE_START = 0.8;
const SEND_ICON_SCALE_END = 1;
const PLACEHOLDER_INTERVAL_MS = 4000;
const INPUT_BACKGROUND = 'rgba(255,255,255,0.07)';
const INPUT_HIGHLIGHT = 'rgba(255,255,255,0.04)';
const INPUT_BORDER = 'rgba(255,255,255,0.10)';
const INPUT_DISABLED_OPACITY = 0.72;
const MICROPHONE_COLOR = 'rgba(255,255,255,0.30)';
const OFFLINE_ICON_COLOR = 'rgba(255,255,255,0.30)';
const KEYBOARD_CLEARANCE = spacing.md;
const OFFLINE_INPUT_OPACITY = 0.5;
const RECONNECT_OPACITY_DURATION = 300;

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type PulseAiGoalKey = 'muscle' | 'wellness' | 'energy' | 'recovery';

export interface ChatInputHandle {
  setText: (text: string) => void;
}

export interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  isLoading: boolean;
  usageRemaining: number | null;
}

const GOAL_I18N_KEYS: Record<UserGoal, PulseAiGoalKey> = {
  Muscle: 'muscle',
  Wellness: 'wellness',
  Energy: 'energy',
  Recovery: 'recovery',
};

const INPUT_PLACEHOLDER_FIELDS = [
  'inputPlaceholder1',
  'inputPlaceholder2',
  'inputPlaceholder3',
] as const;

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ onSend, isLoading, usageRemaining }: ChatInputProps, ref) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppTabNavigationProp<'PulseAI'>>();
  const { t } = useAppTranslation();
  const userGoal = useAuthStore((state) => state.user?.goal ?? 'Wellness');
  const isConnected = useNetworkStore((state) => state.isConnected);
  const goalKey = GOAL_I18N_KEYS[userGoal];

  const [message, setMessage] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const sendScale = useRef(new Animated.Value(SEND_ICON_SCALE_END)).current;
  const fieldOpacity = useRef(new Animated.Value(isConnected ? 1 : OFFLINE_INPUT_OPACITY)).current;
  const previousIsConnected = useRef(isConnected);

  useImperativeHandle(ref, () => ({ setText: setMessage }), []);

  const placeholders = useMemo(
    () =>
      INPUT_PLACEHOLDER_FIELDS.map((field) =>
        t(`pulseAi.goals.${goalKey}.${field}`),
      ),
    [goalKey, t],
  );

  const trimmedMessage = message.trim();
  const isLimitReached = usageRemaining === 0;
  const isOffline = !isConnected;
  const isFieldDisabled = isLoading || isLimitReached || isOffline;
  const canSend = trimmedMessage.length > 0 && !isFieldDisabled;
  const restingBottomPadding = BASE_TAB_BAR_HEIGHT + insets.bottom + spacing.md;
  const bottomPadding = keyboardHeight > 0
    ? Math.max(restingBottomPadding, keyboardHeight + KEYBOARD_CLEARANCE)
    : restingBottomPadding;

  useEffect(() => {
    setPlaceholderIndex(0);

    const intervalId = setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholders.length);
    }, PLACEHOLDER_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [placeholders]);

  useEffect(() => {
    if (!trimmedMessage) {
      sendScale.setValue(SEND_ICON_SCALE_START);
      return;
    }

    sendScale.setValue(SEND_ICON_SCALE_START);
    Animated.timing(sendScale, {
      toValue: SEND_ICON_SCALE_END,
      duration: SEND_ICON_ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [sendScale, trimmedMessage]);

  useEffect(() => {
    fieldOpacity.stopAnimation();

    if (!isConnected) {
      fieldOpacity.setValue(OFFLINE_INPUT_OPACITY);
      previousIsConnected.current = false;
      return;
    }

    if (!previousIsConnected.current) {
      fieldOpacity.setValue(OFFLINE_INPUT_OPACITY);
      Animated.timing(fieldOpacity, {
        toValue: 1,
        duration: RECONNECT_OPACITY_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      fieldOpacity.setValue(1);
    }

    previousIsConnected.current = true;
  }, [fieldOpacity, isConnected]);

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    if (Platform.OS === 'ios') {
      const showSubscription = Keyboard.addListener('keyboardWillShow', handleKeyboardShow);
      const changeFrameSubscription = Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardShow);
      const hideSubscription = Keyboard.addListener('keyboardWillHide', handleKeyboardHide);

      return () => {
        showSubscription.remove();
        changeFrameSubscription.remove();
        hideSubscription.remove();
      };
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleSend = async () => {
    if (!canSend) {
      return;
    }

    const outgoingMessage = trimmedMessage;

    try {
      await Promise.resolve(onSend(outgoingMessage));
      setMessage('');
    } catch {
      // O componente apenas preserva a mensagem para retry local.
    }
  };

  const handleSubmitEditing = (
    _event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) => {
    void handleSend();
  };

  const handleUpgradePress = () => {
    const rootNavigation =
      navigation.getParent()?.getParent<NavigationProp<RootStackParamList>>();
    rootNavigation?.navigate('Upgrade');
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}> 
      <LinearGradient
        colors={['transparent', colors.background.primary]}
        style={styles.fadeGradient}
        pointerEvents="none"
      />

      <Animated.View style={{ opacity: fieldOpacity }}>
        <View style={styles.fieldOuter}>
          <View style={styles.fieldBackground} />
          <View style={styles.fieldHighlight} />

          <TextInput
            editable={!isFieldDisabled}
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={handleSubmitEditing}
            placeholder={isOffline ? t('pulseAi.offlineMessage') : placeholders[placeholderIndex]}
            placeholderTextColor={colors.text.tertiary}
            selectionColor={colors.brand.pulse}
            returnKeyType="send"
            autoCapitalize="sentences"
            autoCorrect={true}
            maxLength={500}
            style={[styles.input, isFieldDisabled && !isOffline && styles.inputDisabled]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isOffline
                ? t('pulseAi.offlineMessage')
                : canSend
                  ? t('pulseAi.sendMessage')
                  : t('pulseAi.voicePlaceholder')
            }
            disabled={!canSend || isLoading}
            onPress={() => { void handleSend(); }}
            style={styles.sendButton}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.brand.pulse} />
            ) : isOffline ? (
              <Ionicons name="cloud-offline-outline" size={20} color={OFFLINE_ICON_COLOR} />
            ) : trimmedMessage ? (
              <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                <Ionicons name="arrow-up-circle" size={22} color={colors.brand.pulse} />
              </Animated.View>
            ) : (
              <Ionicons name="mic-outline" size={20} color={MICROPHONE_COLOR} />
            )}
          </Pressable>
        </View>
      </Animated.View>

      {isLimitReached ? (
        <View style={styles.limitRow}>
          <Text style={styles.limitText}>{t('pulseAi.limitReached')}</Text>

          <Pressable accessibilityRole="button" onPress={handleUpgradePress}>
            <Text style={styles.upgradeText}>{t('pulseAi.upgradeButton')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: CONTAINER_FADE_HEIGHT,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background.primary,
  },
  fadeGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CONTAINER_FADE_HEIGHT,
  },
  fieldOuter: {
    position: 'relative',
    height: CHAT_FIELD_HEIGHT,
    justifyContent: 'center',
    borderRadius: CHAT_FIELD_RADIUS,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    overflow: 'hidden',
  },
  fieldBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: INPUT_BACKGROUND,
  },
  fieldHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CHAT_FIELD_HEIGHT / 2,
    backgroundColor: INPUT_HIGHLIGHT,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    paddingLeft: 20,
    paddingRight: 56,
  },
  inputDisabled: {
    opacity: INPUT_DISABLED_OPACITY,
  },
  sendButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  limitText: {
    flex: 1,
    color: colors.feedback.warning,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
    lineHeight: 18,
  },
  upgradeText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
});