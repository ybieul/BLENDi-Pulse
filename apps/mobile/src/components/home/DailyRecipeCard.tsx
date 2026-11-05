import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PulseAiRecipe } from '@blendi/shared';

import {
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton } from '../ui/AuthButton';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import type { TranslationKey } from '../../locales/i18n';

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';

interface DailyRecipeIngredient {
  nameKey: TranslationKey;
  amountKey: TranslationKey;
}

interface DailyRecipeStep {
  textKey: TranslationKey;
  pulseCount?: number;
}

interface DailyRecipe {
  nameKey: TranslationKey;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  durationMinutes: number;
  ingredients: DailyRecipeIngredient[];
  steps: DailyRecipeStep[];
}

export interface DailyRecipeCardProps {
  goal: UserGoal;
  onStartBlend: (recipe: PulseAiRecipe) => void;
}

const MACRO_OPACITY = 0.7;
const META_OPACITY = 0.6;

// A primeira receita de cada goal (índice 0) é a receita original, única,
// que já existia antes do pool de 20 — nela, fat = (calories − protein×4 −
// carbs×4) / 9, arredondado. As 19 seguintes de cada goal foram derivadas
// ingrediente a ingrediente (não a partir dessa fórmula reversa).
export const DAILY_RECIPES: Record<UserGoal, DailyRecipe[]> = {
  Muscle: [
    {
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
      steps: [
        { textKey: 'home.dailyRecipeMuscle01Step1' },
        { textKey: 'home.dailyRecipeMuscle01Step2' },
        { textKey: 'home.dailyRecipeMuscle01Step3' },
        { textKey: 'home.dailyRecipeMuscle01Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle02Name',
      protein: 38,
      carbs: 21,
      fat: 19,
      calories: 407,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle02Ingredient1Name', amountKey: 'home.dailyRecipeMuscle02Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle02Ingredient2Name', amountKey: 'home.dailyRecipeMuscle02Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle02Ingredient3Name', amountKey: 'home.dailyRecipeMuscle02Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle02Step1' },
        { textKey: 'home.dailyRecipeMuscle02Step2' },
        { textKey: 'home.dailyRecipeMuscle02Step3' },
        { textKey: 'home.dailyRecipeMuscle02Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle03Name',
      protein: 26,
      carbs: 42,
      fat: 6,
      calories: 326,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle03Ingredient1Name', amountKey: 'home.dailyRecipeMuscle03Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle03Ingredient2Name', amountKey: 'home.dailyRecipeMuscle03Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle03Ingredient3Name', amountKey: 'home.dailyRecipeMuscle03Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle03Step1' },
        { textKey: 'home.dailyRecipeMuscle03Step2' },
        { textKey: 'home.dailyRecipeMuscle03Step3' },
        { textKey: 'home.dailyRecipeMuscle03Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle04Name',
      protein: 26,
      carbs: 28,
      fat: 10,
      calories: 306,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle04Ingredient1Name', amountKey: 'home.dailyRecipeMuscle04Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle04Ingredient2Name', amountKey: 'home.dailyRecipeMuscle04Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle04Ingredient3Name', amountKey: 'home.dailyRecipeMuscle04Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle04Step1' },
        { textKey: 'home.dailyRecipeMuscle04Step2' },
        { textKey: 'home.dailyRecipeMuscle04Step3' },
        { textKey: 'home.dailyRecipeMuscle04Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle05Name',
      protein: 21,
      carbs: 47,
      fat: 30,
      calories: 542,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle05Ingredient1Name', amountKey: 'home.dailyRecipeMuscle05Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle05Ingredient2Name', amountKey: 'home.dailyRecipeMuscle05Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle05Ingredient3Name', amountKey: 'home.dailyRecipeMuscle05Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle05Step1' },
        { textKey: 'home.dailyRecipeMuscle05Step2' },
        { textKey: 'home.dailyRecipeMuscle05Step3' },
        { textKey: 'home.dailyRecipeMuscle05Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle06Name',
      protein: 23,
      carbs: 49,
      fat: 5,
      calories: 333,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle06Ingredient1Name', amountKey: 'home.dailyRecipeMuscle06Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle06Ingredient2Name', amountKey: 'home.dailyRecipeMuscle06Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle06Ingredient3Name', amountKey: 'home.dailyRecipeMuscle06Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle06Step1' },
        { textKey: 'home.dailyRecipeMuscle06Step2' },
        { textKey: 'home.dailyRecipeMuscle06Step3' },
        { textKey: 'home.dailyRecipeMuscle06Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle07Name',
      protein: 26,
      carbs: 34,
      fat: 3,
      calories: 267,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle07Ingredient1Name', amountKey: 'home.dailyRecipeMuscle07Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle07Ingredient2Name', amountKey: 'home.dailyRecipeMuscle07Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle07Ingredient3Name', amountKey: 'home.dailyRecipeMuscle07Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle07Step1' },
        { textKey: 'home.dailyRecipeMuscle07Step2' },
        { textKey: 'home.dailyRecipeMuscle07Step3' },
        { textKey: 'home.dailyRecipeMuscle07Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle08Name',
      protein: 12,
      carbs: 34,
      fat: 7,
      calories: 247,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle08Ingredient1Name', amountKey: 'home.dailyRecipeMuscle08Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle08Ingredient2Name', amountKey: 'home.dailyRecipeMuscle08Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle08Ingredient3Name', amountKey: 'home.dailyRecipeMuscle08Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle08Step1' },
        { textKey: 'home.dailyRecipeMuscle08Step2' },
        { textKey: 'home.dailyRecipeMuscle08Step3', pulseCount: 8 },
        { textKey: 'home.dailyRecipeMuscle08Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle09Name',
      protein: 36,
      carbs: 35,
      fat: 6,
      calories: 338,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle09Ingredient1Name', amountKey: 'home.dailyRecipeMuscle09Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle09Ingredient2Name', amountKey: 'home.dailyRecipeMuscle09Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle09Ingredient3Name', amountKey: 'home.dailyRecipeMuscle09Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle09Step1' },
        { textKey: 'home.dailyRecipeMuscle09Step2' },
        { textKey: 'home.dailyRecipeMuscle09Step3' },
        { textKey: 'home.dailyRecipeMuscle09Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle10Name',
      protein: 22,
      carbs: 35,
      fat: 7,
      calories: 291,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle10Ingredient1Name', amountKey: 'home.dailyRecipeMuscle10Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle10Ingredient2Name', amountKey: 'home.dailyRecipeMuscle10Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle10Ingredient3Name', amountKey: 'home.dailyRecipeMuscle10Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle10Step1' },
        { textKey: 'home.dailyRecipeMuscle10Step2' },
        { textKey: 'home.dailyRecipeMuscle10Step3' },
        { textKey: 'home.dailyRecipeMuscle10Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle11Name',
      protein: 33,
      carbs: 19,
      fat: 12,
      calories: 316,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle11Ingredient1Name', amountKey: 'home.dailyRecipeMuscle11Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle11Ingredient2Name', amountKey: 'home.dailyRecipeMuscle11Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle11Ingredient3Name', amountKey: 'home.dailyRecipeMuscle11Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle11Step1' },
        { textKey: 'home.dailyRecipeMuscle11Step2' },
        { textKey: 'home.dailyRecipeMuscle11Step3' },
        { textKey: 'home.dailyRecipeMuscle11Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle12Name',
      protein: 19,
      carbs: 43,
      fat: 20,
      calories: 428,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle12Ingredient1Name', amountKey: 'home.dailyRecipeMuscle12Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle12Ingredient2Name', amountKey: 'home.dailyRecipeMuscle12Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle12Ingredient3Name', amountKey: 'home.dailyRecipeMuscle12Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle12Step1' },
        { textKey: 'home.dailyRecipeMuscle12Step2' },
        { textKey: 'home.dailyRecipeMuscle12Step3' },
        { textKey: 'home.dailyRecipeMuscle12Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle13Name',
      protein: 8,
      carbs: 45,
      fat: 11,
      calories: 311,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle13Ingredient1Name', amountKey: 'home.dailyRecipeMuscle13Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle13Ingredient2Name', amountKey: 'home.dailyRecipeMuscle13Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle13Ingredient3Name', amountKey: 'home.dailyRecipeMuscle13Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle13Step1' },
        { textKey: 'home.dailyRecipeMuscle13Step2' },
        { textKey: 'home.dailyRecipeMuscle13Step3', pulseCount: 8 },
        { textKey: 'home.dailyRecipeMuscle13Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle14Name',
      protein: 33,
      carbs: 47,
      fat: 10,
      calories: 410,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle14Ingredient1Name', amountKey: 'home.dailyRecipeMuscle14Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle14Ingredient2Name', amountKey: 'home.dailyRecipeMuscle14Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle14Ingredient3Name', amountKey: 'home.dailyRecipeMuscle14Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle14Step1' },
        { textKey: 'home.dailyRecipeMuscle14Step2' },
        { textKey: 'home.dailyRecipeMuscle14Step3' },
        { textKey: 'home.dailyRecipeMuscle14Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle15Name',
      protein: 18,
      carbs: 29,
      fat: 5,
      calories: 233,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle15Ingredient1Name', amountKey: 'home.dailyRecipeMuscle15Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle15Ingredient2Name', amountKey: 'home.dailyRecipeMuscle15Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle15Ingredient3Name', amountKey: 'home.dailyRecipeMuscle15Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle15Step1' },
        { textKey: 'home.dailyRecipeMuscle15Step2' },
        { textKey: 'home.dailyRecipeMuscle15Step3' },
        { textKey: 'home.dailyRecipeMuscle15Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle16Name',
      protein: 28,
      carbs: 23,
      fat: 13,
      calories: 321,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle16Ingredient1Name', amountKey: 'home.dailyRecipeMuscle16Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle16Ingredient2Name', amountKey: 'home.dailyRecipeMuscle16Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle16Ingredient3Name', amountKey: 'home.dailyRecipeMuscle16Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle16Step1' },
        { textKey: 'home.dailyRecipeMuscle16Step2' },
        { textKey: 'home.dailyRecipeMuscle16Step3' },
        { textKey: 'home.dailyRecipeMuscle16Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle17Name',
      protein: 23,
      carbs: 38,
      fat: 8,
      calories: 316,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle17Ingredient1Name', amountKey: 'home.dailyRecipeMuscle17Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle17Ingredient2Name', amountKey: 'home.dailyRecipeMuscle17Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle17Ingredient3Name', amountKey: 'home.dailyRecipeMuscle17Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle17Step1' },
        { textKey: 'home.dailyRecipeMuscle17Step2' },
        { textKey: 'home.dailyRecipeMuscle17Step3', pulseCount: 8 },
        { textKey: 'home.dailyRecipeMuscle17Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle18Name',
      protein: 36,
      carbs: 35,
      fat: 11,
      calories: 383,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle18Ingredient1Name', amountKey: 'home.dailyRecipeMuscle18Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle18Ingredient2Name', amountKey: 'home.dailyRecipeMuscle18Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle18Ingredient3Name', amountKey: 'home.dailyRecipeMuscle18Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle18Step1' },
        { textKey: 'home.dailyRecipeMuscle18Step2' },
        { textKey: 'home.dailyRecipeMuscle18Step3' },
        { textKey: 'home.dailyRecipeMuscle18Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle19Name',
      protein: 25,
      carbs: 34,
      fat: 10,
      calories: 326,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle19Ingredient1Name', amountKey: 'home.dailyRecipeMuscle19Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle19Ingredient2Name', amountKey: 'home.dailyRecipeMuscle19Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle19Ingredient3Name', amountKey: 'home.dailyRecipeMuscle19Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle19Step1' },
        { textKey: 'home.dailyRecipeMuscle19Step2' },
        { textKey: 'home.dailyRecipeMuscle19Step3' },
        { textKey: 'home.dailyRecipeMuscle19Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeMuscle20Name',
      protein: 21,
      carbs: 28,
      fat: 5,
      calories: 241,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeMuscle20Ingredient1Name', amountKey: 'home.dailyRecipeMuscle20Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeMuscle20Ingredient2Name', amountKey: 'home.dailyRecipeMuscle20Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeMuscle20Ingredient3Name', amountKey: 'home.dailyRecipeMuscle20Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeMuscle20Step1' },
        { textKey: 'home.dailyRecipeMuscle20Step2' },
        { textKey: 'home.dailyRecipeMuscle20Step3' },
        { textKey: 'home.dailyRecipeMuscle20Step4' },
      ],
    },
  ],
  Wellness: [
    {
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
      steps: [
        { textKey: 'home.dailyRecipeWellness01Step1' },
        { textKey: 'home.dailyRecipeWellness01Step2' },
        { textKey: 'home.dailyRecipeWellness01Step3' },
        { textKey: 'home.dailyRecipeWellness01Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness02Name',
      protein: 16,
      carbs: 35,
      fat: 3,
      calories: 231,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness02Ingredient1Name', amountKey: 'home.dailyRecipeWellness02Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness02Ingredient2Name', amountKey: 'home.dailyRecipeWellness02Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness02Ingredient3Name', amountKey: 'home.dailyRecipeWellness02Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness02Step1' },
        { textKey: 'home.dailyRecipeWellness02Step2' },
        { textKey: 'home.dailyRecipeWellness02Step3' },
        { textKey: 'home.dailyRecipeWellness02Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness03Name',
      protein: 16,
      carbs: 30,
      fat: 3,
      calories: 211,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness03Ingredient1Name', amountKey: 'home.dailyRecipeWellness03Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness03Ingredient2Name', amountKey: 'home.dailyRecipeWellness03Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness03Ingredient3Name', amountKey: 'home.dailyRecipeWellness03Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness03Step1' },
        { textKey: 'home.dailyRecipeWellness03Step2' },
        { textKey: 'home.dailyRecipeWellness03Step3' },
        { textKey: 'home.dailyRecipeWellness03Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness04Name',
      protein: 9,
      carbs: 35,
      fat: 6,
      calories: 230,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness04Ingredient1Name', amountKey: 'home.dailyRecipeWellness04Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness04Ingredient2Name', amountKey: 'home.dailyRecipeWellness04Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness04Ingredient3Name', amountKey: 'home.dailyRecipeWellness04Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness04Step1' },
        { textKey: 'home.dailyRecipeWellness04Step2' },
        { textKey: 'home.dailyRecipeWellness04Step3' },
        { textKey: 'home.dailyRecipeWellness04Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness05Name',
      protein: 17,
      carbs: 24,
      fat: 4,
      calories: 200,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness05Ingredient1Name', amountKey: 'home.dailyRecipeWellness05Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness05Ingredient2Name', amountKey: 'home.dailyRecipeWellness05Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness05Ingredient3Name', amountKey: 'home.dailyRecipeWellness05Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness05Step1' },
        { textKey: 'home.dailyRecipeWellness05Step2' },
        { textKey: 'home.dailyRecipeWellness05Step3' },
        { textKey: 'home.dailyRecipeWellness05Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness06Name',
      protein: 16,
      carbs: 27,
      fat: 3,
      calories: 199,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness06Ingredient1Name', amountKey: 'home.dailyRecipeWellness06Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness06Ingredient2Name', amountKey: 'home.dailyRecipeWellness06Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness06Ingredient3Name', amountKey: 'home.dailyRecipeWellness06Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness06Step1' },
        { textKey: 'home.dailyRecipeWellness06Step2' },
        { textKey: 'home.dailyRecipeWellness06Step3' },
        { textKey: 'home.dailyRecipeWellness06Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness07Name',
      protein: 9,
      carbs: 30,
      fat: 6,
      calories: 210,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness07Ingredient1Name', amountKey: 'home.dailyRecipeWellness07Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness07Ingredient2Name', amountKey: 'home.dailyRecipeWellness07Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness07Ingredient3Name', amountKey: 'home.dailyRecipeWellness07Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness07Step1' },
        { textKey: 'home.dailyRecipeWellness07Step2' },
        { textKey: 'home.dailyRecipeWellness07Step3' },
        { textKey: 'home.dailyRecipeWellness07Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness08Name',
      protein: 7,
      carbs: 29,
      fat: 3,
      calories: 171,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness08Ingredient1Name', amountKey: 'home.dailyRecipeWellness08Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness08Ingredient2Name', amountKey: 'home.dailyRecipeWellness08Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness08Ingredient3Name', amountKey: 'home.dailyRecipeWellness08Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness08Step1' },
        { textKey: 'home.dailyRecipeWellness08Step2' },
        { textKey: 'home.dailyRecipeWellness08Step3' },
        { textKey: 'home.dailyRecipeWellness08Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness09Name',
      protein: 17,
      carbs: 29,
      fat: 4,
      calories: 220,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness09Ingredient1Name', amountKey: 'home.dailyRecipeWellness09Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness09Ingredient2Name', amountKey: 'home.dailyRecipeWellness09Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness09Ingredient3Name', amountKey: 'home.dailyRecipeWellness09Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness09Step1' },
        { textKey: 'home.dailyRecipeWellness09Step2' },
        { textKey: 'home.dailyRecipeWellness09Step3' },
        { textKey: 'home.dailyRecipeWellness09Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness10Name',
      protein: 11,
      carbs: 22,
      fat: 2,
      calories: 150,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness10Ingredient1Name', amountKey: 'home.dailyRecipeWellness10Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness10Ingredient2Name', amountKey: 'home.dailyRecipeWellness10Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness10Ingredient3Name', amountKey: 'home.dailyRecipeWellness10Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness10Step1' },
        { textKey: 'home.dailyRecipeWellness10Step2' },
        { textKey: 'home.dailyRecipeWellness10Step3' },
        { textKey: 'home.dailyRecipeWellness10Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness11Name',
      protein: 16,
      carbs: 23,
      fat: 3,
      calories: 183,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness11Ingredient1Name', amountKey: 'home.dailyRecipeWellness11Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness11Ingredient2Name', amountKey: 'home.dailyRecipeWellness11Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness11Ingredient3Name', amountKey: 'home.dailyRecipeWellness11Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness11Step1' },
        { textKey: 'home.dailyRecipeWellness11Step2' },
        { textKey: 'home.dailyRecipeWellness11Step3' },
        { textKey: 'home.dailyRecipeWellness11Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness12Name',
      protein: 8,
      carbs: 35,
      fat: 5,
      calories: 217,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness12Ingredient1Name', amountKey: 'home.dailyRecipeWellness12Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness12Ingredient2Name', amountKey: 'home.dailyRecipeWellness12Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness12Ingredient3Name', amountKey: 'home.dailyRecipeWellness12Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness12Step1' },
        { textKey: 'home.dailyRecipeWellness12Step2' },
        { textKey: 'home.dailyRecipeWellness12Step3' },
        { textKey: 'home.dailyRecipeWellness12Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness13Name',
      protein: 8,
      carbs: 33,
      fat: 3,
      calories: 191,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness13Ingredient1Name', amountKey: 'home.dailyRecipeWellness13Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness13Ingredient2Name', amountKey: 'home.dailyRecipeWellness13Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness13Ingredient3Name', amountKey: 'home.dailyRecipeWellness13Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness13Step1' },
        { textKey: 'home.dailyRecipeWellness13Step2' },
        { textKey: 'home.dailyRecipeWellness13Step3' },
        { textKey: 'home.dailyRecipeWellness13Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness14Name',
      protein: 17,
      carbs: 28,
      fat: 3,
      calories: 207,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness14Ingredient1Name', amountKey: 'home.dailyRecipeWellness14Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness14Ingredient2Name', amountKey: 'home.dailyRecipeWellness14Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness14Ingredient3Name', amountKey: 'home.dailyRecipeWellness14Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness14Step1' },
        { textKey: 'home.dailyRecipeWellness14Step2' },
        { textKey: 'home.dailyRecipeWellness14Step3' },
        { textKey: 'home.dailyRecipeWellness14Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness15Name',
      protein: 12,
      carbs: 31,
      fat: 2,
      calories: 190,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness15Ingredient1Name', amountKey: 'home.dailyRecipeWellness15Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness15Ingredient2Name', amountKey: 'home.dailyRecipeWellness15Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness15Ingredient3Name', amountKey: 'home.dailyRecipeWellness15Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness15Step1' },
        { textKey: 'home.dailyRecipeWellness15Step2' },
        { textKey: 'home.dailyRecipeWellness15Step3' },
        { textKey: 'home.dailyRecipeWellness15Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness16Name',
      protein: 16,
      carbs: 28,
      fat: 4,
      calories: 212,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness16Ingredient1Name', amountKey: 'home.dailyRecipeWellness16Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness16Ingredient2Name', amountKey: 'home.dailyRecipeWellness16Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness16Ingredient3Name', amountKey: 'home.dailyRecipeWellness16Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness16Step1' },
        { textKey: 'home.dailyRecipeWellness16Step2' },
        { textKey: 'home.dailyRecipeWellness16Step3' },
        { textKey: 'home.dailyRecipeWellness16Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness17Name',
      protein: 9,
      carbs: 33,
      fat: 5,
      calories: 213,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness17Ingredient1Name', amountKey: 'home.dailyRecipeWellness17Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness17Ingredient2Name', amountKey: 'home.dailyRecipeWellness17Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness17Ingredient3Name', amountKey: 'home.dailyRecipeWellness17Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness17Step1' },
        { textKey: 'home.dailyRecipeWellness17Step2' },
        { textKey: 'home.dailyRecipeWellness17Step3' },
        { textKey: 'home.dailyRecipeWellness17Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness18Name',
      protein: 16,
      carbs: 19,
      fat: 4,
      calories: 176,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness18Ingredient1Name', amountKey: 'home.dailyRecipeWellness18Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness18Ingredient2Name', amountKey: 'home.dailyRecipeWellness18Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness18Ingredient3Name', amountKey: 'home.dailyRecipeWellness18Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness18Step1' },
        { textKey: 'home.dailyRecipeWellness18Step2' },
        { textKey: 'home.dailyRecipeWellness18Step3' },
        { textKey: 'home.dailyRecipeWellness18Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness19Name',
      protein: 18,
      carbs: 27,
      fat: 6,
      calories: 234,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness19Ingredient1Name', amountKey: 'home.dailyRecipeWellness19Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness19Ingredient2Name', amountKey: 'home.dailyRecipeWellness19Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness19Ingredient3Name', amountKey: 'home.dailyRecipeWellness19Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness19Step1' },
        { textKey: 'home.dailyRecipeWellness19Step2' },
        { textKey: 'home.dailyRecipeWellness19Step3' },
        { textKey: 'home.dailyRecipeWellness19Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeWellness20Name',
      protein: 16,
      carbs: 34,
      fat: 3,
      calories: 227,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeWellness20Ingredient1Name', amountKey: 'home.dailyRecipeWellness20Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeWellness20Ingredient2Name', amountKey: 'home.dailyRecipeWellness20Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeWellness20Ingredient3Name', amountKey: 'home.dailyRecipeWellness20Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeWellness20Step1' },
        { textKey: 'home.dailyRecipeWellness20Step2' },
        { textKey: 'home.dailyRecipeWellness20Step3' },
        { textKey: 'home.dailyRecipeWellness20Step4' },
      ],
    },
  ],
  Energy: [
    {
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
      steps: [
        { textKey: 'home.dailyRecipeEnergy01Step1' },
        { textKey: 'home.dailyRecipeEnergy01Step2' },
        { textKey: 'home.dailyRecipeEnergy01Step3' },
        { textKey: 'home.dailyRecipeEnergy01Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy02Name',
      protein: 10,
      carbs: 71,
      fat: 3,
      calories: 351,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy02Ingredient1Name', amountKey: 'home.dailyRecipeEnergy02Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy02Ingredient2Name', amountKey: 'home.dailyRecipeEnergy02Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy02Ingredient3Name', amountKey: 'home.dailyRecipeEnergy02Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy02Step1' },
        { textKey: 'home.dailyRecipeEnergy02Step2' },
        { textKey: 'home.dailyRecipeEnergy02Step3' },
        { textKey: 'home.dailyRecipeEnergy02Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy03Name',
      protein: 13,
      carbs: 35,
      fat: 10,
      calories: 282,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy03Ingredient1Name', amountKey: 'home.dailyRecipeEnergy03Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy03Ingredient2Name', amountKey: 'home.dailyRecipeEnergy03Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy03Ingredient3Name', amountKey: 'home.dailyRecipeEnergy03Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy03Step1' },
        { textKey: 'home.dailyRecipeEnergy03Step2' },
        { textKey: 'home.dailyRecipeEnergy03Step3' },
        { textKey: 'home.dailyRecipeEnergy03Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy04Name',
      protein: 9,
      carbs: 40,
      fat: 3,
      calories: 223,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy04Ingredient1Name', amountKey: 'home.dailyRecipeEnergy04Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy04Ingredient2Name', amountKey: 'home.dailyRecipeEnergy04Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy04Ingredient3Name', amountKey: 'home.dailyRecipeEnergy04Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy04Step1' },
        { textKey: 'home.dailyRecipeEnergy04Step2' },
        { textKey: 'home.dailyRecipeEnergy04Step3' },
        { textKey: 'home.dailyRecipeEnergy04Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy05Name',
      protein: 5,
      carbs: 51,
      fat: 2,
      calories: 242,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy05Ingredient1Name', amountKey: 'home.dailyRecipeEnergy05Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy05Ingredient2Name', amountKey: 'home.dailyRecipeEnergy05Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy05Ingredient3Name', amountKey: 'home.dailyRecipeEnergy05Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy05Step1' },
        { textKey: 'home.dailyRecipeEnergy05Step2' },
        { textKey: 'home.dailyRecipeEnergy05Step3' },
        { textKey: 'home.dailyRecipeEnergy05Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy06Name',
      protein: 14,
      carbs: 87,
      fat: 4,
      calories: 440,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy06Ingredient1Name', amountKey: 'home.dailyRecipeEnergy06Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy06Ingredient2Name', amountKey: 'home.dailyRecipeEnergy06Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy06Ingredient3Name', amountKey: 'home.dailyRecipeEnergy06Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy06Step1' },
        { textKey: 'home.dailyRecipeEnergy06Step2' },
        { textKey: 'home.dailyRecipeEnergy06Step3' },
        { textKey: 'home.dailyRecipeEnergy06Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy07Name',
      protein: 9,
      carbs: 39,
      fat: 3,
      calories: 219,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy07Ingredient1Name', amountKey: 'home.dailyRecipeEnergy07Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy07Ingredient2Name', amountKey: 'home.dailyRecipeEnergy07Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy07Ingredient3Name', amountKey: 'home.dailyRecipeEnergy07Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy07Step1' },
        { textKey: 'home.dailyRecipeEnergy07Step2' },
        { textKey: 'home.dailyRecipeEnergy07Step3' },
        { textKey: 'home.dailyRecipeEnergy07Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy08Name',
      protein: 9,
      carbs: 39,
      fat: 3,
      calories: 219,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy08Ingredient1Name', amountKey: 'home.dailyRecipeEnergy08Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy08Ingredient2Name', amountKey: 'home.dailyRecipeEnergy08Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy08Ingredient3Name', amountKey: 'home.dailyRecipeEnergy08Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy08Step1' },
        { textKey: 'home.dailyRecipeEnergy08Step2' },
        { textKey: 'home.dailyRecipeEnergy08Step3' },
        { textKey: 'home.dailyRecipeEnergy08Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy09Name',
      protein: 12,
      carbs: 54,
      fat: 13,
      calories: 381,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy09Ingredient1Name', amountKey: 'home.dailyRecipeEnergy09Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy09Ingredient2Name', amountKey: 'home.dailyRecipeEnergy09Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy09Ingredient3Name', amountKey: 'home.dailyRecipeEnergy09Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy09Step1' },
        { textKey: 'home.dailyRecipeEnergy09Step2' },
        { textKey: 'home.dailyRecipeEnergy09Step3' },
        { textKey: 'home.dailyRecipeEnergy09Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy10Name',
      protein: 8,
      carbs: 65,
      fat: 5,
      calories: 337,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy10Ingredient1Name', amountKey: 'home.dailyRecipeEnergy10Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy10Ingredient2Name', amountKey: 'home.dailyRecipeEnergy10Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy10Ingredient3Name', amountKey: 'home.dailyRecipeEnergy10Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy10Step1' },
        { textKey: 'home.dailyRecipeEnergy10Step2' },
        { textKey: 'home.dailyRecipeEnergy10Step3' },
        { textKey: 'home.dailyRecipeEnergy10Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy11Name',
      protein: 10,
      carbs: 43,
      fat: 6,
      calories: 266,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy11Ingredient1Name', amountKey: 'home.dailyRecipeEnergy11Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy11Ingredient2Name', amountKey: 'home.dailyRecipeEnergy11Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy11Ingredient3Name', amountKey: 'home.dailyRecipeEnergy11Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy11Step1' },
        { textKey: 'home.dailyRecipeEnergy11Step2' },
        { textKey: 'home.dailyRecipeEnergy11Step3' },
        { textKey: 'home.dailyRecipeEnergy11Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy12Name',
      protein: 10,
      carbs: 69,
      fat: 3,
      calories: 343,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy12Ingredient1Name', amountKey: 'home.dailyRecipeEnergy12Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy12Ingredient2Name', amountKey: 'home.dailyRecipeEnergy12Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy12Ingredient3Name', amountKey: 'home.dailyRecipeEnergy12Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy12Step1' },
        { textKey: 'home.dailyRecipeEnergy12Step2' },
        { textKey: 'home.dailyRecipeEnergy12Step3' },
        { textKey: 'home.dailyRecipeEnergy12Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy13Name',
      protein: 9,
      carbs: 35,
      fat: 3,
      calories: 203,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy13Ingredient1Name', amountKey: 'home.dailyRecipeEnergy13Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy13Ingredient2Name', amountKey: 'home.dailyRecipeEnergy13Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy13Ingredient3Name', amountKey: 'home.dailyRecipeEnergy13Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy13Step1' },
        { textKey: 'home.dailyRecipeEnergy13Step2' },
        { textKey: 'home.dailyRecipeEnergy13Step3' },
        { textKey: 'home.dailyRecipeEnergy13Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy14Name',
      protein: 5,
      carbs: 53,
      fat: 4,
      calories: 268,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy14Ingredient1Name', amountKey: 'home.dailyRecipeEnergy14Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy14Ingredient2Name', amountKey: 'home.dailyRecipeEnergy14Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy14Ingredient3Name', amountKey: 'home.dailyRecipeEnergy14Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy14Step1' },
        { textKey: 'home.dailyRecipeEnergy14Step2' },
        { textKey: 'home.dailyRecipeEnergy14Step3' },
        { textKey: 'home.dailyRecipeEnergy14Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy15Name',
      protein: 6,
      carbs: 46,
      fat: 11,
      calories: 307,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy15Ingredient1Name', amountKey: 'home.dailyRecipeEnergy15Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy15Ingredient2Name', amountKey: 'home.dailyRecipeEnergy15Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy15Ingredient3Name', amountKey: 'home.dailyRecipeEnergy15Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy15Step1' },
        { textKey: 'home.dailyRecipeEnergy15Step2' },
        { textKey: 'home.dailyRecipeEnergy15Step3' },
        { textKey: 'home.dailyRecipeEnergy15Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy16Name',
      protein: 9,
      carbs: 60,
      fat: 3,
      calories: 303,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy16Ingredient1Name', amountKey: 'home.dailyRecipeEnergy16Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy16Ingredient2Name', amountKey: 'home.dailyRecipeEnergy16Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy16Ingredient3Name', amountKey: 'home.dailyRecipeEnergy16Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy16Step1' },
        { textKey: 'home.dailyRecipeEnergy16Step2' },
        { textKey: 'home.dailyRecipeEnergy16Step3' },
        { textKey: 'home.dailyRecipeEnergy16Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy17Name',
      protein: 9,
      carbs: 15,
      fat: 9,
      calories: 177,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy17Ingredient1Name', amountKey: 'home.dailyRecipeEnergy17Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy17Ingredient2Name', amountKey: 'home.dailyRecipeEnergy17Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy17Ingredient3Name', amountKey: 'home.dailyRecipeEnergy17Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy17Step1' },
        { textKey: 'home.dailyRecipeEnergy17Step2' },
        { textKey: 'home.dailyRecipeEnergy17Step3' },
        { textKey: 'home.dailyRecipeEnergy17Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy18Name',
      protein: 16,
      carbs: 27,
      fat: 3,
      calories: 199,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy18Ingredient1Name', amountKey: 'home.dailyRecipeEnergy18Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy18Ingredient2Name', amountKey: 'home.dailyRecipeEnergy18Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy18Ingredient3Name', amountKey: 'home.dailyRecipeEnergy18Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy18Step1' },
        { textKey: 'home.dailyRecipeEnergy18Step2' },
        { textKey: 'home.dailyRecipeEnergy18Step3' },
        { textKey: 'home.dailyRecipeEnergy18Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy19Name',
      protein: 7,
      carbs: 62,
      fat: 3,
      calories: 303,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy19Ingredient1Name', amountKey: 'home.dailyRecipeEnergy19Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy19Ingredient2Name', amountKey: 'home.dailyRecipeEnergy19Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy19Ingredient3Name', amountKey: 'home.dailyRecipeEnergy19Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy19Step1' },
        { textKey: 'home.dailyRecipeEnergy19Step2' },
        { textKey: 'home.dailyRecipeEnergy19Step3' },
        { textKey: 'home.dailyRecipeEnergy19Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeEnergy20Name',
      protein: 9,
      carbs: 36,
      fat: 4,
      calories: 216,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeEnergy20Ingredient1Name', amountKey: 'home.dailyRecipeEnergy20Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeEnergy20Ingredient2Name', amountKey: 'home.dailyRecipeEnergy20Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeEnergy20Ingredient3Name', amountKey: 'home.dailyRecipeEnergy20Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeEnergy20Step1' },
        { textKey: 'home.dailyRecipeEnergy20Step2' },
        { textKey: 'home.dailyRecipeEnergy20Step3' },
        { textKey: 'home.dailyRecipeEnergy20Step4' },
      ],
    },
  ],
  Recovery: [
    {
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
      steps: [
        { textKey: 'home.dailyRecipeRecovery01Step1' },
        { textKey: 'home.dailyRecipeRecovery01Step2' },
        { textKey: 'home.dailyRecipeRecovery01Step3' },
        { textKey: 'home.dailyRecipeRecovery01Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery02Name',
      protein: 21,
      carbs: 35,
      fat: 6,
      calories: 278,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery02Ingredient1Name', amountKey: 'home.dailyRecipeRecovery02Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery02Ingredient2Name', amountKey: 'home.dailyRecipeRecovery02Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery02Ingredient3Name', amountKey: 'home.dailyRecipeRecovery02Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery02Step1' },
        { textKey: 'home.dailyRecipeRecovery02Step2' },
        { textKey: 'home.dailyRecipeRecovery02Step3' },
        { textKey: 'home.dailyRecipeRecovery02Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery03Name',
      protein: 16,
      carbs: 29,
      fat: 3,
      calories: 207,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery03Ingredient1Name', amountKey: 'home.dailyRecipeRecovery03Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery03Ingredient2Name', amountKey: 'home.dailyRecipeRecovery03Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery03Ingredient3Name', amountKey: 'home.dailyRecipeRecovery03Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery03Step1' },
        { textKey: 'home.dailyRecipeRecovery03Step2' },
        { textKey: 'home.dailyRecipeRecovery03Step3' },
        { textKey: 'home.dailyRecipeRecovery03Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery04Name',
      protein: 24,
      carbs: 26,
      fat: 2,
      calories: 218,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery04Ingredient1Name', amountKey: 'home.dailyRecipeRecovery04Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery04Ingredient2Name', amountKey: 'home.dailyRecipeRecovery04Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery04Ingredient3Name', amountKey: 'home.dailyRecipeRecovery04Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery04Step1' },
        { textKey: 'home.dailyRecipeRecovery04Step2' },
        { textKey: 'home.dailyRecipeRecovery04Step3' },
        { textKey: 'home.dailyRecipeRecovery04Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery05Name',
      protein: 16,
      carbs: 31,
      fat: 4,
      calories: 224,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery05Ingredient1Name', amountKey: 'home.dailyRecipeRecovery05Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery05Ingredient2Name', amountKey: 'home.dailyRecipeRecovery05Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery05Ingredient3Name', amountKey: 'home.dailyRecipeRecovery05Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery05Step1' },
        { textKey: 'home.dailyRecipeRecovery05Step2' },
        { textKey: 'home.dailyRecipeRecovery05Step3' },
        { textKey: 'home.dailyRecipeRecovery05Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery06Name',
      protein: 17,
      carbs: 28,
      fat: 6,
      calories: 234,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery06Ingredient1Name', amountKey: 'home.dailyRecipeRecovery06Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery06Ingredient2Name', amountKey: 'home.dailyRecipeRecovery06Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery06Ingredient3Name', amountKey: 'home.dailyRecipeRecovery06Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery06Step1' },
        { textKey: 'home.dailyRecipeRecovery06Step2' },
        { textKey: 'home.dailyRecipeRecovery06Step3' },
        { textKey: 'home.dailyRecipeRecovery06Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery07Name',
      protein: 26,
      carbs: 39,
      fat: 2,
      calories: 278,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery07Ingredient1Name', amountKey: 'home.dailyRecipeRecovery07Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery07Ingredient2Name', amountKey: 'home.dailyRecipeRecovery07Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery07Ingredient3Name', amountKey: 'home.dailyRecipeRecovery07Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery07Step1' },
        { textKey: 'home.dailyRecipeRecovery07Step2' },
        { textKey: 'home.dailyRecipeRecovery07Step3' },
        { textKey: 'home.dailyRecipeRecovery07Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery08Name',
      protein: 16,
      carbs: 28,
      fat: 3,
      calories: 203,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery08Ingredient1Name', amountKey: 'home.dailyRecipeRecovery08Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery08Ingredient2Name', amountKey: 'home.dailyRecipeRecovery08Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery08Ingredient3Name', amountKey: 'home.dailyRecipeRecovery08Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery08Step1' },
        { textKey: 'home.dailyRecipeRecovery08Step2' },
        { textKey: 'home.dailyRecipeRecovery08Step3' },
        { textKey: 'home.dailyRecipeRecovery08Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery09Name',
      protein: 26,
      carbs: 33,
      fat: 2,
      calories: 254,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery09Ingredient1Name', amountKey: 'home.dailyRecipeRecovery09Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery09Ingredient2Name', amountKey: 'home.dailyRecipeRecovery09Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery09Ingredient3Name', amountKey: 'home.dailyRecipeRecovery09Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery09Step1' },
        { textKey: 'home.dailyRecipeRecovery09Step2' },
        { textKey: 'home.dailyRecipeRecovery09Step3' },
        { textKey: 'home.dailyRecipeRecovery09Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery10Name',
      protein: 16,
      carbs: 27,
      fat: 3,
      calories: 199,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery10Ingredient1Name', amountKey: 'home.dailyRecipeRecovery10Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery10Ingredient2Name', amountKey: 'home.dailyRecipeRecovery10Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery10Ingredient3Name', amountKey: 'home.dailyRecipeRecovery10Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery10Step1' },
        { textKey: 'home.dailyRecipeRecovery10Step2' },
        { textKey: 'home.dailyRecipeRecovery10Step3' },
        { textKey: 'home.dailyRecipeRecovery10Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery11Name',
      protein: 25,
      carbs: 28,
      fat: 2,
      calories: 230,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery11Ingredient1Name', amountKey: 'home.dailyRecipeRecovery11Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery11Ingredient2Name', amountKey: 'home.dailyRecipeRecovery11Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery11Ingredient3Name', amountKey: 'home.dailyRecipeRecovery11Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery11Step1' },
        { textKey: 'home.dailyRecipeRecovery11Step2' },
        { textKey: 'home.dailyRecipeRecovery11Step3' },
        { textKey: 'home.dailyRecipeRecovery11Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery12Name',
      protein: 16,
      carbs: 34,
      fat: 3,
      calories: 227,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery12Ingredient1Name', amountKey: 'home.dailyRecipeRecovery12Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery12Ingredient2Name', amountKey: 'home.dailyRecipeRecovery12Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery12Ingredient3Name', amountKey: 'home.dailyRecipeRecovery12Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery12Step1' },
        { textKey: 'home.dailyRecipeRecovery12Step2' },
        { textKey: 'home.dailyRecipeRecovery12Step3' },
        { textKey: 'home.dailyRecipeRecovery12Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery13Name',
      protein: 25,
      carbs: 27,
      fat: 2,
      calories: 226,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery13Ingredient1Name', amountKey: 'home.dailyRecipeRecovery13Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery13Ingredient2Name', amountKey: 'home.dailyRecipeRecovery13Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery13Ingredient3Name', amountKey: 'home.dailyRecipeRecovery13Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery13Step1' },
        { textKey: 'home.dailyRecipeRecovery13Step2' },
        { textKey: 'home.dailyRecipeRecovery13Step3' },
        { textKey: 'home.dailyRecipeRecovery13Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery14Name',
      protein: 16,
      carbs: 21,
      fat: 3,
      calories: 175,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery14Ingredient1Name', amountKey: 'home.dailyRecipeRecovery14Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery14Ingredient2Name', amountKey: 'home.dailyRecipeRecovery14Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery14Ingredient3Name', amountKey: 'home.dailyRecipeRecovery14Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery14Step1' },
        { textKey: 'home.dailyRecipeRecovery14Step2' },
        { textKey: 'home.dailyRecipeRecovery14Step3' },
        { textKey: 'home.dailyRecipeRecovery14Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery15Name',
      protein: 26,
      carbs: 27,
      fat: 2,
      calories: 230,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery15Ingredient1Name', amountKey: 'home.dailyRecipeRecovery15Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery15Ingredient2Name', amountKey: 'home.dailyRecipeRecovery15Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery15Ingredient3Name', amountKey: 'home.dailyRecipeRecovery15Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery15Step1' },
        { textKey: 'home.dailyRecipeRecovery15Step2' },
        { textKey: 'home.dailyRecipeRecovery15Step3' },
        { textKey: 'home.dailyRecipeRecovery15Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery16Name',
      protein: 25,
      carbs: 26,
      fat: 2,
      calories: 222,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery16Ingredient1Name', amountKey: 'home.dailyRecipeRecovery16Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery16Ingredient2Name', amountKey: 'home.dailyRecipeRecovery16Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery16Ingredient3Name', amountKey: 'home.dailyRecipeRecovery16Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery16Step1' },
        { textKey: 'home.dailyRecipeRecovery16Step2' },
        { textKey: 'home.dailyRecipeRecovery16Step3' },
        { textKey: 'home.dailyRecipeRecovery16Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery17Name',
      protein: 18,
      carbs: 21,
      fat: 7,
      calories: 219,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery17Ingredient1Name', amountKey: 'home.dailyRecipeRecovery17Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery17Ingredient2Name', amountKey: 'home.dailyRecipeRecovery17Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery17Ingredient3Name', amountKey: 'home.dailyRecipeRecovery17Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery17Step1' },
        { textKey: 'home.dailyRecipeRecovery17Step2' },
        { textKey: 'home.dailyRecipeRecovery17Step3' },
        { textKey: 'home.dailyRecipeRecovery17Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery18Name',
      protein: 26,
      carbs: 32,
      fat: 2,
      calories: 250,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery18Ingredient1Name', amountKey: 'home.dailyRecipeRecovery18Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery18Ingredient2Name', amountKey: 'home.dailyRecipeRecovery18Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery18Ingredient3Name', amountKey: 'home.dailyRecipeRecovery18Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery18Step1' },
        { textKey: 'home.dailyRecipeRecovery18Step2' },
        { textKey: 'home.dailyRecipeRecovery18Step3' },
        { textKey: 'home.dailyRecipeRecovery18Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery19Name',
      protein: 17,
      carbs: 28,
      fat: 3,
      calories: 207,
      durationMinutes: 4,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery19Ingredient1Name', amountKey: 'home.dailyRecipeRecovery19Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery19Ingredient2Name', amountKey: 'home.dailyRecipeRecovery19Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery19Ingredient3Name', amountKey: 'home.dailyRecipeRecovery19Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery19Step1' },
        { textKey: 'home.dailyRecipeRecovery19Step2' },
        { textKey: 'home.dailyRecipeRecovery19Step3' },
        { textKey: 'home.dailyRecipeRecovery19Step4' },
      ],
    },
    {
      nameKey: 'home.dailyRecipeRecovery20Name',
      protein: 15,
      carbs: 23,
      fat: 3,
      calories: 179,
      durationMinutes: 3,
      ingredients: [
        { nameKey: 'home.dailyRecipeRecovery20Ingredient1Name', amountKey: 'home.dailyRecipeRecovery20Ingredient1Amount' },
        { nameKey: 'home.dailyRecipeRecovery20Ingredient2Name', amountKey: 'home.dailyRecipeRecovery20Ingredient2Amount' },
        { nameKey: 'home.dailyRecipeRecovery20Ingredient3Name', amountKey: 'home.dailyRecipeRecovery20Ingredient3Amount' },
      ],
      steps: [
        { textKey: 'home.dailyRecipeRecovery20Step1' },
        { textKey: 'home.dailyRecipeRecovery20Step2' },
        { textKey: 'home.dailyRecipeRecovery20Step3' },
        { textKey: 'home.dailyRecipeRecovery20Step4' },
      ],
    },
  ],
};

const SECONDS_PER_MINUTE = 60;
const MS_PER_DAY = 86400000;

// Lê o fuso ATUAL do aparelho via Intl (nunca o fuso persistido no perfil do
// backend) — a rotação da Home precisa funcionar antes de qualquer
// sessão/hidratação e mudar imediatamente se o usuário trocar o fuso do
// aparelho, sem depender de rede nem de estado salvo. Extrair ano/mês/dia
// reais via Intl.DateTimeFormat (em vez de aritmética manual de offset)
// evita erro em fusos com offset não-inteiro (ex: Asia/Kolkata, UTC+5:30) e
// em transições de horário de verão — mesma técnica já usada em
// useDateFormat.ts (getLocalDateKey) e no equivalente de backend
// timezone.utils.ts.
//
// `timezone` é injetável só para teste determinístico: mutar
// `process.env.TZ` em runtime não é confiável neste setup de Jest
// (confirmado empiricamente — `Intl.DateTimeFormat().resolvedOptions()`
// continua devolvendo o fuso real da máquina mesmo depois da troca). Em
// produção, o parâmetro nunca é passado — o default já é o fuso real do
// aparelho, lido de novo em toda chamada.
export function getLocalDayIndex(
  date: Date,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  // Date.UTC sobre os componentes LOCAIS já extraídos acima só gera um
  // índice monotônico que avança exatamente 1 por virada de meia-noite
  // LOCAL — a aritmética UTC aqui nunca serve para calcular o fuso em si.
  return Math.floor(
    Date.UTC(getPart('year'), getPart('month') - 1, getPart('day')) / MS_PER_DAY
  );
}

export function DailyRecipeCard({ goal, onStartBlend }: DailyRecipeCardProps) {
  const colors = useColors();
  const CARD_BACKGROUND = colors.overlay.plum[7];
  const CARD_BORDER = colors.overlay.plum[10];

  const { t } = useAppTranslation();
  const pool = DAILY_RECIPES[goal];
  // new Date(Date.now()), não new Date() sem argumentos: no runtime do RN
  // (e em testes com jest.spyOn(Date, 'now')), o construtor sem argumentos
  // lê o relógio por um caminho interno do motor que ignora um `Date.now`
  // sobrescrito — confirmado empiricamente ao escrever os testes deste
  // arquivo. Passar por `Date.now()` explicitamente garante que mockar
  // `Date.now` em teste continue controlando este cálculo.
  const daysSinceEpoch = getLocalDayIndex(new Date(Date.now()));
  // Módulo matemático (sempre não-negativo), não o operador `%` puro do JS
  // — daysSinceEpoch só é negativo perto da época Unix num fuso atrás de
  // UTC (irrelevante com datas reais, sempre muito depois de 1970), mas
  // sem essa guarda um valor negativo indexaria o array fora dos limites
  // (`pool[-1]` é `undefined`), quebrando o render.
  const poolIndex = ((daysSinceEpoch % pool.length) + pool.length) % pool.length;
  const recipe = pool[poolIndex];

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
      steps: recipe.steps.map((step) => ({
        text: t(step.textKey),
        pulseCount: step.pulseCount,
      })),
    };

    onStartBlend(pulseAiRecipe);
  }, [onStartBlend, recipe, t]);

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
