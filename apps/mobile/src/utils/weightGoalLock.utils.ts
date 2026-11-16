// apps/mobile/src/utils/weightGoalLock.utils.ts
// CP-1.1.9 — com o objetivo Weight Loss, o objetivo de peso fica travado em
// "perder" nas telas de corpo (onboarding e completar perfil). A regra em si
// (isWeightGoalAllowedForGoal) mora no shared e é a mesma que o backend aplica.
import {
  WEIGHT_LOSS_GOAL,
  WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL,
  isWeightGoalAllowedForGoal,
  type UserGoal,
  type WeightGoal,
} from '@blendi/shared';

/** Opacidade das opções de objetivo de peso desabilitadas pelo Weight Loss. */
export const LOCKED_WEIGHT_GOAL_CHIP_OPACITY = 0.4;

export function isWeightGoalLockedByGoal(goal: UserGoal | null | undefined): boolean {
  return goal === WEIGHT_LOSS_GOAL;
}

/** weightGoal efetivo: 'lose' com Weight Loss; senão, o escolhido na tela. */
export function resolveDisplayedWeightGoal<T extends WeightGoal | null>(
  goal: UserGoal | null | undefined,
  chosenWeightGoal: T
): WeightGoal | T {
  return isWeightGoalLockedByGoal(goal) ? WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL : chosenWeightGoal;
}

export function isWeightGoalOptionDisabled(goal: UserGoal | null | undefined, option: WeightGoal): boolean {
  return !isWeightGoalAllowedForGoal(goal, option);
}
