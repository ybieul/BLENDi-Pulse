// apps/api/src/utils/blenderGuardrail.utils.ts
// Camada 2 do refinamento de qualidade do Pulse AI: valida no backend se a
// proteína da receita respeita o limite físico do blenderModel do usuário.
// A instrução no prompt (promptBuilder.service.ts) nem sempre é suficiente —
// sob pedido adversarial do usuário ("máximo de proteína possível"), o modelo
// pode ignorá-la. Esta é a rede de segurança: sinaliza a violação para o
// handler pedir um retry.
//
// CP-1.1.9: o limite físico passou a BLOQUEAR. Se o retry ainda passar do
// limite de proteína ou de volume, a receita não é entregue (Pulse AI: 422
// pulseai/blender-limit-unmet; Pantry: a receita é descartada). O volume é
// estimado a partir do texto de `amount` por recipeVolume.utils.ts (limite
// inferior: o que não dá para medir conta como 0).

import type { PulseAiRecipe } from '@blendi/shared';

import { BLENDER_LIMITS } from '../config/pricing.config';
import type { BlendiModel } from '../models/User';
import { estimateRecipeVolumeMl } from './recipeVolume.utils';

export interface ProteinGuardrailDiscrepancy {
  declaredProtein: number;
  maxProteinGrams: number;
}

export type ProteinGuardrailResult =
  | { withinGuardrail: true }
  | { withinGuardrail: false; discrepancy: ProteinGuardrailDiscrepancy };

export function validateProteinGuardrail(
  recipe: Pick<PulseAiRecipe, 'macros'>,
  blendiModel: BlendiModel
): ProteinGuardrailResult {
  const { maxProteinGrams } = BLENDER_LIMITS[blendiModel];

  if (recipe.macros.protein <= maxProteinGrams) {
    return { withinGuardrail: true };
  }

  return {
    withinGuardrail: false,
    discrepancy: {
      declaredProtein: recipe.macros.protein,
      maxProteinGrams,
    },
  };
}

export function buildProteinGuardrailRetryMessage(
  discrepancy: ProteinGuardrailDiscrepancy
): string {
  return [
    `Your previous response exceeded the physical protein guardrail for this blender: it has ${discrepancy.declaredProtein}g of protein, but the maximum allowed for this hardware is ${discrepancy.maxProteinGrams}g.`,
    'Reduce or substitute ingredients so the total protein fits within that limit, then return the corrected JSON with recalculated macros.',
  ].join(' ');
}

// ─── Limite físico completo: proteína + volume (CP-1.1.9) ────────────────────

export interface VolumeGuardrailDiscrepancy {
  /** Limite inferior do volume, em ml (ver recipeVolume.utils.ts). */
  estimatedVolumeMl: number;
  maxVolumeMl: number;
  maxVolumeOz: number;
}

export interface BlenderLimitViolation {
  protein?: ProteinGuardrailDiscrepancy;
  volume?: VolumeGuardrailDiscrepancy;
}

export type BlenderLimitResult =
  | { withinLimits: true }
  | { withinLimits: false; violation: BlenderLimitViolation };

export function validateBlenderLimits(
  recipe: Pick<PulseAiRecipe, 'macros' | 'ingredients'>,
  blendiModel: BlendiModel
): BlenderLimitResult {
  const limits = BLENDER_LIMITS[blendiModel];
  const violation: BlenderLimitViolation = {};

  const protein = validateProteinGuardrail(recipe, blendiModel);
  if (!protein.withinGuardrail) {
    violation.protein = protein.discrepancy;
  }

  const { estimatedVolumeMl } = estimateRecipeVolumeMl(recipe.ingredients);
  if (estimatedVolumeMl > limits.maxVolumeMl) {
    violation.volume = {
      estimatedVolumeMl,
      maxVolumeMl: limits.maxVolumeMl,
      maxVolumeOz: limits.maxVolumeOz,
    };
  }

  return violation.protein || violation.volume ? { withinLimits: false, violation } : { withinLimits: true };
}

export function buildBlenderLimitRetryMessage(violation: BlenderLimitViolation): string {
  return [
    ...(violation.protein ? [buildProteinGuardrailRetryMessage(violation.protein)] : []),
    ...(violation.volume
      ? [
          `Your previous response exceeded the physical volume of this blender: its ingredients add up to about ${violation.volume.estimatedVolumeMl}ml (counting each gram of a solid ingredient as 1ml), but the maximum is ${violation.volume.maxVolumeMl}ml (${violation.volume.maxVolumeOz}oz).`,
          'Reduce the quantities so the combined volume fits within that limit, then return the corrected JSON with recalculated macros.',
        ]
      : []),
  ].join(' ');
}

/** Resumo para log: só números, sem texto da receita. */
export function summarizeBlenderLimitViolation(violation: BlenderLimitViolation) {
  return {
    ...(violation.protein && { protein: violation.protein.declaredProtein, maxProtein: violation.protein.maxProteinGrams }),
    ...(violation.volume && { volumeMl: violation.volume.estimatedVolumeMl, maxVolumeMl: violation.volume.maxVolumeMl }),
  };
}
