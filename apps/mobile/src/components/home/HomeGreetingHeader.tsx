// apps/mobile/src/components/home/HomeGreetingHeader.tsx
// Cabeçalho da Home: saudação com o PRIMEIRO nome, data, indicador de nível
// e badge do plano (teste no build EAS 25-26/11).
//
// Antes: a saudação usava o nome completo e o nível/badge ficavam em
// posição absoluta por cima do bloco de texto — um nome longo passava por
// baixo deles. Agora é uma linha: o texto ocupa o espaço que sobra (flex 1,
// minWidth 0) e corta com reticências numa linha só; nível e badge têm a
// largura deles e nunca encolhem.

import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors as staticColors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';

const BADGE_HEIGHT = 24;
const BADGE_PADDING_H = 10;
const BADGE_PRO_BACKGROUND = staticColors.overlay.pulse[25];
const BADGE_PRO_BORDER = staticColors.overlay.pulse[40];
export const LEVEL_PROGRESS_BAR_WIDTH = 40;

export interface HomeGreetingHeaderProps {
  /** Saudação já traduzida ("Bom dia, Gabriel."). */
  greeting: string;
  formattedDate: string;
  level: number;
  /** Largura animada da barra de progresso do nível (0..LEVEL_PROGRESS_BAR_WIDTH). */
  levelProgressWidth: Animated.Value;
  isPro: boolean;
  onLevelPress: () => void;
}

export function HomeGreetingHeader({
  greeting,
  formattedDate,
  level,
  levelProgressWidth,
  isPro,
  onLevelPress,
}: HomeGreetingHeaderProps) {
  const colors = useColors();
  const { t } = useAppTranslation();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 24,
      gap: spacing.md,
    },
    textBlock: {
      flex: 1,
      minWidth: 0,
    },
    greetingText: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
    },
    greetingDate: {
      marginTop: 4,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: spacing.sm,
    },
    levelIndicatorContent: {
      alignItems: 'center',
    },
    levelIndicatorText: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: 11,
      fontWeight: fontWeights.bold,
    },
    levelIndicatorTrack: {
      marginTop: 3,
      width: LEVEL_PROGRESS_BAR_WIDTH,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.overlay.plum[10],
      overflow: 'hidden',
    },
    levelIndicatorFill: {
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.brand.pulse,
    },
    badge: {
      height: BADGE_HEIGHT,
      paddingHorizontal: BADGE_PADDING_H,
      borderRadius: BADGE_HEIGHT / 2,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeFree: {
      backgroundColor: colors.overlay.plum[8],
      borderColor: colors.overlay.plum[12],
    },
    badgePro: {
      backgroundColor: BADGE_PRO_BACKGROUND,
      borderColor: BADGE_PRO_BORDER,
    },
    badgeText: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.semibold,
    },
  });

  const levelLabel = `${t('gamification.levelPrefix')} ${level}`;

  return (
    <View style={styles.container} testID="home-greeting-header">
      <View style={styles.textBlock} testID="home-greeting-text-block">
        <Text
          accessibilityRole="header"
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.greetingText}
          testID="home-greeting"
        >
          {greeting}
        </Text>
        <Text numberOfLines={1} style={styles.greetingDate}>
          {formattedDate}
        </Text>
      </View>

      <View style={styles.actions} testID="home-greeting-actions">
        <TouchableOpacity
          accessibilityLabel={levelLabel}
          accessibilityRole="button"
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          onPress={onLevelPress}
        >
          <View style={styles.levelIndicatorContent}>
            <Text style={styles.levelIndicatorText}>{levelLabel}</Text>
            <View style={styles.levelIndicatorTrack}>
              <Animated.View style={[styles.levelIndicatorFill, { width: levelProgressWidth }]} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={[styles.badge, isPro ? styles.badgePro : styles.badgeFree]}>
          <Text style={styles.badgeText}>{isPro ? t('home.proPlan') : t('home.freePlan')}</Text>
        </View>
      </View>
    </View>
  );
}
