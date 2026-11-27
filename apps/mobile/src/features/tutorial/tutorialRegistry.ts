// CP-C2 — Registro em memória do que as telas expõem ao motor:
//   - âncoras (<TutorialAnchor id>): ref do elemento a destacar;
//   - rolagens (useTutorialScrollRef): o ScrollView de cada tela, para o
//     motor rolar até uma âncora fora da área visível;
//   - superfícies que bloqueiam o tour (useTutorialBlockingSurface): folhas
//     e modais abertos. Com qualquer uma aberta, o tour espera.
// Módulo simples (sem React): as telas só registram, toda a lógica é do motor.
import type { RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

type Listener = () => void;

const anchors = new Map<string, RefObject<View | null>>();
const scrollables = new Map<string, RefObject<ScrollView | null>>();
const anchorLayoutListeners = new Set<(id: string) => void>();
const blockerListeners = new Set<Listener>();
let blockerCount = 0;

export function registerTutorialAnchor(id: string, ref: RefObject<View | null>): () => void {
  anchors.set(id, ref);
  return () => {
    // Só remove se ainda for a mesma ref (outra instância pode ter registrado depois).
    if (anchors.get(id) === ref) {
      anchors.delete(id);
    }
  };
}

export function getTutorialAnchor(id: string): RefObject<View | null> | undefined {
  return anchors.get(id);
}

export function notifyTutorialAnchorLayout(id: string): void {
  anchorLayoutListeners.forEach((listener) => listener(id));
}

export function subscribeTutorialAnchorLayout(listener: (id: string) => void): () => void {
  anchorLayoutListeners.add(listener);
  return () => {
    anchorLayoutListeners.delete(listener);
  };
}

export function registerTutorialScrollable(screen: string, ref: RefObject<ScrollView | null>): () => void {
  scrollables.set(screen, ref);
  return () => {
    if (scrollables.get(screen) === ref) {
      scrollables.delete(screen);
    }
  };
}

export function getTutorialScrollable(screen: string): RefObject<ScrollView | null> | undefined {
  return scrollables.get(screen);
}

export function getAllTutorialScrollables(): Array<RefObject<ScrollView | null>> {
  return [...scrollables.values()];
}

/** Marca uma folha/modal como aberta. Devolve a função que desmarca (idempotente). */
export function acquireTutorialBlocker(): () => void {
  blockerCount += 1;
  blockerListeners.forEach((listener) => listener());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    blockerCount = Math.max(0, blockerCount - 1);
    blockerListeners.forEach((listener) => listener());
  };
}

export function getTutorialBlockerCount(): number {
  return blockerCount;
}

export function subscribeTutorialBlockers(listener: Listener): () => void {
  blockerListeners.add(listener);
  return () => {
    blockerListeners.delete(listener);
  };
}

/** Só para testes. */
export function resetTutorialRegistryForTests(): void {
  anchors.clear();
  scrollables.clear();
  anchorLayoutListeners.clear();
  blockerListeners.clear();
  blockerCount = 0;
}
