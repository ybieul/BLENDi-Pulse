// apps/mobile/src/screens/onboarding/OnboardingGoalScreen.tsx
// Passo 2 do fluxo de onboarding: seleção do objetivo principal do usuário.
//
// O usuário escolhe entre Muscle, Wellness, Energy ou Recovery. O CTA só fica
// habilitado após a seleção; ao confirmar, o valor é gravado no onboarding
// store e o fluxo avança para a coleta de dados corporais.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ComponentProps } from 'react';
import { fontSizes, fonts, spacing } from '@blendi/shared';
import { AuthButton } from '../../components/ui/AuthButton';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { SelectionCard } from '../../components/ui/SelectionCard';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useOnboardingStore } from '../../store/onboarding.store';

const ICON_SIZE = 22;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type OnboardingGoalScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingBody') => void;
  };
};

const GOALS: ReadonlyArray<{
  key: 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
  titleKey: 'onboarding.goalMuscle' | 'onboarding.goalWellness' | 'onboarding.goalEnergy' | 'onboarding.goalRecovery';
  descKey: 'onboarding.goalMuscleDesc' | 'onboarding.goalWellnessDesc' | 'onboarding.goalEnergyDesc' | 'onboarding.goalRecoveryDesc';
  iconName: IoniconName;
}> = [
  {
    key: 'Muscle',
    titleKey: 'onboarding.goalMuscle',
    descKey: 'onboarding.goalMuscleDesc',
    iconName: 'barbell-outline',
  },
  {
    key: 'Wellness',
    titleKey: 'onboarding.goalWellness',
    descKey: 'onboarding.goalWellnessDesc',
    iconName: 'heart-outline',
  },
  {
    key: 'Energy',
    titleKey: 'onboarding.goalEnergy',
    descKey: 'onboarding.goalEnergyDesc',
    iconName: 'flash-outline',
  },
  {
    key: 'Recovery',
    titleKey: 'onboarding.goalRecovery',
    descKey: 'onboarding.goalRecoveryDesc',
    iconName: 'moon-outline',
  },
];

export function OnboardingGoalScreen({ navigation }: OnboardingGoalScreenProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const selectedGoal = useOnboardingStore((state) => state.selectedGoal);
  const setGoal = useOnboardingStore((state) => state.setGoal);

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
  });

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={2}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.goal.title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.goal.subtitle')}</Text>
            <View style={styles.cardList}>
              {GOALS.map(({ key, titleKey, descKey, iconName }) => (
                <SelectionCard
                  key={key}
                  title={t(titleKey)}
                  subtitle={t(descKey)}
                  icon={<Ionicons name={iconName} size={ICON_SIZE} color={colors.text.primary} />}
                  selected={selectedGoal === key}
                  onPress={() => { setGoal(key); }}
                />
              ))}
            </View>
          </View>
        )}
        bottomContent={(
          <AuthButton
            disabled={selectedGoal === null}
            onPress={() => { navigation.navigate('OnboardingBody'); }}
          >
            {t('onboarding.continue')}
          </AuthButton>
        )}
      />
    </Animated.View>
  );
}
