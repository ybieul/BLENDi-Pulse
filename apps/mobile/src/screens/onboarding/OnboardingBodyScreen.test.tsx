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

// Sistema de unidades do store, lido a cada render; setUnitSystem o altera
// (a tela re-renderiza porque limpa os campos na mesma troca).
let mockUnitSystem: 'metric' | 'imperial' = 'metric';
const mockSetBodyData = jest.fn();
jest.mock('../../store/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedGoal: 'Wellness',
      unitSystem: mockUnitSystem,
      setBodyData: (...args: unknown[]) => {
        mockSetBodyData(...args);
      },
      setUnitSystem: (next: 'metric' | 'imperial') => {
        mockUnitSystem = next;
      },
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
  mockSetBodyData.mockReset();
  mockUnitSystem = 'metric';
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

// ─── CP-1.1.1f: altura em pés e polegadas e mensagens de faixa ───────────────

const INTEGER_ERROR = 'errors.validation.integer';
const rangeText = (min: string, max: string) => `errors.validation.number_range:${JSON.stringify({ min, max })}`;
const KG_RANGE = rangeText('20 kg', '300 kg');
const CM_RANGE = rangeText('100 cm', '250 cm');
const LBS_RANGE = rangeText('44.1 lbs', '661.5 lbs');
const FT_IN_RANGE = rangeText('3\'4"', '8\'2"');
const INCHES_RANGE = rangeText('0', '11');

const MACROS_RESPONSE = {
  data: {
    success: true,
    data: { dailyProteinTarget: 120, dailyCalorieTarget: 2000, dailyCarbTarget: 250, imc: 23, imcClassification: 'normal' },
  },
};

function renderImperial() {
  mockUnitSystem = 'imperial';
  const utils = render(<OnboardingBodyScreen navigation={{ navigate: jest.fn() }} />);
  const inputs = () => utils.UNSAFE_getAllByType(TextInput);
  const [weight, feet, inches, birthDate] = inputs() as [
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
  ];
  // Erro de cada campo, na ordem: peso, pés, polegadas, data de nascimento.
  const fieldErrors = () => utils.UNSAFE_getAllByType(AuthInput).map((input) => input.props.error as unknown);
  return { ...utils, inputs, weight, feet, inches, birthDate, fieldErrors };
}

async function flushDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(700);
    await Promise.resolve();
  });
}

describe('OnboardingBodyScreen — imperial: altura em pés e polegadas', () => {
  it('dois campos de altura (ft e in), inteiros, no lugar do campo único', () => {
    const utils = renderImperial();
    expect(utils.inputs()).toHaveLength(4);
    expect(utils.getByText('onboarding.heightFeetPlaceholder')).toBeTruthy();
    expect(utils.getByText('onboarding.heightInchesPlaceholder')).toBeTruthy();
    expect(utils.getByText('ft')).toBeTruthy();
    expect(utils.getByText('in')).toBeTruthy();
    expect(utils.feet.props.keyboardType).toBe('number-pad');
    expect(utils.inches.props.keyboardType).toBe('number-pad');
    expect(utils.queryByText('onboarding.heightPlaceholderMetric')).toBeNull();
  });

  it('5 e 10 calculam e salvam 177.8 cm (peso em kg)', async () => {
    jest.useFakeTimers();
    mockPost.mockResolvedValue(MACROS_RESPONSE);
    try {
      const utils = renderImperial();
      fireEvent.changeText(utils.weight, '154.4');
      fireEvent.changeText(utils.feet, '5');
      fireEvent.changeText(utils.inches, '10');
      fireEvent.changeText(utils.birthDate, '15061990');
      fireEvent.press(utils.getByText('onboarding.biologicalSexMale'));
      fireEvent.press(utils.getByText('onboarding.weightGoalMaintain'));
      await flushDebounce();

      expect(mockPost).toHaveBeenCalledTimes(1);
      const body = mockPost.mock.calls[0]?.[1] as { weight: number; height: number; unitSystem: string };
      expect(body.height).toBe(177.8);
      expect(body.weight).toBeCloseTo(70.0227, 4);
      expect(body.unitSystem).toBe('metric');

      fireEvent.press(utils.getByText('onboarding.calculateMacros'));
      expect(mockSetBodyData).toHaveBeenCalledWith(expect.objectContaining({ height: 177.8 }));
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['12', INCHES_RANGE],
    ['-1', INTEGER_ERROR],
    ['abc', INTEGER_ERROR],
    ['5.5', INTEGER_ERROR],
  ])('polegadas "%s" recusadas, com erro só nas polegadas, e não calcula', async (text, error) => {
    jest.useFakeTimers();
    mockPost.mockResolvedValue(MACROS_RESPONSE);
    try {
      const utils = renderImperial();
      fireEvent.changeText(utils.weight, '154');
      fireEvent.changeText(utils.feet, '5');
      fireEvent.changeText(utils.inches, text);
      fireEvent.changeText(utils.birthDate, '15061990');
      fireEvent.press(utils.getByText('onboarding.biologicalSexMale'));
      fireEvent.press(utils.getByText('onboarding.weightGoalMaintain'));
      await flushDebounce();

      expect(utils.fieldErrors()).toEqual([undefined, undefined, error, undefined]);
      expect(mockPost).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['-5', 'x', '５'])('pés "%s" recusados com erro de formato', (text) => {
    const utils = renderImperial();
    fireEvent.changeText(utils.feet, text);
    expect(utils.fieldErrors()).toEqual([undefined, INTEGER_ERROR, undefined, undefined]);
  });

  it('ordem do "Próximo" (iOS): peso → pés → polegadas → data, e "Concluir" fecha', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderImperial();
    const ids = utils.inputs().map((input) => input.props.inputAccessoryViewID as unknown);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();

    const focusFeet = stubFocus(utils.feet);
    const focusInches = stubFocus(utils.inches);
    const focusBirthDate = stubFocus(utils.birthDate);

    fireEvent(utils.weight, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusFeet).toHaveBeenCalledTimes(1);

    fireEvent(utils.feet, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusInches).toHaveBeenCalledTimes(1);

    fireEvent(utils.inches, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusBirthDate).toHaveBeenCalledTimes(1);

    fireEvent(utils.birthDate, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('ordem da tecla de ação (Android): peso → pés → polegadas → data', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderImperial();
    expect(utils.inputs().map((input) => input.props.returnKeyType as unknown)).toEqual([
      'next',
      'next',
      'next',
      'done',
    ]);
    const focusFeet = stubFocus(utils.feet);
    const focusInches = stubFocus(utils.inches);
    const focusBirthDate = stubFocus(utils.birthDate);

    fireEvent(utils.weight, 'submitEditing');
    expect(focusFeet).toHaveBeenCalledTimes(1);
    fireEvent(utils.feet, 'submitEditing');
    expect(focusInches).toHaveBeenCalledTimes(1);
    fireEvent(utils.inches, 'submitEditing');
    expect(focusBirthDate).toHaveBeenCalledTimes(1);
    fireEvent(utils.birthDate, 'submitEditing');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('trocar de unidade limpa peso e altura (comportamento de antes), nos dois sentidos', () => {
    const utils = render(<OnboardingBodyScreen navigation={{ navigate: jest.fn() }} />);
    const [weight, height] = utils.UNSAFE_getAllByType(TextInput) as [ReactTestInstance, ReactTestInstance];
    fireEvent.changeText(weight, '70');
    fireEvent.changeText(height, '178');

    fireEvent.press(utils.getByText('onboarding.unitSystemImperial'));
    let inputs = utils.UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(4);
    expect(inputs.slice(0, 3).map((input) => input.props.value as unknown)).toEqual(['', '', '']);

    fireEvent.changeText(inputs[1], '5');
    fireEvent.changeText(inputs[2], '10');
    fireEvent.press(utils.getByText('onboarding.unitSystemMetric'));
    inputs = utils.UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(3);
    expect(inputs.slice(0, 2).map((input) => input.props.value as unknown)).toEqual(['', '']);

    fireEvent.press(utils.getByText('onboarding.unitSystemImperial'));
    inputs = utils.UNSAFE_getAllByType(TextInput);
    expect(inputs.slice(0, 3).map((input) => input.props.value as unknown)).toEqual(['', '', '']);
  });
});

describe('OnboardingBodyScreen — mensagem de fora da faixa', () => {
  it.each([
    ['20', undefined],
    ['300', undefined],
    ['19.9', KG_RANGE],
    ['300.1', KG_RANGE],
  ])('métrico: peso "%s"', (text, error) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()).toEqual([error, undefined, undefined]);
  });

  it.each([
    ['100', undefined],
    ['250', undefined],
    ['99.9', CM_RANGE],
    ['250.1', CM_RANGE],
  ])('métrico: altura "%s"', (text, error) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.height, text);
    expect(utils.fieldErrors()).toEqual([undefined, error, undefined]);
  });

  it.each([
    ['44.1', undefined],
    ['661.5', undefined],
    ['44', LBS_RANGE],
    ['661.6', LBS_RANGE],
  ])('imperial: peso "%s" lbs', (text, error) => {
    const utils = renderImperial();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()).toEqual([error, undefined, undefined, undefined]);
  });

  it.each([
    ['3', '4', undefined],
    ['8', '2', undefined],
    ['3', '3', FT_IN_RANGE],
    ['8', '3', FT_IN_RANGE],
  ])('imperial: altura %s\'%s" (faixa no campo de pés)', (feet, inches, error) => {
    const utils = renderImperial();
    fireEvent.changeText(utils.feet, feet);
    fireEvent.changeText(utils.inches, inches);
    expect(utils.fieldErrors()).toEqual([undefined, error, undefined, undefined]);
  });

  it('nada digitado, nada de mensagem; erro de formato tem prioridade sobre a faixa', () => {
    const utils = renderScreen();
    expect(utils.fieldErrors()).toEqual([undefined, undefined, undefined]);
    fireEvent.changeText(utils.weight, '1000abc');
    fireEvent.changeText(utils.height, '999.99');
    expect(utils.fieldErrors()).toEqual([FORMAT_ERROR, FORMAT_ERROR, undefined]);
  });

  it('imperial: com polegadas inválidas, a faixa não aparece nos pés', () => {
    const utils = renderImperial();
    fireEvent.changeText(utils.feet, '9');
    fireEvent.changeText(utils.inches, 'x');
    expect(utils.fieldErrors()).toEqual([undefined, undefined, INTEGER_ERROR, undefined]);
  });
});

describe('OnboardingBodyScreen — polegadas sem "ok" com altura fora da faixa', () => {
  it('8\'3" marca as polegadas como inválidas; 8\'2" e polegadas com erro próprio não', () => {
    const utils = renderImperial();
    const inchesInvalid = () => utils.UNSAFE_getAllByType(AuthInput)[2]?.props.invalid as unknown;
    expect(inchesInvalid()).toBe(false);
    fireEvent.changeText(utils.feet, '8');
    fireEvent.changeText(utils.inches, '3');
    expect(inchesInvalid()).toBe(true);
    fireEvent.changeText(utils.inches, '2');
    expect(inchesInvalid()).toBe(false);
    fireEvent.changeText(utils.inches, '12');
    expect(inchesInvalid()).toBe(false);
  });

  it('o peso no onboarding vem sempre do texto (não há peso salvo)', async () => {
    jest.useFakeTimers();
    mockPost.mockResolvedValue(MACROS_RESPONSE);
    try {
      const utils = renderScreen();
      fireEvent.changeText(utils.weight, '70');
      fireEvent.changeText(utils.height, '178');
      fireEvent.changeText(utils.birthDate, '15061990');
      fireEvent.press(utils.getByText('onboarding.biologicalSexMale'));
      fireEvent.press(utils.getByText('onboarding.weightGoalMaintain'));
      await flushDebounce();
      expect(mockPost.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ weight: 70, height: 178 }));
    } finally {
      jest.useRealTimers();
    }
  });
});
