// Teste no build EAS (25-26/11): o campo da Pulse AI ficava muito acima da
// barra de abas (somava BASE_TAB_BAR_HEIGHT 88 + insets.bottom, mas a tela já
// termina acima da barra). Agora: teclado fechado → respiro fixo; teclado
// aberto → a sobreposição real entre teclado e fim da tela (medida).
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@blendi/shared';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ getParent: () => undefined }),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { goal: 'Wellness' } }),
}));
jest.mock('../../store/network.store', () => ({
  useNetworkStore: (selector: (state: unknown) => unknown) => selector({ isConnected: true }),
}));

import { ChatInput, getChatInputBottomPadding } from './ChatInput';

type StyledNode = { props: { [propName: string]: unknown } };
const styleOf = (node: StyledNode): ViewStyle => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

const KEYBOARD_CLEARANCE = spacing.md;

describe('getChatInputBottomPadding', () => {
  it('teclado fechado: só o respiro (nada de barra de abas nem área segura somadas)', () => {
    expect(getChatInputBottomPadding({ keyboardScreenY: null, keyboardHeight: 0, screenBottomY: 760 })).toBe(spacing.md);
  });

  it('teclado aberto por cima da tela (iOS, barra de abas escondida): a sobreposição + respiro', () => {
    // Tela vai até 844 (barra escondida); teclado começa em 508 → cobre 336.
    expect(getChatInputBottomPadding({ keyboardScreenY: 508, keyboardHeight: 336, screenBottomY: 844 })).toBe(336 + KEYBOARD_CLEARANCE);
  });

  it('Android que encolhe a janela: tela já termina no teclado → só o respiro', () => {
    expect(getChatInputBottomPadding({ keyboardScreenY: 500, keyboardHeight: 300, screenBottomY: 500 })).toBe(spacing.md);
  });

  it('barra de abas ainda visível (não somada de novo): sobreposição medida, não altura do teclado', () => {
    // Tela termina em 760 (acima da barra de 84); teclado começa em 508.
    expect(getChatInputBottomPadding({ keyboardScreenY: 508, keyboardHeight: 336, screenBottomY: 760 })).toBe(252 + KEYBOARD_CLEARANCE);
  });

  it('sem medida da tela ainda: usa a altura do teclado', () => {
    expect(getChatInputBottomPadding({ keyboardScreenY: 508, keyboardHeight: 336, screenBottomY: null })).toBe(336 + KEYBOARD_CLEARANCE);
  });
});

describe('ChatInput — posição real', () => {
  type Handler = (event: KeyboardEvent) => void;
  let handlers: Record<string, Handler>;

  beforeEach(() => {
    handlers = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((eventName: string, handler: Handler) => {
      handlers[eventName] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Fim da tela na janela: y 760 + altura 84 = 844 (tela inteira, barra escondida).
  const createNodeMock = () => ({
    measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => {
      callback(0, 760, 390, 84);
    },
  });

  function paddingBottom(container: StyledNode): ViewStyle['paddingBottom'] {
    return styleOf(container).paddingBottom;
  }

  it('não é mais absoluto e, de teclado fechado, fica logo acima da barra (respiro fixo)', () => {
    const { getByTestId } = render(<ChatInput onSend={jest.fn()} isLoading={false} usageRemaining={3} />, { createNodeMock });
    const container = getByTestId('chat-input-container');
    const style = styleOf(container);

    expect(style.position).toBeUndefined();
    expect(style.bottom).toBeUndefined();
    expect(paddingBottom(container)).toBe(spacing.md);
  });

  it('teclado aberto: logo acima do teclado; fechado de novo: volta ao respiro', () => {
    const { getByTestId } = render(<ChatInput onSend={jest.fn()} isLoading={false} usageRemaining={3} />, { createNodeMock });
    const container = getByTestId('chat-input-container');
    fireEvent(container, 'layout', { nativeEvent: { layout: { x: 0, y: 760, width: 390, height: 84 } } });

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    act(() => {
      handlers[showEvent]?.({ endCoordinates: { screenY: 508, height: 336, screenX: 0, width: 390 } } as KeyboardEvent);
    });
    expect(paddingBottom(getByTestId('chat-input-container'))).toBe(844 - 508 + KEYBOARD_CLEARANCE);

    act(() => {
      handlers[hideEvent]?.({ endCoordinates: { screenY: 844, height: 0, screenX: 0, width: 390 } } as KeyboardEvent);
    });
    expect(paddingBottom(getByTestId('chat-input-container'))).toBe(spacing.md);
  });
});
