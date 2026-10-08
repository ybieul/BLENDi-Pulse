import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PulseAiRecipe } from '@blendi/shared';

import { colors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';
import { useDateFormat } from '../../hooks/useDateFormat';
import { RecipeCard } from './RecipeCard';

const USER_BUBBLE_BACKGROUND = colors.overlay.pulse[25];
const USER_BUBBLE_BORDER = colors.overlay.pulse[35];
const ERROR_BUBBLE_BACKGROUND = colors.decorative.errorBubbleBackground;
const ERROR_BUBBLE_BORDER = colors.decorative.errorBubbleBorder;
const ERROR_ICON_COLOR = colors.decorative.errorBubbleIcon;
const TIMESTAMP_OPACITY = 0.5;
const ENTRY_DURATION_MS = 300;
const ENTRY_TRANSLATE_Y = 12;
const NOOP = () => {};

type MessageTimestamp = Date | number | string;

interface BaseChatMessageProps {
  timestamp?: MessageTimestamp;
}

interface UserChatMessageProps extends BaseChatMessageProps {
  role: 'user';
  content: string;
}

interface AssistantChatMessageProps extends BaseChatMessageProps {
  role: 'assistant';
  content: PulseAiRecipe;
  isFavorited?: boolean;
  favoriteId?: string;
  onStartBlend?: () => void;
  isFromCache?: boolean;
  isError?: never;
}

interface AssistantErrorChatMessageProps extends BaseChatMessageProps {
  role: 'assistant';
  content: string;
  isError: true;
}

export type ChatMessageProps = UserChatMessageProps | AssistantChatMessageProps | AssistantErrorChatMessageProps;

export function ChatMessage(props: ChatMessageProps) {
  const { formatTime } = useDateFormat();
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryTranslateY = useRef(new Animated.Value(ENTRY_TRANSLATE_Y)).current;
  const timestamp = props.timestamp ?? new Date();

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(entryOpacity, {
        toValue: 1,
        duration: ENTRY_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(entryTranslateY, {
        toValue: 0,
        duration: ENTRY_DURATION_MS,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      entryOpacity.stopAnimation();
      entryTranslateY.stopAnimation();
    };
  }, [entryOpacity, entryTranslateY]);

  if (props.role === 'assistant' && props.isError) {
    return (
      <Animated.View
        style={[
          styles.assistantMessageWrap,
          {
            opacity: entryOpacity,
            transform: [{ translateY: entryTranslateY }],
          },
        ]}
      >
        <View style={styles.errorBubble}>
          <Ionicons
            name="warning-outline"
            size={16}
            color={ERROR_ICON_COLOR}
            style={styles.errorIcon}
          />
          <Text style={styles.errorText}>{props.content}</Text>
        </View>
      </Animated.View>
    );
  }

  if (props.role === 'user') {
    return (
      <Animated.View
        style={[
          styles.userMessageWrap,
          {
            opacity: entryOpacity,
            transform: [{ translateY: entryTranslateY }],
          },
        ]}
      >
        <View style={styles.userBubble}>
          <Text style={styles.userMessageText}>{props.content}</Text>
        </View>
        <Text style={styles.userTimestamp}>{formatTime(timestamp)}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.assistantMessageWrap,
        {
          opacity: entryOpacity,
          transform: [{ translateY: entryTranslateY }],
        },
      ]}
    >
      <RecipeCard
        recipe={props.content}
        isFavorited={props.isFavorited ?? false}
        favoriteId={props.favoriteId}
        onStartBlend={props.onStartBlend ?? NOOP}
        isFromCache={props.isFromCache}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  userMessageWrap: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    marginLeft: spacing['4xl'],
  },
  userBubble: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: USER_BUBBLE_BORDER,
    backgroundColor: USER_BUBBLE_BACKGROUND,
    padding: 12,
  },
  userMessageText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
  },
  userTimestamp: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    opacity: TIMESTAMP_OPACITY,
  },
  assistantMessageWrap: {
    marginRight: 16,
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ERROR_BUBBLE_BORDER,
    backgroundColor: ERROR_BUBBLE_BACKGROUND,
    padding: spacing.lg,
    marginLeft: spacing.xl,
    marginRight: spacing.xl,
  },
  errorIcon: {
    marginTop: 1,
    marginRight: spacing.md,
    flexShrink: 0,
  },
  errorText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    opacity: 0.85,
  },
});