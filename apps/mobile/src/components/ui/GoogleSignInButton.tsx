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
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useAppTranslation } from '../../hooks/useAppTranslation';

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

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('auth.google_sign_in')}
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
    >
      <View style={styles.content}>
        {isLoading ? (
          // Indicador centralizado — mesma altura do conteúdo normal
          <ActivityIndicator size="small" color="#5F6368" />
        ) : (
          <>
            {/* Ícone Google — cor azul da marca (#4285F4) */}
            <AntDesign name="google" size={20} color="#4285F4" />
            <Text style={styles.label}>{t('auth.google_sign_in')}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
// Segue as diretrizes visuais do Google para botões de Sign In:
// fundo branco, borda cinza (#DADCE0), texto escuro (#3C4043), raio 8dp.
// https://developers.google.com/identity/branding-guidelines

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    // Leve sombra para destacar do fundo em telas claras
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3C4043',
    letterSpacing: 0.25,
  },
});
