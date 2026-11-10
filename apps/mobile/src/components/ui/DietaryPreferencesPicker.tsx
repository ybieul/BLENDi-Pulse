// apps/mobile/src/components/ui/DietaryPreferencesPicker.tsx
// Múltipla escolha das 4 restrições alimentares (dairy_free, vegan, nut_free,
// no_added_sugar) + o alerta de que são preferências, não garantia para
// alergias. Fonte única das opções, dos textos (chaves onboarding.diet.*) e
// do alerta: usado pela tela de dieta do onboarding e pela tela "Minhas
// metas" — quem usa só decide o que acontece ao tocar num card.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fontSizes, fonts, spacing, type DietaryPreference } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import type { TranslationKey } from '../../locales/i18n';
import { SelectionCard } from './SelectionCard';

const DISCLAIMER_ICON_SIZE = 16;

export const DIET_OPTIONS: ReadonlyArray<{
  key: DietaryPreference;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}> = [
  { key: 'dairy_free', titleKey: 'onboarding.diet.dairyFree', descKey: 'onboarding.diet.dairyFreeDesc' },
  { key: 'vegan', titleKey: 'onboarding.diet.vegan', descKey: 'onboarding.diet.veganDesc' },
  { key: 'nut_free', titleKey: 'onboarding.diet.nutFree', descKey: 'onboarding.diet.nutFreeDesc' },
  { key: 'no_added_sugar', titleKey: 'onboarding.diet.noAddedSugar', descKey: 'onboarding.diet.noAddedSugarDesc' },
];

export interface DietaryPreferencesPickerProps {
  selected: readonly DietaryPreference[];
  onToggle: (preference: DietaryPreference) => void;
}

export function DietaryPreferencesPicker({ selected, onToggle }: DietaryPreferencesPickerProps) {
  const colors = useColors();
  const { t } = useAppTranslation();

  const styles = StyleSheet.create({
    root: {
      gap: spacing.lg,
    },
    cardList: {
      gap: spacing.md,
      paddingTop: spacing.sm,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    disclaimerText: {
      flex: 1,
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      lineHeight: 18,
    },
  });

  return (
    <View style={styles.root}>
      <View style={styles.cardList}>
        {DIET_OPTIONS.map(({ key, titleKey, descKey }) => (
          <SelectionCard
            key={key}
            title={t(titleKey)}
            subtitle={t(descKey)}
            selected={selected.includes(key)}
            onPress={() => { onToggle(key); }}
          />
        ))}
      </View>
      <View style={styles.disclaimer}>
        <Ionicons
          name="information-circle-outline"
          size={DISCLAIMER_ICON_SIZE}
          color={colors.text.tertiary}
        />
        <Text style={styles.disclaimerText}>{t('onboarding.diet.disclaimer')}</Text>
      </View>
    </View>
  );
}
