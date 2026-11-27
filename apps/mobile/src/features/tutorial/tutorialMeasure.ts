// CP-C2 — Medição de âncoras e rolagem até elas. Nunca lança: qualquer
// falha de medição vira `null` e a etapa é tratada como "âncora não apareceu".
import type { RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

import type { TutorialRect } from './tutorial.types';

/** Teto de espera de uma medição nativa (callback que nunca volta). */
const MEASURE_TIMEOUT_MS = 500;
/** Margem para considerar a âncora "visível" dentro da rolagem. */
const VISIBLE_MARGIN = 8;
/** Onde a âncora fica depois da rolagem: a 20% do topo da área visível. */
const SCROLL_TARGET_RATIO = 0.2;

type Measurable = Pick<View, 'measureInWindow'>;

function withTimeout<T>(executor: (resolve: (value: T | null) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), MEASURE_TIMEOUT_MS);
    try {
      executor(finish);
    } catch {
      finish(null);
    }
  });
}

function isUsableRect(x: number, y: number, width: number, height: number): boolean {
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

export function measureInWindow(target: Measurable | null | undefined): Promise<TutorialRect | null> {
  if (!target || typeof target.measureInWindow !== 'function') {
    return Promise.resolve(null);
  }
  return withTimeout<TutorialRect>((resolve) => {
    target.measureInWindow((x, y, width, height) => {
      resolve(isUsableRect(x, y, width, height) ? { x, y, width, height } : null);
    });
  });
}

export function measureAnchorRef(ref: RefObject<View | null> | undefined): Promise<TutorialRect | null> {
  return measureInWindow(ref?.current);
}

export function rectsAreClose(a: TutorialRect, b: TutorialRect, tolerance = 1): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

export function isRectInsideViewport(rect: TutorialRect, viewport: TutorialRect): boolean {
  const top = viewport.y + VISIBLE_MARGIN;
  const bottom = viewport.y + viewport.height - VISIBLE_MARGIN;
  if (rect.y >= top && rect.y + rect.height <= bottom) {
    return true;
  }
  // Maior que a área visível: basta o topo estar dentro.
  return rect.height > viewport.height - 2 * VISIBLE_MARGIN && rect.y >= top && rect.y < bottom;
}

/** Offset de rolagem que põe a âncora a 20% do topo, sem passar do fim do conteúdo. */
export function computeScrollTarget(contentY: number, viewportHeight: number, contentHeight: number | null): number {
  const desired = contentY - viewportHeight * SCROLL_TARGET_RATIO;
  const max = contentHeight === null ? Number.POSITIVE_INFINITY : Math.max(0, contentHeight - viewportHeight);
  return Math.max(0, Math.min(desired, max));
}

/** Existe em runtime (ScrollView.js) mas não está nos tipos do RN. */
type ScrollViewInternals = {
  getInnerViewRef?: () => unknown;
};

function asMeasurable(value: unknown): (Measurable & Partial<Pick<View, 'measureLayout' | 'measure'>>) | null {
  return value && typeof (value as Measurable).measureInWindow === 'function'
    ? (value as Measurable & Partial<Pick<View, 'measureLayout' | 'measure'>>)
    : null;
}

function measureLayoutY(anchor: View, relativeTo: unknown): Promise<number | null> {
  const target = asMeasurable(relativeTo);
  if (!target || typeof anchor.measureLayout !== 'function') {
    return Promise.resolve(null);
  }
  return withTimeout<number>((resolve) => {
    anchor.measureLayout(
      target as unknown as Parameters<View['measureLayout']>[0],
      (_x, y) => resolve(Number.isFinite(y) ? y : null),
      () => resolve(null)
    );
  });
}

function measureHeight(target: unknown): Promise<number | null> {
  const measurable = asMeasurable(target);
  if (!measurable || typeof measurable.measure !== 'function') {
    return Promise.resolve(null);
  }
  return withTimeout<number>((resolve) => {
    measurable.measure?.((_x, _y, _width, height) => resolve(Number.isFinite(height) && height > 0 ? height : null));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Se a âncora está fora da área visível da rolagem da tela, rola até ela.
 * Sem rolagem registrada, ou se a medição falhar, não faz nada (a etapa
 * segue com o que estiver na tela).
 */
export async function revealAnchorInScroll(
  anchorRef: RefObject<View | null> | undefined,
  scrollRef: RefObject<ScrollView | null> | undefined,
  options: { animated: boolean }
): Promise<void> {
  const anchor = anchorRef?.current;
  const scroll = scrollRef?.current;
  if (!anchor || !scroll || typeof scroll.scrollTo !== 'function') {
    return;
  }

  const scrollHost = asMeasurable(scroll.getNativeScrollRef?.()) ?? asMeasurable(scroll);
  const [viewport, rect] = await Promise.all([measureInWindow(scrollHost), measureInWindow(anchor)]);
  if (!viewport || !rect || isRectInsideViewport(rect, viewport)) {
    return;
  }

  const inner = (scroll as unknown as ScrollViewInternals).getInnerViewRef?.();
  let contentY = await measureLayoutY(anchor, inner);
  if (contentY === null) {
    // Sem measureLayout: volta ao topo (offset conhecido = 0) e mede de novo.
    scroll.scrollTo({ y: 0, animated: false });
    await wait(60);
    const fromTop = await measureInWindow(anchor);
    if (!fromTop) return;
    contentY = fromTop.y - viewport.y;
  }

  const contentHeight = await measureHeight(inner);
  scroll.scrollTo({ y: computeScrollTarget(contentY, viewport.height, contentHeight), animated: options.animated });
  await wait(options.animated ? 400 : 60);
}
