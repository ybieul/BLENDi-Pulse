// apps/api/src/utils/aiRecipePayload.utils.ts
// CP-B2 — preparo da receita crua da IA antes do schema (pulseAiRecipeSchema):
// - capacityNotice acima do tamanho máximo é cortado no último espaço (com
//   "…") em vez de invalidar a receita inteira e custar uma nova tentativa;
// - usesWaterNotInPhoto é marcado só pelo backend (Pantry): o que vier da IA
//   é descartado.

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

  const { usesWaterNotInPhoto: _ignored, ...recipe } = payload as Record<string, unknown>;
  void _ignored;

  if (typeof recipe.capacityNotice === 'string') {
    recipe.capacityNotice = truncateCapacityNotice(recipe.capacityNotice);
  }

  return recipe;
}
