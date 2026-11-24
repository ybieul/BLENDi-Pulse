// apps/api/src/utils/aiRecipePayload.utils.ts
// CP-B2 — preparo da receita crua da IA antes do schema (pulseAiRecipeSchema):
// - capacityNotice acima do tamanho máximo é cortado no último espaço (com
//   "…") em vez de invalidar a receita inteira e custar uma nova tentativa;
// - usesWaterNotInPhoto é marcado só pelo backend (Pantry): o que vier da IA
//   é descartado.
// - CP-B5: dietOverrideIngredients e alcoholFreeVersion também são só do
//   backend (descartados); alcoholGrams numérico em texto ("16") vira número,
//   e valor inválido (null, negativo, texto) sai em vez de invalidar a
//   receita. alcoholRequested não está no schema e é lido à parte
//   (readAlcoholRequested).

import { RECIPE_CAPACITY_NOTICE_MAX_LENGTH } from '@blendi/shared';

const ELLIPSIS = '…';

export function truncateCapacityNotice(notice: string): string {
  const trimmed = notice.trim();

  if (trimmed.length <= RECIPE_CAPACITY_NOTICE_MAX_LENGTH) {
    return trimmed;
  }

  const room = RECIPE_CAPACITY_NOTICE_MAX_LENGTH - ELLIPSIS.length;
  const cut = trimmed.slice(0, room);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ELLIPSIS}`;
}

export function prepareAiRecipePayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return payload;
  }

  const {
    usesWaterNotInPhoto: _ignoredWater,
    dietOverrideIngredients: _ignoredDietOverride,
    alcoholFreeVersion: _ignoredAlcoholFree,
    // CP-B7a: o aviso de item pedido que faltou também é só do backend.
    missingRequestedIngredients: _ignoredMissing,
    // CP-B7: o aviso de valor pedido não atingido também.
    unmetTargets: _ignoredUnmetTargets,
    ...recipe
  } = payload as Record<string, unknown>;
  void _ignoredWater;
  void _ignoredDietOverride;
  void _ignoredAlcoholFree;
  void _ignoredMissing;
  void _ignoredUnmetTargets;

  if (typeof recipe.capacityNotice === 'string') {
    recipe.capacityNotice = truncateCapacityNotice(recipe.capacityNotice);
  }

  if ('alcoholGrams' in recipe) {
    const grams = typeof recipe.alcoholGrams === 'string' ? Number(recipe.alcoholGrams.trim()) : recipe.alcoholGrams;

    if (typeof grams === 'number' && Number.isFinite(grams) && grams >= 0) {
      recipe.alcoholGrams = grams;
    } else {
      delete recipe.alcoholGrams;
    }
  }

  return recipe;
}

/** CP-B5: a IA marcou que a mensagem atual pede bebida alcoólica (só true literal conta). */
export function readAlcoholRequested(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).alcoholRequested === true
  );
}

// CP-B5 (lote 9 ao vivo): em pt-BR a IA às vezes escreve o número do JSON com
// vírgula decimal ("protein": 1,7), e o JSON inteiro fica inválido. Conserto
// só desse padrão, só nos campos numéricos da receita, e só quando o
// JSON.parse já falhou: em JSON válido "chave": 1,7 não existe.
const DECIMAL_COMMA_NUMBER_FIELD =
  /("(?:protein|carbs|fat|calories|alcoholGrams|prepTimeSeconds|pulseCount)"\s*:\s*-?\d+),(\d+)(?=\s*[,}\n\r])/g;

/** JSON.parse com o conserto acima; lança o erro original se nem assim der. */
export function parseAiJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const repaired = content.replace(DECIMAL_COMMA_NUMBER_FIELD, '$1.$2');

    if (repaired === content) {
      throw error;
    }

    return JSON.parse(repaired);
  }
}
