// CP-C2 — Ambiente real do motor: React Navigation, registro de âncoras,
// folhas abertas, celebração de nível, AppState (alertas do sistema deixam o
// app 'inactive' no iOS) e teclado.
import { AppState, Keyboard } from 'react-native';

import { navigationRef } from '../../navigation/navigationRef';
import { trackEvent } from '../../services/analytics.service';
import { useGamificationStore } from '../../store/gamification.store';
import type { TutorialEnvironment, TutorialTelemetry } from './TutorialController';
import type { TutorialRect, TutorialUnavailableReason } from './tutorial.types';
import { measureAnchorRef, rectsAreClose, revealAnchorInScroll } from './tutorialMeasure';
import {
  getAllTutorialScrollables,
  getTutorialAnchor,
  getTutorialBlockerCount,
  getTutorialScrollable,
  subscribeTutorialBlockers,
} from './tutorialRegistry';
import { navigateToTutorialScreen } from './tutorialScreens';

/** Quanto esperar uma âncora aparecer (tela carregando dados, lista montando). */
export const TUTORIAL_ANCHOR_TIMEOUT_MS = 5_000;
const ANCHOR_POLL_MS = 120;
/** Espera a transição de tela antes da primeira medição. */
const NAVIGATION_SETTLE_MS = 180;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRootOnAppFlow(): boolean {
  if (!navigationRef.isReady()) return false;
  const root = navigationRef.getRootState();
  const top = root?.routes[root.index ?? 0];
  return top?.name === 'AppFlow';
}

export function isTutorialSurfaceFree(): boolean {
  return (
    getTutorialBlockerCount() === 0 &&
    useGamificationStore.getState().levelUpData === null &&
    AppState.currentState === 'active' &&
    isRootOnAppFlow()
  );
}

export function getCurrentTutorialRouteName(): string | undefined {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
}

function isOnScreen(rect: TutorialRect, windowHeight: number): boolean {
  return rect.y + rect.height > 0 && rect.y < windowHeight;
}

export function createTutorialEnvironment(options: {
  isReducedMotion: () => boolean;
  getWindowHeight: () => number;
}): TutorialEnvironment {
  return {
    navigateTo: (screen) => navigateToTutorialScreen(navigationRef, screen),

    resolveAnchor: async (anchorId, screen, isCancelled) => {
      const deadline = Date.now() + TUTORIAL_ANCHOR_TIMEOUT_MS;
      let revealed = false;
      let previous: TutorialRect | null = null;
      await wait(NAVIGATION_SETTLE_MS);

      while (Date.now() < deadline) {
        if (isCancelled()) return null;
        const ref = getTutorialAnchor(anchorId);

        if (ref?.current) {
          if (!revealed) {
            await revealAnchorInScroll(ref, getTutorialScrollable(screen), {
              animated: !options.isReducedMotion(),
            });
            revealed = true;
          }
          const rect = await measureAnchorRef(ref);
          // Só aceita depois de duas medições iguais: a transição de tela e
          // a rolagem terminaram.
          if (rect && isOnScreen(rect, options.getWindowHeight())) {
            if (previous && rectsAreClose(previous, rect)) return rect;
            previous = rect;
          } else {
            previous = null;
          }
        }

        await wait(ANCHOR_POLL_MS);
      }

      return null;
    },

    measureAnchor: (anchorId) => measureAnchorRef(getTutorialAnchor(anchorId)),

    isSurfaceFree: isTutorialSurfaceFree,

    subscribeSurface: (listener) => {
      const unsubscribeBlockers = subscribeTutorialBlockers(listener);
      const unsubscribeGamification = useGamificationStore.subscribe((state, previous) => {
        if (state.levelUpData !== previous.levelUpData) listener();
      });
      const appStateSubscription = AppState.addEventListener('change', listener);
      const unsubscribeNavigation = navigationRef.addListener('state', listener);
      return () => {
        unsubscribeBlockers();
        unsubscribeGamification();
        appStateSubscription.remove();
        unsubscribeNavigation();
      };
    },

    scrollToTop: () => {
      for (const ref of getAllTutorialScrollables()) {
        try {
          ref.current?.scrollTo({ y: 0, animated: false });
        } catch {
          // Melhor esforço.
        }
      }
    },

    dismissKeyboard: () => {
      Keyboard.dismiss();
    },

    wait,
  };
}

export const tutorialTelemetry: TutorialTelemetry = {
  track: (event, properties) => {
    trackEvent(event, properties);
  },
  logUnavailable: (stepId: string, reason: TutorialUnavailableReason) => {
    if (__DEV__) {
      console.info(`[tutorial] etapa pulada: ${stepId} (${reason})`);
    }
  },
};
