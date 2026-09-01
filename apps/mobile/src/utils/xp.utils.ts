import { LEVEL_NAMES } from '@blendi/shared';
import { QUERY_KEYS } from '../config/cache.config';
import { queryClient } from '../config/queryClient';
import { useGamificationStore } from '../store/gamification.store';

interface XPResponsePayload {
  xpAwarded?: number;
  leveledUp?: boolean;
  newLevel?: number | null;
  newLevelNameKey?: string;
}

function resolveLevelNameKey(newLevel: number): string {
  if (newLevel <= LEVEL_NAMES.length) {
    return LEVEL_NAMES[newLevel - 1] ?? 'levels.guru';
  }

  return 'levels.guru';
}

export function handleXPResponse({
  xpAwarded,
  leveledUp,
  newLevel,
}: XPResponsePayload): void {
  try {
    if (typeof xpAwarded === 'number' && Number.isFinite(xpAwarded) && xpAwarded > 0) {
      useGamificationStore.getState().incrementXP(xpAwarded);
    }

    if (leveledUp !== true || typeof newLevel !== 'number' || !Number.isFinite(newLevel)) {
      return;
    }

    const normalizedLevel = Math.trunc(newLevel);

    if (normalizedLevel <= 0) {
      return;
    }

    useGamificationStore.getState().setPendingLevelUp({
      newLevel: normalizedLevel,
      newLevelNameKey: resolveLevelNameKey(normalizedLevel),
    });
  } catch {
    return;
  }
}

// Invalidação incondicional: nenhum dos 6 endpoints que chamam esta função
// (blend, hidratação, suplementos, favoritos, Pulse AI, pantry scanner)
// retorna missionsUpdated de forma confiável — cada um dispara updateMissionProgress
// em fire-and-forget no backend, sem capturar o resultado na resposta. Missões são
// sempre potencialmente afetadas por qualquer uma dessas ações, então invalidar
// sempre é o comportamento correto (o payload é aceito só por compatibilidade
// com os call sites existentes, mas não é mais usado).
export function handleMissionResponse(_payload?: unknown): void {
  try {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dailyMissions });
  } catch {
    return;
  }
}
