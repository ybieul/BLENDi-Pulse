// CP-L1 — Barra de água da Home: verde (overlay.success[70], a mesma da
// barra do Track) ao bater a meta, azul abaixo dela; o leitor de tela diz
// "meta atingida".
import { act, render, screen } from '@testing-library/react-native';
import { InteractionManager, StyleSheet } from 'react-native';

import { lightColors } from '@blendi/shared';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors: palette } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => palette };
});
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${String(options.current)}/${String(options.target)}` : key),
    locale: 'en',
  }),
}));
jest.mock('../../hooks/useUnits', () => ({
  useUnits: () => ({ displayHydration: (ml: number) => `${ml} ml` }),
}));
jest.mock('../ui/GoalRing', () => ({ GoalRing: () => null }));
jest.mock('../ui/StaleDataIndicator', () => ({ StaleDataIndicator: () => null }));

import { GoalRingsSection } from './GoalRingsSection';

function renderBar(current: number, target: number) {
  return render(
    <GoalRingsSection
      proteinCurrent={0}
      proteinTarget={100}
      carbsCurrent={0}
      carbsTarget={100}
      caloriesCurrent={0}
      calorieTarget={2000}
      hydrationCurrent={current}
      hydrationTarget={target}
      dataUpdatedAt={0}
    />
  );
}

function fillColorAfterAnimation(): unknown {
  act(() => {
    jest.runAllTimers();
  });
  const bar = screen.getByTestId('home-hydration-bar');
  const fill = bar.findAll((node) => {
    const style = StyleSheet.flatten(node.props.style as never) as { width?: unknown; backgroundColor?: unknown } | undefined;
    return style?.backgroundColor !== undefined && style.width !== undefined;
  })[0];
  return (StyleSheet.flatten(fill?.props.style as never) as { backgroundColor?: unknown }).backgroundColor;
}

/**
 * A cor é uma interpolação do Animated (serializa para "rgba(34, 197, 94, 0.702)"):
 * compara pelos canais.
 */
function channels(color: unknown): number[] {
  const value = typeof color === 'string' ? color : JSON.stringify(color);
  return value.match(/[\d.]+/g)?.map(Number) ?? [];
}
function expectSameColor(actual: unknown, expected: string) {
  const [r, g, b, a] = channels(actual);
  const [er, eg, eb, ea] = channels(expected);
  expect([r, g, b]).toEqual([er, eg, eb]);
  expect(Math.abs((a ?? 1) - (ea ?? 1))).toBeLessThan(0.01);
}

describe('CP-L1 — barra de água da Home', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
      if (typeof task === 'function') task();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined } as never;
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('meta batida: verde do Track e rótulo "meta atingida"', () => {
    renderBar(2500, 2500);
    expect(screen.getByTestId('home-hydration-bar').props.accessibilityLabel).toBe('home.hydrationBarGoalReached:2500 ml/2500 ml');
    expectSameColor(fillColorAfterAnimation(), lightColors.overlay.success[70]);
  });

  it('acima da meta também fica verde', () => {
    renderBar(3000, 2500);
    expectSameColor(fillColorAfterAnimation(), lightColors.overlay.success[70]);
  });

  it('abaixo da meta: cor de hoje e rótulo normal', () => {
    renderBar(1000, 2500);
    expect(screen.getByTestId('home-hydration-bar').props.accessibilityLabel).toBe('home.hydrationBar:1000 ml/2500 ml');
    expectSameColor(fillColorAfterAnimation(), lightColors.overlay.info[70]);
  });

  it('meta zero não conta como batida', () => {
    renderBar(0, 0);
    expect(screen.getByTestId('home-hydration-bar').props.accessibilityLabel).toBe('home.hydrationBar:0 ml/0 ml');
  });
});
