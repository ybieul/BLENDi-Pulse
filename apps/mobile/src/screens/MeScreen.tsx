import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { borderRadius, colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { api } from '../config/api';
import { QUERY_KEYS } from '../config/cache.config';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { UnitSystemToggle } from '../components/ui/UnitSystemToggle';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useAuthStore } from '../store/auth.store';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';

export function MeScreen() {
  const { t, locale, changeLocale } = useAppTranslation();
  const logout = useAuthStore((state) => state.logout);
  const unitSystem = useAuthStore((state) => state.user?.unitSystem ?? 'metric');
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const queryClient = useQueryClient();

  const [isSavingUnitSystem, setIsSavingUnitSystem] = useState(false);

  const handleUnitSystemChange = async (nextUnitSystem: 'metric' | 'imperial') => {
    if (nextUnitSystem === unitSystem || isSavingUnitSystem) {
      return;
    }

    setIsSavingUnitSystem(true);

    try {
      await api.patch('/users/me', { unitSystem: nextUnitSystem });
      updateUserProfile({ unitSystem: nextUnitSystem });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
    } finally {
      setIsSavingUnitSystem(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Text style={styles.subtitle}>{t('profile.unitSystem')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.unitSystem')}</Text>
          <UnitSystemToggle
            value={unitSystem}
            onChange={(nextValue) => { void handleUnitSystemChange(nextValue); }}
            metricLabel={t('profile.metric')}
            imperialLabel={t('profile.imperial')}
          />
          {isSavingUnitSystem ? (
            <Text style={styles.helperText}>{t('common.actions.save')}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.language.label')}</Text>

          <View style={styles.actions}>
            <Pressable onPress={() => void changeLocale('en')} style={styles.actionButton}>
              <Text style={styles.actionButtonLabel}>{t('profile.language.en')}</Text>
            </Pressable>

            <Pressable onPress={() => void changeLocale('pt-BR')} style={styles.actionButton}>
              <Text style={styles.actionButtonLabel}>{t('profile.language.pt_BR')}</Text>
            </Pressable>

            <Text style={styles.helperText}>{`${t('profile.language.label')}: ${locale}`}</Text>

            {__DEV__ ? (
              <Pressable onPress={() => void logout()} style={styles.actionButton}>
                <Text style={styles.actionButtonLabel}>Dev: reset session</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['5xl'],
    paddingBottom: spacing['6xl'],
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes['4xl'],
    lineHeight: 48,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    lineHeight: 24,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  actions: {
    gap: spacing.md,
  },
  actionButton: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  actionButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  helperText: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
  },
});