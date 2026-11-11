// apps/mobile/src/screens/CompleteProfileScreen.tsx
// CP-B.1 — tela de edição dos dados de corpo fora do onboarding.
//
// Alcançável a partir do aviso "complete seu perfil" em MeScreen, para
// contas com hasRealBodyProfile: false (nunca passaram pelo onboarding de
// corpo real, ou passaram antes do CP-B existir e ainda têm os
// placeholders de birthDate/biologicalSex/weightGoal do CP-A.4).
//
// Reaproveita os mesmos campos/validação de OnboardingBodyScreen.tsx, mas
// não toca blendiModel/goal/metas de macro — só os 6 campos de corpo, num
// único PATCH /users/me com o sinal completingBodyOnboarding: true.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';

import { calculateMacrosSchema, colors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';
import { api } from '../config/api';
import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { AuthInput } from '../components/ui/AuthInput';
import { NumericKeyboardAccessory } from '../components/ui/NumericKeyboardAccessory';
import { UnitSystemToggle } from '../components/ui/UnitSystemToggle';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { useNumericFieldChain } from '../hooks/useNumericFieldChain';
import { useUnits } from '../hooks/useUnits';
import { useAuthStore } from '../store/auth.store';
import { getApiErrorTranslationKey } from '../utils/error.utils';
import {
  HEIGHT_FEET_MAX_LENGTH,
  HEIGHT_INCHES_MAX_LENGTH,
  evaluateBodyFields,
  getBodyNumericFields,
  heightCmToFeetInchesTexts,
  translateBodyFieldError,
} from '../utils/bodyFields.utils';
import { kgToPounds } from '../utils/bodyUnits';
import { showToast } from '../utils/toast.utils';
import {
  BIRTH_DATE_MASKED_LENGTH,
  birthDateInputToIso,
  isoToBirthDateInput,
  maskBirthDateInput,
  translateBirthDateError,
} from '../utils/birthDate.utils';
import type { RootStackParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityLevel = 'sedentary' | 'lightlyActive' | 'moderatelyActive' | 'veryActive';
type BiologicalSex = 'male' | 'female';
type WeightGoalOption = 'lose' | 'maintain' | 'gain';

interface ApiErrorResponse {
  code?: string;
}

interface PatchBodyProfileResponse {
  success: true;
  data: {
    user: {
      dailyProteinTarget: number;
      dailyCalorieTarget: number;
      dailyCarbTarget: number;
      dailyFatTarget?: number;
    };
  };
}

interface BodyProfileResponse {
  success: true;
  data: {
    user: {
      weight?: number;
      height?: number;
      birthDate?: string;
      biologicalSex?: BiologicalSex;
      weightGoal?: WeightGoalOption;
      activityLevel?: ActivityLevel;
      unitSystem?: 'metric' | 'imperial';
    };
  };
}

type CompleteProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'CompleteProfile'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const CHIP_SELECTED_BACKGROUND_COLOR = `${colors.brand.pulse}26`;
const DEFAULT_ACTIVITY: ActivityLevel = 'moderatelyActive';

const KEYBOARD_ACCESSORY_ID = 'completeProfileKeyboardAccessory';

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

async function fetchBodyProfile(): Promise<BodyProfileResponse> {
  const response = await api.get<BodyProfileResponse>('/users/me');
  return response.data;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CompleteProfileScreen({ navigation }: CompleteProfileScreenProps) {
  const colorsTheme = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();

  const CHIP_BORDER_COLOR = `${colorsTheme.text.primary}26`;
  const CHIP_BACKGROUND_COLOR = `${colorsTheme.text.primary}0d`;

  const { data: profileResponse, isLoading: isProfileLoading } = useQuery<BodyProfileResponse>({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: fetchBodyProfile,
    staleTime: CACHE_CONFIG.USER_PROFILE_TTL,
  });
  const profile = profileResponse?.data.user;

  const [unitSystem, setUnitSystemState] = useState<'metric' | 'imperial'>('metric');
  const { inputHeightFeetUnit, inputHeightUnit, weightUnit } = useUnits(unitSystem);
  const isImperial = unitSystem === 'imperial';

  const [weightText, setWeightText] = useState('');
  const [heightText, setHeightText] = useState('');
  // Altura imperial: pés e polegadas em dois campos.
  const [feetText, setFeetText] = useState('');
  const [inchesText, setInchesText] = useState('');
  // Altura salva (cm) enquanto a pessoa não mexe em pés nem polegadas: é ela
  // que vai no PATCH, não a ida e volta cm -> pés/pol -> cm (178 -> 5'10" ->
  // 177.8). Vira null ao mexer em qualquer um dos dois ou trocar de unidade.
  const [untouchedSavedHeightCm, setUntouchedSavedHeightCm] = useState<number | null>(null);
  // Mesma ideia para o peso, nos dois sistemas: sem mexer, vai o peso salvo
  // (81 kg -> 178.6 lbs -> 80.997 kg era a ida e volta). Vira null ao mexer
  // no peso ou trocar de unidade.
  const [untouchedSavedWeightKg, setUntouchedSavedWeightKg] = useState<number | null>(null);
  const [birthDateText, setBirthDateText] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | null>(null);
  const [weightGoal, setWeightGoal] = useState<WeightGoalOption | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasPrefilled = useRef(false);

  // Pré-preenche uma única vez quando o profile chega — tanto com valores
  // reais (conta antiga, pré-CP-B) quanto com os placeholders do CP-A.4
  // (indistinguíveis dos reais, por isso o usuário sempre pode revisar e
  // confirmar/ajustar todos os 6 campos aqui).
  useEffect(() => {
    if (hasPrefilled.current || !profile) return;
    hasPrefilled.current = true;

    const profileUnitSystem = profile.unitSystem ?? 'metric';
    setUnitSystemState(profileUnitSystem);

    if (typeof profile.weight === 'number') {
      const displayValue = profileUnitSystem === 'imperial' ? kgToPounds(profile.weight) : profile.weight;
      setWeightText(displayValue.toFixed(1));
      setUntouchedSavedWeightKg(profile.weight);
    }

    if (typeof profile.height === 'number') {
      if (profileUnitSystem === 'imperial') {
        const { feetText: savedFeet, inchesText: savedInches } = heightCmToFeetInchesTexts(profile.height);
        setFeetText(savedFeet);
        setInchesText(savedInches);
        setUntouchedSavedHeightCm(profile.height);
      } else {
        setHeightText(profile.height.toFixed(1));
      }
    }

    if (profile.birthDate) {
      setBirthDateText(isoToBirthDateInput(profile.birthDate));
    }

    if (profile.biologicalSex) {
      setBiologicalSex(profile.biologicalSex);
    }

    if (profile.weightGoal) {
      setWeightGoal(profile.weightGoal);
    }

    if (profile.activityLevel && ACTIVITY_LEVELS.some(({ key }) => key === profile.activityLevel)) {
      setActivityLevel(profile.activityLevel);
    }
  }, [profile]);

  // Leitura estrita ("70abc", "1.2.3", "-3" e "1e2" são inválidos), conversão
  // para kg/cm e mensagem de cada campo: bodyFields.utils.ts. Os limites vêm
  // do shared.
  const bodyFields = evaluateBodyFields({
    unitSystem,
    weightText,
    heightText,
    feetText,
    inchesText,
    untouchedSavedHeightCm,
    untouchedSavedWeightKg,
    weightUnit,
    metricHeightUnit: inputHeightUnit,
  });
  const storageWeight = bodyFields.weightKg;
  const storageHeight = bodyFields.heightCm;
  const { weightValid, heightValid } = bodyFields;

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

  const { fieldProps, accessoryProps } = useNumericFieldChain(getBodyNumericFields(unitSystem), KEYBOARD_ACCESSORY_ID);

  const canSubmit = weightValid && heightValid && birthDateValid && biologicalSex !== null && weightGoal !== null;

  const handleUnitSystemChange = (nextUnitSystem: 'metric' | 'imperial') => {
    if (nextUnitSystem === unitSystem) return;
    setUnitSystemState(nextUnitSystem);
    setWeightText('');
    setHeightText('');
    setFeetText('');
    setInchesText('');
    setUntouchedSavedHeightCm(null);
    setUntouchedSavedWeightKg(null);
  };

  const handleWeightChange = (text: string) => {
    setWeightText(text);
    setUntouchedSavedWeightKg(null);
  };

  const handleFeetChange = (text: string) => {
    setFeetText(text);
    setUntouchedSavedHeightCm(null);
  };

  const handleInchesChange = (text: string) => {
    setInchesText(text);
    setUntouchedSavedHeightCm(null);
  };

  const handleSave = async () => {
    if (!canSubmit || storageWeight === null || storageHeight === null || !birthDateIso) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await api.patch<PatchBodyProfileResponse>('/users/me', {
        weight: storageWeight,
        height: storageHeight,
        birthDate: birthDateIso,
        biologicalSex,
        weightGoal,
        activityLevel,
        completingBodyOnboarding: true,
      });

      // Recalculo de macros (activityLevel/birthDate/biologicalSex/weight/
      // height/weightGoal são todos gatilhos em updateMe) muda dailyProtein/
      // Calorie/Carb/FatTarget — precisa sincronizar authUser (Zustand), não
      // só invalidar o react-query, porque WeeklyReportScreen.tsx:366 e
      // HistoryScreen.tsx:120 leem essas metas direto de authUser, sem
      // fallback de query. Mesmo padrão já usado por
      // OnboardingMacrosScreen.tsx (handleFinish) e MeScreen.tsx
      // (handleConfirmEdit).
      const updatedUser = response.data.data.user;
      useAuthStore.getState().updateUserProfile({
        dailyProteinTarget: updatedUser.dailyProteinTarget,
        dailyCalorieTarget: updatedUser.dailyCalorieTarget,
        dailyCarbTarget: updatedUser.dailyCarbTarget,
        dailyFatTarget: updatedUser.dailyFatTarget,
      });

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      showToast(t('completeProfile.success'));
      navigation.goBack();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const translationKey = getApiErrorTranslationKey(responseData?.code);
        setFormError(t(translationKey));
        return;
      }

      setFormError(t('errors.network_internal_server_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const opacity = useRef(new Animated.Value(0)).current;
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

  const weightPlaceholder =
    unitSystem === 'imperial' ? t('onboarding.weightPlaceholderImperial') : t('onboarding.weightPlaceholderMetric');

  const styles = StyleSheet.create({
    flex: {
      flex: 1,
    },
    root: {
      flex: 1,
      backgroundColor: colorsTheme.background.primary,
    },
    contentContainer: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing['4xl'],
    },
    // Aplicado no Animated.View que de fato embrulha as seções (header,
    // subtitle, toggle, fields, cada par label+chipRow, erro, botão) — ao
    // contrário de contentContainer, que só tem esse Animated.View como
    // único filho e por isso nunca aplicava gap nenhum entre as seções
    // reais (bug: rótulos/chips ficavam colados uns nos outros).
    innerContent: {
      gap: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: CHIP_BACKGROUND_COLOR,
      borderWidth: 1,
      borderColor: CHIP_BORDER_COLOR,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: fonts.display,
      fontWeight: fontWeights.bold,
      fontSize: fontSizes.lg,
      color: colorsTheme.text.primary,
    },
    subtitle: {
      color: colorsTheme.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 22,
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
      right: spacing['5xl'],
      top: 0,
      height: 56,
      justifyContent: 'center',
    },
    unitText: {
      color: colorsTheme.text.tertiary,
      fontFamily: fonts.mono,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.medium,
    },
    fieldGroup: {
      gap: spacing.sm,
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
      color: colorsTheme.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      textAlign: 'center',
    },
    chipLabelSelected: {
      color: colorsTheme.text.primary,
      fontWeight: fontWeights.medium,
    },
    sectionLabel: {
      color: colorsTheme.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      paddingHorizontal: spacing.xs,
    },
    errorText: {
      color: colorsTheme.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
  });

  // KeyboardAvoidingView + keyboardShouldPersistTaps: mesmo padrão de teclado
  // da tela de metas e do OnboardingLayout (sem isso, no iPhone o "Salvar" e os
  // chips ficavam atrás do teclado e o primeiro toque só fechava o teclado).
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <View style={styles.root}>
        <AuroraBackground intensity="reduced" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + spacing.lg }]}
        >
          <Animated.View style={[styles.innerContent, { opacity, transform: [{ translateY }] }]}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.actions.back')}
                onPress={navigation.goBack}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={18} color={colorsTheme.text.primary} />
              </Pressable>
              <Text style={styles.title}>{t('completeProfile.title')}</Text>
            </View>

            <Text style={styles.subtitle}>{t('completeProfile.subtitle')}</Text>

            <UnitSystemToggle
              value={unitSystem}
              onChange={handleUnitSystemChange}
              metricLabel={t('onboarding.unitSystemMetric')}
              imperialLabel={t('onboarding.unitSystemImperial')}
            />

            <View style={styles.fields}>
              <View style={styles.inputContainer}>
                <AuthInput
                  {...fieldProps('weight')}
                  value={weightText}
                  onChangeText={handleWeightChange}
                  placeholder={weightPlaceholder}
                  error={weightError}
                  keyboardType="decimal-pad"
                  editable={!isProfileLoading}
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
                      onChangeText={handleFeetChange}
                      placeholder={t('onboarding.heightFeetPlaceholder')}
                      error={heightFeetError}
                      keyboardType="number-pad"
                      maxLength={HEIGHT_FEET_MAX_LENGTH}
                      editable={!isProfileLoading}
                    />
                    <View pointerEvents="none" style={styles.unitOverlay}>
                      <Text style={styles.unitText}>{inputHeightFeetUnit}</Text>
                    </View>
                  </View>
                  <View style={styles.heightPart}>
                    <AuthInput
                      {...fieldProps('heightInches')}
                      value={inchesText}
                      onChangeText={handleInchesChange}
                      placeholder={t('onboarding.heightInchesPlaceholder')}
                      error={heightInchesError}
                      invalid={bodyFields.heightOutOfRange}
                      keyboardType="number-pad"
                      maxLength={HEIGHT_INCHES_MAX_LENGTH}
                      editable={!isProfileLoading}
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
                    editable={!isProfileLoading}
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
                editable={!isProfileLoading}
              />
            </View>

            <View style={styles.fieldGroup}>
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
            </View>

            <View style={styles.fieldGroup}>
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

            <View style={styles.fieldGroup}>
              <Text style={styles.sectionLabel}>{t('completeProfile.activityLevelLabel')}</Text>
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

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <AuthButton
              loading={isSubmitting}
              disabled={!canSubmit || isSubmitting}
              onPress={() => { void handleSave(); }}
            >
              {t('common.actions.save')}
            </AuthButton>
          </Animated.View>
        </ScrollView>
      </View>

      <NumericKeyboardAccessory nativeID={KEYBOARD_ACCESSORY_ID} {...accessoryProps} />
    </KeyboardAvoidingView>
  );
}
