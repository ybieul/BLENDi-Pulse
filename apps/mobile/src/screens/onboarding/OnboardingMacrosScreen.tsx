// apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx
// Passo 4 (final) do fluxo de onboarding: confirmação das metas de macros.
//
// Campos pré-preenchidos com os valores calculados na etapa anterior (se o
// usuário não pulou o cálculo). O usuário pode ajustar antes de confirmar.
//
// Ao pressionar "Finish setup":
//   1. PATCH /users/me → persiste modelo, goal, macros e dados corporais
//   2. completeOnboarding() → isNewUser: false + MMKV onboarding_completed: true
//   3. resetOnboarding() → limpa store temporário
//   O RootNavigator detecta isNewUser: false e navega para AppFlow automaticamente.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import axios from 'axios';

import { colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { api } from '../../config/api';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { OnboardingScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/auth.store';
import { useOnboardingStore } from '../../store/onboarding.store';
import { getApiErrorTranslationKey } from '../../utils/error.utils';

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

interface ApiErrorResponse {
  code?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// Protein: int 10–400g  |  Calories: int 500–10000 kcal  |  Carbs: int 50–800g
const PROTEIN_MIN = 10;
const PROTEIN_MAX = 400;
const CALORIES_MIN = 500;
const CALORIES_MAX = 10_000;
const CARBS_MIN = 50;
const CARBS_MAX = 800;

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

// ─── Screen ────────────────────────────────────────────────────────────────────

export function OnboardingMacrosScreen(_props: OnboardingScreenProps<'OnboardingMacros'>) {
  const { t } = useAppTranslation();
  const translateKey = (key: string) => t(key as TranslationKey);

  const selectedModel    = useOnboardingStore((state) => state.selectedModel);
  const selectedGoal     = useOnboardingStore((state) => state.selectedGoal);
  const weight           = useOnboardingStore((state) => state.weight);
  const height           = useOnboardingStore((state) => state.height);
  const calculatedProtein  = useOnboardingStore((state) => state.calculatedProtein);
  const calculatedCalories = useOnboardingStore((state) => state.calculatedCalories);
  const calculatedCarbs    = useOnboardingStore((state) => state.calculatedCarbs);
  const resetOnboarding  = useOnboardingStore((state) => state.resetOnboarding);

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

  const proteinNum  = parseInt(proteinText, 10);
  const caloriesNum = parseInt(caloriesText, 10);
  const carbsNum = parseInt(carbsText, 10);
  const proteinValid  = !isNaN(proteinNum)  && proteinNum  >= PROTEIN_MIN  && proteinNum  <= PROTEIN_MAX;
  const caloriesValid = !isNaN(caloriesNum) && caloriesNum >= CALORIES_MIN && caloriesNum <= CALORIES_MAX;
  const carbsValid = !isNaN(carbsNum) && carbsNum >= CARBS_MIN && carbsNum <= CARBS_MAX;
  const canSubmit = proteinValid && caloriesValid && carbsValid;

  const goalLabel = translateKey(`onboarding.goal${goal}`);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    if (!canSubmit) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        blendiModel,
        goal,
        dailyProteinTarget: proteinNum,
        dailyCalorieTarget: caloriesNum,
        dailyCarbTarget: carbsNum,
      };

      if (weight  !== null) payload['weight']  = weight;
      if (height  !== null) payload['height']  = height;

      await api.patch('/users/me', payload);

      await useAuthStore.getState().completeOnboarding();
      resetOnboarding();
      // RootNavigator reacts to isNewUser: false — no manual navigation needed.
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

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={4}
        topContent={(
          <View style={styles.topContent}>
            <Text style={styles.title}>{t('onboarding.macrosTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.macrosSubtitle')}</Text>

            <View style={styles.fields}>
              <AuthInput
                value={proteinText}
                onChangeText={(text) => {
                  setProteinText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.proteinPlaceholder')}
                keyboardType="number-pad"
                returnKeyType="next"
              />
              <AuthInput
                value={caloriesText}
                onChangeText={(text) => {
                  setCaloriesText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.caloriesPlaceholder')}
                keyboardType="number-pad"
                returnKeyType="next"
              />
              <AuthInput
                value={carbsText}
                onChangeText={(text) => {
                  setCarbsText(text);
                  setFormError(null);
                }}
                placeholder={t('onboarding.carbTarget')}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>

            {/* Linha informativa com ranges recomendados para o goal */}
            <Text style={styles.recommendation}>
              {t('onboarding.macroRecommendation', {
                goal: goalLabel,
                proteinMin: goalConfig.proteinMin,
                proteinMax: goalConfig.proteinMax,
                caloriesMin: goalConfig.caloriesMin,
                caloriesMax: goalConfig.caloriesMax,
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
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

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
