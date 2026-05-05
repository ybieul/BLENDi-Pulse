// ─── i18n — DEVE ser o primeiro import do app ─────────────────────────────────
// Inicialização síncrona: garante que os textos estejam prontos antes do
// primeiro render, sem flicker de chaves ou textos em idioma errado.
import './src/locales/i18n';

import { enableScreens } from 'react-native-screens';

// Ativa telas nativas do React Navigation para reduzir custo de memória e
// melhorar transições em dispositivos físicos.
enableScreens();

import { useEffect, useRef } from 'react';
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

// Query cache — client persistido em MMKV
import { persistOptions, queryClient } from './src/config/queryClient';

// Navigation — root switch entre auth e app
import { RootNavigator } from './src/navigation/RootNavigator';

// Timezone — sincronização silenciosa ao voltar ao foreground
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
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isRestoringSession = useAuthStore((s) => s.isRestoringSession);

  // Rastreia o AppState anterior para filtrar apenas transições para 'active'
  // vindas de background/inactive — evita disparar na montagem inicial.
  const appStatePrevious = useRef<AppStateStatus>(AppState.currentState);

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
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" backgroundColor={colors.background.primary} />
          <RootNavigator />
        </NavigationContainer>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
