// apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx
// Passo 5 (final) do fluxo de onboarding: confirmação das metas de macros.
//
// Campos pré-preenchidos com os valores calculados na etapa anterior (se o
// usuário não pulou o cálculo). O usuário pode ajustar antes de confirmar.
//
// Ao pressionar "Finish setup":
//   1. PATCH /users/me → persiste modelo, goal, macros e dados corporais
//   2. Sucesso → abre "Montando seu plano" (OnboardingBuildingPlanScreen), que
//      chama completeOnboarding() + resetOnboarding() quando o anel termina.
//      O RootNavigator detecta isNewUser: false e navega para AppFlow.
//   Falha → erro aqui mesmo (formError), sem sair da tela.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import axios from 'axios';

import {
  DAILY_CALORIE_TARGET_MAX,
  DAILY_CALORIE_TARGET_MIN,
  DAILY_CARB_TARGET_MAX,
  DAILY_CARB_TARGET_MIN,
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { api } from '../../config/api';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { NumericKeyboardAccessory } from '../../components/ui/NumericKeyboardAccessory';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useNumericFieldChain } from '../../hooks/useNumericFieldChain';
import type { OnboardingScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/auth.store';
import { useOnboardingStore } from '../../store/onboarding.store';
import { getApiErrorTranslationKey } from '../../utils/error.utils';
import { parseStrictInteger } from '../../utils/numericInput.utils';
import type { TranslationKey } from '../../locales/i18n';

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';

type ValidationIssue = { message: string; code?: string; minimum?: number | bigint; maximum?: number | bigint };

interface ApiErrorResponse {
  code?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// Faixas de VALIDAÇÃO: as mesmas que o backend aplica (packages/shared) —
// proteína 10–800g, calorias 300–15.000 kcal, carboidratos 0–1.500g. Antes
// eram faixas locais mais estreitas, que barravam aqui valores que o Me aceita.
const PROTEIN_MIN = DAILY_PROTEIN_TARGET_VALIDATION_MIN;
const PROTEIN_MAX = DAILY_PROTEIN_TARGET_VALIDATION_MAX;
const CALORIES_MIN = DAILY_CALORIE_TARGET_MIN;
const CALORIES_MAX = DAILY_CALORIE_TARGET_MAX;
const CARBS_MIN = DAILY_CARB_TARGET_MIN;
const CARBS_MAX = DAILY_CARB_TARGET_MAX;

// Faixa de RECOMENDAÇÃO de carboidratos, só para o texto informativo abaixo
// dos campos. Não é faixa de validação (0–1.500g aceitos, ver acima) e não
// varia por goal, ao contrário de proteína/calorias (GOAL_CONFIG).
const CARBS_RECOMMENDATION_MIN = 50;
const CARBS_RECOMMENDATION_MAX = 800;

// Goal-specific recommendation ranges and suggested defaults shown as placeholders
// when the user skipped body data collection.
const GOAL_CONFIG: Record<
  UserGoal,
  {
    proteinMin: number;
    proteinMax: number;
    caloriesMin: number;
    caloriesMax: number;
    suggestedProtein: number;
    suggestedCalories: number;
  }
> = {
  Muscle:   { proteinMin: 140, proteinMax: 200, caloriesMin: 2000, caloriesMax: 2600, suggestedProtein: 150, suggestedCalories: 2300 },
  Wellness: { proteinMin: 100, proteinMax: 160, caloriesMin: 1600, caloriesMax: 2400, suggestedProtein: 110, suggestedCalories: 2000 },
  Energy:   { proteinMin: 120, proteinMax: 180, caloriesMin: 1700, caloriesMax: 2300, suggestedProtein: 130, suggestedCalories: 1900 },
  Recovery: { proteinMin: 140, proteinMax: 200, caloriesMin: 1700, caloriesMax: 2300, suggestedProtein: 150, suggestedCalories: 2000 },
};
const DEFAULT_GOAL_CONFIG = GOAL_CONFIG.Wellness;

// Ordem visual dos campos (é a ordem do "Próximo").
const MACRO_FIELDS = ['protein', 'calories', 'carbs'] as const;
const KEYBOARD_ACCESSORY_ID = 'onboardingMacrosKeyboardAccessory';

// ─── Screen ────────────────────────────────────────────────────────────────────

export function OnboardingMacrosScreen({ navigation }: OnboardingScreenProps<'OnboardingMacros'>) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const translateKey = (input: string | ValidationIssue) => {
    const raw = typeof input === 'string' ? input : input.message;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'key' in parsed) {
        const { key, ...vars } = parsed as { key: TranslationKey } & Record<string, unknown>;
        return t(key, vars);
      }
    } catch {
      // não é uma mensagem serializada — trata como chave literal
    }

    if (typeof input !== 'string') {
      if (input.code === 'too_small' && typeof input.minimum === 'number') {
        return t(raw as TranslationKey, { min: input.minimum });
      }
      if (input.code === 'too_big' && typeof input.maximum === 'number') {
        return t(raw as TranslationKey, { max: input.maximum });
      }
    }

    return t(raw as TranslationKey);
  };

  const selectedModel    = useOnboardingStore((state) => state.selectedModel);
  const blendiOwnership  = useOnboardingStore((state) => state.blendiOwnership);
  const otherBlenderModel = useOnboardingStore((state) => state.otherBlenderModel);
  const selectedGoal     = useOnboardingStore((state) => state.selectedGoal);
  const dietaryPreferences = useOnboardingStore((state) => state.dietaryPreferences);
  const unitSystem       = useOnboardingStore((state) => state.unitSystem);
  const weight           = useOnboardingStore((state) => state.weight);
  const height           = useOnboardingStore((state) => state.height);
  const birthDate        = useOnboardingStore((state) => state.birthDate);
  const biologicalSex    = useOnboardingStore((state) => state.biologicalSex);
  const weightGoal       = useOnboardingStore((state) => state.weightGoal);
  const activityLevel    = useOnboardingStore((state) => state.activityLevel);
  const calculatedProtein  = useOnboardingStore((state) => state.calculatedProtein);
  const calculatedCalories = useOnboardingStore((state) => state.calculatedCalories);
  const calculatedCarbs    = useOnboardingStore((state) => state.calculatedCarbs);

  // Pre-fill from calculated values; empty string prompts the placeholder hint.
  const [proteinText, setProteinText]   = useState(() =>
    calculatedProtein  !== null ? String(calculatedProtein)  : '',
  );
  const [caloriesText, setCaloriesText] = useState(() =>
    calculatedCalories !== null ? String(calculatedCalories) : '',
  );
  const [carbsText, setCarbsText] = useState(() =>
    calculatedCarbs !== null ? String(calculatedCarbs) : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);

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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const goal: UserGoal         = (selectedGoal  as UserGoal   | null) ?? 'Wellness';
  const blendiModel: BlendiModel = (selectedModel as BlendiModel | null) ?? 'Lite';
  const goalConfig             = GOAL_CONFIG[goal] ?? DEFAULT_GOAL_CONFIG;

  // Leitura estrita (só dígitos ASCII): "12abc" e "150,5" são inválidos — antes
  // o parseInt lia 12 e 150. Texto inválido vira NaN e cai no erro do campo.
  const proteinNum  = parseStrictInteger(proteinText) ?? Number.NaN;
  const caloriesNum = parseStrictInteger(caloriesText) ?? Number.NaN;
  const carbsNum = parseStrictInteger(carbsText) ?? Number.NaN;
  const proteinValid  = !isNaN(proteinNum)  && proteinNum  >= PROTEIN_MIN  && proteinNum  <= PROTEIN_MAX;
  const caloriesValid = !isNaN(caloriesNum) && caloriesNum >= CALORIES_MIN && caloriesNum <= CALORIES_MAX;
  const carbsValid = !isNaN(carbsNum) && carbsNum >= CARBS_MIN && carbsNum <= CARBS_MAX;
  const canSubmit = proteinValid && caloriesValid && carbsValid;

  // Erro inline só depois que o usuário já digitou algo — sem isso o botão
  // "Finish setup" fica desabilitado sem nenhuma explicação visível quando o
  // valor preenchido cai fora da faixa aceita (a faixa de validação não é a
  // mesma do texto de recomendação acima).
  const proteinError = proteinText.length > 0 && !proteinValid
    ? t('errors.validation.number_range', { min: PROTEIN_MIN, max: PROTEIN_MAX })
    : undefined;
  const caloriesError = caloriesText.length > 0 && !caloriesValid
    ? t('errors.validation.number_range', { min: CALORIES_MIN, max: CALORIES_MAX })
    : undefined;
  const carbsError = carbsText.length > 0 && !carbsValid
    ? t('errors.validation.number_range', { min: CARBS_MIN, max: CARBS_MAX })
    : undefined;

  const { fieldProps, accessoryProps } = useNumericFieldChain(MACRO_FIELDS, KEYBOARD_ACCESSORY_ID);

  const goalLabel = translateKey(`onboarding.goal${goal}`);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    if (!canSubmit) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      // Texto de marca/modelo só vai quando a posse é 'other' e há algo
      // digitado — nunca vai para analytics nem log, só para o perfil.
      const trimmedOtherBlenderModel = otherBlenderModel.trim();

      const payload: Record<string, unknown> = {
        blendiModel,
        blendiOwnership,
        ...(blendiOwnership === 'other' && trimmedOtherBlenderModel.length > 0 && {
          otherBlenderModel: trimmedOtherBlenderModel,
        }),
        dietaryPreferences,
        goal,
        dailyProteinTarget: proteinNum,
        dailyCalorieTarget: caloriesNum,
        dailyCarbTarget: carbsNum,
        unitSystem: unitSystem ?? 'metric',
      };

      if (weight  !== null) payload['weight']  = weight;
      if (height  !== null) payload['height']  = height;
      if (birthDate !== null) payload['birthDate'] = birthDate;
      if (biologicalSex !== null) payload['biologicalSex'] = biologicalSex;
      if (weightGoal !== null) payload['weightGoal'] = weightGoal;
      if (activityLevel !== null) payload['activityLevel'] = activityLevel;

      // CP-B.1 — sinal explícito de "perfil completo" (hasRealBodyProfile).
      // Enviado só quando os 5 campos acima vieram de verdade do onboarding
      // de corpo (não do link "Pular por agora", que deixa todos null) —
      // nunca incondicionalmente, já que este handleFinish é o mesmo ponto
      // de chegada dos dois caminhos (OnboardingBodyScreen.tsx:337-339).
      if (weight !== null && height !== null && birthDate !== null && biologicalSex !== null && weightGoal !== null) {
        payload['completingBodyOnboarding'] = true;
      }

      await api.patch('/users/me', payload);

      useAuthStore.getState().updateUserProfile({
        blendiModel,
        blendiOwnership,
        otherBlenderModel:
          blendiOwnership === 'other' && trimmedOtherBlenderModel.length > 0
            ? trimmedOtherBlenderModel
            : null,
        dietaryPreferences,
        goal,
        dailyProteinTarget: proteinNum,
        dailyCalorieTarget: caloriesNum,
        dailyCarbTarget: carbsNum,
        unitSystem: unitSystem ?? 'metric',
      });

      // completeOnboarding() e resetOnboarding() saem daqui e vão para o fim
      // da tela "Montando seu plano". reset (e não navigate) tira esta tela e
      // as anteriores do histórico: não há para onde voltar. Os dados vão por
      // parâmetro porque o resetOnboarding() de lá limpa o store.
      navigation.reset({
        index: 0,
        routes: [{
          name: 'OnboardingBuildingPlan',
          params: {
            blendiModel,
            blendiOwnership,
            goal,
            dailyProteinTarget: proteinNum,
            dailyCalorieTarget: caloriesNum,
            dailyCarbTarget: carbsNum,
            dietaryPreferences,
          },
        }],
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const translationKey = getApiErrorTranslationKey(responseData?.code);
        setFormError(translateKey(translationKey));
        return;
      }

      setFormError(translateKey('errors.network_internal_server_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

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
    recommendation: {
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      lineHeight: 18,
      paddingHorizontal: spacing.xs,
    },
    bottomContent: {
      gap: spacing.md,
    },
    errorText: {
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
      fontWeight: fontWeights.medium,
    },
  });

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={5}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.macrosTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.macrosSubtitle')}</Text>

            <View style={styles.fields}>
              <AuthInput
                {...fieldProps('protein')}
                value={proteinText}
                onChangeText={(text) => {
                  setProteinText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.proteinPlaceholder')}
                error={proteinError}
                keyboardType="number-pad"
              />
              <AuthInput
                {...fieldProps('calories')}
                value={caloriesText}
                onChangeText={(text) => {
                  setCaloriesText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.caloriesPlaceholder')}
                error={caloriesError}
                keyboardType="number-pad"
              />
              <AuthInput
                {...fieldProps('carbs')}
                value={carbsText}
                onChangeText={(text) => {
                  setCarbsText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.carbTarget')}
                error={carbsError}
                keyboardType="number-pad"
              />
            </View>

            {/* Linha informativa com ranges recomendados — proteína/calorias
                variam por goal (goalConfig); carboidratos usa uma faixa fixa
                de recomendação própria (CARBS_RECOMMENDATION_MIN/MAX), já que
                não há um range por goal para esse macro. NÃO usar aqui a faixa
                de validação (CARBS_MIN/MAX): aceitar um valor não é recomendá-lo. */}
            <Text style={styles.recommendation}>
              {t('onboarding.macroRecommendation', {
                goal: goalLabel,
                proteinMin: goalConfig.proteinMin,
                proteinMax: goalConfig.proteinMax,
                caloriesMin: goalConfig.caloriesMin,
                caloriesMax: goalConfig.caloriesMax,
                carbsMin: CARBS_RECOMMENDATION_MIN,
                carbsMax: CARBS_RECOMMENDATION_MAX,
              })}
            </Text>
          </View>
        )}
        bottomContent={(
          <View style={styles.bottomContent}>
            {formError ? (
              <Text style={styles.errorText}>{formError}</Text>
            ) : null}

            <AuthButton
              disabled={!canSubmit}
              loading={isSubmitting}
              onPress={() => { void handleFinish(); }}
            >
              {t('onboarding.finishSetup')}
            </AuthButton>
          </View>
        )}
      />

      <NumericKeyboardAccessory nativeID={KEYBOARD_ACCESSORY_ID} {...accessoryProps} />
    </Animated.View>
  );
}
