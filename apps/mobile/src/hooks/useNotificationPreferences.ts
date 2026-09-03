// apps/mobile/src/hooks/useNotificationPreferences.ts
// Lê as preferências de notificação do store Zustand e expõe
// actions de atualização com UI otimista + mutation React Query.

import { useCallback } from 'react';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../config/api';
import { QUERY_KEYS } from '../config/cache.config';
import { useAuthStore } from '../store/auth.store';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';
import { showToast } from '../utils/toast.events';
import { useAppTranslation } from './useAppTranslation';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  dailyPulse: boolean;
  streakReminder: boolean;
  supplementReminder: boolean;
  hydrationReminder: boolean;
}

export interface DailyPulseTime {
  hour: number;
  minute: number;
}

export type NotificationPrefKey = keyof NotificationPreferences;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: NotificationPreferences = {
  dailyPulse: true,
  streakReminder: true,
  supplementReminder: true,
  hydrationReminder: true,
};

const DEFAULT_DAILY_PULSE_TIME: DailyPulseTime = { hour: 7, minute: 0 };

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface StoredNotificationPreferences extends NotificationPreferences {
  levelUp: boolean;
}

interface TogglePreferenceContext {
  previousPreferences: StoredNotificationPreferences;
}

interface UpdateDailyPulseTimeContext {
  previousDailyPulseTime: DailyPulseTime;
}

function getErrorTranslationKey(error: unknown): string {
  return axios.isAxiosError(error)
    ? getAxiosErrorTranslationKey(error)
    : 'errors.network_internal_server_error';
}

export function useNotificationPreferences() {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile);
  const storedPreferences = useAuthStore((s) => s.user?.notificationPreferences);
  const storedDailyPulseTime = useAuthStore((s) => s.user?.dailyPulseTime);

  const preferences: NotificationPreferences = {
    dailyPulse: storedPreferences?.dailyPulse ?? DEFAULT_PREFERENCES.dailyPulse,
    streakReminder: storedPreferences?.streakReminder ?? DEFAULT_PREFERENCES.streakReminder,
    supplementReminder: storedPreferences?.supplementReminder ?? DEFAULT_PREFERENCES.supplementReminder,
    hydrationReminder: storedPreferences?.hydrationReminder ?? DEFAULT_PREFERENCES.hydrationReminder,
  };

  const dailyPulseTime: DailyPulseTime = storedDailyPulseTime ?? DEFAULT_DAILY_PULSE_TIME;

  const preferencesMutation = useMutation<
    void,
    unknown,
    Partial<NotificationPreferences>,
    TogglePreferenceContext
  >({
    mutationFn: async (payload) => {
      await api.patch('/users/notification-preferences', payload);
    },
    onMutate: (payload) => {
      const previousPreferences: StoredNotificationPreferences = {
        dailyPulse: storedPreferences?.dailyPulse ?? true,
        streakReminder: storedPreferences?.streakReminder ?? true,
        supplementReminder: storedPreferences?.supplementReminder ?? true,
        hydrationReminder: storedPreferences?.hydrationReminder ?? true,
        levelUp: storedPreferences?.levelUp ?? true,
      };

      // UI otimista — atualiza o store antes da resposta do backend.
      updateUserProfile({
        notificationPreferences: { ...previousPreferences, ...payload },
      });

      return { previousPreferences };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
    },
    onError: (error, _payload, context) => {
      // Sem rollback aqui, o Switch ficaria mostrando um estado que o
      // servidor nunca recebeu — reverte para o valor de antes do toque.
      if (context) {
        updateUserProfile({ notificationPreferences: context.previousPreferences });
      }

      showToast(t(getErrorTranslationKey(error) as Parameters<typeof t>[0]));
    },
  });

  const timeMutation = useMutation<void, unknown, DailyPulseTime, UpdateDailyPulseTimeContext>({
    mutationFn: async (time) => {
      await api.patch('/users/daily-pulse-time', time);
    },
    onMutate: (time) => {
      const previousDailyPulseTime = dailyPulseTime;

      // UI otimista
      updateUserProfile({ dailyPulseTime: time });

      return { previousDailyPulseTime };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
    },
    onError: (error, _time, context) => {
      if (context) {
        updateUserProfile({ dailyPulseTime: context.previousDailyPulseTime });
      }

      showToast(t(getErrorTranslationKey(error) as Parameters<typeof t>[0]));
    },
  });

  const togglePreference = useCallback(
    (key: NotificationPrefKey, value: boolean) => {
      preferencesMutation.mutate({ [key]: value });
    },
    [preferencesMutation],
  );

  const updateDailyPulseTime = useCallback(
    (time: DailyPulseTime) => {
      timeMutation.mutate(time);
    },
    [timeMutation],
  );

  return {
    preferences,
    dailyPulseTime,
    togglePreference,
    updateDailyPulseTime,
  };
}
