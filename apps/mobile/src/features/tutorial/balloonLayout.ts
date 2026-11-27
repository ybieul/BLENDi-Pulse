// CP-C2 — Posição do balão e do recorte (funções puras).
// O balão vai acima ou abaixo do elemento conforme o espaço e NUNCA sai da
// área segura (iPhone SE, notch, Android com barra de navegação).
import type { TutorialPlacement } from '@blendi/shared';

import type { TutorialRect } from './tutorial.types';

export const BALLOON_GUTTER = 16;
export const BALLOON_GAP = 12;
export const BALLOON_MAX_WIDTH = 420;
export const SPOTLIGHT_PADDING = 8;
export const SPOTLIGHT_RADIUS = 12;

export interface BalloonLayoutInput {
  target: TutorialRect | null;
  balloonHeight: number;
  window: { width: number; height: number };
  insets: { top: number; bottom: number; left: number; right: number };
  placement: TutorialPlacement;
}

export interface BalloonLayout {
  top: number;
  left: number;
  width: number;
  /** Altura máxima: com fonte grande, o texto rola dentro do balão. */
  maxHeight: number;
  side: 'above' | 'below' | 'center';
}

/** Recorte em volta do elemento, com margem, sem passar da tela. */
export function computeSpotlightRect(target: TutorialRect, window: { width: number; height: number }): TutorialRect {
  const x = Math.max(0, target.x - SPOTLIGHT_PADDING);
  const y = Math.max(0, target.y - SPOTLIGHT_PADDING);
  const right = Math.min(window.width, target.x + target.width + SPOTLIGHT_PADDING);
  const bottom = Math.min(window.height, target.y + target.height + SPOTLIGHT_PADDING);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function computeBalloonLayout(input: BalloonLayoutInput): BalloonLayout {
  const { window, insets } = input;
  const safeLeft = insets.left + BALLOON_GUTTER;
  const safeRight = window.width - insets.right - BALLOON_GUTTER;
  const width = Math.max(0, Math.min(BALLOON_MAX_WIDTH, safeRight - safeLeft));
  const left = safeLeft + Math.max(0, (safeRight - safeLeft - width) / 2);

  const safeTop = insets.top + BALLOON_GUTTER;
  const safeBottom = window.height - insets.bottom - BALLOON_GUTTER;
  const maxHeight = Math.max(0, safeBottom - safeTop);
  const height = Math.min(input.balloonHeight, maxHeight);

  if (!input.target) {
    return {
      top: clamp(safeTop + (maxHeight - height) / 2, safeTop, safeBottom - height),
      left,
      width,
      maxHeight,
      side: 'center',
    };
  }

  const spot = computeSpotlightRect(input.target, window);
  const belowTop = spot.y + spot.height + BALLOON_GAP;
  const aboveTop = spot.y - BALLOON_GAP - height;
  const fitsBelow = belowTop + height <= safeBottom;
  const fitsAbove = aboveTop >= safeTop;
  const spaceBelow = safeBottom - belowTop;
  const spaceAbove = spot.y - BALLOON_GAP - safeTop;

  let side: 'above' | 'below';
  if (input.placement === 'below' && fitsBelow) side = 'below';
  else if (input.placement === 'above' && fitsAbove) side = 'above';
  else if (fitsBelow && fitsAbove) side = spaceBelow >= spaceAbove ? 'below' : 'above';
  else if (fitsBelow) side = 'below';
  else if (fitsAbove) side = 'above';
  else side = spaceBelow >= spaceAbove ? 'below' : 'above';

  const rawTop = side === 'below' ? belowTop : aboveTop;
  return {
    top: clamp(rawTop, safeTop, safeBottom - height),
    left,
    width,
    maxHeight,
    side,
  };
}
