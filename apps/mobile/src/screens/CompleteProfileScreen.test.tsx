// CompleteProfileScreen — teclado numérico ("Próximo/Concluir"), padrão de
// teclado (KeyboardAvoidingView + toques que não se perdem) e leitura estrita
// de peso e altura.
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

// Perfil da conta (getMe). Lido só no render, então o prefixo "mock" basta.
let mockProfile: Record<string, unknown> | undefined;
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockProfile ? { success: true, data: { user: mockProfile } } : undefined,
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn(() => Promise.resolve()) }),
}));

const mockPatch = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../config/api', () => ({
  api: {
    get: jest.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

jest.mock('../store/auth.store', () => {
  const useAuthStore = (selector: (state: Record<string, unknown>) => unknown) => selector({ user: null });
  useAuthStore.getState = () => ({ updateUserProfile: jest.fn() });
  return { useAuthStore };
});

jest.mock('../utils/toast.utils', () => ({ showToast: jest.fn() }));

import { AuthInput } from '../components/ui/AuthInput';
import { CompleteProfileScreen } from './CompleteProfileScreen';

const FORMAT_ERROR = 'errors.validation.decimal_one_place';

type ScreenProps = Parameters<typeof CompleteProfileScreen>[0];

function renderScreen() {
  const navigation = { goBack: jest.fn() };
  const props = { navigation, route: { key: 'complete-profile', name: 'CompleteProfile' } } as unknown as ScreenProps;
  const utils = render(<CompleteProfileScreen {...props} />);
  const inputs = () => utils.UNSAFE_getAllByType(TextInput);
  const [weight, height, birthDate] = inputs() as [ReactTestInstance, ReactTestInstance, ReactTestInstance];
  const fieldErrors = () => utils.UNSAFE_getAllByType(AuthInput).map((input) => input.props.error as unknown);
  return { ...utils, navigation, inputs, weight, height, birthDate, fieldErrors };
}

function stubFocus(input: ReactTestInstance) {
  const focus = jest.fn();
  (input.instance as { focus: () => void }).focus = focus;
  return focus;
}

beforeEach(() => {
  mockProfile = undefined;
  mockPatch.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CompleteProfileScreen — teclado numérico (iOS)', () => {
  it('peso, altura e data ligados à mesma barra; "Próximo" na ordem e "Concluir" fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const ids = utils.inputs().map((input) => input.props.inputAccessoryViewID as unknown);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();

    const focusHeight = stubFocus(utils.height);
    const focusBirthDate = stubFocus(utils.birthDate);

    fireEvent(utils.weight, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusHeight).toHaveBeenCalledTimes(1);

    fireEvent(utils.height, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(focusBirthDate).toHaveBeenCalledTimes(1);

    fireEvent(utils.birthDate, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it("segue o padrão de teclado: KeyboardAvoidingView 'padding' e ScrollView com keyboardShouldPersistTaps", () => {
    const utils = renderScreen();
    expect(utils.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    expect(utils.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('CompleteProfileScreen — teclado numérico (Android)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it("sem barra; a tecla de ação encadeia o foco; KeyboardAvoidingView 'height'", () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const focusHeight = stubFocus(utils.height);
    const focusBirthDate = stubFocus(utils.birthDate);

    expect(utils.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
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
    fireEvent(utils.birthDate, 'submitEditing');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });
});

describe('CompleteProfileScreen — leitura estrita de peso e altura', () => {
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

  it.each(['-3', '1e2', '７０', '70.55'])('"%s" é recusado', (text) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.height, text);
    expect(utils.fieldErrors()[1]).toBe(FORMAT_ERROR);
  });

  it('o valor pré-preenchido (uma casa) é válido e salva com vírgula na altura', async () => {
    mockProfile = {
      weight: 70,
      height: 175,
      birthDate: '1990-06-15T00:00:00.000Z',
      biologicalSex: 'male',
      weightGoal: 'maintain',
      activityLevel: 'moderatelyActive',
      unitSystem: 'metric',
    };
    mockPatch.mockResolvedValueOnce({
      data: { success: true, data: { user: { dailyProteinTarget: 1, dailyCalorieTarget: 1, dailyCarbTarget: 1 } } },
    });

    const utils = renderScreen();
    expect(utils.weight.props.value).toBe('70.0');
    expect(utils.fieldErrors()).toEqual([undefined, undefined, undefined]);

    fireEvent.changeText(utils.height, '175,5');
    expect(utils.fieldErrors()[1]).toBeUndefined();

    fireEvent.press(utils.getByRole('button', { name: 'common.actions.save' }));
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/users/me', expect.objectContaining({ weight: 70, height: 175.5 }));
    });
  });

  it('com lixo no peso o "Salvar" não envia nada', () => {
    mockProfile = {
      weight: 70,
      height: 175,
      birthDate: '1990-06-15T00:00:00.000Z',
      biologicalSex: 'male',
      weightGoal: 'maintain',
      unitSystem: 'metric',
    };
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, '70abc');
    fireEvent.press(utils.getByRole('button', { name: 'common.actions.save' }));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
