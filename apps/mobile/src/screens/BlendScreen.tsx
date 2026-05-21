// apps/mobile/src/screens/BlendScreen.tsx
// Tela principal da aba Blend — orquestra timer, receita ativa, avaliação e logging.
//
// ─── Arquitetura do timer ─────────────────────────────────────────────────────
//
// Há dois contadores independentes em operação simultânea:
//
// 1. BlendScreen.elapsedSeconds — rastreado via setInterval interno.
//    Finalidade: recuperação de estado (saber quantos segundos passaram desde
//    timerStartedAt ao remontar a tela) e calcular `remainingSeconds` para
//    passar ao TimerCircle na transição de status.
//
// 2. TimerCircle — gerencia o próprio countdown internamente.
//    Recebe `duration` (= timerDuration − elapsedSeconds) apenas no momento
//    da transição para 'running'. Enquanto rodando, ignora mudanças externas
//    de `duration` e chama onComplete quando chega a zero.
//
// Recuperação: ao montar com isTimerRunning = true, setElapsedSeconds é chamado
// ANTES de setTimerStatus('running'). O React 18 batcha os dois no mesmo render,
// garantindo que TimerCircle receba o `remainingSeconds` correto na transição.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import type { PulseAiRecipe } from '@blendi/shared';

import type { AppTabScreenProps } from '../navigation/types';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ActiveRecipeHeader } from '../components/blend/ActiveRecipeHeader';
import { TimerCircle, type TimerCircleStatus } from '../components/blend/TimerCircle';
import { TimerControls } from '../components/blend/TimerControls';
import { RatingBottomSheet } from '../components/blend/RatingBottomSheet';
import { CleaningReminder } from '../components/blend/CleaningReminder';
import { useBlendStore } from '../store/blend.store';
import { useAuthStore } from '../store/auth.store';
import { useNetworkStore } from '../store/network.store';
import { createBlendLog } from '../services/blendLog.service';
import { QUERY_KEYS } from '../config/cache.config';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { addPendingBlend } from '../utils/pendingBlends.utils';
import { showToast } from '../utils/toast.utils';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STOP_RESET_DELAY_MS = 300;
const COMPLETE_SHOW_RATING_DELAY_MS = 800;
const LOG_CLEAN_CHECK_DELAY_MS = 300;
const HAPTIC_SEQUENCE_DELAY_MS = 100;
const CLEANING_STALE_DAYS = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastCleanedAt(userSnapshot: unknown): string | null {
  if (!userSnapshot || typeof userSnapshot !== 'object') {
    return null;
  }

  const candidate = (userSnapshot as { lastCleanedAt?: unknown }).lastCleanedAt;
  return typeof candidate === 'string' ? candidate : null;
}

function isPulseAiRecipe(value: unknown): value is PulseAiRecipe {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    title?: unknown;
    ingredients?: unknown;
    macros?: unknown;
    prepTimeSeconds?: unknown;
    blendInstruction?: unknown;
    tip?: unknown;
    hasSubstitutes?: unknown;
  };

  if (
    typeof candidate.title !== 'string'
    || typeof candidate.prepTimeSeconds !== 'number'
    || typeof candidate.blendInstruction !== 'string'
    || typeof candidate.hasSubstitutes !== 'boolean'
    || (candidate.tip !== undefined && typeof candidate.tip !== 'string')
  ) {
    return false;
  }

  if (!Array.isArray(candidate.ingredients)) {
    return false;
  }

  const hasValidIngredients = candidate.ingredients.every((ingredient) => {
    if (!ingredient || typeof ingredient !== 'object') {
      return false;
    }

    const typedIngredient = ingredient as { name?: unknown; amount?: unknown };
    return typeof typedIngredient.name === 'string' && typeof typedIngredient.amount === 'string';
  });

  if (!hasValidIngredients || !candidate.macros || typeof candidate.macros !== 'object') {
    return false;
  }

  const typedMacros = candidate.macros as {
    protein?: unknown;
    carbs?: unknown;
    fat?: unknown;
    calories?: unknown;
  };

  return (
    typeof typedMacros.protein === 'number'
    && typeof typedMacros.carbs === 'number'
    && typeof typedMacros.fat === 'number'
    && typeof typedMacros.calories === 'number'
  );
}

function getIncomingRecipe(routeParams: unknown): PulseAiRecipe | null {
  if (!routeParams || typeof routeParams !== 'object') {
    return null;
  }

  const candidate = (routeParams as { recipe?: unknown }).recipe;
  return isPulseAiRecipe(candidate) ? candidate : null;
}

function shouldShowCleaningReminder(lastCleanedAt?: string | null): boolean {
  if (!lastCleanedAt) {
    return true;
  }

  const cleanedAt = new Date(lastCleanedAt);
  const staleAt = new Date(cleanedAt.getTime() + CLEANING_STALE_DAYS * 24 * 60 * 60 * 1000);

  return staleAt.getTime() <= Date.now();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function BlendScreen({ route }: AppTabScreenProps<'Blend'>) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // ── Blend store ──────────────────────────────────────────────────────────

  const activeRecipe = useBlendStore((s) => s.activeRecipe);
  const timerDuration = useBlendStore((s) => s.timerDuration);
  const isTimerRunning = useBlendStore((s) => s.isTimerRunning);
  const timerStartedAt = useBlendStore((s) => s.timerStartedAt);
  const startTimer = useBlendStore((s) => s.startTimer);
  const stopTimer = useBlendStore((s) => s.stopTimer);
  const completeBlend = useBlendStore((s) => s.completeBlend);
  const setActiveRecipe = useBlendStore((s) => s.setActiveRecipe);
  const setTimerDuration = useBlendStore((s) => s.setTimerDuration);

  // ── Auth store ───────────────────────────────────────────────────────────

  const blendiModel = useAuthStore((s) => s.user?.blendiModel);
  const isConnected = useNetworkStore((s) => s.isConnected);

  // ── Local state ──────────────────────────────────────────────────────────

  const [timerStatus, setTimerStatus] = useState<TimerCircleStatus>('ready');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [showCleaningReminder, setShowCleaningReminder] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer helpers ─────────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleComplete = useCallback(() => {
    clearTimer();

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, HAPTIC_SEQUENCE_DELAY_MS);
    }, HAPTIC_SEQUENCE_DELAY_MS);

    setTimerStatus('completed');

    setTimeout(() => {
      setShowRating(true);
    }, COMPLETE_SHOW_RATING_DELAY_MS);
  }, [clearTimer]);

  const handleStart = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startTimer();
    setTimerStatus('running');
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [startTimer]);

  const handleStop = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    clearTimer();
    stopTimer();
    setTimerStatus('stopped');
    setElapsedSeconds(0);

    setTimeout(() => {
      setTimerStatus('ready');
    }, STOP_RESET_DELAY_MS);
  }, [clearTimer, stopTimer]);

  const handleRateOrSkip = useCallback(
    async (rating?: number) => {
      if (isLogging) return;

      setShowRating(false);
      setIsLogging(true);

      try {
        const blendLogInput = {
          recipeName: activeRecipe?.title,
          protein: activeRecipe?.macros.protein ?? 0,
          carbs: activeRecipe?.macros.carbs ?? 0,
          fat: activeRecipe?.macros.fat ?? 0,
          calories: activeRecipe?.macros.calories ?? 0,
          blendiModel: blendiModel ?? 'Lite',
          durationSeconds: timerDuration,
          ...(rating !== undefined ? { rating } : {}),
        };

        if (isConnected) {
          await createBlendLog(blendLogInput);

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.blendLogsToday }),
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.blendHistory }),
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile }),
          ]);
        } else {
          addPendingBlend(blendLogInput);
          showToast(t('blend.savedLocally'));
        }

        completeBlend();
        setIsLogging(false);

        setTimeout(() => {
          const currentLastCleanedAt = getLastCleanedAt(useAuthStore.getState().user);

          if (shouldShowCleaningReminder(currentLastCleanedAt)) {
            setShowCleaningReminder(true);
          }
          setTimerStatus('ready');
          setElapsedSeconds(0);
        }, LOG_CLEAN_CHECK_DELAY_MS);
      } catch {
        setIsLogging(false);
        // timerStatus permanece 'completed' para o usuário poder tentar novamente
        Alert.alert(t('errors.network.server'));
      }
    },
    [
      isLogging,
      activeRecipe,
      blendiModel,
      isConnected,
      timerDuration,
      queryClient,
      completeBlend,
      t,
    ],
  );

  const handleAdjust = useCallback(
    (delta: 5 | -5) => {
      setTimerDuration(timerDuration + delta);
    },
    [timerDuration, setTimerDuration],
  );

  // ── Recuperação de timer em andamento (montagem) ──────────────────────────
  // Aplica-se quando o componente remonta com isTimerRunning = true no store.
  // O React 18 batcha setElapsedSeconds + setTimerStatus no mesmo render,
  // garantindo que TimerCircle receba remainingSeconds correto na transição.

  useEffect(() => {
    if (!isTimerRunning || !timerStartedAt) {
      return undefined;
    }

    const elapsed = Math.floor((Date.now() - timerStartedAt.getTime()) / 1000);

    if (elapsed >= timerDuration) {
      // Blend já terminou enquanto a tela estava fora do foco
      handleComplete();
    } else {
      // Retoma a partir do ponto atual
      setElapsedSeconds(elapsed);
      setTimerStatus('running');
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Receita via parâmetro de navegação ────────────────────────────────────
  // Chamado quando o usuário vem do Pulse AI ou da Home via "Start Blend".

  useEffect(() => {
    const incomingRecipe = getIncomingRecipe(route.params);

    if (incomingRecipe !== null && incomingRecipe !== activeRecipe) {
      setActiveRecipe(incomingRecipe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  // remainingSeconds é passado ao TimerCircle como `duration`.
  // Na transição para 'running', o TimerCircle captura esse valor como ponto
  // de partida do seu próprio countdown interno — não é atualizado enquanto
  // o timer está rodando.

  const remainingSeconds = Math.max(0, timerDuration - elapsedSeconds);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />

      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        {activeRecipe !== null && <ActiveRecipeHeader recipe={activeRecipe} />}

        <View style={styles.timerArea}>
          <TimerCircle
            duration={remainingSeconds}
            status={timerStatus}
            onComplete={handleComplete}
          />
        </View>

        <View style={styles.controlsArea}>
          <TimerControls
            status={timerStatus}
            duration={timerDuration}
            onAdjust={handleAdjust}
            onStart={handleStart}
            onStop={handleStop}
          />
        </View>
      </View>

      <RatingBottomSheet
        visible={showRating}
        recipeName={activeRecipe?.title}
        onRate={(r) => {
          void handleRateOrSkip(r);
        }}
        onSkip={() => {
          void handleRateOrSkip(undefined);
        }}
      />

      <CleaningReminder visible={showCleaningReminder} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  timerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsArea: {
    flex: 0,
    paddingBottom: 24,
  },
});
