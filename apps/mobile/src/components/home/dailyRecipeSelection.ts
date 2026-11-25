// apps/mobile/src/components/home/dailyRecipeSelection.ts
// CP-1.1.9 — escolha da receita do dia da Home, filtrada por dieta e modelo.
//
// 1. Receitas do goal da pessoa compatíveis com a dieta (dietaryPreferences)
//    e com o modelo (nada com gelo no Lite, pela marcação `contains`).
//    CP-B2: o filtro por proteína (Lite até 35 g) saiu — o único limite
//    físico do copo é o volume.
// 2. Nenhuma compatível no goal: receitas compatíveis dos outros goals, na
//    ordem de USER_GOAL_VALUES.
// 3. Nenhuma em lugar nenhum: null — a Home troca o card por um atalho para
//    pedir uma receita à Pulse AI.
//
// CP-B6: alergias. Alergia comum pela marcação `contains` (conferida no
// backend pelas famílias); item do campo livre pelos nomes dos ingredientes
// em en e pt-BR (ingredientNamesOf), com a normalização do shared. Mesmo
// filtro e mesmo fallback da dieta.
//
// A rotação continua determinística (dia local % tamanho da lista), agora
// sobre a lista filtrada. Sem dieta e fora do Lite, a lista é exatamente o
// pool do goal, na mesma ordem: a receita de cada dia é a mesma de antes.
import {
  USER_GOAL_VALUES,
  isHomeRecipeAllowed,
  type DietaryPreference,
  type HomeRecipeAllergyFilter,
  type HomeRecipeBlendiModel,
  type UserGoal,
} from '@blendi/shared';

import { DAILY_RECIPES, type DailyRecipe } from './dailyRecipes.data';

export type DailyRecipePoolSource = 'goal' | 'otherGoals';

export interface DailyRecipePool {
  recipes: DailyRecipe[];
  source: DailyRecipePoolSource;
}

export interface DailyRecipeSelectionInput {
  goal: UserGoal;
  dietaryPreferences: readonly DietaryPreference[];
  blendiModel: HomeRecipeBlendiModel;
  /** CP-B6: alergias cadastradas (ausente = nenhuma). */
  allergies?: HomeRecipeAllergyFilter;
  /** CP-B6: nomes dos ingredientes (en e pt-BR) para o campo livre. */
  ingredientNamesOf?: (recipe: DailyRecipe) => readonly string[];
}

function filterCompatible(
  recipes: readonly DailyRecipe[],
  { dietaryPreferences, blendiModel, allergies, ingredientNamesOf }: DailyRecipeSelectionInput
): DailyRecipe[] {
  return recipes.filter((recipe) =>
    isHomeRecipeAllowed(
      recipe,
      dietaryPreferences,
      blendiModel,
      allergies,
      allergies && allergies.custom.length > 0 ? ingredientNamesOf?.(recipe) : undefined
    )
  );
}

/** Lista de onde sai a receita do dia, ou null quando nenhuma receita é compatível. */
export function getDailyRecipePool(input: DailyRecipeSelectionInput): DailyRecipePool | null {
  const fromGoal = filterCompatible(DAILY_RECIPES[input.goal] ?? [], input);
  if (fromGoal.length > 0) {
    return { recipes: fromGoal, source: 'goal' };
  }

  const fromOtherGoals = filterCompatible(
    USER_GOAL_VALUES.filter((goal) => goal !== input.goal).flatMap((goal) => DAILY_RECIPES[goal]),
    input
  );

  return fromOtherGoals.length > 0 ? { recipes: fromOtherGoals, source: 'otherGoals' } : null;
}

/**
 * Item do dia: módulo matemático (sempre não-negativo), não o `%` puro do JS
 * — um dayIndex negativo (perto da época Unix num fuso atrás de UTC)
 * indexaria fora da lista.
 */
export function pickForDay<T>(items: readonly T[], dayIndex: number): T {
  return items[((dayIndex % items.length) + items.length) % items.length];
}

export function selectDailyRecipe(input: DailyRecipeSelectionInput, dayIndex: number): DailyRecipe | null {
  const pool = getDailyRecipePool(input);
  return pool ? pickForDay(pool.recipes, dayIndex) : null;
}
