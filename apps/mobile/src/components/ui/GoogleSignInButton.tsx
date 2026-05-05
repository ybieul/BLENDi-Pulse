// apps/mobile/src/components/ui/GoogleSignInButton.tsx
// Botão de login com Google — componente de apresentação pura.
//
// Responsabilidades:
//   ✅ Exibir ícone do Google + texto traduzido
//   ✅ Indicar carregamento (ActivityIndicator) e bloquear cliques duplos
//   ✅ Propagar onPress ao componente pai
//
// Este componente NÃO conhece nada sobre OAuth, tokens ou estado de sessão.
// Toda a lógica de autenticação fica no hook useGoogleAuth — este componente
// apenas reflete o estado recebido via props.

import React from 'react';
import {
  Animated,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  Easing,
  type GestureResponderEvent,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import {
  borderRadius,
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const BUTTON_HEIGHT = 56;
const PRESS_SCALE = 0.97;
const LOADING_FADE_DURATION = 150;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface GoogleSignInButtonProps {
  /** Disparado quando o usuário toca no botão (ignorado se isLoading=true). */
  onPress: () => void;
  /** Quando true, exibe um indicador de carregamento e desabilita o botão. */
  isLoading: boolean;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function GoogleSignInButton({ onPress, isLoading }: GoogleSignInButtonProps) {
  const { t } = useAppTranslation();
  const scale = React.useRef(new Animated.Value(1)).current;
  const contentOpacity = React.useRef(new Animated.Value(isLoading ? 0 : 1)).current;
  const loaderOpacity = React.useRef(new Animated.Value(isLoading ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: isLoading ? 0 : 1,
        duration: LOADING_FADE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(loaderOpacity, {
        toValue: isLoading ? 1 : 0,
        duration: LOADING_FADE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, isLoading, loaderOpacity]);

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      stiffness: 420,
      damping: 28,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (_event: GestureResponderEvent) => {
    animateScale(PRESS_SCALE);
  };

  const handlePressOut = (_event: GestureResponderEvent) => {
    animateScale(1);
  };

  return (
    <AnimatedTouchableOpacity
      style={styles.button}
      onPress={onPress}
      disabled={isLoading}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={t('auth.google_sign_in')}
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
    >
      <Animated.View style={[styles.pressLayer, { transform: [{ scale }] }]}> 
        <Animated.View style={[styles.content, { opacity: contentOpacity }]}> 
          <AntDesign name="google" size={18} color="#4285F4" />
          <Text style={styles.label}>{t('auth.google_sign_in')}</Text>
        </Animated.View>

        <Animated.View pointerEvents="none" style={[styles.loader, { opacity: loaderOpacity }]}> 
          <ActivityIndicator size="small" color={colors.text.primary} />
        </Animated.View>
      </Animated.View>
    </AnimatedTouchableOpacity>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  pressLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.medium,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
