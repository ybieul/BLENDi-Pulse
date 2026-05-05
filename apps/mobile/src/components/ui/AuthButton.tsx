import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  type GestureResponderEvent,
  type TouchableOpacityProps,
} from 'react-native';
import {
  borderRadius,
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

const BUTTON_HEIGHT = 56;
const BUTTON_FONT_SIZE = 16;
const PRESS_SCALE = 0.97;
const LOADING_FADE_DURATION = 150;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export interface AuthButtonProps extends TouchableOpacityProps {
  loading?: boolean;
  fullWidth?: boolean;
}

export function AuthButton({
  loading = false,
  fullWidth = true,
  disabled,
  style,
  children,
  onPressIn,
  onPressOut,
  accessibilityRole,
  accessibilityState,
  ...touchableProps
}: AuthButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const loaderOpacity = useRef(new Animated.Value(loading ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: loading ? 0 : 1,
        duration: LOADING_FADE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(loaderOpacity, {
        toValue: loading ? 1 : 0,
        duration: LOADING_FADE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, loaderOpacity, loading]);

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      stiffness: 420,
      damping: 28,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    animateScale(PRESS_SCALE);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animateScale(1);
    onPressOut?.(event);
  };

  const renderContent = (content: ReactNode) => {
    if (typeof content === 'string' || typeof content === 'number') {
      return <Text style={styles.label}>{content}</Text>;
    }

    return content;
  };

  const isDisabled = disabled || loading;

  return (
    <AnimatedTouchableOpacity
      {...touchableProps}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: Boolean(isDisabled),
      }}
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
        { transform: [{ scale }] },
      ]}
    >
      <Animated.View style={[styles.content, { opacity: contentOpacity }]}> 
        {renderContent(children)}
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.loader, { opacity: loaderOpacity }]}> 
        <ActivityIndicator size="small" color={colors.text.primary} />
      </Animated.View>
    </AnimatedTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'relative',
    height: BUTTON_HEIGHT,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.brand.pulse,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.92,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: BUTTON_FONT_SIZE,
    fontWeight: fontWeights.medium,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});