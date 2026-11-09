// apps/mobile/src/screens/onboarding/OnboardingDietScreen.tsx
// Passo 3 do fluxo de onboarding: restrições alimentares.
//
// Múltipla escolha (tocar marca e desmarca) entre dairy_free, vegan, nut_free
// e no_added_sugar. Pode continuar sem marcar nada — o botão deixa isso claro.
// As escolhas ficam no onboarding store e vão no PATCH final do
// OnboardingMacrosScreen; a Pulse AI e o Pantry Scanner aplicam pelo prompt.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fontSizes, fonts, spacing, type DietaryPreference } from '@blendi/shared';
import { AuthButton } from '../../components/ui/AuthButton';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { SelectionCard } from '../../components/ui/SelectionCard';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import type { TranslationKey } from '../../locales/i18n';
import { useOnboardingStore } from '../../store/onboarding.store';

const DISCLAIMER_ICON_SIZE = 16;

type OnboardingDietScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingBody') => void;
  };
};

const DIETS: ReadonlyArray<{
  key: DietaryPreference;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}> = [
  { key: 'dairy_free', titleKey: 'onboarding.diet.dairyFree', descKey: 'onboarding.diet.dairyFreeDesc' },
  { key: 'vegan', titleKey: 'onboarding.diet.vegan', descKey: 'onboarding.diet.veganDesc' },
  { key: 'nut_free', titleKey: 'onboarding.diet.nutFree', descKey: 'onboarding.diet.nutFreeDesc' },
  { key: 'no_added_sugar', titleKey: 'onboarding.diet.noAddedSugar', descKey: 'onboarding.diet.noAddedSugarDesc' },
];

export function OnboardingDietScreen({ navigation }: OnboardingDietScreenProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const dietaryPreferences = useOnboardingStore((state) => state.dietaryPreferences);
  const toggleDietaryPreference = useOnboardingStore((state) => state.toggleDietaryPreference);

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    topContent: {
      gap: spacing.lg,
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

  const hasSelection = dietaryPreferences.length > 0;

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={3}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.diet.title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.diet.subtitle')}</Text>
            <View style={styles.cardList}>
              {DIETS.map(({ key, titleKey, descKey }) => (
                <SelectionCard
                  key={key}
                  title={t(titleKey)}
                  subtitle={t(descKey)}
                  selected={dietaryPreferences.includes(key)}
                  onPress={() => { toggleDietaryPreference(key); }}
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
        )}
        bottomContent={(
          <AuthButton onPress={() => { navigation.navigate('OnboardingBody'); }}>
            {hasSelection ? t('onboarding.continue') : t('onboarding.diet.continueNoRestrictions')}
          </AuthButton>
        )}
      />
    </Animated.View>
  );
}
