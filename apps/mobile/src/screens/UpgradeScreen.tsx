import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';

export function UpgradeScreen() {
  const { t } = useAppTranslation();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('profile.subscription.pro_label')}</Text>
      <Text style={styles.subtitle}>{t('profile.subscription.upgrade_cta')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
    backgroundColor: colors.background.primary,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.lg,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
});