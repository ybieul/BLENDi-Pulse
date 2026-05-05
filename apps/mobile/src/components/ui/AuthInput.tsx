import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';

const FIELD_HEIGHT = 64;
const LABEL_IDLE_TRANSLATE_Y = 12;
const LABEL_FLOAT_FONT_SIZE = 11;
const LABEL_IDLE_FONT_SIZE = 15;
const BORDER_ANIMATION_DURATION = 200;
const CHECK_ANIMATION_DURATION = 150;
const ERROR_ANIMATION_DURATION = 200;
const ERROR_TRANSLATE_Y = 6;
const HORIZONTAL_PADDING = spacing.xl;
const ICON_SLOT_SIZE = 20;
const LEADING_GAP = spacing.lg;
const TRAILING_SLOT_WIDTH = 28;

type TextInputFocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type TextInputBlurEvent = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

export interface AuthInputProps extends TextInputProps {
  error?: string;
  leftIcon?: ReactNode;
}

export const AuthInput = forwardRef<TextInput, AuthInputProps>(function AuthInput(
  {
    error,
    leftIcon,
    style,
    placeholder,
    value,
    defaultValue,
    onFocus,
    onBlur,
    onChangeText,
    editable = true,
    ...textInputProps
  },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [visibleError, setVisibleError] = useState<string | null>(error ?? null);

  const labelProgress = useRef(
    new Animated.Value(
      String(value ?? defaultValue ?? '').trim().length > 0 ? 1 : 0
    )
  ).current;
  const borderProgress = useRef(new Animated.Value(0)).current;
  const checkProgress = useRef(new Animated.Value(0)).current;
  const errorProgress = useRef(new Animated.Value(error ? 1 : 0)).current;

  const resolvedValue = typeof value === 'string' ? value : internalValue;
  const hasContent = resolvedValue.trim().length > 0;
  const hasLabel = typeof placeholder === 'string' && placeholder.trim().length > 0;
  const shouldFloatLabel = hasLabel && (isFocused || hasContent);
  const showCheck = hasContent && !error;
  const leftInset = leftIcon
    ? HORIZONTAL_PADDING + ICON_SLOT_SIZE + LEADING_GAP
    : HORIZONTAL_PADDING;

  useEffect(() => {
    Animated.spring(labelProgress, {
      toValue: shouldFloatLabel ? 1 : 0,
      stiffness: 340,
      damping: 34,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }, [labelProgress, shouldFloatLabel]);

  useEffect(() => {
    Animated.timing(borderProgress, {
      toValue: isFocused ? 1 : 0,
      duration: BORDER_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [borderProgress, isFocused]);

  useEffect(() => {
    Animated.timing(checkProgress, {
      toValue: showCheck ? 1 : 0,
      duration: CHECK_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [checkProgress, showCheck]);

  useEffect(() => {
    if (error) {
      setVisibleError(error);
      Animated.timing(errorProgress, {
        toValue: 1,
        duration: ERROR_ANIMATION_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!visibleError) {
      return;
    }

    Animated.timing(errorProgress, {
      toValue: 0,
      duration: ERROR_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisibleError(null);
      }
    });
  }, [error, errorProgress, visibleError]);

  const handleFocus = (event: TextInputFocusEvent) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: TextInputBlurEvent) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  const handleChangeText = (nextValue: string) => {
    setInternalValue(nextValue);
    onChangeText?.(nextValue);
  };

  const labelTranslateY = labelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_IDLE_TRANSLATE_Y, 0],
  });

  const labelFontSize = labelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_IDLE_FONT_SIZE, LABEL_FLOAT_FONT_SIZE],
  });

  const errorTranslateYValue = errorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-ERROR_TRANSLATE_Y, 0],
  });

  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, !editable && styles.fieldDisabled]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.focusBorder, { opacity: borderProgress }]}
        />

        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}

        {hasLabel ? (
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.label,
              {
                left: leftInset,
                fontSize: labelFontSize,
                transform: [{ translateY: labelTranslateY }],
              },
            ]}
          >
            {placeholder}
          </Animated.Text>
        ) : null}

        <TextInput
          ref={ref}
          {...textInputProps}
          value={value}
          defaultValue={defaultValue}
          editable={editable}
          placeholder={undefined}
          placeholderTextColor={colors.text.tertiary}
          selectionColor={colors.brand.pulse}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChangeText={handleChangeText}
          style={[
            styles.input,
            {
              paddingLeft: leftInset,
              paddingRight: HORIZONTAL_PADDING + TRAILING_SLOT_WIDTH,
              paddingTop: hasLabel ? 24 : 0,
              paddingBottom: hasLabel ? 10 : 0,
            },
            !hasLabel && styles.inputWithoutLabel,
            style,
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[styles.checkIcon, { opacity: checkProgress }]}
        >
          <AntDesign name="checkcircle" size={18} color={colors.feedback.success} />
        </Animated.View>
      </View>

      {visibleError ? (
        <Animated.View
          style={[
            styles.errorContainer,
            {
              opacity: errorProgress,
              transform: [{ translateY: errorTranslateYValue }],
            },
          ]}
        >
          <Text style={styles.errorText}>{visibleError}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  field: {
    position: 'relative',
    height: FIELD_HEIGHT,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fieldDisabled: {
    opacity: 0.7,
  },
  focusBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.brand.pulse,
  },
  leftIcon: {
    position: 'absolute',
    left: HORIZONTAL_PADDING,
    top: 22,
    width: ICON_SLOT_SIZE,
    height: ICON_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    position: 'absolute',
    top: 10,
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontWeight: fontWeights.regular,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  inputWithoutLabel: {
    textAlignVertical: 'center',
  },
  checkIcon: {
    position: 'absolute',
    right: HORIZONTAL_PADDING,
    top: 23,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.feedback.error,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
  },
});