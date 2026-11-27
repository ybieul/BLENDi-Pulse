// CP-C2 — Peças de teste do motor: roteiro de teste (NÃO o real), storage em
// memória, servidor falso e ambiente falso.
import {
  EMPTY_TUTORIAL_PROGRESS,
  parseTutorialContent,
  type TutorialContent,
  type TutorialContentInput,
  type TutorialProgress,
  type UpdateTutorialProgressInput,
} from '@blendi/shared';

import type { AppStorage } from '../../../config/storage';
import type { TutorialEnvironment, TutorialTelemetry } from '../TutorialController';
import type { TutorialRect, TutorialUnavailableReason } from '../tutorial.types';
import type { TutorialContentRemote } from '../tutorialApi';
import type { TutorialProgressRemote } from '../tutorialProgressSync';

function text(label: string) {
  return {
    en: { title: `${label} Title`, body: `${label} body.` },
    'pt-BR': { title: `${label} título`, body: `${label} texto.` },
  };
}

/** Roteiro de teste: 2 telas, uma etapa sem âncora, uma tela inexistente, uma condição. */
export const TEST_CONTENT_INPUT: TutorialContentInput = {
  schemaVersion: 1,
  contentVersion: 1,
  whatsNewIntro: text('News'),
  steps: [
    { id: 'test.welcome', order: 10, screen: 'Home', addedInVersion: 1, text: text('Welcome') },
    { id: 'test.homeA', order: 20, screen: 'Home', anchor: 'test.anchorA', addedInVersion: 1, text: text('Home A') },
    { id: 'test.missing', order: 30, screen: 'Home', anchor: 'test.neverRendered', addedInVersion: 1, text: text('Missing') },
    { id: 'test.ghostScreen', order: 40, screen: 'GhostScreen', anchor: 'test.anchorA', addedInVersion: 1, text: text('Ghost') },
    { id: 'test.proOnly', order: 50, screen: 'Me', anchor: 'test.anchorMe', condition: 'isPro', addedInVersion: 1, text: text('Pro') },
    { id: 'test.blend', order: 60, screen: 'Blend', anchor: 'test.anchorBlend', addedInVersion: 1, text: text('Blend') },
    { id: 'test.me', order: 70, screen: 'Me', anchor: 'test.anchorMe', addedInVersion: 1, text: text('Me') },
    { id: 'test.done', order: 80, screen: 'Home', addedInVersion: 1, text: text('Done') },
  ],
};

export function testContent(overrides: Partial<TutorialContentInput> = {}): TutorialContent {
  const parsed = parseTutorialContent({ ...TEST_CONTENT_INPUT, ...overrides });
  if (!parsed) throw new Error('roteiro de teste inválido');
  return parsed;
}

/** Âncoras que o "app de teste" conhece (test.neverRendered está aqui mas nunca aparece). */
export const TEST_KNOWN_ANCHORS = new Set(['test.anchorA', 'test.neverRendered', 'test.anchorMe', 'test.anchorBlend', 'test.anchorNew']);
export const TEST_KNOWN_SCREENS = new Set(['Home', 'Blend', 'Me', 'PulseAIChat', 'TrackMain']);

/** Valores dos marcadores nos testes (métrico). */
export const TEST_MARKERS = {
  waterGlass: '250 ml',
  freeAiPerDay: '3',
  freeScansPerMonth: '3',
  missionsPerDay: '3',
};

export const testSupport = {
  isScreenSupported: (screen: string) => TEST_KNOWN_SCREENS.has(screen),
  isAnchorSupported: (anchor: string) => TEST_KNOWN_ANCHORS.has(anchor),
};

export function createMemoryAppStorage(): AppStorage & { dump: () => Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, String(value));
    },
    delete: (key) => {
      map.delete(key);
    },
    dump: () => map,
  };
}

export interface FakeServer extends TutorialProgressRemote, TutorialContentRemote {
  progress: TutorialProgress;
  online: boolean;
  content: unknown;
  calls: string[];
  patches: UpdateTutorialProgressInput[];
}

export function createFakeServer(content: unknown = TEST_CONTENT_INPUT): FakeServer {
  const server: FakeServer = {
    progress: { ...EMPTY_TUTORIAL_PROGRESS, seenStepIds: [] },
    online: true,
    content,
    calls: [],
    patches: [],
    fetchContent: () => {
      server.calls.push('fetchContent');
      if (!server.online) return Promise.reject(new Error('offline'));
      return Promise.resolve({ raw: server.content, etag: '"test"' });
    },
    fetchProgress: () => {
      server.calls.push('fetchProgress');
      if (!server.online) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ...server.progress, seenStepIds: [...server.progress.seenStepIds] });
    },
    patchProgress: (input) => {
      server.calls.push('patchProgress');
      if (!server.online) return Promise.reject(new Error('offline'));
      server.patches.push(input);
      const seen = [...server.progress.seenStepIds];
      for (const id of input.seenStepIds ?? []) if (!seen.includes(id)) seen.push(id);
      server.progress = {
        seenStepIds: seen,
        lastStepId: input.lastStepId === undefined ? server.progress.lastStepId : input.lastStepId,
        completedAt: input.status === 'completed' ? '2026-11-27T00:00:00.000Z' : server.progress.completedAt,
        skippedAt: input.status === 'skipped' ? '2026-11-27T00:00:00.000Z' : server.progress.skippedAt,
        contentVersion:
          input.contentVersion === undefined
            ? server.progress.contentVersion
            : Math.max(server.progress.contentVersion ?? 0, input.contentVersion),
      };
      return Promise.resolve({ ...server.progress, seenStepIds: [...server.progress.seenStepIds] });
    },
    resetProgress: () => {
      server.calls.push('resetProgress');
      if (!server.online) return Promise.reject(new Error('offline'));
      server.progress = { ...EMPTY_TUTORIAL_PROGRESS, seenStepIds: [] };
      return Promise.resolve({ ...server.progress, seenStepIds: [] });
    },
  };
  return server;
}

export interface FakeEnvironment extends TutorialEnvironment {
  currentScreen: string;
  navigations: string[];
  /** Âncoras "renderizadas" por tela. */
  rendered: Map<string, Set<string>>;
  free: boolean;
  setFree: (free: boolean) => void;
  scrolledToTop: number;
  keyboardDismissed: number;
}

const RECT: TutorialRect = { x: 10, y: 100, width: 200, height: 60 };

export function createFakeEnvironment(): FakeEnvironment {
  const listeners = new Set<() => void>();
  const env: FakeEnvironment = {
    currentScreen: 'Home',
    navigations: [],
    rendered: new Map([
      ['Home', new Set(['test.anchorA'])],
      ['Blend', new Set(['test.anchorBlend'])],
      ['Me', new Set(['test.anchorMe'])],
    ]),
    free: true,
    scrolledToTop: 0,
    keyboardDismissed: 0,
    setFree: (free) => {
      env.free = free;
      listeners.forEach((listener) => listener());
    },
    navigateTo: (screen) => {
      if (!TEST_KNOWN_SCREENS.has(screen)) return false;
      env.currentScreen = screen;
      env.navigations.push(screen);
      return true;
    },
    resolveAnchor: (anchorId, screen) =>
      Promise.resolve(env.currentScreen === screen && env.rendered.get(screen)?.has(anchorId) ? RECT : null),
    measureAnchor: (anchorId) =>
      Promise.resolve(env.rendered.get(env.currentScreen)?.has(anchorId) ? RECT : null),
    isSurfaceFree: () => env.free,
    subscribeSurface: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scrollToTop: () => {
      env.scrolledToTop += 1;
    },
    dismissKeyboard: () => {
      env.keyboardDismissed += 1;
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
  };
  return env;
}

export interface FakeTelemetry extends TutorialTelemetry {
  events: Array<{ event: string; properties: Record<string, string | number> }>;
  unavailable: Array<{ stepId: string; reason: TutorialUnavailableReason }>;
}

export function createFakeTelemetry(): FakeTelemetry {
  const telemetry: FakeTelemetry = {
    events: [],
    unavailable: [],
    track: (event, properties) => {
      telemetry.events.push({ event, properties });
    },
    logUnavailable: (stepId, reason) => {
      telemetry.unavailable.push({ stepId, reason });
    },
  };
  return telemetry;
}

/** Espera uma condição (o motor é assíncrono). */
export async function until(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('until: tempo esgotado');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
