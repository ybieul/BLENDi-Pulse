import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { CACHE_CONFIG, QUERY_KEYS } from '../../config/cache.config';
import { getDailyMissions, type DailyMissionItem } from '../../services/dailyMission.service';
import { useAuthStore } from '../../store/auth.store';
import { useGamificationStore } from '../../store/gamification.store';
import { MissionCompletionToast } from './MissionCompletionToast';

// Handoff pro level up: mesmo delay que já existia em HomeScreen antes desta
// mudança, dá tempo da animação de saída do toast terminar antes do modal
// de level up (global, LevelUpCelebration) começar a entrar.
const LEVEL_UP_HANDOFF_DELAY_MS = 500;

// Montado globalmente (App.tsx), igual ao LevelUpCelebration — antes esta
// detecção + o toast viviam dentro de HomeScreen, então uma missão concluída
// por uma ação em qualquer outra aba (TrackScreen, BlendScreen, PulseAIScreen,
// PantryScannerScreen, tela de receita) rodava o ciclo de vida inteiro do
// toast (entrada + 2s + saída) em segundo plano, invisível — a Home não
// precisava estar em foco pro efeito de detecção rodar (query ativa mesmo em
// aba oculta), só a renderização do toast é que ficava presa dentro da árvore
// da Home. Vivendo aqui, o toast aparece por cima de qualquer tela.
export function MissionCelebrationWatcher() {
  // Montado globalmente (fora do RootNavigator/AppFlow), então esta query
  // roda mesmo com o usuário deslogado (tela de Login) — sem esse `enabled`,
  // ela dispara sem accessToken, recebe 401 e aciona o fluxo de refresh/logout
  // do interceptor do Axios (auth.store.ts) já no boot do app. Pior: se esse
  // logout() disparado "a frio" ainda estiver em andamento (ele mesmo tenta
  // POST /auth/logout, que também 401 sem token, re-disparando o interceptor
  // recursivamente) no momento em que o usuário efetua login com sucesso, ele
  // conclui DEPOIS do login e sobrescreve accessToken/isAuthenticated de volta
  // para deslogado — o usuário via a Home abrir e imediatamente voltar pro
  // Login, em loop.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const { data: missionsData } = useQuery({
    queryKey: QUERY_KEYS.dailyMissions,
    queryFn: getDailyMissions,
    staleTime: CACHE_CONFIG.DAILY_MISSIONS_TTL,
    enabled: isAuthenticated,
  });

  const prevMissionsRef = useRef<DailyMissionItem[] | null>(null);

  const missionToastXP = useGamificationStore((state) => state.missionToastXP);
  const triggerMissionToast = useGamificationStore((state) => state.triggerMissionToast);
  const dismissMissionToast = useGamificationStore((state) => state.dismissMissionToast);
  const pendingLevelUp = useGamificationStore((state) => state.pendingLevelUp);
  const clearPendingLevelUp = useGamificationStore((state) => state.clearPendingLevelUp);
  const triggerLevelUp = useGamificationStore((state) => state.triggerLevelUp);

  useEffect(() => {
    const missions = missionsData?.missions;

    if (!missions) {
      prevMissionsRef.current = null;
      return;
    }

    const prev = prevMissionsRef.current;
    prevMissionsRef.current = missions;

    if (!prev) {
      return;
    }

    const newlyCompleted = missions.filter((mission) => {
      const prevMission = prev.find((item) => item.missionId === mission.missionId);
      return prevMission !== undefined && !prevMission.completed && mission.completed;
    });

    if (newlyCompleted.length === 0) {
      return;
    }

    const totalXP = newlyCompleted.reduce((sum, mission) => sum + mission.xpReward, 0);
    triggerMissionToast(totalXP);
  }, [missionsData?.missions, triggerMissionToast]);

  // Mesmo gate que já existia: não sobrepõe o modal de level up com o toast
  // de missão — o level up só dispara quando não há toast na tela.
  useEffect(() => {
    if (pendingLevelUp === null || missionToastXP !== null) {
      return;
    }

    triggerLevelUp(pendingLevelUp);
    clearPendingLevelUp();
  }, [clearPendingLevelUp, missionToastXP, pendingLevelUp, triggerLevelUp]);

  const handleDismiss = useCallback(() => {
    dismissMissionToast();

    if (pendingLevelUp !== null) {
      const levelUpToTrigger = pendingLevelUp;
      clearPendingLevelUp();
      setTimeout(() => {
        triggerLevelUp(levelUpToTrigger);
      }, LEVEL_UP_HANDOFF_DELAY_MS);
    }
  }, [clearPendingLevelUp, dismissMissionToast, pendingLevelUp, triggerLevelUp]);

  if (missionToastXP === null) {
    return null;
  }

  return (
    <MissionCompletionToast
      xpAmount={missionToastXP}
      visible={missionToastXP !== null}
      onDismiss={handleDismiss}
    />
  );
}
