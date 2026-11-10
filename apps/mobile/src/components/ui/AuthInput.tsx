import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { useColors } from '../../hooks/useColors';

const FIELD_HEIGHT = 56;
const LABEL_FLOAT_TOP = 10;
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
const BORDER_SELECTED_COLOR = colors.overlay.pulse[65];
const INPUT_PADDING_TOP_WITH_LABEL = 24;
const INPUT_PADDING_BOTTOM_WITH_LABEL = 10;

/**
 * Teto de ampliação da fonte do sistema no rótulo, no valor e na mensagem de
 * erro. O campo tem altura fixa (FIELD_HEIGHT): acima disso o valor não cabe.
 * Quem usa o componente pode passar outro `maxFontSizeMultiplier` para o valor.
 */
export const AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER = 1.3;

// Com fonte ampliada, rótulo flutuante e valor crescem dentro da mesma altura.
// No teto (1,3x; DM Sans ~1,3x de altura de linha) o rótulo ocupa ~10–28,6 px e
// o valor, centrado na área 24–46, começa em ~22 px: os dois se sobrepõem. Então,
// à medida que a escala vai de 1 a 1,3, o rótulo sobe até 6 px e a área do valor
// desce (padding de cima +3, de baixo −6): no teto, rótulo ~4–22,6 e valor
// ~26,8–52,2. Em escala 1 nada muda (mesmo visual de antes).
const LABEL_FLOAT_TOP_SHIFT_AT_MAX_SCALE = 6;
const INPUT_PADDING_TOP_SHIFT_AT_MAX_SCALE = 3;
const INPUT_PADDING_BOTTOM_SHIFT_AT_MAX_SCALE = 6;

export interface AuthInputLabelLayout {
  /** top do rótulo quando flutua (o rótulo em repouso fica sempre no mesmo lugar). */
  labelFloatTop: number;
  /** translateY do rótulo em repouso, relativo a labelFloatTop. */
  labelIdleTranslateY: number;
  inputPaddingTop: number;
  inputPaddingBottom: number;
}

/** Posições do rótulo e do valor (campo com rótulo) para a escala de fonte do sistema. */
export function getAuthInputLabelLayout(systemFontScale: number): AuthInputLabelLayout {
  const scale = Number.isFinite(systemFontScale)
    ? Math.min(Math.max(systemFontScale, 1), AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER)
    : 1;
  const progress = (scale - 1) / (AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER - 1);
  const labelFloatTop = LABEL_FLOAT_TOP - LABEL_FLOAT_TOP_SHIFT_AT_MAX_SCALE * progress;

  return {
    labelFloatTop,
    labelIdleTranslateY: LABEL_FLOAT_TOP + LABEL_IDLE_TRANSLATE_Y - labelFloatTop,
    inputPaddingTop: INPUT_PADDING_TOP_WITH_LABEL + INPUT_PADDING_TOP_SHIFT_AT_MAX_SCALE * progress,
    inputPaddingBottom:
      INPUT_PADDING_BOTTOM_WITH_LABEL - INPUT_PADDING_BOTTOM_SHIFT_AT_MAX_SCALE * progress,
  };
}

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
    maxFontSizeMultiplier = AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER,
    ...textInputProps
  },
  ref
) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const labelLayout = getAuthInputLabelLayout(fontScale);
  const FIELD_BG_COLOR = colors.overlay.plum[6];
  const FIELD_HIGHLIGHT_COLOR = colors.overlay.plum[3];

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
      useNativeDriver: false,
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
    outputRange: [labelLayout.labelIdleTranslateY, 0],
  });

  const labelFontSize = labelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_IDLE_FONT_SIZE, LABEL_FLOAT_FONT_SIZE],
  });

  const errorTranslateYValue = errorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-ERROR_TRANSLATE_Y, 0],
  });

  const animatedBorderColor = borderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.overlay.plum[16], BORDER_SELECTED_COLOR],
  });

  const styles = StyleSheet.create({
    wrapper: {
      width: '100%',
    },
    fieldOuter: {
      position: 'relative',
      height: FIELD_HEIGHT,
      borderRadius: 14,
      overflow: 'hidden',
      justifyContent: 'center',
      borderWidth: 1,
    },
    fieldDisabled: {
      opacity: 0.7,
    },
    fieldBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: FIELD_BG_COLOR,
    },
    fieldHighlight: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: FIELD_HEIGHT / 2,
      backgroundColor: FIELD_HIGHLIGHT_COLOR,
    },
    leftIcon: {
      position: 'absolute',
      left: HORIZONTAL_PADDING,
      top: 18,
      width: ICON_SLOT_SIZE,
      height: ICON_SLOT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    label: {
      position: 'absolute',
      top: labelLayout.labelFloatTop,
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontWeight: fontWeights.regular,
      zIndex: 1,
    },
    input: {
      flex: 1,
      height: '100%',
      paddingRight: HORIZONTAL_PADDING + TRAILING_SLOT_WIDTH,
      color: colors.text.primary,
      fontFamily: 'DMSans_400Regular',
      fontSize: fontSizes.md,
    },
    inputWithLeadingIcon: {
      paddingLeft: HORIZONTAL_PADDING + ICON_SLOT_SIZE + LEADING_GAP,
    },
    inputWithoutLeadingIcon: {
      paddingLeft: HORIZONTAL_PADDING,
    },
    inputWithLabel: {
      paddingTop: labelLayout.inputPaddingTop,
      paddingBottom: labelLayout.inputPaddingBottom,
    },
    inputWithoutLabel: {
      paddingTop: 0,
      paddingBottom: 0,
      textAlignVertical: 'center',
    },
    checkIcon: {
      position: 'absolute',
      right: HORIZONTAL_PADDING,
      top: 19,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Sem altura fixa: cresce com o texto (quebra em várias linhas, nada é
    // cortado) e só existe enquanto há erro — sem erro, não ocupa espaço.
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

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[styles.fieldOuter, !editable && styles.fieldDisabled, { borderColor: animatedBorderColor }]}
      >
        {/* Camada de fundo — simula superfície de vidro */}
        <View style={styles.fieldBg} />
        {/* Highlight superior — simula luz vinda de cima */}
        <View style={styles.fieldHighlight} />

        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}

        {hasLabel ? (
          <Animated.Text
            maxFontSizeMultiplier={AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER}
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
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          placeholder={undefined}
          placeholderTextColor={colors.overlay.plum[35]}
          selectionColor={colors.brand.pulse}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChangeText={handleChangeText}
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeadingIcon : styles.inputWithoutLeadingIcon,
            hasLabel ? styles.inputWithLabel : styles.inputWithoutLabel,
            style,
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[styles.checkIcon, { opacity: checkProgress }]}
        >
          <AntDesign name="check-circle" size={18} color={colors.feedback.success} />
        </Animated.View>
      </Animated.View>

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
          <Text maxFontSizeMultiplier={AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER} style={styles.errorText}>
            {visibleError}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
});
