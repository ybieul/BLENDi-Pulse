// CP-C2 — Registra o ScrollView de uma tela para o motor rolar até uma
// âncora fora da área visível. Uso: `const ref = useTutorialScrollRef('Home')`
// e `<ScrollView ref={ref}>`. Não muda o comportamento da tela.
import { useEffect, useRef, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

import type { TutorialScreenName } from './tutorialScreens';
import { registerTutorialScrollable } from './tutorialRegistry';

export function useTutorialScrollRef(screen: TutorialScreenName): RefObject<ScrollView | null> {
  const ref = useRef<ScrollView | null>(null);

  useEffect(() => registerTutorialScrollable(screen, ref), [screen]);

  return ref;
}
