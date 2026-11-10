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
import { UnitSystemToggle } from '../components/ui/UnitSystemToggle';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { useUnits } from '../hooks/useUnits';
import { useAuthStore } from '../store/auth.store';
import { getApiErrorTranslationKey } from '../utils/error.utils';
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

const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;
const CHIP_SELECTED_BACKGROUND_COLOR = `${colors.brand.pulse}26`;
const DEFAULT_ACTIVITY: ActivityLevel = 'moderatelyActive';

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
  const { inputHeightUnit, toStorageWeight, toStorageHeight, weightUnit } = useUnits(unitSystem);

  const [weightText, setWeightText] = useState('');
  const [heightText, setHeightText] = useState('');
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
      const displayValue =
        profileUnitSystem === 'imperial' ? profile.weight * POUNDS_PER_KILOGRAM : profile.weight;
      setWeightText(displayValue.toFixed(1));
    }

    if (typeof profile.height === 'number') {
      const displayValue =
        profileUnitSystem === 'imperial' ? profile.height / CENTIMETERS_PER_INCH : profile.height;
      setHeightText(displayValue.toFixed(1));
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

  const rawWeightNum = parseFloat(weightText.replace(',', '.'));
  const rawHeightNum = parseFloat(heightText.replace(',', '.'));
  const storageWeight = toStorageWeight(rawWeightNum);
  const storageHeight = toStorageHeight(rawHeightNum);
  const weightValid = typeof storageWeight === 'number' && storageWeight >= 20 && storageWeight <= 300;
  const heightValid = typeof storageHeight === 'number' && storageHeight >= 100 && storageHeight <= 250;

  const birthDateIso = birthDateInputToIso(birthDateText);
  const birthDateValidation = birthDateIso
    ? calculateMacrosSchema.shape.birthDate.safeParse(birthDateIso)
    : null;
  const birthDateValid = birthDateValidation?.success === true;
  const birthDateError =
    birthDateText.length === BIRTH_DATE_MASKED_LENGTH && birthDateValidation && !birthDateValidation.success
      ? translateBirthDateError(t, birthDateValidation.error.issues[0]?.message ?? '')
      : undefined;

  const canSubmit = weightValid && heightValid && birthDateValid && biologicalSex !== null && weightGoal !== null;

  const handleUnitSystemChange = (nextUnitSystem: 'metric' | 'imperial') => {
    if (nextUnitSystem === unitSystem) return;
    setUnitSystemState(nextUnitSystem);
    setWeightText('');
    setHeightText('');
  };

  const handleSave = async () => {
    if (!canSubmit || typeof storageWeight !== 'number' || typeof storageHeight !== 'number' || !birthDateIso) {
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
  const heightPlaceholder =
    unitSystem === 'imperial' ? t('onboarding.heightPlaceholderImperial') : t('onboarding.heightPlaceholderMetric');

  const styles = StyleSheet.create({
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

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />
      <ScrollView
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
                value={weightText}
                onChangeText={setWeightText}
                placeholder={weightPlaceholder}
                keyboardType="decimal-pad"
                returnKeyType="next"
                editable={!isProfileLoading}
              />
              <View pointerEvents="none" style={styles.unitOverlay}>
                <Text style={styles.unitText}>{weightUnit}</Text>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <AuthInput
                value={heightText}
                onChangeText={setHeightText}
                placeholder={heightPlaceholder}
                keyboardType="decimal-pad"
                returnKeyType="next"
                editable={!isProfileLoading}
              />
              <View pointerEvents="none" style={styles.unitOverlay}>
                <Text style={styles.unitText}>{inputHeightUnit}</Text>
              </View>
            </View>

            <AuthInput
              value={birthDateText}
              onChangeText={(text) => { setBirthDateText(maskBirthDateInput(text)); }}
              placeholder={t('onboarding.birthDatePlaceholder')}
              error={birthDateError}
              keyboardType="number-pad"
              maxLength={BIRTH_DATE_MASKED_LENGTH}
              returnKeyType="done"
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
  );
}
