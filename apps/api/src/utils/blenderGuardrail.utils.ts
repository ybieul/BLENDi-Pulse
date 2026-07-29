// apps/api/src/utils/blenderGuardrail.utils.ts
// Camada 2 do refinamento de qualidade do Pulse AI: valida no backend se a
// proteína da receita respeita o limite físico do blenderModel do usuário.
// A instrução no prompt (promptBuilder.service.ts) nem sempre é suficiente —
// sob pedido adversarial do usuário ("máximo de proteína possível"), o modelo
// pode ignorá-la. Esta é a rede de segurança, no mesmo padrão de
// macroValidation.utils.ts: nunca bloqueia o usuário, apenas sinaliza a
// violação para o handler decidir se vale um retry.
//
// Volume não é validado aqui: o campo `amount` de cada ingrediente é texto
// livre ("30g", "1 cup", "240ml") e não há como converter isso de forma
// confiável para um total comparável sem um parser de unidades — fora do
// escopo desta correção pontual.

import type { PulseAiRecipe } from '@blendi/shared';

import { BLENDER_LIMITS } from '../config/pricing.config';
import type { BlendiModel } from '../models/User';

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
