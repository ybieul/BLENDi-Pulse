// CP-C2 — Liga o motor ao app. Fica na raiz do AppFlow (AppNavigator):
//   - cria um motor por conta (troca de conta = motor novo);
//   - carrega roteiro (servidor → cache → cópia embutida) e progresso
//     (servidor + cópia local com fila offline);
//   - abre o tour sozinho na Home quando a tela está livre;
//   - mede de novo a âncora em layout, rotação e teclado;
//   - botão voltar do Android = "Voltar" do balão;
//   - expõe `replay()` para a linha "Ver tutorial de novo" em Me.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { BackHandler, Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useAuthStore } from '../../store/auth.store';
import { useNetworkStore } from '../../store/network.store';
import { useReduceMotion } from './useReduceMotion';
import { TutorialController, type TutorialEnvironment, type TutorialTelemetry } from './TutorialController';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialContext } from './tutorialContext';
import { IDLE_TUTORIAL_VIEW_STATE, type TutorialViewState } from './tutorial.types';
import { isKnownTutorialAnchor } from './tutorialAnchors';
import { loadTutorialContent, type TutorialContentRemote } from './tutorialApi';
import { tutorialHttpRemote } from './tutorialHttpRemote';
import {
  createTutorialEnvironment,
  getCurrentTutorialRouteName,
  tutorialTelemetry,
} from './tutorialEnvironment';
import { resolveTutorialLocale, type TutorialPlanSupport } from './tutorialPlanner';
import { TutorialProgressSync, type TutorialProgressRemote } from './tutorialProgressSync';
import { subscribeTutorialAnchorLayout } from './tutorialRegistry';
import { isTutorialScreen } from './tutorialScreens';
import { createTutorialStorage, type TutorialStorage } from './tutorialStorage';

/** Espera a Home assentar (dados, animação de entrada) antes de abrir o tour. */
export const TUTORIAL_AUTO_START_DELAY_MS = 900;
/** Re-medição periódica enquanto o balão está aberto (layout assíncrono). */
const REFRESH_INTERVAL_MS = 700;

const noopSubscribe = () => () => undefined;
const idleSnapshot = () => IDLE_TUTORIAL_VIEW_STATE;

export interface TutorialProviderProps {
  children: ReactNode;
  /** Injeção para testes; em produção, os padrões reais. */
  remote?: TutorialProgressRemote & TutorialContentRemote;
  storage?: TutorialStorage;
  environment?: TutorialEnvironment;
  telemetry?: TutorialTelemetry;
  autoStartDelayMs?: number;
  getCurrentRouteName?: () => string | undefined;
  support?: TutorialPlanSupport;
}

const DEFAULT_SUPPORT: TutorialPlanSupport = {
  isScreenSupported: isTutorialScreen,
  isAnchorSupported: isKnownTutorialAnchor,
};

let defaultStorage: TutorialStorage | null = null;
function getDefaultStorage(): TutorialStorage {
  defaultStorage ??= createTutorialStorage();
  return defaultStorage;
}

export function TutorialProvider({
  children,
  remote = tutorialHttpRemote,
  storage,
  environment,
  telemetry = tutorialTelemetry,
  autoStartDelayMs = TUTORIAL_AUTO_START_DELAY_MS,
  getCurrentRouteName = getCurrentTutorialRouteName,
  support = DEFAULT_SUPPORT,
}: TutorialProviderProps) {
  const userId = useAuthStore((state) => state.user?.id);
  const isPro = useAuthStore((state) => state.user?.isPro ?? false);
  const blendiOwnership = useAuthStore((state) => state.user?.blendiOwnership);
  const { locale } = useAppTranslation();
  const contentLocale = resolveTutorialLocale(locale);
  const reduceMotion = useReduceMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;
  const contextRef = useRef({ isPro, blendiOwnership, contentLocale });
  contextRef.current = { isPro, blendiOwnership, contentLocale };

  const env = useMemo(
    () =>
      environment ??
      createTutorialEnvironment({
        isReducedMotion: () => reduceMotionRef.current,
        getWindowHeight: () => windowHeightRef.current,
      }),
    [environment]
  );

  const [controller, setController] = useState<TutorialController | null>(null);
  const syncRef = useRef<TutorialProgressSync | null>(null);

  // Um motor por conta.
  useEffect(() => {
    if (!userId) return undefined;
    const resolvedStorage = storage ?? getDefaultStorage();
    const sync = new TutorialProgressSync(userId, resolvedStorage, remote);
    const { isPro: currentIsPro, blendiOwnership: currentOwnership, contentLocale: currentLocale } = contextRef.current;
    const next = new TutorialController({
      userId,
      context: { isPro: currentIsPro, blendiOwnership: currentOwnership },
      locale: currentLocale,
      env,
      telemetry,
      sync,
      loadContent: async () => (await loadTutorialContent(remote, resolvedStorage))?.content ?? null,
      support,
    });
    syncRef.current = sync;
    setController(next);
    return () => {
      next.dispose();
      sync.dispose();
      syncRef.current = null;
      setController(null);
    };
  }, [env, remote, storage, support, telemetry, userId]);

  useEffect(() => {
    controller?.updateContext({ isPro, blendiOwnership }, contentLocale);
  }, [blendiOwnership, contentLocale, controller, isPro]);

  const state: TutorialViewState = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getState ?? idleSnapshot
  );

  // Abertura automática: depois de carregar e a cada mudança de rota/tela livre.
  useEffect(() => {
    if (!controller) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) controller.maybeAutoStart(getCurrentRouteName());
      }, autoStartDelayMs);
    };
    const unsubscribe = env.subscribeSurface(schedule);
    void controller.init().then(() => {
      if (!cancelled) schedule();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [autoStartDelayMs, controller, env, getCurrentRouteName]);

  // Rede voltou: envia o que ficou na fila.
  useEffect(
    () =>
      useNetworkStore.subscribe((current, previous) => {
        if (current.isConnected && !previous.isConnected) {
          void syncRef.current?.flush();
        }
      }),
    []
  );

  // Re-medição: layout da âncora atual, teclado, rotação e um intervalo curto.
  const currentAnchor = state.phase === 'showing' ? state.step?.anchor : undefined;
  useEffect(() => {
    if (!controller || !currentAnchor) return undefined;
    const refresh = () => {
      void controller.refreshTarget();
    };
    const unsubscribeLayout = subscribeTutorialAnchorLayout((id) => {
      if (id === currentAnchor) refresh();
    });
    const showSubscription = Keyboard.addListener('keyboardDidShow', refresh);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', refresh);
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      unsubscribeLayout();
      showSubscription.remove();
      hideSubscription.remove();
      clearInterval(interval);
    };
  }, [controller, currentAnchor]);

  useEffect(() => {
    void controller?.refreshTarget();
  }, [controller, windowHeight, windowWidth]);

  // Android: voltar = "Voltar" do balão; nunca sai do app no meio do tour.
  useEffect(() => {
    if (!controller || !state.isRunning) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      controller.back();
      return true;
    });
    return () => subscription.remove();
  }, [controller, state.isRunning]);

  const replay = useCallback(() => {
    controller?.replay();
  }, [controller]);

  const value = useMemo(() => ({ replay, isRunning: state.isRunning }), [replay, state.isRunning]);
  const hidesApp = state.isRunning && state.phase !== 'paused';

  return (
    <TutorialContext.Provider value={value}>
      <View
        style={styles.content}
        importantForAccessibility={hidesApp ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hidesApp}
      >
        {children}
      </View>
      {controller ? (
        <TutorialOverlay state={state} onNext={controller.next} onBack={controller.back} onSkip={controller.skip} />
      ) : null}
    </TutorialContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
