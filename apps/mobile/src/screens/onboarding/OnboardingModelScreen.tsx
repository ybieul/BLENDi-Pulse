// apps/mobile/src/screens/onboarding/OnboardingModelScreen.tsx
// Passo 1 do fluxo de onboarding: seleção do modelo BLENDi.
//
// O usuário escolhe entre Lite, Pro+, Steel, "outro modelo ou modelo antigo"
// e "ainda não tenho um BLENDi" (as duas últimas gravam blendiModel 'Lite' e a
// posse correspondente). Em "outro modelo", um campo opcional aceita marca e
// modelo. O CTA só fica habilitado após a seleção; ao confirmar, o valor é
// gravado no onboarding store (em memória) e o fluxo avança para o objetivo.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { fontSizes, fonts, OTHER_BLENDER_MODEL_MAX_LENGTH, spacing } from '@blendi/shared';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { SelectionCard } from '../../components/ui/SelectionCard';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useOnboardingStore } from '../../store/onboarding.store';
import { BLENDER_OPTIONS, resolveBlenderOption } from '../../utils/blenderOwnership.utils';

type OnboardingModelScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingGoal') => void;
  };
};

export function OnboardingModelScreen({ navigation }: OnboardingModelScreenProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const selectedModel = useOnboardingStore((state) => state.selectedModel);
  const blendiOwnership = useOnboardingStore((state) => state.blendiOwnership);
  const otherBlenderModel = useOnboardingStore((state) => state.otherBlenderModel);
  const setModel = useOnboardingStore((state) => state.setModel);
  const setOtherBlenderModel = useOnboardingStore((state) => state.setOtherBlenderModel);

  // Card selecionado: a posse quando não é um BLENDi atual, senão o modelo.
  const selectedOptionKey = selectedModel === null
    ? null
    : blendiOwnership === 'blendi' ? selectedModel : blendiOwnership;

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
        step={1}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.modelTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.modelSubtitle')}</Text>
            <View style={styles.cardList}>
              {BLENDER_OPTIONS.map(({ key, titleKey, badge, descKey }) => (
                <SelectionCard
                  key={key}
                  title={t(titleKey)}
                  badge={badge}
                  subtitle={t(descKey)}
                  selected={selectedOptionKey === key}
                  onPress={() => {
                    const { blendiModel, blendiOwnership: ownership } = resolveBlenderOption(key);
                    setModel(blendiModel, ownership);
                  }}
                />
              ))}
            </View>
            {selectedOptionKey === 'other' ? (
              <AuthInput
                value={otherBlenderModel}
                onChangeText={setOtherBlenderModel}
                placeholder={t('onboarding.otherModelPlaceholder')}
                maxLength={OTHER_BLENDER_MODEL_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            ) : null}
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
