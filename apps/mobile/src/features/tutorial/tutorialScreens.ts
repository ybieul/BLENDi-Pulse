// CP-C2 — Telas por onde o tour pode passar e como chegar em cada uma.
// `screen` no roteiro é o nome da rota; rota fora daqui = etapa pulada
// (motivo 'route'). Só abas e a raiz das pilhas das abas: rotas de raiz
// (Upgrade, NutritionGoals...) ficariam por cima do overlay.
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import type { RootStackParamList } from '../../navigation/types';

type NavigationRef = NavigationContainerRefWithCurrent<RootStackParamList>;

const TUTORIAL_SCREEN_NAVIGATORS = {
  Home: (ref: NavigationRef) => ref.navigate('AppFlow', { screen: 'Home' }),
  PulseAIChat: (ref: NavigationRef) =>
    ref.navigate('AppFlow', { screen: 'PulseAI', params: { screen: 'PulseAIChat' } }),
  Blend: (ref: NavigationRef) => ref.navigate('AppFlow', { screen: 'Blend' }),
  TrackMain: (ref: NavigationRef) =>
    ref.navigate('AppFlow', { screen: 'Track', params: { screen: 'TrackMain' } }),
  Me: (ref: NavigationRef) => ref.navigate('AppFlow', { screen: 'Me' }),
} as const;

export type TutorialScreenName = keyof typeof TUTORIAL_SCREEN_NAVIGATORS;

export const TUTORIAL_SCREEN_NAMES = Object.keys(TUTORIAL_SCREEN_NAVIGATORS) as TutorialScreenName[];

export function isTutorialScreen(name: string): name is TutorialScreenName {
  return Object.prototype.hasOwnProperty.call(TUTORIAL_SCREEN_NAVIGATORS, name);
}

/** Navega até a tela da etapa. false = rota que esta versão não conhece. */
export function navigateToTutorialScreen(ref: NavigationRef, screen: string): boolean {
  if (!isTutorialScreen(screen) || !ref.isReady()) {
    return false;
  }

  try {
    TUTORIAL_SCREEN_NAVIGATORS[screen](ref);
    return true;
  } catch {
    return false;
  }
}
