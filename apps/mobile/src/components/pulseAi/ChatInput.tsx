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

import {
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import type { UserGoal } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useAuthStore } from '../../store/auth.store';
import { useNetworkStore } from '../../store/network.store';
import type { AppTabNavigationProp, RootStackParamList } from '../../navigation/types';

// ── Posição do campo (teste no build EAS 25-26/11) ─────────────────────────
// Antes: o campo era absoluto e somava BASE_TAB_BAR_HEIGHT (88) +
// insets.bottom ao padding — mas a tela da Pulse AI já termina ACIMA da barra
// de abas (a barra não é absoluta), então esse espaço era contado duas vezes
// e o campo ficava "flutuando" longe da barra. Agora o campo fica no fluxo do
// layout, no fim da tela (logo acima da barra de abas), com um respiro fixo.
// Com o teclado aberto, o padding é a SOBREPOSIÇÃO real entre o teclado e o
// fim da tela, medida na janela: cobre a barra de abas que some com o
// teclado (tabBarHideOnKeyboard), o iOS (teclado por cima) e o Android que
// já encolhe a janela (sobreposição zero) — sem constantes de altura.
const RESTING_BOTTOM_PADDING = spacing.md;
const CHAT_FIELD_HEIGHT = 56;
const CHAT_FIELD_RADIUS = 24;
const CONTAINER_FADE_HEIGHT = 16;
const SEND_ICON_ANIMATION_DURATION = 150;
const SEND_ICON_SCALE_START = 0.8;
const SEND_ICON_SCALE_END = 1;
const PLACEHOLDER_INTERVAL_MS = 4000;
const INPUT_DISABLED_OPACITY = 0.72;
const KEYBOARD_CLEARANCE = spacing.md;
const OFFLINE_INPUT_OPACITY = 0.5;
const RECONNECT_OPACITY_DURATION = 300;

type PulseAiGoalKey = 'muscle' | 'wellness' | 'energy' | 'recovery' | 'weightLoss';

export interface ChatInputBottomPaddingInput {
  /** Topo do teclado na tela (endCoordinates.screenY); null = teclado fechado. */
  keyboardScreenY: number | null;
  /** Altura do teclado (endCoordinates.height), usada só sem a medida da tela. */
  keyboardHeight: number;
  /** Fim da tela da Pulse AI na janela (y + altura do campo); null = ainda não medido. */
  screenBottomY: number | null;
}

/**
 * Padding inferior do campo. Teclado fechado: respiro fixo (a tela já
 * termina acima da barra de abas). Teclado aberto: o quanto o teclado cobre
 * a tela + o respiro — nunca a barra de abas somada de novo.
 */
export function getChatInputBottomPadding({
  keyboardScreenY,
  keyboardHeight,
  screenBottomY,
}: ChatInputBottomPaddingInput): number {
  if (keyboardScreenY === null) {
    return RESTING_BOTTOM_PADDING;
  }

  const overlap = screenBottomY === null
    ? keyboardHeight
    : Math.max(0, screenBottomY - keyboardScreenY);

  return Math.max(RESTING_BOTTOM_PADDING, overlap + KEYBOARD_CLEARANCE);
}

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
  WeightLoss: 'weightLoss',
};

const INPUT_PLACEHOLDER_FIELDS = [
  'inputPlaceholder1',
  'inputPlaceholder2',
  'inputPlaceholder3',
] as const;

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ onSend, isLoading, usageRemaining }: ChatInputProps, ref) {
  const colors = useColors();
  const INPUT_BACKGROUND = colors.overlay.plum[6];
  const INPUT_HIGHLIGHT = colors.overlay.plum[3];
  const INPUT_BORDER = colors.overlay.plum[16];
  const MICROPHONE_COLOR = colors.overlay.plum[30];
  const OFFLINE_ICON_COLOR = colors.overlay.plum[30];

  const navigation = useNavigation<AppTabNavigationProp<'PulseAI'>>();
  const { t } = useAppTranslation();
  const userGoal = useAuthStore((state) => state.user?.goal ?? 'Wellness');
  const isConnected = useNetworkStore((state) => state.isConnected);
  const goalKey = GOAL_I18N_KEYS[userGoal];

  const [message, setMessage] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardScreenY, setKeyboardScreenY] = useState<number | null>(null);
  const [screenBottomY, setScreenBottomY] = useState<number | null>(null);
  const containerRef = useRef<View>(null);
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
  const bottomPadding = getChatInputBottomPadding({ keyboardScreenY, keyboardHeight, screenBottomY });

  // Fim da tela na janela = y + altura deste container (o último item da
  // tela). Medido a cada mudança de layout: a barra de abas some/volta com o
  // teclado e a tela muda de altura junto.
  const measureScreenBottom = () => {
    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        setScreenBottomY(y + height);
      }
    });
  };

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
      setKeyboardScreenY(event.endCoordinates.screenY);
      measureScreenBottom();
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      setKeyboardScreenY(null);
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

  const styles = StyleSheet.create({
    container: {
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

  return (
    <View
      ref={containerRef}
      onLayout={measureScreenBottom}
      style={[styles.container, { paddingBottom: bottomPadding }]}
      testID="chat-input-container"
    >
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