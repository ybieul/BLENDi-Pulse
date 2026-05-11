// apps/mobile/src/screens/FavoritesListScreen.tsx
// Placeholder para CP1.7 — lista de receitas favoritas do usuário.
// Este arquivo será substituído integralmente no Checkpoint 1.7.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';

export function FavoritesListScreen() {
  const { t } = useAppTranslation();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.iconShell}>
          <Ionicons name="heart" size={28} color={colors.brand.pulse} />
        </View>
        <Text style={styles.title}>{t('recipes.favorites.title')}</Text>
        <Text style={styles.subtitle}>{t('recipes.favorites.empty_message')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing['3xl'],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    width: '100%',
  },
  iconShell: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(154,72,147,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
