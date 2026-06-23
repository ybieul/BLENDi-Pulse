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

interface MissionResponsePayload {
  missionsUpdated?: string[];
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

export function handleMissionResponse({ missionsUpdated }: MissionResponsePayload): void {
  try {
    if (!Array.isArray(missionsUpdated) || missionsUpdated.length === 0) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dailyMissions });
  } catch {
    return;
  }
}
