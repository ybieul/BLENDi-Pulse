// apps/api/src/utils/blenderGuardrail.utils.ts
// Limite físico do copo do BLENDi, validado no backend sobre a receita já
// gerada (Pulse AI e Pantry Scanner). A instrução do prompt
// (promptBuilder.service.ts) nem sempre basta; esta é a rede de segurança:
// sinaliza a violação para o handler pedir uma nova tentativa.
//
// CP-1.1.9: o limite físico passou a BLOQUEAR. Se a nova tentativa ainda
// passar do volume, a receita não é entregue (Pulse AI: 422
// pulseai/blender-limit-unmet; Pantry: a receita é descartada). O volume é
// estimado a partir do texto de `amount` por recipeVolume.utils.ts (limite
// inferior: o que não dá para medir conta como 0).
//
// CP-B2: o VOLUME é o único limite físico. A checagem de proteína por modelo
// (maxProteinGrams), a nova tentativa por proteína e o campo de violação de
// proteína saíram: o teto foi criado por nós e não refletia o hardware.

import type { PulseAiRecipe } from '@blendi/shared';

import { BLENDER_LIMITS } from '../config/pricing.config';
import type { BlendiModel } from '../models/User';
import { formatDecimal, formatMaxVolume, type RecipeTextContext } from './recipeText.utils';
import { estimateRecipeVolumeMl } from './recipeVolume.utils';

export interface VolumeGuardrailDiscrepancy {
  model: BlendiModel;
  /** Limite inferior do volume, em ml (ver recipeVolume.utils.ts). */
  estimatedVolumeMl: number;
  maxVolumeMl: number;
  maxVolumeOz: number;
}

export interface BlenderLimitViolation {
  volume: VolumeGuardrailDiscrepancy;
}

export type BlenderLimitResult =
  | { withinLimits: true }
  | { withinLimits: false; violation: BlenderLimitViolation };

export function validateBlenderLimits(
  recipe: Pick<PulseAiRecipe, 'ingredients'>,
  blendiModel: BlendiModel
): BlenderLimitResult {
  const limits = BLENDER_LIMITS[blendiModel];
  const { estimatedVolumeMl } = estimateRecipeVolumeMl(recipe.ingredients);

  if (estimatedVolumeMl <= limits.maxVolumeMl) {
    return { withinLimits: true };
  }

  return {
    withinLimits: false,
    violation: {
      volume: {
        model: blendiModel,
        estimatedVolumeMl,
        maxVolumeMl: limits.maxVolumeMl,
        maxVolumeOz: limits.maxVolumeOz,
      },
    },
  };
}

/**
 * Nova tentativa por volume (CP-B2): reduzir as quantidades mantendo a ideia
 * da receita e o título (sem palavras de tamanho), e preencher o
 * capacityNotice se o pedido da pessoa deixar de ser atendido.
 *
 * CP-B3: com o contexto da conta, o limite sai no formato do idioma (pt-BR
 * com vírgula) e, no imperial, também em xícaras; a regra do peso típico é a
 * mesma do prompt. Sem contexto, o texto em inglês de antes do CP-B3 (com a
 * regra do peso atualizada).
 */
export function buildBlenderLimitRetryMessage(
  violation: BlenderLimitViolation,
  textContext?: RecipeTextContext
): string {
  const { volume } = violation;
  const locale = textContext?.locale ?? 'en';
  const imperialLimit = textContext?.unitSystem === 'imperial'
    ? formatMaxVolume(volume.model, 'imperial', locale)
    : `${formatDecimal(volume.maxVolumeOz, locale)}oz`;

  return [
    `Your previous response exceeded the physical volume of this blender: its ingredients add up to about ${volume.estimatedVolumeMl}ml (counting each gram of a solid ingredient as 1ml), but the cup holds at most ${volume.maxVolumeMl}ml (${imperialLimit}).`,
    'Keep the same recipe idea and the same title (if you change the title, do not add any word about size, such as compact, mini, small, compacto or pequeno). Reduce the quantities so the combined volume fits within that limit, then return the corrected JSON with macros recalculated from the new quantities.',
    // CP-B2 (lote 4 ao vivo): depois da nova tentativa a IA encolhia demais
    // (~300 ml e 140-180 kcal; "900 kcal" virou 425 kcal).
    `Aim for about 90% of the limit (around ${Math.round(volume.maxVolumeMl * 0.9)}ml), not far below it: keep a full serving.`,
    // CP-B3: a mesma conta do backend (ingredientWeights.utils.ts).
    'Leafy greens, fruit pieces, oats, powders, seeds, nut butters and yogurt measured in cups or spoons count by their typical weight; liquids and any other ingredient measured in cups or spoons count with the full measured volume, so measure protein powder by weight.',
    "If, after reducing, the recipe no longer delivers what the user explicitly asked for (for example a calorie or macro amount), fill the capacityNotice field with one short sentence, in the user's language, saying what was asked, what this recipe delivers and that the cup's volume is the reason. Otherwise omit capacityNotice.",
  ].join(' ');
}

/** Resumo para log: só números, sem texto da receita. */
export function summarizeBlenderLimitViolation(violation: BlenderLimitViolation) {
  return {
    volumeMl: violation.volume.estimatedVolumeMl,
    maxVolumeMl: violation.volume.maxVolumeMl,
  };
}
