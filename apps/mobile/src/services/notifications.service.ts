import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '../config/api';
import i18n from '../locales/i18n';

const NOTIFICATION_CHANNEL_ID = 'default';
const NOTIFICATION_CHANNEL_LIGHT_COLOR = '#9a4893';
const NOTIFICATION_CHANNEL_VIBRATION_PATTERN: number[] = [0, 250, 250, 250];

type NotificationDataValue = string | number | boolean | null | undefined;

export type NotificationData = Record<string, NotificationDataValue>;

interface UpdatePushTokenResponse {
  success: true;
  data: {
    user: {
      id: string;
      pushToken: string | null;
      updatedAt: string;
    };
  };
}

interface ExpoExtraConfig {
  expoProjectId?: string;
}

export interface NotificationRouteResult {
  screen: string;
  params?: Record<string, unknown>;
}

function getExpoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as ExpoExtraConfig | undefined;
  const expoProjectId = extra?.expoProjectId;

  return typeof expoProjectId === 'string' && expoProjectId.trim().length > 0
    ? expoProjectId
    : null;
}

function toOptionalString(value: NotificationDataValue): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function buildDailyPulsePrompt(recipeTitle: string | undefined): string | null {
  if (!recipeTitle) {
    return null;
  }

  return i18n.t('notifications.dailyPulsePrompt', { recipeTitle });
}

function buildNestedRoute(
  screen: string,
  nestedScreen?: string,
  params?: Record<string, unknown>
): NotificationRouteResult {
  if (!nestedScreen) {
    return params ? { screen, params } : { screen };
  }

  return {
    screen,
    params: params ? { screen: nestedScreen, params } : { screen: nestedScreen },
  };
}

export async function requestPermissionsAndGetToken(): Promise<string | null> {
  const existingPermissions = await Notifications.getPermissionsAsync();
  const grantedPermissions = existingPermissions.granted
    ? existingPermissions
    : await Notifications.requestPermissionsAsync();

  if (!grantedPermissions.granted) {
    return null;
  }

  const projectId = getExpoProjectId();

  if (!projectId) {
    throw new Error('Missing expoProjectId in Constants.expoConfig.extra.');
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenResponse.data;
}

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: i18n.t('notifications.channelName'),
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: NOTIFICATION_CHANNEL_VIBRATION_PATTERN,
    lightColor: NOTIFICATION_CHANNEL_LIGHT_COLOR,
  });
}

export function processDeepLink(data: NotificationData): NotificationRouteResult {
  const deepLink = toOptionalString(data.deepLink);
  const type = toOptionalString(data.type);

  if (type === 'dailyPulse') {
    return buildNestedRoute('PulseAI', 'PulseAIChat', {
      prefilledMessage: buildDailyPulsePrompt(toOptionalString(data.recipeTitle)),
    });
  }

  if (type === 'streakReminder') {
    return buildNestedRoute('Blend');
  }

  if (type === 'supplementReminder' || type === 'hydrationReminder') {
    return buildNestedRoute('Track', 'TrackMain');
  }

  // WeeklyReport não é uma aba/tela aninhada em AppFlow — é uma rota solta no
  // root stack (mesmo padrão de Upgrade), por isso não usa buildNestedRoute
  // com um segundo argumento. App.tsx trata esse screen como navegação de
  // root em vez de aninhada.
  if (type === 'weeklyReport') {
    return buildNestedRoute('WeeklyReport');
  }

  if (!deepLink) {
    return buildNestedRoute('Home');
  }

  const normalizedPath = deepLink.replace(/^blendipulse:\/\//, '').replace(/^\/+/, '');

  if (normalizedPath === 'blend') {
    return buildNestedRoute('Blend');
  }

  if (normalizedPath === 'me') {
    return buildNestedRoute('Me');
  }

  if (normalizedPath === 'track') {
    return buildNestedRoute('Track', 'TrackMain');
  }

  if (normalizedPath === 'track/history') {
    return buildNestedRoute('Track', 'History');
  }

  if (normalizedPath === 'track/manage-stack') {
    return buildNestedRoute('Track', 'ManageStack');
  }

  if (normalizedPath === 'pulse-ai/chat') {
    return buildNestedRoute('PulseAI', 'PulseAIChat');
  }

  if (normalizedPath === 'pulse-ai/favorites') {
    return buildNestedRoute('PulseAI', 'Favorites');
  }

  if (normalizedPath === 'pulse-ai/pantry-scanner') {
    return buildNestedRoute('PulseAI', 'PantryScanner');
  }

  return buildNestedRoute('Home');
}

export async function updatePushToken(pushToken: string): Promise<string | null> {
  const response = await api.patch<UpdatePushTokenResponse>('/users/push-token', {
    pushToken,
  });

  return response.data.data.user.pushToken;
}
