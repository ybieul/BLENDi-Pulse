import { StyleSheet, Text, View } from 'react-native';

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

interface DailyRecipe {
  nameKey:
    | 'home.goalMuscleRecipe'
    | 'home.goalWellnessRecipe'
    | 'home.goalEnergyRecipe'
    | 'home.goalRecoveryRecipe';
  protein: number;
  carbs: number;
  calories: number;
  durationMinutes: number;
}

export interface DailyRecipeCardProps {
  goal: UserGoal;
  onStartBlend: () => void;
}

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const MACRO_OPACITY = 0.7;
const META_OPACITY = 0.6;

const DAILY_RECIPES: Record<UserGoal, DailyRecipe> = {
  Muscle: {
    nameKey: 'home.goalMuscleRecipe',
    protein: 38,
    carbs: 26,
    calories: 420,
    durationMinutes: 3,
  },
  Wellness: {
    nameKey: 'home.goalWellnessRecipe',
    protein: 18,
    carbs: 24,
    calories: 260,
    durationMinutes: 4,
  },
  Energy: {
    nameKey: 'home.goalEnergyRecipe',
    protein: 16,
    carbs: 42,
    calories: 340,
    durationMinutes: 3,
  },
  Recovery: {
    nameKey: 'home.goalRecoveryRecipe',
    protein: 24,
    carbs: 20,
    calories: 290,
    durationMinutes: 4,
  },
};

export function DailyRecipeCard({ goal, onStartBlend }: DailyRecipeCardProps) {
  const { t } = useAppTranslation();
  const recipe = DAILY_RECIPES[goal];

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
          onPress={onStartBlend}
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