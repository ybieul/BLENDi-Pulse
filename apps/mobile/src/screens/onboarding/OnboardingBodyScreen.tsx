// apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx
// Passo 3 do fluxo de onboarding: coleta de dados corporais e cálculo de macros.
//
// Dois inputs numéricos (peso kg / altura cm) disparam POST /users/calculate-macros
// com debounce de 600ms. O IMC e a classificação são exibidos em tempo real.
// Um seletor de nível de atividade recalcula ao ser alterado.
//
// Caminho principal: preenche dados → CTA "Calcular macros" salva no store e
// avança para OnboardingMacros.
// Caminho alternativo: link "Pular por agora" avança sem salvar dados corporais.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { api } from '../../config/api';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useOnboardingStore } from '../../store/onboarding.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityLevel = 'sedentary' | 'lightlyActive' | 'moderatelyActive' | 'veryActive';
type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';

interface MacroResult {
  imc: number;
  imcClassification: 'underweight' | 'normal' | 'overweight' | 'obese';
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  tdee: number;
}

type OnboardingBodyScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingMacros') => void;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 600;
const DEFAULT_ACTIVITY: ActivityLevel = 'moderatelyActive';
const DEFAULT_GOAL: UserGoal = 'Wellness';

// Altura do campo AuthInput — must match FIELD_HEIGHT in AuthInput.tsx
const FIELD_HEIGHT = 56;

// Afasta o label de unidade do ícone de check que fica em right: 16 (tamanho 18)
const UNIT_LABEL_RIGHT = spacing['5xl']; // 40
const CHIP_BORDER_COLOR = `${colors.text.primary}26`;
const CHIP_BACKGROUND_COLOR = `${colors.text.primary}0d`;
const CHIP_SELECTED_BACKGROUND_COLOR = `${colors.brand.pulse}26`;

type ActivityConfig = {
  key: ActivityLevel;
  labelKey:
    | 'onboarding.activitySedentary'
    | 'onboarding.activityLight'
    | 'onboarding.activityModerate'
    | 'onboarding.activityVery';
};

const ACTIVITY_LEVELS: ActivityConfig[] = [
  { key: 'sedentary', labelKey: 'onboarding.activitySedentary' },
  { key: 'lightlyActive', labelKey: 'onboarding.activityLight' },
  { key: 'moderatelyActive', labelKey: 'onboarding.activityModerate' },
  { key: 'veryActive', labelKey: 'onboarding.activityVery' },
];

const IMC_CLASS_KEYS = {
  underweight: 'onboarding.imcUnderweight',
  normal: 'onboarding.imcNormal',
  overweight: 'onboarding.imcOverweight',
  obese: 'onboarding.imcObese',
} as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export function OnboardingBodyScreen({ navigation }: OnboardingBodyScreenProps) {
  const { t } = useAppTranslation();
  const selectedGoal = useOnboardingStore((state) => state.selectedGoal);
  const setBodyData = useOnboardingStore((state) => state.setBodyData);
  const setCalculatedMacros = useOnboardingStore((state) => state.setCalculatedMacros);

  const [weightText, setWeightText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<MacroResult | null>(null);

  // Parse and validate inputs
  const weightNum = parseFloat(weightText.replace(',', '.'));
  const heightNum = parseInt(heightText, 10);
  const weightValid = !isNaN(weightNum) && weightNum >= 20 && weightNum <= 300;
  const heightValid = !isNaN(heightNum) && heightNum >= 100 && heightNum <= 250;
  const canFetch = weightValid && heightValid;

  // Debounced API call — stale flag prevents setting state from an outdated request
  useEffect(() => {
    if (!canFetch) {
      setResult(null);
      setIsCalculating(false);
      return;
    }

    const goal: UserGoal = (selectedGoal as UserGoal | null) ?? DEFAULT_GOAL;
    let stale = false;

    const timer = setTimeout(() => {
      void (async () => {
        setIsCalculating(true);
        try {
          const response = await api.post<{ success: true; data: MacroResult }>(
            '/users/calculate-macros',
            { weight: weightNum, height: heightNum, activityLevel, goal },
          );
          if (!stale) {
            setResult(response.data.data);
          }
        } catch {
          if (!stale) {
            setResult(null);
          }
        } finally {
          if (!stale) {
            setIsCalculating(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [canFetch, weightNum, heightNum, activityLevel, selectedGoal]);

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

  const handleContinue = () => {
    if (!result) return;
    setBodyData({ weight: weightNum, height: heightNum, activityLevel });
    setCalculatedMacros({
      calculatedProtein: result.dailyProteinTarget,
      calculatedCalories: result.dailyCalorieTarget,
      imc: result.imc,
    });
    navigation.navigate('OnboardingMacros');
  };

  const handleSkip = () => {
    navigation.navigate('OnboardingMacros');
  };

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={3}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.bodyTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.bodySubtitle')}</Text>

            {/* Campos numéricos com label de unidade sobreposto */}
            <View style={styles.fields}>
              <View style={styles.inputContainer}>
                <AuthInput
                  value={weightText}
                  onChangeText={setWeightText}
                  placeholder={t('onboarding.weightPlaceholder')}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
                <View pointerEvents="none" style={styles.unitOverlay}>
                  <Text style={styles.unitText}>kg</Text>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <AuthInput
                  value={heightText}
                  onChangeText={setHeightText}
                  placeholder={t('onboarding.heightPlaceholder')}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <View pointerEvents="none" style={styles.unitOverlay}>
                  <Text style={styles.unitText}>cm</Text>
                </View>
              </View>
            </View>

            {/* IMC em tempo real */}
            {canFetch ? (
              <View style={styles.imcContainer}>
                {isCalculating ? (
                  <ActivityIndicator size="small" color={colors.brand.pulse} />
                ) : result ? (
                  <View style={styles.imcContent}>
                    <Text style={styles.imcValue}>
                      {t('onboarding.imcLabel')} {result.imc.toFixed(1)}
                    </Text>
                    <Text style={styles.imcClassification}>
                      {t(IMC_CLASS_KEYS[result.imcClassification])}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Seletor de nível de atividade */}
            <View style={styles.chipRow}>
              {ACTIVITY_LEVELS.map(({ key, labelKey }) => (
                <Pressable
                  key={key}
                  onPress={() => { setActivityLevel(key); }}
                  style={[styles.chip, activityLevel === key && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activityLevel === key }}
                >
                  <Text style={[styles.chipLabel, activityLevel === key && styles.chipLabelSelected]}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        bottomContent={(
          <View style={styles.bottomContent}>
            <AuthButton
              disabled={result === null}
              onPress={handleContinue}
            >
              {t('onboarding.calculateMacros')}
            </AuthButton>
            <Pressable onPress={handleSkip} style={styles.skipLink} accessibilityRole="button">
              <Text style={styles.skipText}>{t('onboarding.skipCalculation')}</Text>
            </Pressable>
          </View>
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
  fields: {
    gap: spacing.md,
  },
  // Wrapper relativo para sobrepor o label de unidade sobre o AuthInput
  inputContainer: {
    position: 'relative',
  },
  // Label de unidade (kg / cm) — absoluto dentro de inputContainer,
  // alinhado à altura do fieldOuter (56px). Posicionado a 40px da direita
  // para não colidir com o ícone de check (right: 16, tamanho 18).
  unitOverlay: {
    position: 'absolute',
    right: UNIT_LABEL_RIGHT,
    top: 0,
    height: FIELD_HEIGHT,
    justifyContent: 'center',
  },
  unitText: {
    color: colors.text.tertiary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  imcContainer: {
    minHeight: spacing['4xl'],
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  imcContent: {
    gap: spacing.xs,
  },
  imcValue: {
    color: colors.text.primary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
  },
  // Classificação em cor secundária — sem cores alarmistas
  imcClassification: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minWidth: 70,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: spacing['4xl'],
    borderWidth: 1,
    borderColor: CHIP_BORDER_COLOR,
    backgroundColor: CHIP_BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.brand.pulse,
    backgroundColor: CHIP_SELECTED_BACKGROUND_COLOR,
  },
  chipLabel: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  chipLabelSelected: {
    color: colors.text.primary,
    fontWeight: fontWeights.medium,
  },
  bottomContent: {
    gap: spacing.lg,
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
});
