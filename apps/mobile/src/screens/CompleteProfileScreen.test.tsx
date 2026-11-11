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

// ─── CP-1.1.1f: altura em pés e polegadas e mensagens de faixa ───────────────

const INTEGER_ERROR = 'errors.validation.integer';
const rangeText = (min: string, max: string) => `errors.validation.number_range:${JSON.stringify({ min, max })}`;
const KG_RANGE = rangeText('20 kg', '300 kg');
const CM_RANGE = rangeText('100 cm', '250 cm');
const LBS_RANGE = rangeText('44.1 lbs', '661.5 lbs');
const FT_IN_RANGE = rangeText('3\'4"', '8\'2"');
const INCHES_RANGE = rangeText('0', '11');

const PATCH_RESPONSE = {
  data: { success: true, data: { user: { dailyProteinTarget: 1, dailyCalorieTarget: 1, dailyCarbTarget: 1 } } },
};

function imperialProfile(overrides: Record<string, unknown> = {}) {
  return {
    weight: 80,
    height: 178,
    birthDate: '1990-06-15T00:00:00.000Z',
    biologicalSex: 'male',
    weightGoal: 'maintain',
    activityLevel: 'moderatelyActive',
    unitSystem: 'imperial',
    ...overrides,
  };
}

function renderImperial() {
  const utils = renderScreen();
  const [weight, feet, inches, birthDate] = utils.inputs() as [
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
  ];
  return { ...utils, weight, feet, inches, birthDate };
}

function pressSave(utils: ReturnType<typeof renderScreen>) {
  fireEvent.press(utils.getByRole('button', { name: 'common.actions.save' }));
}

async function sentHeight(): Promise<unknown> {
  await waitFor(() => {
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });
  return (mockPatch.mock.calls[0]?.[1] as { height: unknown }).height;
}

describe('CompleteProfileScreen — imperial: altura em pés e polegadas', () => {
  beforeEach(() => {
    mockPatch.mockResolvedValue(PATCH_RESPONSE);
  });

  it('pré-preenche 178 cm como 5 e 10, em dois campos (ft e in)', () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    expect(utils.inputs()).toHaveLength(4);
    expect(utils.feet.props.value).toBe('5');
    expect(utils.inches.props.value).toBe('10');
    expect(utils.getByText('ft')).toBeTruthy();
    expect(utils.getByText('in')).toBeTruthy();
    expect(utils.fieldErrors()).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('pré-preenche 182.8 cm como 6 e 0 (12 polegadas viram mais um pé)', () => {
    mockProfile = imperialProfile({ height: 182.8 });
    const utils = renderImperial();
    expect([utils.feet.props.value, utils.inches.props.value]).toEqual(['6', '0']);
  });

  it('salvar sem mexer envia a altura salva original (178, não 177.8)', async () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    pressSave(utils);
    expect(await sentHeight()).toBe(178);
  });

  it('mexer só no peso não altera a altura salva', async () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.weight, '180');
    pressSave(utils);
    expect(await sentHeight()).toBe(178);
  });

  it('mexer nas polegadas envia a conversão (5\'11" = 180.3 cm)', async () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.inches, '11');
    pressSave(utils);
    expect(await sentHeight()).toBe(180.3);
  });

  it('mexer e voltar ao mesmo valor conta como mexer (envia 177.8)', async () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.feet, '');
    fireEvent.changeText(utils.feet, '5');
    pressSave(utils);
    expect(await sentHeight()).toBe(177.8);
  });

  it('digitar 5 e 10 numa conta sem altura salva envia 177.8', async () => {
    mockProfile = imperialProfile({ height: undefined });
    const utils = renderImperial();
    expect([utils.feet.props.value, utils.inches.props.value]).toEqual(['', '']);
    fireEvent.changeText(utils.feet, '5');
    fireEvent.changeText(utils.inches, '10');
    pressSave(utils);
    expect(await sentHeight()).toBe(177.8);
  });

  it.each([
    ['12', INCHES_RANGE],
    ['-1', INTEGER_ERROR],
    ['abc', INTEGER_ERROR],
  ])('polegadas "%s" recusadas: erro só nas polegadas e "Salvar" não envia', (text, error) => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.inches, text);
    expect(utils.fieldErrors()).toEqual([undefined, undefined, error, undefined]);
    pressSave(utils);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('ordem do "Próximo" (iOS): peso → pés → polegadas → data', () => {
    mockProfile = imperialProfile();
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderImperial();
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

  it('ordem da tecla de ação (Android)', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockProfile = imperialProfile();
    const utils = renderImperial();
    expect(utils.inputs().map((input) => input.props.returnKeyType as unknown)).toEqual([
      'next',
      'next',
      'next',
      'done',
    ]);
  });

  it('trocar para métrico e voltar limpa os campos e deixa de usar a altura salva', () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.press(utils.getByText('onboarding.unitSystemMetric'));
    expect(utils.inputs()).toHaveLength(3);
    fireEvent.press(utils.getByText('onboarding.unitSystemImperial'));
    const inputs = utils.inputs();
    expect(inputs.slice(0, 3).map((input) => input.props.value as unknown)).toEqual(['', '', '']);
    pressSave(utils);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('CompleteProfileScreen — mensagem de fora da faixa', () => {
  it.each([
    ['20', undefined],
    ['19.9', KG_RANGE],
    ['300', undefined],
    ['300.1', KG_RANGE],
  ])('métrico: peso "%s"', (text, error) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()).toEqual([error, undefined, undefined]);
  });

  it.each([
    ['100', undefined],
    ['99.9', CM_RANGE],
    ['250', undefined],
    ['250.1', CM_RANGE],
  ])('métrico: altura "%s"', (text, error) => {
    const utils = renderScreen();
    fireEvent.changeText(utils.height, text);
    expect(utils.fieldErrors()).toEqual([undefined, error, undefined]);
  });

  it.each([
    ['44.1', undefined],
    ['44', LBS_RANGE],
    ['661.5', undefined],
    ['661.6', LBS_RANGE],
  ])('imperial: peso "%s" lbs', (text, error) => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.weight, text);
    expect(utils.fieldErrors()).toEqual([error, undefined, undefined, undefined]);
  });

  it.each([
    ['3', '4', undefined],
    ['3', '3', FT_IN_RANGE],
    ['8', '2', undefined],
    ['8', '3', FT_IN_RANGE],
  ])('imperial: altura %s\'%s" (faixa no campo de pés); fora da faixa não salva', (feet, inches, error) => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    fireEvent.changeText(utils.feet, feet);
    fireEvent.changeText(utils.inches, inches);
    expect(utils.fieldErrors()).toEqual([undefined, error, undefined, undefined]);
    if (error) {
      pressSave(utils);
      expect(mockPatch).not.toHaveBeenCalled();
    }
  });

  it('erro de formato tem prioridade sobre a faixa', () => {
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, '999abc');
    expect(utils.fieldErrors()[0]).toBe(FORMAT_ERROR);
  });
});

// ─── Peso salvo sem mexer e "ok" das polegadas ───────────────────────────────

async function sentBody(): Promise<{ weight: unknown; height: unknown }> {
  await waitFor(() => {
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });
  return mockPatch.mock.calls[0]?.[1] as { weight: unknown; height: unknown };
}

describe('CompleteProfileScreen — peso salvo, sem mexer', () => {
  beforeEach(() => {
    mockPatch.mockResolvedValue(PATCH_RESPONSE);
  });

  it('imperial: 81 kg aparece como 178.6 lbs; salvar sem mexer envia 81 (não 80.997)', async () => {
    mockProfile = imperialProfile({ weight: 81 });
    const utils = renderImperial();
    expect(utils.weight.props.value).toBe('178.6');
    pressSave(utils);
    const body = await sentBody();
    expect(body.weight).toBe(81);
    expect(body.height).toBe(178);
  });

  it('imperial: mexer no peso envia a conversão', async () => {
    mockProfile = imperialProfile({ weight: 81 });
    const utils = renderImperial();
    fireEvent.changeText(utils.weight, '180');
    pressSave(utils);
    expect((await sentBody()).weight).toBeCloseTo(81.6327, 4);
  });

  it('imperial: mexer só na altura mantém o peso salvo', async () => {
    mockProfile = imperialProfile({ weight: 81 });
    const utils = renderImperial();
    fireEvent.changeText(utils.inches, '11');
    pressSave(utils);
    const body = await sentBody();
    expect(body.weight).toBe(81);
    expect(body.height).toBe(180.3);
  });

  it('imperial: apagar e redigitar o mesmo texto conta como mexer', async () => {
    mockProfile = imperialProfile({ weight: 81 });
    const utils = renderImperial();
    fireEvent.changeText(utils.weight, '');
    fireEvent.changeText(utils.weight, '178.6');
    pressSave(utils);
    expect((await sentBody()).weight).toBeCloseTo(80.9977, 4);
  });

  it('métrico: 70.0227 kg aparece como 70.0; salvar sem mexer envia 70.0227', async () => {
    mockProfile = imperialProfile({ weight: 70.0227, unitSystem: 'metric' });
    const utils = renderScreen();
    expect(utils.weight.props.value).toBe('70.0');
    pressSave(utils);
    expect((await sentBody()).weight).toBe(70.0227);
  });

  it('métrico: mexer no peso envia o texto', async () => {
    mockProfile = imperialProfile({ weight: 70.0227, unitSystem: 'metric' });
    const utils = renderScreen();
    fireEvent.changeText(utils.weight, '72,5');
    pressSave(utils);
    expect((await sentBody()).weight).toBe(72.5);
  });

  it('trocar de unidade descarta o peso salvo (campo limpo, "Salvar" não envia)', () => {
    mockProfile = imperialProfile({ weight: 81 });
    const utils = renderImperial();
    fireEvent.press(utils.getByText('onboarding.unitSystemMetric'));
    fireEvent.press(utils.getByText('onboarding.unitSystemImperial'));
    expect(utils.inputs()[0]?.props.value).toBe('');
    pressSave(utils);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('CompleteProfileScreen — polegadas sem "ok" com altura fora da faixa', () => {
  const inchesInvalid = (utils: ReturnType<typeof renderScreen>) =>
    utils.UNSAFE_getAllByType(AuthInput)[2]?.props.invalid as unknown;

  it('8\'3" marca as polegadas como inválidas; 8\'2" não', () => {
    mockProfile = imperialProfile();
    const utils = renderImperial();
    expect(inchesInvalid(utils)).toBe(false);
    fireEvent.changeText(utils.feet, '8');
    fireEvent.changeText(utils.inches, '3');
    expect(inchesInvalid(utils)).toBe(true);
    fireEvent.changeText(utils.inches, '2');
    expect(inchesInvalid(utils)).toBe(false);
  });
});
