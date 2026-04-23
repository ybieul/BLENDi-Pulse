// apps/mobile/src/components/ui/SkeletonLoader.tsx
// Componente de fundação — usado em TODA tela com operação assíncrona.
// Nunca mostre tela em branco ou spinner genérico. Use sempre o SkeletonLoader.

import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, borderRadius, spacing } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SkeletonVariant = 'line' | 'card' | 'circle' | 'input';

interface BaseSkeletonProps {
  /** Acessibilidade — sobrescreve o label padrão se necessário */
  accessibilityLabel?: string;
  /** Estilo adicional no container externo */
  style?: ViewStyle;
}

// ─── Tipos de props da variante line ─────────────────────────────────────────
// Largura aceita number (pt) ou string percentual ('70%', '100%')
type LineWidth = number | `${number}%`;

interface LineProps extends BaseSkeletonProps {
  variant: 'line';
  /** Largura da linha — número (pt) ou string percentual ('70%'). Padrão: '100%' */
  width?: LineWidth;
  /** Altura da linha em pt. Padrão: 14 */
  height?: number;
}

interface CardProps extends BaseSkeletonProps {
  variant: 'card';
}

interface CircleProps extends BaseSkeletonProps {
  variant: 'circle';
  /** Diâmetro do círculo em pt. Padrão: 40 */
  size?: number;
}

interface InputProps extends BaseSkeletonProps {
  variant: 'input';
}

export type SkeletonLoaderProps = LineProps | CardProps | CircleProps | InputProps;

// ─── Constantes de animação ───────────────────────────────────────────────────

const ANIMATION_DURATION = 1200; // ms por ciclo completo

// ─── Componente base ──────────────────────────────────────────────────────────

export function SkeletonLoader(props: SkeletonLoaderProps) {
  const { t } = useAppTranslation();
  const opacity = useRef(new Animated.Value(0.3)).current;

  // Shimmer: opacidade 30% → 100% → 30%, loop infinito na UI thread
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const label = props.accessibilityLabel ?? t('common.states.loading');

  switch (props.variant) {
    case 'line': {
      const { width = '100%', height = 14, style } = props;
      // View externo controla dimensões (aceita string | number sem conflito)
      // Animated.View interno controla apenas opacity + cor
      return (
        <View
          style={[{ width, height }, style]}
          accessibilityLabel={label}
          accessibilityRole="none"
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity, backgroundColor: colors.background.secondary, borderRadius: borderRadius.sm },
            ]}
          />
        </View>
      );
    }

    case 'card': {
      const { style } = props;
      return (
        <View
          style={[styles.card, style]}
          accessibilityLabel={label}
          accessibilityRole="none"
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity, backgroundColor: colors.background.secondary, borderRadius: borderRadius.lg }]}
          />
        </View>
      );
    }

    case 'circle': {
      const { size = 40, style } = props;
      const radius = size / 2;
      return (
        <View
          style={[styles.circle, { width: size, height: size, borderRadius: radius }, style]}
          accessibilityLabel={label}
          accessibilityRole="none"
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity, backgroundColor: colors.background.secondary }]}
          />
        </View>
      );
    }

    case 'input': {
      const { style } = props;
      return (
        <View
          style={[styles.input, style]}
          accessibilityLabel={label}
          accessibilityRole="none"
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity, backgroundColor: colors.background.secondary, borderRadius: borderRadius.md }]}
          />
        </View>
      );
    }
  }
}

// ─── Estilos base ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    height: 200,
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  circle: {
    overflow: 'hidden',
  },
  input: {
    height: 48,
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
});

// ─── Composição 1: RecipeCardSkeleton ─────────────────────────────────────────
// Imita a estrutura de um card de receita completo.
// Uso: enquanto o Pulse AI ou a API de receitas está respondendo.

export function RecipeCardSkeleton() {
  return (
    <View style={compositions.recipeCard}>
      {/* Imagem / header do card */}
      <SkeletonLoader variant="card" />

      <View style={compositions.recipeCardBody}>
        {/* Título da receita */}
        <SkeletonLoader variant="line" height={18} width="65%" />

        <View style={compositions.recipeCardLines}>
          {/* Ingredientes — larguras variadas para parecer natural */}
          <SkeletonLoader variant="line" height={13} width="80%" />
          <SkeletonLoader variant="line" height={13} width="60%" />
          <SkeletonLoader variant="line" height={13} width="72%" />
        </View>

        {/* Botão de ação */}
        <SkeletonLoader variant="input" style={compositions.recipeCardButton} />
      </View>
    </View>
  );
}

// ─── Composição 2: ChatMessageSkeleton ────────────────────────────────────────
// Imita uma resposta do Pulse AI no chat.
// Uso: enquanto o GPT-4o processa a resposta (~1–3s).

export function ChatMessageSkeleton() {
  return (
    <View style={compositions.chatMessage}>
      {/* Avatar do assistente */}
      <SkeletonLoader variant="circle" size={32} />

      <View style={compositions.chatMessageLines}>
        {/* Linha 1 — largura total */}
        <SkeletonLoader variant="line" height={14} width="100%" />
        {/* Linha 2 — 70% da largura para parecer texto real */}
        <SkeletonLoader variant="line" height={14} width="70%" />
      </View>
    </View>
  );
}

// ─── Composição 3: ProfileSkeleton ───────────────────────────────────────────
// Imita os dados do perfil do usuário.
// Uso: enquanto os dados do usuário carregam da API após login.

export function ProfileSkeleton() {
  return (
    <View style={compositions.profile}>
      {/* Avatar grande centralizado */}
      <SkeletonLoader
        variant="circle"
        size={80}
        style={compositions.profileAvatar}
      />

      {/* Nome do usuário */}
      <SkeletonLoader
        variant="line"
        height={20}
        width="50%"
        style={compositions.profileLine}
      />

      {/* Email ou subtítulo */}
      <SkeletonLoader
        variant="line"
        height={14}
        width="38%"
        style={compositions.profileLine}
      />
    </View>
  );
}

// ─── Estilos das composições ──────────────────────────────────────────────────

const compositions = StyleSheet.create({
  // RecipeCardSkeleton
  recipeCard: {
    width: '100%',
  },
  recipeCardBody: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  recipeCardLines: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  recipeCardButton: {
    marginTop: spacing.md,
    height: 44,
  },

  // ChatMessageSkeleton
  chatMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  chatMessageLines: {
    flex: 1,
    gap: spacing.sm,
  },

  // ProfileSkeleton
  profile: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  profileAvatar: {
    marginBottom: spacing.md,
  },
  profileLine: {
    alignSelf: 'center',
  },
});
