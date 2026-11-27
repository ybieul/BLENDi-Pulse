// CP-C2 — Folhas e modais avisam o motor quando estão abertos: com qualquer
// um aberto, o tour não começa e, se já estiver rodando, pausa (o balão
// nunca fica por cima de uma folha). Uma linha no componente:
//   useTutorialBlockingSurface(visible);
import { useEffect } from 'react';

import { acquireTutorialBlocker } from './tutorialRegistry';

export function useTutorialBlockingSurface(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    return acquireTutorialBlocker();
  }, [isOpen]);
}
