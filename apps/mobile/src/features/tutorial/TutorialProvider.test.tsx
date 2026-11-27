// CP-C2 — Overlay e Provider: balão com título, texto, "N de M" e botões
// rotulados; toques fora do balão não chegam ao app; pausado não bloqueia;
// Provider abre sozinho na Home, botão voltar do Android = "Voltar",
// "Ver tutorial de novo" pelo contexto.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Pressable } from 'react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-provider-test', isPro: false, blendiOwnership: 'blendi' } }),
}));
jest.mock('../../config/api', () => ({ api: {} }));
jest.mock('../../store/theme.store', () => ({
  useThemeStore: (selector: (state: unknown) => unknown) => selector({ mode: 'light' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

import { TutorialOverlay } from './TutorialOverlay';
import { TutorialProvider } from './TutorialProvider';
import { useTutorial } from './tutorialContext';
import { IDLE_TUTORIAL_VIEW_STATE, type TutorialViewState } from './tutorial.types';
import { createTutorialStorage } from './tutorialStorage';
import {
  createFakeEnvironment,
  createFakeServer,
  createFakeTelemetry,
  createMemoryAppStorage,
  testSupport,
} from './testUtils/tutorialTestKit';

type ResponderProps = { onStartShouldSetResponder: () => boolean };

function showingState(overrides: Partial<TutorialViewState> = {}): TutorialViewState {
  return {
    isRunning: true,
    mode: 'full',
    phase: 'showing',
    step: { id: 'test.homeA', screen: 'Home', anchor: 'test.anchorA', placement: 'auto', title: 'Rings Title', body: 'Rings body.' },
    index: 0,
    total: 3,
    targetRect: { x: 10, y: 100, width: 200, height: 60 },
    ...overrides,
  };
}

describe('CP-C2 — TutorialOverlay', () => {
  it('balão com título, texto, contador e botões rotulados; Voltar desabilitado na primeira', () => {
    const onBack = jest.fn();
    render(<TutorialOverlay state={showingState()} onNext={jest.fn()} onBack={onBack} onSkip={jest.fn()} />);
    expect(screen.getByText('Rings Title')).toBeTruthy();
    expect(screen.getByText('Rings body.')).toBeTruthy();
    // Contador visível, mas fora do leitor de tela (já está no rótulo do grupo).
    expect(screen.getByText('tutorial.stepCounter:{"current":1,"total":3}', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('tutorial.skip')).toBeTruthy();
    expect(screen.getByLabelText('tutorial.next')).toBeTruthy();
    // Leitor de tela: título + texto + "etapa N de M" num grupo só.
    expect(screen.getByLabelText('Rings Title. Rings body. tutorial.stepA11y:{"current":1,"total":3}')).toBeTruthy();

    const back = screen.getByTestId('tutorial-back');
    expect(back.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(back);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('na última etapa o botão vira Concluir', () => {
    const onNext = jest.fn();
    render(<TutorialOverlay state={showingState({ index: 2 })} onNext={onNext} onBack={jest.fn()} onSkip={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('tutorial.done'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('bloqueia toques fora do balão; pausado não bloqueia nem mostra balão', () => {
    const { rerender } = render(
      <TutorialOverlay state={showingState()} onNext={jest.fn()} onBack={jest.fn()} onSkip={jest.fn()} />
    );
    const overlay = screen.getByTestId('tutorial-overlay');
    expect(overlay.props.pointerEvents).toBe('auto');
    expect((overlay.props as ResponderProps).onStartShouldSetResponder()).toBe(true);
    expect(overlay.props.accessibilityViewIsModal).toBe(true);

    rerender(
      <TutorialOverlay state={showingState({ phase: 'paused' })} onNext={jest.fn()} onBack={jest.fn()} onSkip={jest.fn()} />
    );
    const paused = screen.getByTestId('tutorial-overlay', { includeHiddenElements: true });
    expect(paused.props.pointerEvents).toBe('none');
    expect((paused.props as ResponderProps).onStartShouldSetResponder()).toBe(false);
    expect(screen.queryByTestId('tutorial-balloon', { includeHiddenElements: true })).toBeNull();
  });

  it('procurando a próxima etapa: escurece e bloqueia, sem balão', () => {
    render(
      <TutorialOverlay state={showingState({ phase: 'resolving' })} onNext={jest.fn()} onBack={jest.fn()} onSkip={jest.fn()} />
    );
    expect(screen.getByTestId('tutorial-overlay').props.pointerEvents).toBe('auto');
    expect(screen.queryByTestId('tutorial-balloon')).toBeNull();
  });

  it('parado: não renderiza nada', () => {
    render(<TutorialOverlay state={IDLE_TUTORIAL_VIEW_STATE} onNext={jest.fn()} onBack={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.queryByTestId('tutorial-overlay')).toBeNull();
  });
});

function ReplayButton() {
  const { replay } = useTutorial();
  return (
    <Pressable onPress={replay} testID="replay" />
  );
}

describe('CP-C2 — TutorialProvider', () => {
  function renderProvider() {
    const env = createFakeEnvironment();
    const server = createFakeServer();
    const telemetry = createFakeTelemetry();
    const storage = createTutorialStorage(createMemoryAppStorage());
    const utils = render(
      <TutorialProvider
        environment={env}
        remote={server}
        storage={storage}
        telemetry={telemetry}
        autoStartDelayMs={0}
        getCurrentRouteName={() => env.currentScreen}
        support={testSupport}
      >
        <ReplayButton />
      </TutorialProvider>
    );
    return { ...utils, env, server, telemetry };
  }

  it('abre sozinho na Home e Pular fecha', async () => {
    const { telemetry } = renderProvider();
    expect(await screen.findByText('Welcome Title')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tutorial-skip'));
    expect(screen.queryByTestId('tutorial-overlay')).toBeNull();
    expect(telemetry.events.map((item) => item.event)).toContain('tutorial_skipped');
  });

  it('botão voltar do Android = "Voltar" do balão, e nunca sai do app durante o tour', async () => {
    const handlers: Array<() => boolean | null | undefined> = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => undefined };
    });

    renderProvider();
    await screen.findByText('Welcome Title');
    fireEvent.press(screen.getByTestId('tutorial-next'));
    await screen.findByText('Home A Title');

    const handler = handlers[handlers.length - 1];
    expect(handler).toBeDefined();
    let consumed: boolean | null | undefined;
    act(() => {
      consumed = handler?.();
    });
    expect(consumed).toBe(true);
    expect(await screen.findByText('Welcome Title')).toBeTruthy();
    spy.mockRestore();
  });

  it('"Ver tutorial de novo" pelo contexto recomeça da primeira etapa', async () => {
    const { server } = renderProvider();
    await screen.findByText('Welcome Title');
    fireEvent.press(screen.getByTestId('tutorial-skip'));
    expect(screen.queryByText('Welcome Title')).toBeNull();

    fireEvent.press(screen.getByTestId('replay'));
    expect(await screen.findByText('Welcome Title')).toBeTruthy();
    expect(server.calls).toContain('resetProgress');
  });
});
