// CP-C2 — O balão nunca sai da área segura (iPhone SE, notch, Android com
// barra) e escolhe acima/abaixo conforme o espaço.
import { BALLOON_GUTTER, computeBalloonLayout, computeSpotlightRect } from './balloonLayout';

const SCREENS = [
  { name: 'iPhone SE', window: { width: 375, height: 667 }, insets: { top: 20, bottom: 0, left: 0, right: 0 } },
  { name: 'iPhone com notch', window: { width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'Android com barra', window: { width: 360, height: 760 }, insets: { top: 24, bottom: 48, left: 0, right: 0 } },
];

describe('CP-C2 — balloonLayout', () => {
  it.each(SCREENS)('$name: em qualquer posição do alvo, o balão fica dentro da área segura', ({ window, insets }) => {
    for (const height of [120, 260, 2_000]) {
      for (const y of [-50, 0, 80, window.height / 2, window.height - 70, window.height + 20]) {
        for (const placement of ['above', 'below', 'auto'] as const) {
          const layout = computeBalloonLayout({
            target: { x: 20, y, width: 200, height: 60 },
            balloonHeight: height,
            window,
            insets,
            placement,
          });
          const visibleHeight = Math.min(height, layout.maxHeight);
          expect(layout.top).toBeGreaterThanOrEqual(insets.top + BALLOON_GUTTER);
          expect(layout.top + visibleHeight).toBeLessThanOrEqual(window.height - insets.bottom - BALLOON_GUTTER + 0.001);
          expect(layout.left).toBeGreaterThanOrEqual(BALLOON_GUTTER);
          expect(layout.left + layout.width).toBeLessThanOrEqual(window.width - BALLOON_GUTTER);
        }
      }
    }
  });

  it('respeita a preferência quando cabe e troca de lado quando não cabe', () => {
    const base = { balloonHeight: 150, window: { width: 375, height: 667 }, insets: { top: 20, bottom: 0, left: 0, right: 0 } };
    expect(computeBalloonLayout({ ...base, target: { x: 0, y: 300, width: 100, height: 40 }, placement: 'above' }).side).toBe('above');
    expect(computeBalloonLayout({ ...base, target: { x: 0, y: 300, width: 100, height: 40 }, placement: 'below' }).side).toBe('below');
    // Alvo no rodapé (campo do chat): "below" não cabe → acima.
    expect(computeBalloonLayout({ ...base, target: { x: 0, y: 600, width: 100, height: 50 }, placement: 'below' }).side).toBe('above');
    // Alvo no topo: "above" não cabe → abaixo.
    expect(computeBalloonLayout({ ...base, target: { x: 0, y: 30, width: 100, height: 40 }, placement: 'above' }).side).toBe('below');
  });

  it('sem alvo: centralizado', () => {
    const layout = computeBalloonLayout({
      target: null,
      balloonHeight: 200,
      window: { width: 375, height: 667 },
      insets: { top: 20, bottom: 0, left: 0, right: 0 },
      placement: 'auto',
    });
    expect(layout.side).toBe('center');
  });

  it('recorte com margem, sem passar da tela', () => {
    expect(computeSpotlightRect({ x: 2, y: 2, width: 100, height: 40 }, { width: 375, height: 667 })).toEqual({
      x: 0,
      y: 0,
      width: 110,
      height: 50,
    });
    const edge = computeSpotlightRect({ x: 300, y: 640, width: 100, height: 40 }, { width: 375, height: 667 });
    expect(edge.x + edge.width).toBeLessThanOrEqual(375);
    expect(edge.y + edge.height).toBeLessThanOrEqual(667);
  });
});
