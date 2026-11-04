// apps/mobile/src/components/ui/AppleSignInButton.tsx
// Botão de login com Apple — usa o componente oficial do
// expo-apple-authentication (AppleAuthenticationButton). As guidelines de
// review da App Store exigem esse componente nativo; um botão customizado
// aqui (como o do Google) é motivo real de rejeição.
//
// Diferente do GoogleSignInButton, este componente não controla a própria
// aparência interna (texto, ícone, spinner) — só:
//   ✅ Verifica disponibilidade (AppleAuthentication.isAvailableAsync())
//   ✅ Ignora toques e reduz a opacidade enquanto isLoading=true
//   ✅ Propaga onPress ao componente pai
//
// Este componente NÃO conhece nada sobre OAuth, tokens ou estado de sessão.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const BUTTON_HEIGHT = 52;
const BUTTON_CORNER_RADIUS = 14;
const DISABLED_OPACITY = 0.92;

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface AppleSignInButtonProps {
  /** Disparado quando o usuário toca no botão (ignorado se isLoading=true). */
  onPress: () => void;
  /** Quando true, ignora toques e reduz a opacidade do botão. */
  isLoading: boolean;
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function AppleSignInButton({ onPress, isLoading }: AppleSignInButtonProps) {
  const { t } = useAppTranslation();
  const [isAvailable, setIsAvailable] = React.useState(false);

  React.useEffect(() => {
    void AppleAuthentication.isAvailableAsync()
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false));
  }, []);

  if (!isAvailable) {
    return null;
  }

  const handlePress = () => {
    if (isLoading) return;
    onPress();
  };

  return (
    <View style={[styles.wrapper, isLoading && styles.disabled]}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={BUTTON_CORNER_RADIUS}
        style={styles.button}
        onPress={handlePress}
        accessibilityLabel={t('auth.apple_sign_in')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  button: {
    width: '100%',
    height: BUTTON_HEIGHT,
  },
});
