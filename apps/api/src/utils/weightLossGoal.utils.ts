// apps/api/src/utils/weightLossGoal.utils.ts
// CP-1.1.9 — goal 'WeightLoss' sempre com weightGoal 'lose'.
//
// Regra, sobre o estado FINAL do usuário depois da atualização (goal do corpo
// ou, se ausente, o salvo):
// - Goal final WeightLoss:
//   - weightGoal no corpo diferente de 'lose' → recusa (400,
//     WEIGHT_LOSS_REQUIRES_LOSE_ERROR_CODE). Vale tanto para "troca o goal
//     para WeightLoss e manda gain" quanto para "troca só o weightGoal com
//     WeightLoss salvo".
//   - weightGoal ausente no corpo → grava 'lose' (se o salvo já for 'lose' e
//     o goal não veio no corpo, não há nada a gravar).
// - Goal final de outro tipo: nada muda — inclusive trocar de WeightLoss para
//   outro goal mantém o weightGoal salvo.
//
// Atomicidade: o 'lose' imposto vai no MESMO $set do goal (um único
// findOneAndUpdate). O único caminho que poderia deixar WeightLoss + gain no
// banco é um PATCH só de weightGoal ('maintain'/'gain') correndo junto com
// outro que troca o goal para WeightLoss; para ele, requireGoalNotWeightLoss
// pede ao controller um filtro { goal: { $ne: 'WeightLoss' } } no update —
// se o goal mudou no meio, o update não casa e o controller responde 400.
import {
  WEIGHT_LOSS_GOAL,
  WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL,
  WEIGHT_LOSS_REQUIRES_LOSE_ERROR_CODE,
  isWeightGoalAllowedForGoal,
} from '@blendi/shared';

import type { UserGoal, WeightGoal } from '../models/User';

export { WEIGHT_LOSS_REQUIRES_LOSE_ERROR_CODE };

export const WEIGHT_LOSS_REQUIRES_LOSE_MESSAGE = 'The Weight Loss goal requires weightGoal "lose".';

export interface WeightLossGoalCoherenceInput {
  /** goal enviado no corpo (já validado pelo Zod); undefined se não veio. */
  bodyGoal?: UserGoal;
  /** weightGoal enviado no corpo (já validado pelo Zod); undefined se não veio. */
  bodyWeightGoal?: WeightGoal;
  savedGoal?: UserGoal | null;
  savedWeightGoal?: WeightGoal | null;
}

export type WeightLossGoalCoherence =
  | { ok: false }
  | {
      ok: true;
      /** weightGoal a gravar (o do corpo ou o 'lose' imposto); undefined = não mexe. */
      weightGoalToSet: WeightGoal | undefined;
      /** A regra trocou o weightGoal salvo — conta como gatilho de recálculo das metas. */
      weightGoalChangedByRule: boolean;
      /** O update precisa do filtro { goal: { $ne: 'WeightLoss' } } (ver cabeçalho). */
      requireGoalNotWeightLoss: boolean;
    };

export function resolveWeightLossGoalCoherence({
  bodyGoal,
  bodyWeightGoal,
  savedGoal,
  savedWeightGoal,
}: WeightLossGoalCoherenceInput): WeightLossGoalCoherence {
  const finalGoal = bodyGoal ?? savedGoal ?? undefined;

  if (finalGoal === WEIGHT_LOSS_GOAL) {
    if (bodyWeightGoal !== undefined && !isWeightGoalAllowedForGoal(finalGoal, bodyWeightGoal)) {
      return { ok: false };
    }

    const weightGoalChangedByRule =
      bodyWeightGoal === undefined && savedWeightGoal !== WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL;
    const mustWriteLose = bodyGoal !== undefined || bodyWeightGoal !== undefined || weightGoalChangedByRule;

    return {
      ok: true,
      weightGoalToSet: mustWriteLose ? WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL : undefined,
      weightGoalChangedByRule,
      requireGoalNotWeightLoss: false,
    };
  }

  return {
    ok: true,
    weightGoalToSet: bodyWeightGoal,
    weightGoalChangedByRule: false,
    requireGoalNotWeightLoss:
      bodyGoal === undefined &&
      bodyWeightGoal !== undefined &&
      bodyWeightGoal !== WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL,
  };
}

/**
 * weightGoal das contas novas: o placeholder de getAccountCreationBodyProfileDefaults
 * ('maintain'), exceto para WeightLoss, que nasce com 'lose'.
 */
export function resolveAccountCreationWeightGoal(goal: UserGoal, placeholder: WeightGoal): WeightGoal {
  return goal === WEIGHT_LOSS_GOAL ? WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL : placeholder;
}

// ─── XP de "meta de calorias" ────────────────────────────────────────────────
// Regra antiga (todos os goals): o XP sai quando a soma de calorias dos blends
// do dia chega à meta — e também quando passa dela, sem teto. Para quem está
// em déficit (WeightLoss) isso premiava passar da meta. Para WeightLoss o XP
// só sai com o total entre 90% e 100% da meta; os outros goals não mudam.
export const WEIGHT_LOSS_CALORIE_GOAL_XP_MIN_RATIO = 0.9;
export const WEIGHT_LOSS_CALORIE_GOAL_XP_MAX_RATIO = 1;

export interface CalorieGoalXpRange {
  min: number;
  /** Sem teto quando ausente. */
  max?: number;
}

export function getCalorieGoalXpRange(goal: UserGoal | null | undefined, dailyCalorieTarget: number): CalorieGoalXpRange {
  if (goal === WEIGHT_LOSS_GOAL) {
    return {
      min: dailyCalorieTarget * WEIGHT_LOSS_CALORIE_GOAL_XP_MIN_RATIO,
      max: dailyCalorieTarget * WEIGHT_LOSS_CALORIE_GOAL_XP_MAX_RATIO,
    };
  }

  return { min: dailyCalorieTarget };
}

export function isWithinCalorieGoalXpRange(total: number, range: CalorieGoalXpRange): boolean {
  return total >= range.min && (range.max === undefined || total <= range.max);
}
