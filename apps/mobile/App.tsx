// ─── i18n — DEVE ser o primeiro import do app ─────────────────────────────────
// Inicialização síncrona: garante que os textos estejam prontos antes do
// primeiro render, sem flicker de chaves ou textos em idioma errado.
import './src/locales/i18n';

import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { enableScreens } from 'react-native-screens';

// Ativa telas nativas do React Navigation para reduzir custo de memória e
// melhorar transições em dispositivos físicos.
enableScreens();

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Auth — interceptors Axios e restauração de sessão
import { setupAxiosInterceptors, useAuthStore } from './src/store/auth.store';
import { useGamificationStore } from './src/store/gamification.store';

// Query cache — client persistido em MMKV
import { persistOptions, queryClient } from './src/config/queryClient';
import { initMMKVEncryptionKey } from './src/config/storage';

// Navigation — root switch entre auth e app
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { LevelUpCelebration } from './src/components/gamification/LevelUpCelebration';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { OfflineBanner } from './src/components/ui/OfflineBanner';
import { showToast, ToastViewport } from './src/utils/toast.utils';
import { useNetworkStatus } from './src/hooks/useNetworkStatus';

// Timezone — sincronização silenciosa ao voltar ao foreground
import {
  processDeepLink,
  requestPermissionsAndGetToken,
  setupNotificationChannel,
  updatePushToken,
  type NotificationData,
} from './src/services/notifications.service';
import { initializePurchases } from './src/services/purchase.service';
import { syncTimezoneIfNeeded } from './src/services/timezone.service';

// Fontes da marca — carregadas antes de qualquer render
import {
  Syne_400Regular,
  Syne_500Medium,
  Syne_600SemiBold,
  Syne_700Bold,
  Syne_800ExtraBold,
} from '@expo-google-fonts/syne';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  DMMono_300Light,
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';

import { colors } from '@blendi/shared';

// Mantém a splash screen visível enquanto as fontes carregam
// preventAutoHideAsync é fire-and-forget intencional — sem await no módulo
void SplashScreen.preventAutoHideAsync();

// Rotas soltas do root stack (irmãs de AppFlow, não abas dentro dele) —
// precisam de navigate direto no root em vez de aninhado via
// navigate('AppFlow', { screen, params }).
const ROOT_LEVEL_DEEP_LINK_SCREENS = new Set(['WeeklyReport']);

function buildHandledNotificationResponseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand.pulse,
    background: colors.background.primary,
    card: colors.background.primary,
    text: colors.text.primary,
    border: colors.background.secondary,
    notification: colors.brand.pulse,
  },
};

export default function App() {
  // Aguarda a chave de criptografia do MMKV ANTES de renderizar
  // PersistQueryClientProvider — ele começa a restaurar o cache persistido
  // (que vive em MMKV) assim que monta, então precisa vir depois deste
  // gate, não dentro de AppShell (que é filho dele, tarde demais).
  // A splash screen (SplashScreen.preventAutoHideAsync() no topo do
  // arquivo) permanece visível enquanto isStorageReady for false.
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    void initMMKVEncryptionKey().finally(() => setIsStorageReady(true));
  }, []);

  if (!isStorageReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </PersistQueryClientProvider>
      <OfflineBanner />
      <LevelUpCelebration />
    </SafeAreaProvider>
  );
}

function AppShell() {
  // Inicia a assinatura de conectividade antes da lógica de auth/navegação,
  // usando a mesma instância de queryClient provida para o restante do app.
  useNetworkStatus({ netInfoClient: NetInfo, queryClient });

  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isRestoringSession = useAuthStore((s) => s.isRestoringSession);
  const restoredUserTotalXP = useAuthStore((s) => s.user?.totalXP);
  const userPushToken = useAuthStore((s) => s.user?.pushToken ?? null);
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile);
  const setGamificationTotalXP = useGamificationStore((s) => s.setTotalXP);

  // Rastreia o AppState anterior para filtrar apenas transições para 'active'
  // vindas de background/inactive — evita disparar na montagem inicial.
  const appStatePrevious = useRef<AppStateStatus>(AppState.currentState);
  const lastKnownPushToken = useRef<string | null>(null);
  const lastHandledNotificationResponseKey = useRef<string | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    Syne_400Regular,
    Syne_500Medium,
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    DMMono_300Light,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  // ── Boot: interceptors + restauração imediata de sessão ─────────────────────
  // setupAxiosInterceptors é idempotente (guard interno) — seguro chamar aqui.
  useEffect(() => {
    setupAxiosInterceptors(() => {
      // RootNavigator reage ao logout pelo store e troca automaticamente
      // para o fluxo público sem navegação imperativa aqui.
    });

    void initializePurchases().catch(() => undefined);

    // Dispara imediatamente após a montagem, sem delay intermediário.
    void restoreSession();
  }, [restoreSession]);

  // ── Splash nativa: só some depois que as fontes estiverem resolvidas ───────
  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // ── Timezone inicial após o término do restore da sessão ───────────────────
  useEffect(() => {
    if (isRestoringSession || !isAuthenticated) {
      return;
    }

    void syncTimezoneIfNeeded().catch(() => undefined);
  }, [isAuthenticated, isRestoringSession]);

  useEffect(() => {
    if (isRestoringSession) {
      return;
    }

    if (!isAuthenticated) {
      setGamificationTotalXP(0);
      return;
    }

    if (typeof restoredUserTotalXP === 'number') {
      setGamificationTotalXP(restoredUserTotalXP);
    }
  }, [isAuthenticated, isRestoringSession, restoredUserTotalXP, setGamificationTotalXP]);

  useEffect(() => {
    lastKnownPushToken.current = userPushToken;
  }, [userPushToken]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    return () => {
      Notifications.setNotificationHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      lastKnownPushToken.current = null;
      return;
    }

    let isCancelled = false;
    let pushTokenTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let navigationTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const navigateFromNotificationResponse = (
      response: Notifications.NotificationResponse,
      options?: { clearLastResponse?: boolean }
    ) => {
      const responseKey = buildHandledNotificationResponseKey(response);

      if (lastHandledNotificationResponseKey.current === responseKey) {
        return;
      }

      lastHandledNotificationResponseKey.current = responseKey;

      const notificationData = (response.notification.request.content.data ?? {}) as NotificationData;
      const route = processDeepLink(notificationData);

      if (navigationTimeoutId) {
        clearTimeout(navigationTimeoutId);
      }

      navigationTimeoutId = setTimeout(() => {
        if (!navigationRef.isReady()) {
          return;
        }

        if (ROOT_LEVEL_DEEP_LINK_SCREENS.has(route.screen)) {
          navigationRef.current?.navigate(route.screen as never);
        } else {
          navigationRef.current?.navigate('AppFlow', {
            screen: route.screen as never,
            params: route.params as never,
          } as never);
        }

        if (options?.clearLastResponse === true) {
          void Notifications.clearLastNotificationResponseAsync();
        }
      }, 500);
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      const notificationTitle = notification.request.content.title?.trim();
      const notificationBody = notification.request.content.body?.trim();
      const toastMessage = notificationBody ?? notificationTitle;

      if (!toastMessage) {
        return;
      }

      showToast({
        title: notificationTitle && notificationBody ? notificationTitle : undefined,
        message: notificationBody ?? notificationTitle ?? '',
        duration: 4000,
        dismissOnPress: true,
        forceCustom: true,
      });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      navigateFromNotificationResponse(response);
    });

    void setupNotificationChannel().catch(() => undefined);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (isCancelled || !response) {
        return;
      }

      navigateFromNotificationResponse(response, { clearLastResponse: true });
    });

    pushTokenTimeoutId = setTimeout(() => {
      void (async () => {
        try {
          const nextPushToken = await requestPermissionsAndGetToken();

          if (isCancelled || !nextPushToken) {
            return;
          }

          if (nextPushToken === lastKnownPushToken.current) {
            return;
          }

          const persistedPushToken = await updatePushToken(nextPushToken);

          if (isCancelled) {
            return;
          }

          const resolvedPushToken = persistedPushToken ?? nextPushToken;
          lastKnownPushToken.current = resolvedPushToken;
          updateUserProfile({ pushToken: resolvedPushToken });
        } catch {
        }
      })();
    }, 3000);

    return () => {
      isCancelled = true;

      if (pushTokenTimeoutId) {
        clearTimeout(pushTokenTimeoutId);
      }

      if (navigationTimeoutId) {
        clearTimeout(navigationTimeoutId);
      }

      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [isAuthenticated, updateUserProfile]);

  // ── AppState: sincronização de timezone ao voltar ao foreground ──────────────
  // Cobre o caso de uso principal: usuário viaja entre países, o SO ajusta o
  // timezone automaticamente — na próxima abertura do app o fuso é atualizado
  // sem precisar de logout/login.
  //
  // appStatePrevious rastreia o estado anterior para filtrar apenas as transições
  // background/inactive → active, evitando disparar na montagem inicial.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasInBackground =
        appStatePrevious.current === 'background' || appStatePrevious.current === 'inactive';
      const isNowActive = nextState === 'active';

      if (wasInBackground && isNowActive) {
        // Sincronização silenciosa — nenhum indicador visual para o usuário.
        // Erros são absorvidos: falha de rede ao voltar ao foreground não deve
        // afetar a experiência do usuário. O fuso será sincronizado na próxima
        // oportunidade.
        void syncTimezoneIfNeeded().catch(() => undefined);
      }

      appStatePrevious.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <StatusBar style="light" backgroundColor={colors.background.primary} />
      <RootNavigator />
      <ToastViewport />
    </NavigationContainer>
  );
}
