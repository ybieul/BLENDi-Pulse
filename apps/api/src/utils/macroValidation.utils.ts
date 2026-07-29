// apps/api/src/utils/macroValidation.utils.ts
// Camada 3 do refinamento de qualidade do Pulse AI: verifica se as calorias
// declaradas pela IA batem com as calorias derivadas matematicamente dos
// macros (protein x4 + carbs x4 + fat x9). Nunca bloqueia o usuário — apenas
// sinaliza a inconsistência para o handler decidir se vale um retry.

import type { PulseAiRecipe } from '@blendi/shared';

// Tolerância deliberadamente mais folgada que a checagem de 10% pedida ao
// modelo no prompt (ver promptBuilder.service.ts) — esta é a rede de
// segurança no backend, não a autoavaliação do modelo.
export const MACRO_CALORIE_TOLERANCE_PERCENT = 15;

export interface MacroConsistencyDiscrepancy {
  declaredCalories: number;
  derivedCalories: number;
  differencePercent: number;
}

export type MacroConsistencyResult =
  | { macrosValidated: true }
  | { macrosValidated: false; discrepancy: MacroConsistencyDiscrepancy };

function getCalorieDifferencePercent(declaredCalories: number, derivedCalories: number): number {
  const referenceCalories = Math.max(declaredCalories, derivedCalories);

  if (referenceCalories <= 0) {
    return 0;
  }

  return (Math.abs(declaredCalories - derivedCalories) / referenceCalories) * 100;
}

export function validateMacroConsistency(
  recipe: Pick<PulseAiRecipe, 'macros'>
): MacroConsistencyResult {
  const { protein, carbs, fat, calories } = recipe.macros;
  const derivedCalories = protein * 4 + carbs * 4 + fat * 9;
  const differencePercent = getCalorieDifferencePercent(calories, derivedCalories);

  if (differencePercent <= MACRO_CALORIE_TOLERANCE_PERCENT) {
    return { macrosValidated: true };
  }

  return {
    macrosValidated: false,
    discrepancy: {
      declaredCalories: calories,
      derivedCalories: Math.round(derivedCalories),
      differencePercent: Math.round(differencePercent * 100) / 100,
    },
  };
}

export function buildMacroInconsistencyRetryMessage(
  recipe: Pick<PulseAiRecipe, 'macros'>,
  discrepancy: MacroConsistencyDiscrepancy
): string {
  const { protein, carbs, fat } = recipe.macros;

  return [
    'Your previous response had inconsistent macros.',
    `You declared ${discrepancy.declaredCalories} kcal, but protein (${protein}g x 4) + carbs (${carbs}g x 4) + fat (${fat}g x 9) = ${discrepancy.derivedCalories} kcal, a ${discrepancy.differencePercent}% difference.`,
    'Recalculate the macros and total calories using the exact ingredient quantities you listed, then return the corrected JSON.',
  ].join(' ');
}
