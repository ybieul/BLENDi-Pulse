// apps/mobile/src/screens/onboarding/OnboardingModelScreen.tsx
// Passo 1 do fluxo de onboarding: seleção do modelo BLENDi.
//
// O usuário escolhe entre Lite, Pro+ e Steel. O CTA só fica habilitado após
// a seleção; ao confirmar, o valor é gravado no onboarding store (em memória)
// e o fluxo avança para a tela de objetivo.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fonts, spacing } from '@blendi/shared';
import { AuthButton } from '../../components/ui/AuthButton';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { SelectionCard } from '../../components/ui/SelectionCard';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useOnboardingStore } from '../../store/onboarding.store';

type OnboardingModelScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingGoal') => void;
  };
};

const MODELS = [
  { key: 'Lite', title: 'BLENDi Lite', badge: 'Starter', descKey: 'onboarding.modelLiteDesc' },
  { key: 'ProPlus', title: 'BLENDi Pro+', badge: '120W', descKey: 'onboarding.modelProDesc' },
  { key: 'Steel', title: 'BLENDi Steel', badge: '180W', descKey: 'onboarding.modelSteelDesc' },
] as const;

export function OnboardingModelScreen({ navigation }: OnboardingModelScreenProps) {
  const { t } = useAppTranslation();
  const selectedModel = useOnboardingStore((state) => state.selectedModel);
  const setModel = useOnboardingStore((state) => state.setModel);

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

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={1}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.modelTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.modelSubtitle')}</Text>
            <View style={styles.cardList}>
              {MODELS.map(({ key, title, badge, descKey }) => (
                <SelectionCard
                  key={key}
                  title={title}
                  badge={badge}
                  subtitle={t(descKey)}
                  selected={selectedModel === key}
                  onPress={() => { setModel(key); }}
                />
              ))}
            </View>
          </View>
        )}
        bottomContent={(
          <AuthButton
            disabled={selectedModel === null}
            onPress={() => { navigation.navigate('OnboardingGoal'); }}
          >
            {t('onboarding.continue')}
          </AuthButton>
        )}
      />
    </Animated.View>
  );
}

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
