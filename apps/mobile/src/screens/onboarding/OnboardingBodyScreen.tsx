// apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx
// Passo 4 do fluxo de onboarding: coleta de dados corporais e cálculo de macros.
//
// Inputs numéricos de peso (kg ou lbs) e altura (cm, ou pés + polegadas no
// imperial), sempre enviados em kg/cm, disparam POST /users/calculate-macros
// com debounce de 600ms. O IMC e a classificação são exibidos em tempo real.
// Um seletor de nível de atividade recalcula ao ser alterado.
//
// Caminho principal: preenche dados → CTA "Calcular macros" salva no store e
// avança para OnboardingMacros.
// Caminho alternativo: link "Pular por agora" avança sem salvar dados corporais.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getLocales } from 'expo-localization';

import type { CalculateMacrosResponse } from '@blendi/shared';
import { calculateMacrosSchema, colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { api } from '../../config/api';
import { UnitSystemToggle } from '../../components/ui/UnitSystemToggle';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { NumericKeyboardAccessory } from '../../components/ui/NumericKeyboardAccessory';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useNumericFieldChain } from '../../hooks/useNumericFieldChain';
import { useUnits } from '../../hooks/useUnits';
import { useOnboardingStore } from '../../store/onboarding.store';
import {
  BIRTH_DATE_MASKED_LENGTH,
  birthDateInputToIso,
  maskBirthDateInput,
  translateBirthDateError,
} from '../../utils/birthDate.utils';
import {
  HEIGHT_FEET_MAX_LENGTH,
  HEIGHT_INCHES_MAX_LENGTH,
  evaluateBodyFields,
  getBodyNumericFields,
  translateBodyFieldError,
} from '../../utils/bodyFields.utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityLevel = 'sedentary' | 'lightlyActive' | 'moderatelyActive' | 'veryActive';
type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type BiologicalSex = 'male' | 'female';
type WeightGoalOption = 'lose' | 'maintain' | 'gain';

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
const CHIP_SELECTED_BACKGROUND_COLOR = `${colors.brand.pulse}26`;

const KEYBOARD_ACCESSORY_ID = 'onboardingBodyKeyboardAccessory';

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

type BiologicalSexConfig = {
  key: BiologicalSex;
  labelKey: 'onboarding.biologicalSexMale' | 'onboarding.biologicalSexFemale';
};

const BIOLOGICAL_SEX_OPTIONS: BiologicalSexConfig[] = [
  { key: 'male', labelKey: 'onboarding.biologicalSexMale' },
  { key: 'female', labelKey: 'onboarding.biologicalSexFemale' },
];

type WeightGoalConfig = {
  key: WeightGoalOption;
  labelKey: 'onboarding.weightGoalLose' | 'onboarding.weightGoalMaintain' | 'onboarding.weightGoalGain';
};

const WEIGHT_GOAL_OPTIONS: WeightGoalConfig[] = [
  { key: 'lose', labelKey: 'onboarding.weightGoalLose' },
  { key: 'maintain', labelKey: 'onboarding.weightGoalMaintain' },
  { key: 'gain', labelKey: 'onboarding.weightGoalGain' },
];

const IMC_CLASS_KEYS = {
  underweight: 'onboarding.imcUnderweight',
  normal: 'onboarding.imcNormal',
  overweight: 'onboarding.imcOverweight',
  obese: 'onboarding.imcObese',
} as const;

function getDefaultUnitSystem(): 'metric' | 'imperial' {
  return getLocales()[0]?.languageTag === 'en-US' ? 'imperial' : 'metric';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function OnboardingBodyScreen({ navigation }: OnboardingBodyScreenProps) {
  const colors = useColors();
  const CHIP_BORDER_COLOR = `${colors.text.primary}26`;
  const CHIP_BACKGROUND_COLOR = `${colors.text.primary}0d`;

  const { t } = useAppTranslation();
  const selectedGoal = useOnboardingStore((state) => state.selectedGoal);
  const selectedUnitSystem = useOnboardingStore((state) => state.unitSystem);
  const setBodyData = useOnboardingStore((state) => state.setBodyData);
  const setUnitSystem = useOnboardingStore((state) => state.setUnitSystem);
  const setCalculatedMacros = useOnboardingStore((state) => state.setCalculatedMacros);

  const defaultUnitSystem = useRef(getDefaultUnitSystem()).current;
  const effectiveUnitSystem = selectedUnitSystem ?? defaultUnitSystem;
  const { inputHeightFeetUnit, inputHeightUnit, weightUnit } = useUnits(effectiveUnitSystem);
  const isImperial = effectiveUnitSystem === 'imperial';

  const [weightText, setWeightText] = useState('');
  const [heightText, setHeightText] = useState('');
  // Altura imperial: pés e polegadas em dois campos.
  const [feetText, setFeetText] = useState('');
  const [inchesText, setInchesText] = useState('');
  const [birthDateText, setBirthDateText] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | null>(null);
  const [weightGoal, setWeightGoal] = useState<WeightGoalOption | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<CalculateMacrosResponse | null>(null);
  const [macrosError, setMacrosError] = useState(false);
  const calculationRequestIdRef = useRef(0);

  useEffect(() => {
    if (selectedUnitSystem === null) {
      setUnitSystem(defaultUnitSystem);
    }
  }, [defaultUnitSystem, selectedUnitSystem, setUnitSystem]);

  // Leitura estrita ("70abc", "1.2.3", "-3" e "1e2" são inválidos), conversão
  // para kg/cm e mensagem de cada campo: bodyFields.utils.ts. Os limites vêm
  // do shared. Esta tela não tem peso nem altura salvos para pré-preencher.
  const bodyFields = evaluateBodyFields({
    unitSystem: effectiveUnitSystem,
    weightText,
    heightText,
    feetText,
    inchesText,
    untouchedSavedHeightCm: null,
    untouchedSavedWeightKg: null,
    weightUnit,
    metricHeightUnit: inputHeightUnit,
  });
  const storageWeight = bodyFields.weightKg;
  const storageHeight = bodyFields.heightCm;
  const { weightValid, heightValid } = bodyFields;

  // birthDate validado pelo mesmo schema Zod do backend (calculateMacrosSchema.
  // shape.birthDate, packages/shared/src/schemas/user.ts) — reaproveita a
  // faixa de idade plausível (13-120) já estabelecida ali, sem duplicar a
  // constante nem a lógica de cálculo de idade aqui.
  const birthDateIso = birthDateInputToIso(birthDateText);
  const birthDateValidation = birthDateIso
    ? calculateMacrosSchema.shape.birthDate.safeParse(birthDateIso)
    : null;
  const birthDateValid = birthDateValidation?.success === true;
  const birthDateError =
    birthDateText.length === BIRTH_DATE_MASKED_LENGTH && birthDateValidation && !birthDateValidation.success
      ? translateBirthDateError(t, birthDateValidation.error.issues[0]?.message ?? '')
      : undefined;

  // Só depois que a pessoa digitou algo: erro de formato primeiro; depois,
  // fora da faixa (a faixa aceita, na unidade do usuário).
  const weightError = translateBodyFieldError(t, bodyFields.errors.weight);
  const heightError = translateBodyFieldError(t, bodyFields.errors.height);
  const heightFeetError = translateBodyFieldError(t, bodyFields.errors.heightFeet);
  const heightInchesError = translateBodyFieldError(t, bodyFields.errors.heightInches);

  const { fieldProps, accessoryProps } = useNumericFieldChain(
    getBodyNumericFields(effectiveUnitSystem),
    KEYBOARD_ACCESSORY_ID,
  );

  const canFetch = weightValid && heightValid && birthDateValid && biologicalSex !== null && weightGoal !== null;

  // Requisição de cálculo de macros — usada tanto pelo debounce automático
  // quanto pelo retry manual. calculationRequestIdRef substitui o antigo
  // "stale flag" local do efeito: como agora duas origens podem disparar
  // esta função, um contador compartilhado garante que só a resposta da
  // chamada mais recente atualize o estado.
  const runMacrosCalculation = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    const goal: UserGoal = (selectedGoal as UserGoal | null) ?? DEFAULT_GOAL;
    const requestId = calculationRequestIdRef.current + 1;
    calculationRequestIdRef.current = requestId;

    setIsCalculating(true);
    setMacrosError(false);

    try {
      const response = await api.post<{ success: true; data: CalculateMacrosResponse }>(
        '/users/calculate-macros',
        {
          weight: storageWeight,
          height: storageHeight,
          birthDate: birthDateIso,
          biologicalSex,
          activityLevel,
          goal,
          weightGoal,
          unitSystem: 'metric',
        },
      );

      if (calculationRequestIdRef.current === requestId) {
        setResult(response.data.data);
      }
    } catch {
      if (calculationRequestIdRef.current === requestId) {
        setResult(null);
        setMacrosError(true);
      }
    } finally {
      if (calculationRequestIdRef.current === requestId) {
        setIsCalculating(false);
      }
    }
  }, [activityLevel, biologicalSex, birthDateIso, canFetch, selectedGoal, storageHeight, storageWeight, weightGoal]);

  // Debounced auto-cálculo — dispara runMacrosCalculation 600ms após a
  // última mudança de peso/altura/atividade/objetivo.
  useEffect(() => {
    if (!canFetch) {
      setResult(null);
      setIsCalculating(false);
      setMacrosError(false);
      return;
    }

    const timer = setTimeout(() => {
      void runMacrosCalculation();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [canFetch, runMacrosCalculation]);

  const handleRetryMacrosCalculation = useCallback(() => {
    void runMacrosCalculation();
  }, [runMacrosCalculation]);

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
    if (
      !result ||
      storageWeight === null ||
      storageHeight === null ||
      !birthDateIso ||
      !biologicalSex ||
      !weightGoal
    ) return;
    setBodyData({
      weight: storageWeight,
      height: storageHeight,
      activityLevel,
      birthDate: birthDateIso,
      biologicalSex,
      weightGoal,
    });
    setUnitSystem(effectiveUnitSystem);
    setCalculatedMacros({
      calculatedProtein: result.dailyProteinTarget,
      calculatedCalories: result.dailyCalorieTarget,
      calculatedCarbs: result.dailyCarbTarget,
      imc: result.imc,
    });
    navigation.navigate('OnboardingMacros');
  };

  const handleSkip = () => {
    setUnitSystem(effectiveUnitSystem);
    navigation.navigate('OnboardingMacros');
  };

  const handleUnitSystemChange = (nextUnitSystem: 'metric' | 'imperial') => {
    if (nextUnitSystem === effectiveUnitSystem) {
      return;
    }

    setUnitSystem(nextUnitSystem);
    setWeightText('');
    setHeightText('');
    setFeetText('');
    setInchesText('');
    setResult(null);
    setIsCalculating(false);
  };

  const weightPlaceholder = effectiveUnitSystem === 'imperial'
    ? t('onboarding.weightPlaceholderImperial')
    : t('onboarding.weightPlaceholderMetric');

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
    inputContainer: {
      position: 'relative',
    },
    heightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    heightPart: {
      flex: 1,
      position: 'relative',
    },
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
    imcClassification: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    imcErrorContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    imcErrorText: {
      flexShrink: 1,
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    imcRetryText: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
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
    sectionLabel: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      paddingHorizontal: spacing.xs,
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

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={4}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.bodyTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.bodySubtitle')}</Text>

            <UnitSystemToggle
              value={effectiveUnitSystem}
              onChange={handleUnitSystemChange}
              metricLabel={t('onboarding.unitSystemMetric')}
              imperialLabel={t('onboarding.unitSystemImperial')}
            />

            {/* Campos numéricos com label de unidade sobreposto */}
            <View style={styles.fields}>
              <View style={styles.inputContainer}>
                <AuthInput
                  {...fieldProps('weight')}
                  value={weightText}
                  onChangeText={setWeightText}
                  placeholder={weightPlaceholder}
                  error={weightError}
                  keyboardType="decimal-pad"
                />
                <View pointerEvents="none" style={styles.unitOverlay}>
                  <Text style={styles.unitText}>{weightUnit}</Text>
                </View>
              </View>

              {isImperial ? (
                <View style={styles.heightRow}>
                  <View style={styles.heightPart}>
                    <AuthInput
                      {...fieldProps('heightFeet')}
                      value={feetText}
                      onChangeText={setFeetText}
                      placeholder={t('onboarding.heightFeetPlaceholder')}
                      error={heightFeetError}
                      keyboardType="number-pad"
                      maxLength={HEIGHT_FEET_MAX_LENGTH}
                    />
                    <View pointerEvents="none" style={styles.unitOverlay}>
                      <Text style={styles.unitText}>{inputHeightFeetUnit}</Text>
                    </View>
                  </View>
                  <View style={styles.heightPart}>
                    <AuthInput
                      {...fieldProps('heightInches')}
                      value={inchesText}
                      onChangeText={setInchesText}
                      placeholder={t('onboarding.heightInchesPlaceholder')}
                      error={heightInchesError}
                      invalid={bodyFields.heightOutOfRange}
                      keyboardType="number-pad"
                      maxLength={HEIGHT_INCHES_MAX_LENGTH}
                    />
                    <View pointerEvents="none" style={styles.unitOverlay}>
                      <Text style={styles.unitText}>{inputHeightUnit}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.inputContainer}>
                  <AuthInput
                    {...fieldProps('height')}
                    value={heightText}
                    onChangeText={setHeightText}
                    placeholder={t('onboarding.heightPlaceholderMetric')}
                    error={heightError}
                    keyboardType="decimal-pad"
                  />
                  <View pointerEvents="none" style={styles.unitOverlay}>
                    <Text style={styles.unitText}>{inputHeightUnit}</Text>
                  </View>
                </View>
              )}

              <AuthInput
                {...fieldProps('birthDate')}
                value={birthDateText}
                onChangeText={(text) => { setBirthDateText(maskBirthDateInput(text)); }}
                placeholder={t('onboarding.birthDatePlaceholder')}
                error={birthDateError}
                keyboardType="number-pad"
                maxLength={BIRTH_DATE_MASKED_LENGTH}
              />
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
                ) : macrosError ? (
                  <View style={styles.imcErrorContent}>
                    <Text style={styles.imcErrorText}>
                      {t('onboarding.macrosCalculationError')}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleRetryMacrosCalculation}
                    >
                      <Text style={styles.imcRetryText}>{t('common.actions.retry')}</Text>
                    </Pressable>
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

            {/* Seletor de sexo biológico */}
            <Text style={styles.sectionLabel}>{t('onboarding.biologicalSexLabel')}</Text>
            <View style={styles.chipRow}>
              {BIOLOGICAL_SEX_OPTIONS.map(({ key, labelKey }) => (
                <Pressable
                  key={key}
                  onPress={() => { setBiologicalSex(key); }}
                  style={[styles.chip, biologicalSex === key && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: biologicalSex === key }}
                >
                  <Text style={[styles.chipLabel, biologicalSex === key && styles.chipLabelSelected]}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Seletor de objetivo de peso */}
            <Text style={styles.sectionLabel}>{t('onboarding.weightGoalLabel')}</Text>
            <View style={styles.chipRow}>
              {WEIGHT_GOAL_OPTIONS.map(({ key, labelKey }) => (
                <Pressable
                  key={key}
                  onPress={() => { setWeightGoal(key); }}
                  style={[styles.chip, weightGoal === key && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: weightGoal === key }}
                >
                  <Text style={[styles.chipLabel, weightGoal === key && styles.chipLabelSelected]}>
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

      <NumericKeyboardAccessory nativeID={KEYBOARD_ACCESSORY_ID} {...accessoryProps} />
    </Animated.View>
  );
}
