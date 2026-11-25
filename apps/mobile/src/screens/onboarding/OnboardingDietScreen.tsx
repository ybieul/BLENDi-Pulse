// apps/mobile/src/screens/onboarding/OnboardingDietScreen.tsx
// Passo 3 do fluxo de onboarding: restrições alimentares.
//
// Múltipla escolha (tocar marca e desmarca) entre dairy_free, vegan, nut_free
// e no_added_sugar. Pode continuar sem marcar nada — o botão deixa isso claro.
// As escolhas ficam no onboarding store e vão no PATCH final do
// OnboardingMacrosScreen; a Pulse AI e o Pantry Scanner aplicam pelo prompt.
//
// CP-B6: logo abaixo, a pergunta OPCIONAL "Você tem alguma alergia?" (os 8
// botões e o campo livre, AllergiesPicker). Pular = não marcar nada; vai no
// mesmo PATCH final só quando há alguma alergia.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { fontSizes, fonts, spacing } from '@blendi/shared';
import { AuthButton } from '../../components/ui/AuthButton';
import { AllergiesPicker } from '../../components/allergies/AllergiesPicker';
import { DietaryPreferencesPicker } from '../../components/ui/DietaryPreferencesPicker';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useOnboardingStore } from '../../store/onboarding.store';

type OnboardingDietScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingBody') => void;
  };
};

export function OnboardingDietScreen({ navigation }: OnboardingDietScreenProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const dietaryPreferences = useOnboardingStore((state) => state.dietaryPreferences);
  const toggleDietaryPreference = useOnboardingStore((state) => state.toggleDietaryPreference);
  const allergies = useOnboardingStore((state) => state.allergies);
  const setAllergies = useOnboardingStore((state) => state.setAllergies);

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
    allergySection: {
      gap: spacing.md,
      paddingTop: spacing.lg,
    },
    allergyTitle: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['2xl'],
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
            <DietaryPreferencesPicker
              selected={dietaryPreferences}
              onToggle={toggleDietaryPreference}
            />
            <View style={styles.allergySection} testID="onboarding-allergies-section">
              <Text style={styles.allergyTitle} accessibilityRole="header">{t('allergies.picker.title')}</Text>
              <Text style={styles.subtitle}>{t('allergies.picker.subtitle')}</Text>
              <AllergiesPicker value={allergies} onChange={setAllergies} />
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
