import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PulseAiRecipe } from '@blendi/shared';

import {
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton } from '../ui/AuthButton';
import { useAppTranslation } from '../../hooks/useAppTranslation';

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

interface DailyRecipeIngredient {
  nameKey: TranslationKey;
  amountKey: TranslationKey;
}

interface DailyRecipe {
  nameKey:
    | 'home.goalMuscleRecipe'
    | 'home.goalWellnessRecipe'
    | 'home.goalEnergyRecipe'
    | 'home.goalRecoveryRecipe';
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  durationMinutes: number;
  ingredients: DailyRecipeIngredient[];
}

export interface DailyRecipeCardProps {
  goal: UserGoal;
  onStartBlend: (recipe: PulseAiRecipe) => void;
}

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const MACRO_OPACITY = 0.7;
const META_OPACITY = 0.6;

// fat = (calories − protein×4 − carbs×4) / 9, arredondado.
const DAILY_RECIPES: Record<UserGoal, DailyRecipe> = {
  Muscle: {
    nameKey: 'home.goalMuscleRecipe',
    protein: 38,
    carbs: 26,
    fat: 18,
    calories: 420,
    durationMinutes: 3,
    ingredients: [
      { nameKey: 'home.dailyRecipeIngredientMuscle1Name', amountKey: 'home.dailyRecipeIngredientMuscle1Amount' },
      { nameKey: 'home.dailyRecipeIngredientMuscle2Name', amountKey: 'home.dailyRecipeIngredientMuscle2Amount' },
      { nameKey: 'home.dailyRecipeIngredientMuscle3Name', amountKey: 'home.dailyRecipeIngredientMuscle3Amount' },
    ],
  },
  Wellness: {
    nameKey: 'home.goalWellnessRecipe',
    protein: 18,
    carbs: 24,
    fat: 10,
    calories: 260,
    durationMinutes: 4,
    ingredients: [
      { nameKey: 'home.dailyRecipeIngredientWellness1Name', amountKey: 'home.dailyRecipeIngredientWellness1Amount' },
      { nameKey: 'home.dailyRecipeIngredientWellness2Name', amountKey: 'home.dailyRecipeIngredientWellness2Amount' },
      { nameKey: 'home.dailyRecipeIngredientWellness3Name', amountKey: 'home.dailyRecipeIngredientWellness3Amount' },
    ],
  },
  Energy: {
    nameKey: 'home.goalEnergyRecipe',
    protein: 16,
    carbs: 42,
    fat: 12,
    calories: 340,
    durationMinutes: 3,
    ingredients: [
      { nameKey: 'home.dailyRecipeIngredientEnergy1Name', amountKey: 'home.dailyRecipeIngredientEnergy1Amount' },
      { nameKey: 'home.dailyRecipeIngredientEnergy2Name', amountKey: 'home.dailyRecipeIngredientEnergy2Amount' },
      { nameKey: 'home.dailyRecipeIngredientEnergy3Name', amountKey: 'home.dailyRecipeIngredientEnergy3Amount' },
    ],
  },
  Recovery: {
    nameKey: 'home.goalRecoveryRecipe',
    protein: 24,
    carbs: 20,
    fat: 13,
    calories: 290,
    durationMinutes: 4,
    ingredients: [
      { nameKey: 'home.dailyRecipeIngredientRecovery1Name', amountKey: 'home.dailyRecipeIngredientRecovery1Amount' },
      { nameKey: 'home.dailyRecipeIngredientRecovery2Name', amountKey: 'home.dailyRecipeIngredientRecovery2Amount' },
      { nameKey: 'home.dailyRecipeIngredientRecovery3Name', amountKey: 'home.dailyRecipeIngredientRecovery3Amount' },
    ],
  },
};

const SECONDS_PER_MINUTE = 60;

export function DailyRecipeCard({ goal, onStartBlend }: DailyRecipeCardProps) {
  const { t } = useAppTranslation();
  const recipe = DAILY_RECIPES[goal];

  const handleStartBlendPress = useCallback(() => {
    const pulseAiRecipe: PulseAiRecipe = {
      title: t(recipe.nameKey),
      ingredients: recipe.ingredients.map((ingredient) => ({
        name: t(ingredient.nameKey),
        amount: t(ingredient.amountKey),
      })),
      macros: {
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat,
        calories: recipe.calories,
      },
      prepTimeSeconds: recipe.durationMinutes * SECONDS_PER_MINUTE,
      blendInstruction: t('home.dailyRecipeBlendInstruction'),
      tip: t('home.dailyRecipeTip'),
      hasSubstitutes: false,
    };

    onStartBlend(pulseAiRecipe);
  }, [onStartBlend, recipe, t]);

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>{t('home.todaysBlend')}</Text>

      <Text style={styles.recipeName}>{t(recipe.nameKey)}</Text>

      <Text style={styles.macrosRow}>
        {t('home.recipeMacros', {
          protein: recipe.protein,
          carbs: recipe.carbs,
          calories: recipe.calories,
        })}
      </Text>

      <Text style={styles.timeEstimate}>
        {t('home.blendTime', { minutes: recipe.durationMinutes })}
      </Text>

      <View style={styles.footer}>
        <AuthButton
          fullWidth={false}
          onPress={handleStartBlendPress}
          style={styles.ctaButton}
        >
          <Text style={styles.ctaLabel}>{t('home.startBlend')}</Text>
        </AuthButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  badge: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.md,
  },
  recipeName: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  macrosRow: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    opacity: MACRO_OPACITY,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  timeEstimate: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    opacity: META_OPACITY,
    lineHeight: 18,
  },
  footer: {
    marginTop: spacing.lg,
    alignItems: 'flex-end',
  },
  ctaButton: {
    height: 36,
    paddingHorizontal: spacing.lg,
    minWidth: 132,
  },
  ctaLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
});