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
 * CP-B4: o que reduzir primeiro na nova tentativa por volume. Pó de proteína,
 * cacau e outros pós entram no copo pelo peso (ingredientWeights.utils.ts) e
 * quase não somam volume; cortá-los não resolve o volume e derruba o valor
 * pedido. Exportada para os testes.
 */
export const BLENDER_LIMIT_RETRY_REDUCTION_RULES: readonly string[] = [
  'Reduce first the liquid, then fruit, leafy greens and other bulky ingredients.',
  'Protein powder, cocoa powder and other powders take very little room in the cup: do not reduce them to fix the volume.',
  'If the user asked for a specific amount of calories or of a macro (for example 70 g protein or 600 kcal), the corrected recipe must keep that amount whenever it fits the cup.',
];

/**
 * Nova tentativa por volume (CP-B2): reduzir as quantidades mantendo a ideia
 * da receita e o título (sem palavras de tamanho), e preencher o
 * capacityNotice se o pedido da pessoa deixar de ser atendido.
 *
 * CP-B3: com o contexto da conta, o limite sai no formato do idioma (pt-BR
 * com vírgula) e, no imperial, também em xícaras; a regra do peso típico é a
 * mesma do prompt. Sem contexto, o texto em inglês de antes do CP-B3 (com a
 * regra do peso atualizada).
 *
 * CP-B4: a ordem de redução (líquido e itens volumosos antes dos pós) e a
 * regra de manter o valor pedido quando cabe; o capacityNotice só quando o
 * valor de fato deixa de ser atendido.
 */
/**
 * CP-B5 (lote 9 ao vivo, só Pulse AI): "2 bananas e 1 colher de pasta de
 * amendoim" virou 1 banana na nova tentativa, sem aviso. O item pedido na
 * mensagem atual fica; os outros encolhem antes.
 */
export const BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE =
  'Keep every ingredient the user\'s current message explicitly asked for, in the requested amount (for example "2 bananas" stays 2 bananas): reduce the other ingredients first. Only if the recipe still does not fit, reduce a requested item as little as possible and say so in capacityNotice.';

export function buildBlenderLimitRetryMessage(
  violation: BlenderLimitViolation,
  textContext?: RecipeTextContext,
  options: { keepExplicitRequest?: boolean } = {}
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
    'Leafy greens, fruit pieces, oats, powders, seeds, nut butters and yogurt measured in cups or spoons count by their typical weight; liquids and any other ingredient measured in cups or spoons count with the full measured volume.',
    // CP-B4 (lote 6 ao vivo): "70 g de proteína" virou 59 g porque a IA
    // cortou tudo por igual, inclusive o whey, que quase não ocupa volume.
    ...BLENDER_LIMIT_RETRY_REDUCTION_RULES,
    ...(options.keepExplicitRequest ? [BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE] : []),
    "Only if, after reducing, the recipe still cannot deliver what the user explicitly asked for, fill the capacityNotice field with one short sentence, in the user's language, saying what was asked, what this recipe delivers and that the cup's volume is the reason. If the requested value is delivered, omit capacityNotice.",
    // CP-B4 (lote 7 ao vivo): 60 g pedidos, 60,1 g entregues e mesmo assim com aviso.
    'Before returning, compare the corrected macros with the requested value: if they reach it, do not fill capacityNotice, because the notice would tell the user something false.',
  ].join(' ');
}

/** Resumo para log: só números, sem texto da receita. */
export function summarizeBlenderLimitViolation(violation: BlenderLimitViolation) {
  return {
    volumeMl: violation.volume.estimatedVolumeMl,
    maxVolumeMl: violation.volume.maxVolumeMl,
  };
}
