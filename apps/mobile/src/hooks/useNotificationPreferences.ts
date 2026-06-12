// apps/mobile/src/hooks/useNotificationPreferences.ts
// Lê as preferências de notificação do store Zustand e expõe
// actions de atualização com UI otimista + mutation React Query.

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../config/api';
import { QUERY_KEYS } from '../config/cache.config';
import { useAuthStore } from '../store/auth.store';

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

export function useNotificationPreferences() {
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

  const preferencesMutation = useMutation({
    mutationFn: async (payload: Partial<NotificationPreferences>) => {
      await api.patch('/users/notification-preferences', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
    },
  });

  const timeMutation = useMutation({
    mutationFn: async (time: DailyPulseTime) => {
      await api.patch('/users/daily-pulse-time', time);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
    },
  });

  const togglePreference = useCallback(
    (key: NotificationPrefKey, value: boolean) => {
      // UI otimista — atualiza o store antes da resposta do backend
      updateUserProfile({
        notificationPreferences: {
          dailyPulse: storedPreferences?.dailyPulse ?? true,
          streakReminder: storedPreferences?.streakReminder ?? true,
          supplementReminder: storedPreferences?.supplementReminder ?? true,
          hydrationReminder: storedPreferences?.hydrationReminder ?? true,
          levelUp: storedPreferences?.levelUp ?? true,
          [key]: value,
        },
      });

      preferencesMutation.mutate({ [key]: value });
    },
    [storedPreferences, preferencesMutation, updateUserProfile],
  );

  const updateDailyPulseTime = useCallback(
    (time: DailyPulseTime) => {
      // UI otimista
      updateUserProfile({ dailyPulseTime: time });
      timeMutation.mutate(time);
    },
    [timeMutation, updateUserProfile],
  );

  return {
    preferences,
    dailyPulseTime,
    togglePreference,
    updateDailyPulseTime,
  };
}
