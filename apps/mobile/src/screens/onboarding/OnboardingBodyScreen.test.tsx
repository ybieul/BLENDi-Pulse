// OnboardingBodyScreen — teclado numérico ("Próximo/Concluir") e leitura
// estrita de peso e altura.
//
// Mesmo esquema de mocks do OnboardingMacrosScreen.test.tsx: useColors e
// useAppTranslation mockados, OnboardingLayout só renderiza o conteúdo, stores
// com estado inline.
import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, TextInput } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));

jest.mock('../../components/ui/OnboardingLayout', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { View } = require('react-native');
  return {
    OnboardingLayout: ({ topContent, bottomContent }: { topContent: unknown; bottomContent: unknown }) => (
      <View>
        <View>{topContent}</View>
        <View>{bottomContent}</View>
      </View>
    ),
  };
});

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'pt-BR' }] }));

const mockPost = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../../config/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ user: null }),
}));

jest.mock('../../store/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedGoal: 'Wellness',
      unitSystem: 'metric',
      setBodyData: jest.fn(),
      setUnitSystem: jest.fn(),
      setCalculatedMacros: jest.fn(),
    }),
}));

import { AuthInput } from '../../components/ui/AuthInput';
import { OnboardingBodyScreen } from './OnboardingBodyScreen';

const FORMAT_ERROR = 'errors.validation.decimal_one_place';

function renderScreen() {
  const utils = render(<OnboardingBodyScreen navigation={{ navigate: jest.fn() }} />);
  const inputs = () => utils.UNSAFE_getAllByType(TextInput);
  const [weight, height, birthDate] = inputs() as [ReactTestInstance, ReactTestInstance, ReactTestInstance];
  // Erro de cada campo, na ordem: peso, altura, data de nascimento.
  const fieldErrors = () => utils.UNSAFE_getAllByType(AuthInput).map((input) => input.props.error as unknown);
  return { ...utils, inputs, weight, height, birthDate, fieldErrors };
}

function stubFocus(input: ReactTestInstance) {
  const focus = jest.fn();
  (input.instance as { focus: () => void }).focus = focus;
  return focus;
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPost.mockReset();
});

describe('OnboardingBodyScreen — teclado numérico (iOS)', () => {
  it('peso, altura e data de nascimento ficam ligados à mesma barra', () => {
    const utils = renderScreen();
    const ids = utils.inputs().map((input) => input.props.inputAccessoryViewID as unknown);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
  });

  it('"Próximo" segue a ordem visual (peso → altura → data) e "Concluir" fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const focusHeight = stubFocus(utils.height);
    const focusBirthDate = stubFocus(utils.birthDate);

    fireEvent(utils.weight, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusHeight).toHaveBeenCalledTimes(1);

    fireEvent(utils.height, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusBirthDate).toHaveBeenCalledTimes(1);

    fireEvent(utils.birthDate, 'focus');
    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    fireEvent.press(utils.getByText('nutritionGoals.done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingBodyScreen — teclado numérico (Android)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('sem barra; a tecla de ação encadeia o foco e fecha no último campo', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const focusHeight = stubFocus(utils.height);
    const focusBirthDate = stubFocus(utils.birthDate);

    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    expect(utils.inputs().map((input) => input.props.inputAccessoryViewID as unknown)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(utils.inputs().map((input) => input.props.returnKeyType as unknown)).toEqual(['next', 'next', 'done']);

    fireEvent(utils.weight, 'submitEditing');
    expect(focusHeight).toHaveBeenCalledTimes(1);
    fireEvent(utils.height, 'submitEditing');
    expect(focusBirthDate).toHaveBeenCalledTimes(1);
    expect(dismissSpy).not.toHaveBeenCalled();

    fireEvent(utils.birthDate, 'submitEditing');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingBodyScreen — leitura estrita de peso e altura', () => {
  it('"12abc" no peso mostra o erro só no peso', () => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, '12abc');
    expect(utils.fieldErrors()).toEqual([FORMAT_ERROR, undefined, undefined]);
  });

  it('"1.2.3" na altura mostra o erro só na altura', () => {
    const utils = renderScreen();
    fireEvent.changeText(utils.height, '1.2.3');
    expect(utils.fieldErrors()).toEqual([undefined, FORMAT_ERROR, undefined]);
  });

  it.each(['-3', '1e2', '٧٠', '70.55'])('"%s" é recusado', (text) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()[0]).toBe(FORMAT_ERROR);
  });

  it.each(['70', '70,5', '70.5', ' 70,5 ', '70,'])('"%s" é aceito, sem erro', (text) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()[0]).toBeUndefined();
  });

  it('com vírgula o cálculo recebe o valor certo; com lixo ("70abc") não calcula', async () => {
    jest.useFakeTimers();
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          dailyProteinTarget: 120,
          dailyCalorieTarget: 2000,
          dailyCarbTarget: 250,
          imc: 23,
          imcClassification: 'normal',
        },
      },
    });

    try {
      const utils = renderScreen();
      fireEvent.changeText(utils.weight, '70,5');
      fireEvent.changeText(utils.height, '175');
      fireEvent.changeText(utils.birthDate, '15061990');
      fireEvent.press(utils.getByText('onboarding.biologicalSexMale'));
      fireEvent.press(utils.getByText('onboarding.weightGoalMaintain'));

      await act(async () => {
        jest.advanceTimersByTime(700);
        await Promise.resolve();
      });
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ weight: 70.5, height: 175 }));

      mockPost.mockClear();
      fireEvent.changeText(utils.weight, '70abc');
      await act(async () => {
        jest.advanceTimersByTime(700);
        await Promise.resolve();
      });
      expect(mockPost).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
