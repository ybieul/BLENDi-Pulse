// ─── i18n — DEVE ser o primeiro import do app ─────────────────────────────────
// Inicialização síncrona: garante que os textos estejam prontos antes do
// primeiro render, sem flicker de chaves ou textos em idioma errado.
import './src/locales/i18n';

import { useCallback, useEffect, useRef } from 'react';
import { AppState, View, ActivityIndicator, StyleSheet } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Auth — interceptors Axios e restauração de sessão
import { setupAxiosInterceptors, useAuthStore } from './src/store/auth.store';

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

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

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

  // ── Boot: interceptors + restauração de sessão + timezone inicial ───────────
  // setupAxiosInterceptors é idempotente (guard interno) — seguro chamar aqui.
  // onSessionExpired: navegar para login será implementado na Fase de Navegação.
  useEffect(() => {
    setupAxiosInterceptors(() => {
      // TODO (Navigation): navigate to login screen
      // navigation.reset({ routes: [{ name: 'Login' }] })
    });

    // Restaura a sessão e, em seguida, tenta sincronizar o timezone.
    // syncTimezoneIfNeeded retorna cedo se não houver sessão ativa ou se
    // user === null (enquanto GET /me não existir, user fica null após restore).
    // A chamada é feita aqui para garantir que quando GET /me for implementado
    // a sincronização já aconteça no boot sem nenhuma alteração neste arquivo.
    const boot = async () => {
      await restoreSession();
      void syncTimezoneIfNeeded();
    };

    void boot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand.pulse} />
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      {/* Navegação e providers serão injetados aqui nos próximos checkpoints */}
      <StatusBar style="light" backgroundColor={colors.brand.plum} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand.plum,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.plum,
  },
});
