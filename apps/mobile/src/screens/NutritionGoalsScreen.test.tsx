// Tela "Minhas metas" (CP-1.1.1b): valores iniciais do perfil, validação com os
// limites do shared, botão Salvar, PATCH só com o que mudou, dieta, invalidação
// de hydrationToday, confirmação ao sair, avisos de meta do backend e o
// comportamento de teclado/rolagem.
//
// Tema, i18n, área segura, fundo animado, API, toast e store de auth são
// mockados (mesmo padrão de OnboardingMacrosScreen.test.tsx). O React Query é o
// real (QueryClient de teste), para poder observar as invalidações. Os cards de
// dieta, o AuthInput e o AuthButton são os reais.
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import type { EmitterSubscription } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

const mockApiGet = jest.fn<Promise<unknown>, unknown[]>();
const mockApiPatch = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../config/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
  },
}));

const mockUpdateUserProfile = jest.fn();
let mockAuthState: Record<string, unknown> = {};
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAuthState),
}));

const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.utils', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { AuthInput } from '../components/ui/AuthInput';
import { QUERY_KEYS } from '../config/cache.config';
import { NutritionGoalsScreen } from './NutritionGoalsScreen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ScreenProps = ComponentProps<typeof NutritionGoalsScreen>;
type BeforeRemoveListener = (event: {
  preventDefault: () => void;
  data: { action: { type: string } };
}) => void;

const PROFILE = {
  dailyProteinTarget: 150,
  dailyCarbTarget: 200,
  dailyCalorieTarget: 2000,
  dailyHydrationTarget: 2500,
  dietaryPreferences: ['vegan'],
};

const SAVE = { name: 'common.actions.save' };
const PROTEIN_LABEL = 'onboarding.proteinPlaceholder';
const KCAL_LABEL = 'onboarding.caloriesPlaceholder';
const HYDRATION_LABEL = 'nutritionGoals.hydrationLabel';
const HYDRATION_LABEL_IMPERIAL = 'nutritionGoals.hydrationLabelImperial';
const RANGE = {
  protein: 'errors.validation.number_range:{"min":10,"max":800}',
  carbs: 'errors.validation.number_range:{"min":0,"max":1500}',
  calories: 'errors.validation.number_range:{"min":300,"max":15000}',
  hydration: 'errors.validation.number_range:{"min":500,"max":8000}',
};

let beforeRemoveListener: BeforeRemoveListener | undefined;
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockAddListener = jest.fn<() => void, [string, BeforeRemoveListener]>();
const navigation = { goBack: mockGoBack, dispatch: mockDispatch, addListener: mockAddListener };

// Teclado simulado: guarda quem se inscreveu e deixa o teste "abrir/fechar" o teclado.
type KeyboardHandler = (event: unknown) => void;
let keyboardHandlers: Record<string, KeyboardHandler[]> = {};
function emitKeyboard(eventName: string, event: unknown = { endCoordinates: { height: 300 } }) {
  act(() => {
    (keyboardHandlers[eventName] ?? []).forEach((handler) => { handler(event); });
  });
}

function renderScreen(profile: Record<string, unknown> | null = PROFILE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (profile) {
    queryClient.setQueryData(QUERY_KEYS.userProfile, { success: true, data: { user: profile } });
  }
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

  const props = { navigation, route: { key: 'nutrition-goals', name: 'NutritionGoals' } } as unknown as ScreenProps;
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <NutritionGoalsScreen {...props} />
    </QueryClientProvider>,
  );

  const inputs = () => utils.UNSAFE_getAllByType(TextInput);
  const [protein, carbs, calories, hydration] = inputs() as [
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
  ];
  const type = (input: ReactTestInstance, text: string) => {
    fireEvent.changeText(input, text);
  };

  return { ...utils, queryClient, invalidateSpy, protein, carbs, calories, hydration, inputs, type };
}

function patchResponse(user: Record<string, unknown> = {}) {
  return Promise.resolve({ data: { success: true, data: { user: { ...PROFILE, ...user } } } });
}

function propOf(input: ReactTestInstance, name: string): unknown {
  const props: Record<string, unknown> = input.props;
  return props[name];
}

function warning(code: string, field: string) {
  return { field, code, message: `warnings.manualMacroEdit.${code}` };
}

async function pressSave(utils: ReturnType<typeof renderScreen>) {
  await act(async () => {
    fireEvent.press(utils.getByRole('button', SAVE));
    await Promise.resolve();
  });
}

function leaveWithGuard() {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  act(() => {
    beforeRemoveListener?.(event);
  });
  return event;
}

beforeEach(() => {
  // Primeiro: restoreAllMocks também zera implementações de jest.fn() (Jest 29).
  jest.restoreAllMocks();
  beforeRemoveListener = undefined;
  keyboardHandlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, handler) => {
    (keyboardHandlers[eventName] ??= []).push(handler as KeyboardHandler);
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });
  mockAddListener.mockReset().mockImplementation((eventName, listener) => {
    if (eventName === 'beforeRemove') {
      beforeRemoveListener = listener;
    }
    return jest.fn();
  });
  mockGoBack.mockReset();
  mockDispatch.mockReset();
  mockApiGet.mockReset().mockResolvedValue({ data: { success: true, data: { user: PROFILE } } });
  mockApiPatch.mockReset().mockImplementation(() => patchResponse());
  mockUpdateUserProfile.mockReset();
  mockShowToast.mockReset();
  mockAuthState = {
    user: {
      dailyProteinTarget: 120,
      dailyCarbTarget: 150,
      dailyCalorieTarget: 1800,
    },
    updateUserProfile: mockUpdateUserProfile,
  };
});

// ─── Conteúdo e valores iniciais ──────────────────────────────────────────────

describe('NutritionGoalsScreen — conteúdo e valores iniciais', () => {
  it('mostra título, subtítulo, os 4 campos, o aviso de recálculo e a seção de dieta, nesta ordem', () => {
    const { getByText, getByRole, inputs, toJSON } = renderScreen();

    expect(getByText('nutritionGoals.title')).toBeTruthy();
    expect(getByText('nutritionGoals.subtitle')).toBeTruthy();
    expect(inputs()).toHaveLength(4);
    for (const label of [PROTEIN_LABEL, 'onboarding.carbTarget', KCAL_LABEL, HYDRATION_LABEL]) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(getByText('nutritionGoals.recalcNotice')).toBeTruthy();
    expect(getByText('nutritionGoals.dietTitle')).toBeTruthy();
    expect(getByRole('button', SAVE)).toBeTruthy();

    const tree = JSON.stringify(toJSON());
    const order = [
      'nutritionGoals.title',
      PROTEIN_LABEL,
      'onboarding.carbTarget',
      KCAL_LABEL,
      HYDRATION_LABEL,
      'nutritionGoals.recalcNotice',
      'nutritionGoals.dietTitle',
    ].map((text) => tree.indexOf(text));
    expect(order.every((position, index) => position >= 0 && (index === 0 || position > (order[index - 1] ?? -1)))).toBe(true);
  });

  it('os valores iniciais vêm do perfil (não do usuário local) e a dieta do perfil vem marcada', () => {
    const { protein, carbs, calories, hydration, getAllByRole } = renderScreen();

    expect(protein.props.value).toBe('150');
    expect(carbs.props.value).toBe('200');
    expect(calories.props.value).toBe('2000');
    expect(hydration.props.value).toBe('2500');
    // 1 card selecionado (vegan); o botão Salvar não tem estado "selected".
    expect(getAllByRole('button', { selected: true })).toHaveLength(1);
  });

  it('sem perfil carregado, usa o usuário local; hidratação e dieta ausentes caem no padrão (2500 ml, sem restrições)', () => {
    const { protein, carbs, calories, hydration, queryByRole } = renderScreen(null);

    expect(protein.props.value).toBe('120');
    expect(carbs.props.value).toBe('150');
    expect(calories.props.value).toBe('1800');
    expect(hydration.props.value).toBe('2500');
    expect(queryByRole('button', { selected: true })).toBeNull();
  });

  it('conta antiga sem dietaryPreferences abre a dieta vazia e já dá para definir uma', async () => {
    const utils = renderScreen({ ...PROFILE, dietaryPreferences: undefined });

    expect(utils.queryByRole('button', { selected: true })).toBeNull();
    fireEvent.press(utils.getByText('onboarding.diet.dairyFree'));
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dietaryPreferences: ['dairy_free'] });
  });

  it('reusa as mesmas chaves de tradução da tela de dieta do onboarding (4 cards + alerta de alergia)', () => {
    const { getByText } = renderScreen();

    for (const key of [
      'onboarding.diet.dairyFree',
      'onboarding.diet.dairyFreeDesc',
      'onboarding.diet.vegan',
      'onboarding.diet.nutFree',
      'onboarding.diet.noAddedSugar',
      'onboarding.diet.subtitle',
      'onboarding.diet.disclaimer',
    ]) {
      expect(getByText(key)).toBeTruthy();
    }
  });
});

// ─── Validação e botão Salvar ─────────────────────────────────────────────────

describe('NutritionGoalsScreen — validação com os limites do shared', () => {
  it('sem mudança nenhuma, "Salvar" começa desabilitado e sem erro', () => {
    const { getByRole, queryByText } = renderScreen();

    expect(getByRole('button', SAVE)).toBeDisabled();
    expect(queryByText(/errors\.validation\.number_range/)).toBeNull();
  });

  it.each([
    ['proteína abaixo do mínimo (9)', 'protein', '9', RANGE.protein],
    ['proteína acima do máximo (801)', 'protein', '801', RANGE.protein],
    ['carboidratos acima do máximo (1501)', 'carbs', '1501', RANGE.carbs],
    ['calorias abaixo do mínimo (299)', 'calories', '299', RANGE.calories],
    ['calorias acima do máximo (15001)', 'calories', '15001', RANGE.calories],
    ['hidratação abaixo do mínimo (499)', 'hydration', '499', RANGE.hydration],
    ['hidratação acima do máximo (8001)', 'hydration', '8001', RANGE.hydration],
    ['texto que não é número inteiro (12abc)', 'protein', '12abc', RANGE.protein],
  ] as const)('%s: erro inline no campo e "Salvar" desabilitado', (_label, field, text, message) => {
    const utils = renderScreen();

    utils.type(utils[field], text);

    expect(utils.getByText(message)).toBeTruthy();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it.each([
    ['protein', '10'],
    ['protein', '800'],
    ['carbs', '0'],
    ['carbs', '1500'],
    ['calories', '300'],
    ['calories', '15000'],
    ['hydration', '500'],
    ['hydration', '8000'],
  ] as const)('extremo aceito: %s = %s', (field, text) => {
    const utils = renderScreen();

    utils.type(utils[field], text);

    expect(utils.queryByText(/errors\.validation\.number_range/)).toBeNull();
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();
  });

  it('campo apagado: sem mensagem de erro (só depois de digitar algo), mas "Salvar" fica desabilitado', () => {
    const utils = renderScreen();

    utils.type(utils.protein, '');

    expect(utils.queryByText(/errors\.validation\.number_range/)).toBeNull();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it('um campo inválido bloqueia o botão mesmo havendo outra mudança válida, e o erro some ao corrigir', () => {
    const utils = renderScreen();

    utils.type(utils.calories, '2200');
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();

    utils.type(utils.protein, '5');
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
    expect(utils.getByText(RANGE.protein)).toBeTruthy();

    utils.type(utils.protein, '160');
    // O AuthInput esmaece o erro antes de tirá-lo da árvore; o que a tela decide é a prop `error`.
    expect(utils.UNSAFE_getAllByType(AuthInput)[0]?.props.error).toBeUndefined();
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();
  });

  it('voltar ao valor salvo desabilita o botão de novo (não é mudança)', () => {
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();

    utils.type(utils.protein, '150');
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });
});

// ─── Salvar ───────────────────────────────────────────────────────────────────

describe('NutritionGoalsScreen — salvar', () => {
  it('envia só os campos que mudaram (não reenvia os iguais ao salvo)', async () => {
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    utils.type(utils.carbs, '200'); // igual ao salvo
    utils.type(utils.hydration, '3000');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledTimes(1);
    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', {
      dailyProteinTarget: 180,
      dailyHydrationTarget: 3000,
    });
  });

  it('em sucesso sem avisos: sincroniza o usuário local, mostra o toast e volta para o Me', async () => {
    const utils = renderScreen();

    utils.type(utils.calories, '2300');
    await pressSave(utils);

    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ dailyCalorieTarget: 2300 });
    expect(mockShowToast).toHaveBeenCalledWith('nutritionGoals.saved');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('o toque em "Salvar" fecha o teclado', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();

    utils.type(utils.calories, '2300');
    await pressSave(utils);

    expect(dismissSpy).toHaveBeenCalled();
  });

  it('em erro: mostra a mensagem traduzida, mantém o que foi digitado, não volta e permite tentar de novo', async () => {
    mockApiPatch.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { data: { code: 'validation/invalid-input' } },
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    utils.type(utils.hydration, '3000');
    await pressSave(utils);

    expect(utils.getByText('errors.validation_invalid_input')).toBeTruthy();
    expect(utils.protein.props.value).toBe('180');
    expect(utils.hydration.props.value).toBe('3000');
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();

    // Tentar de novo (agora o PATCH passa) manda o mesmo conteúdo e volta.
    await pressSave(utils);
    expect(mockApiPatch).toHaveBeenCalledTimes(2);
    expect(mockApiPatch).toHaveBeenLastCalledWith('/users/me', {
      dailyProteinTarget: 180,
      dailyHydrationTarget: 3000,
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(utils.queryByText('errors.validation_invalid_input')).toBeNull();
  });

  it('erro de rede sem resposta usa a mensagem de rede traduzida', async () => {
    mockApiPatch.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(utils.getByText('errors.network.offline')).toBeTruthy();
  });

  it('o erro some quando a pessoa volta a editar', async () => {
    mockApiPatch.mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);
    expect(utils.getByText('errors.network_internal_server_error')).toBeTruthy();

    utils.type(utils.protein, '181');
    expect(utils.queryByText('errors.network_internal_server_error')).toBeNull();
  });
});

// ─── Dieta ────────────────────────────────────────────────────────────────────

describe('NutritionGoalsScreen — dieta', () => {
  it('tocar marca e tocar de novo desmarca; "Salvar" acompanha', () => {
    const utils = renderScreen({ ...PROFILE, dietaryPreferences: [] });

    expect(utils.getByRole('button', SAVE)).toBeDisabled();

    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    expect(utils.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();

    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    expect(utils.queryByRole('button', { selected: true })).toBeNull();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it('múltipla escolha: marca as 4 e o PATCH leva a lista na ordem canônica, só com a dieta', async () => {
    const utils = renderScreen({ ...PROFILE, dietaryPreferences: ['vegan'] });

    fireEvent.press(utils.getByText('onboarding.diet.noAddedSugar'));
    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    fireEvent.press(utils.getByText('onboarding.diet.dairyFree'));
    expect(utils.getAllByRole('button', { selected: true })).toHaveLength(4);

    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', {
      dietaryPreferences: ['dairy_free', 'vegan', 'nut_free', 'no_added_sugar'],
    });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({
      dietaryPreferences: ['dairy_free', 'vegan', 'nut_free', 'no_added_sugar'],
    });
  });

  it('desmarcar a última restrição envia lista vazia (limpa a dieta)', async () => {
    const utils = renderScreen({ ...PROFILE, dietaryPreferences: ['vegan'] });

    fireEvent.press(utils.getByText('onboarding.diet.vegan'));
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dietaryPreferences: [] });
  });
});

// ─── Invalidação de queries ───────────────────────────────────────────────────

describe('NutritionGoalsScreen — invalidação de queries', () => {
  it('invalida o perfil sempre, e hydrationToday só quando a hidratação mudou', async () => {
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);

    const keysAfterProtein = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keysAfterProtein).toContainEqual(QUERY_KEYS.userProfile);
    expect(keysAfterProtein).not.toContainEqual(QUERY_KEYS.hydrationToday);
  });

  it('com a hidratação alterada invalida também hydrationToday (a Home e o Track leem a meta de lá)', async () => {
    const utils = renderScreen();

    utils.type(utils.hydration, '3200');
    await pressSave(utils);

    const keys = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(QUERY_KEYS.userProfile);
    expect(keys).toContainEqual(QUERY_KEYS.hydrationToday);
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ dailyHydrationTarget: 3200 });
  });

  it('dieta sozinha também não invalida hydrationToday', async () => {
    const utils = renderScreen();

    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    await pressSave(utils);

    const keys = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(QUERY_KEYS.userProfile);
    expect(keys).not.toContainEqual(QUERY_KEYS.hydrationToday);
  });

  it('erro no PATCH não invalida nada', async () => {
    mockApiPatch.mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();

    utils.type(utils.hydration, '3200');
    await pressSave(utils);

    expect(utils.invalidateSpy).not.toHaveBeenCalled();
  });
});

// ─── Sair com alteração não salva ─────────────────────────────────────────────

describe('NutritionGoalsScreen — sair com alteração não salva', () => {
  it('sem alteração, sair é livre (sem confirmação)', () => {
    renderScreen();
    const alertSpy = jest.spyOn(Alert, 'alert');

    const event = leaveWithGuard();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('com alteração não salva, bloqueia a saída e pergunta se quer descartar', () => {
    const utils = renderScreen();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    utils.type(utils.protein, '180');
    const event = leaveWithGuard();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('nutritionGoals.discard.title');
    expect(alertSpy.mock.calls[0]?.[1]).toBe('nutritionGoals.discard.message');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('"Continuar editando" mantém a pessoa na tela com o que digitou', () => {
    const utils = renderScreen();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    utils.type(utils.protein, '180');
    leaveWithGuard();
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const keepEditing = buttons.find((button) => button.text === 'nutritionGoals.discard.keepEditing');
    expect(keepEditing?.style).toBe('cancel');
    keepEditing?.onPress?.();

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(utils.protein.props.value).toBe('180');
  });

  it('"Descartar" deixa a pessoa sair, repassando a ação original da navegação', () => {
    const utils = renderScreen();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    utils.type(utils.protein, '180');
    leaveWithGuard();
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const discard = buttons.find((button) => button.text === 'nutritionGoals.discard.confirm');
    expect(discard?.style).toBe('destructive');
    act(() => {
      discard?.onPress?.();
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('alteração só na dieta, ou texto inválido, também conta como não salva', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const dietOnly = renderScreen();
    fireEvent.press(dietOnly.getByText('onboarding.diet.nutFree'));
    expect(leaveWithGuard().preventDefault).toHaveBeenCalledTimes(1);
    dietOnly.unmount();

    const invalidText = renderScreen();
    invalidText.type(invalidText.protein, '5');
    expect(leaveWithGuard().preventDefault).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it('voltar ao valor original (sem diferença) deixa sair sem perguntar', () => {
    const utils = renderScreen();
    const alertSpy = jest.spyOn(Alert, 'alert');

    utils.type(utils.protein, '180');
    utils.type(utils.protein, '150');
    const event = leaveWithGuard();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('depois de salvar, o goBack automático não é barrado pela confirmação', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const preventDefault = jest.fn();
    // O goBack real dispara beforeRemove; reproduz isso aqui.
    mockGoBack.mockImplementation(() => {
      beforeRemoveListener?.({ preventDefault, data: { action: { type: 'GO_BACK' } } });
    });
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('o botão de voltar da tela usa a mesma navegação (e portanto a mesma confirmação)', () => {
    const utils = renderScreen();

    fireEvent.press(utils.getByRole('button', { name: 'common.actions.back' }));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Avisos de meta do backend ────────────────────────────────────────────────

describe('NutritionGoalsScreen — avisos de meta (data.user.warnings)', () => {
  const PROTEIN_WARNING = 'nutritionGoals.warnings.proteinAboveRange';
  const KCAL_WARNING = 'nutritionGoals.warnings.caloriesBelowBmr';

  it('resposta com aviso: continua na tela, mostra o sucesso e o aviso junto do campo certo', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('nutritionGoals.saved');
    expect(within(utils.getByTestId('goal-field-dailyProteinTarget')).getByText(PROTEIN_WARNING)).toBeTruthy();
    expect(within(utils.getByTestId('goal-field-dailyCalorieTarget')).queryByText(PROTEIN_WARNING)).toBeNull();
    expect(utils.getAllByText(PROTEIN_WARNING)).toHaveLength(1);
    // O valor foi salvo: a tela o trata como o novo valor salvo e o botão volta a desabilitar.
    expect(utils.protein.props.value).toBe('800');
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it('um aviso por campo: proteína e calorias aparecem cada um no seu campo', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({
        warnings: [
          warning('macros/protein-above-range', 'dailyProteinTarget'),
          warning('macros/calories-below-bmr', 'dailyCalorieTarget'),
        ],
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    utils.type(utils.calories, '400');
    await pressSave(utils);

    expect(within(utils.getByTestId('goal-field-dailyProteinTarget')).getByText(PROTEIN_WARNING)).toBeTruthy();
    expect(within(utils.getByTestId('goal-field-dailyCalorieTarget')).getByText(KCAL_WARNING)).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('o texto do aviso vem do code, nunca da message do backend', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({
        warnings: [{ field: 'dailyCarbTarget', code: 'macros/carb-below-range', message: 'MENSAGEM CRUA DO BACKEND' }],
      }),
    );
    const utils = renderScreen();

    utils.type(utils.carbs, '10');
    await pressSave(utils);

    expect(utils.queryByText('MENSAGEM CRUA DO BACKEND')).toBeNull();
    expect(within(utils.getByTestId('goal-field-dailyCarbTarget')).getByText('nutritionGoals.warnings.carbBelowRange')).toBeTruthy();
  });

  it('code desconhecido (e os de gordura) são ignorados sem quebrar; sem nenhum aviso conhecido, volta para o Me', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({
        warnings: [
          warning('macros/algo-novo-do-backend', 'dailyProteinTarget'),
          warning('macros/fat-above-range', 'dailyFatTarget'),
        ],
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(utils.queryByText(/nutritionGoals\.warnings\./)).toBeNull();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('code desconhecido junto de um conhecido: mostra só o conhecido e fica na tela', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({
        warnings: [
          warning('macros/algo-novo-do-backend', 'dailyCalorieTarget'),
          warning('macros/protein-above-range', 'dailyProteinTarget'),
        ],
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);

    expect(utils.getAllByText(/nutritionGoals\.warnings\./)).toHaveLength(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('editar o campo apaga o aviso dele e só dele', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({
        warnings: [
          warning('macros/protein-above-range', 'dailyProteinTarget'),
          warning('macros/calories-below-bmr', 'dailyCalorieTarget'),
        ],
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    utils.type(utils.calories, '400');
    await pressSave(utils);
    expect(utils.getAllByText(/nutritionGoals\.warnings\./)).toHaveLength(2);

    utils.type(utils.protein, '790');

    expect(utils.queryByText(PROTEIN_WARNING)).toBeNull();
    expect(utils.getByText(KCAL_WARNING)).toBeTruthy();
  });

  it('pode ajustar e salvar de novo: a segunda resposta sem aviso troca o do campo e volta para o Me', async () => {
    mockApiPatch
      .mockImplementationOnce(() =>
        patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
      )
      .mockImplementationOnce(() => patchResponse());
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);
    expect(utils.getByText(PROTEIN_WARNING)).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();

    utils.type(utils.protein, '200');
    await pressSave(utils);

    // O segundo PATCH compara com o que o primeiro salvou (800), não com o perfil antigo.
    expect(mockApiPatch).toHaveBeenLastCalledWith('/users/me', { dailyProteinTarget: 200 });
    expect(utils.queryByText(PROTEIN_WARNING)).toBeNull();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('salvar outro campo não reavalia nem apaga o aviso de um campo que não foi tocado', async () => {
    mockApiPatch
      .mockImplementationOnce(() =>
        patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
      )
      .mockImplementationOnce(() =>
        patchResponse({ warnings: [warning('macros/calories-below-bmr', 'dailyCalorieTarget')] }),
      );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);
    utils.type(utils.calories, '400');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenLastCalledWith('/users/me', { dailyCalorieTarget: 400 });
    expect(utils.getByText(PROTEIN_WARNING)).toBeTruthy();
    expect(utils.getByText(KCAL_WARNING)).toBeTruthy();
  });

  it('com aviso na tela, voltar não pede confirmação (o valor já foi salvo)', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);
    const event = leaveWithGuard();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('resposta sem warnings (ou com lista malformada) volta para o Me', async () => {
    const utils = renderScreen();
    utils.type(utils.protein, '180');
    await pressSave(utils);
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    mockGoBack.mockReset();
    mockApiPatch.mockImplementation(() => patchResponse({ warnings: 'não é uma lista' }));
    const malformed = renderScreen();
    malformed.type(malformed.protein, '181');
    await pressSave(malformed);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('o aviso (âmbar) é diferente do erro de validação (vermelho) e não aparece junto dele', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await pressSave(utils);
    const warningBox = within(utils.getByTestId('goal-field-dailyProteinTarget')).getByRole('alert');
    expect(warningBox).toBeTruthy();

    // Digitando um valor inválido o aviso já saiu (editou o campo) e entra o erro.
    utils.type(utils.protein, '801');
    expect(utils.queryByText(PROTEIN_WARNING)).toBeNull();
    expect(utils.getByText(RANGE.protein)).toBeTruthy();
  });
});

// ─── Teclado e responsividade ─────────────────────────────────────────────────

describe('NutritionGoalsScreen — teclado e responsividade', () => {
  it('segue o padrão do projeto: KeyboardAvoidingView (padding no iOS) + ScrollView com keyboardShouldPersistTaps="handled"', () => {
    const utils = renderScreen();

    expect(utils.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    const scroll = utils.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
  });

  it('respeita a área segura: topo no conteúdo rolável e base no rodapé fixo', () => {
    const utils = renderScreen();

    const scroll = utils.UNSAFE_getByType(ScrollView);
    const contentStyle = StyleSheet.flatten(scroll.props.contentContainerStyle) as { paddingTop: number };
    expect(contentStyle.paddingTop).toBeGreaterThan(47); // insets.top + folga

    const footerStyle = StyleSheet.flatten(utils.getByTestId('goal-footer').props.style) as { paddingBottom: number };
    expect(footerStyle.paddingBottom).toBeGreaterThanOrEqual(34); // insets.bottom (teclado fechado)
  });

  it('o botão "Salvar" fica FORA do ScrollView (fixo no rodapé, sempre alcançável com o teclado aberto)', () => {
    const utils = renderScreen();

    const scroll = utils.UNSAFE_getByType(ScrollView);
    expect(within(scroll).queryByRole('button', SAVE)).toBeNull();
    expect(utils.getByRole('button', SAVE)).toBeTruthy();
  });

  it('o rodapé encosta no teclado: com ele aberto, a folga da barra inferior some', () => {
    const utils = renderScreen();
    const footerOf = () =>
      StyleSheet.flatten(utils.getByTestId('goal-footer').props.style) as { paddingBottom: number };
    const closed = footerOf().paddingBottom;

    emitKeyboard('keyboardWillShow');
    expect(footerOf().paddingBottom).toBeLessThan(closed);

    emitKeyboard('keyboardWillHide', {});
    expect(footerOf().paddingBottom).toBe(closed);
  });

  it('todos os campos: teclado numérico, "próximo" nos três primeiros e "concluir" no último', () => {
    const { inputs } = renderScreen();

    expect(inputs().map((input) => propOf(input, 'keyboardType'))).toEqual(['number-pad', 'number-pad', 'number-pad', 'number-pad']);
    expect(inputs().map((input) => propOf(input, 'returnKeyType'))).toEqual(['next', 'next', 'next', 'done']);
    // O teclado só perde o foco quando a tela decide (senão o teclado pisca entre campos).
    expect(inputs().map((input) => propOf(input, 'submitBehavior'))).toEqual(['submit', 'submit', 'submit', 'submit']);
  });

  it('"próximo" leva ao campo seguinte; no último, "concluir" fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const instances = utils.inputs().map((input) => {
      const focus = jest.fn();
      (input.instance as { focus: () => void }).focus = focus;
      return focus;
    });

    fireEvent(utils.protein, 'submitEditing');
    expect(instances[1]).toHaveBeenCalledTimes(1);
    fireEvent(utils.carbs, 'submitEditing');
    expect(instances[2]).toHaveBeenCalledTimes(1);
    fireEvent(utils.calories, 'submitEditing');
    expect(instances[3]).toHaveBeenCalledTimes(1);
    expect(dismissSpy).not.toHaveBeenCalled();

    fireEvent(utils.hydration, 'submitEditing');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('iOS: a barra acima do teclado numérico mostra "Próximo" e, no último campo, "Concluir"', () => {
    const utils = renderScreen();

    expect(utils.getByText('nutritionGoals.next')).toBeTruthy();
    expect(utils.queryByText('nutritionGoals.done')).toBeNull();

    fireEvent(utils.hydration, 'focus');
    expect(utils.getByText('nutritionGoals.done')).toBeTruthy();
    expect(utils.queryByText('nutritionGoals.next')).toBeNull();

    // Todos os campos ligam o teclado a essa barra.
    const ids = new Set(utils.inputs().map((input) => input.props.inputAccessoryViewID as string));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it('a barra "Próximo" avança o foco e, no último campo, fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = renderScreen();
    const secondFocus = jest.fn();
    (utils.carbs.instance as { focus: () => void }).focus = secondFocus;

    fireEvent(utils.protein, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.next'));
    expect(secondFocus).toHaveBeenCalledTimes(1);

    fireEvent(utils.hydration, 'focus');
    fireEvent.press(utils.getByText('nutritionGoals.done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  describe('o campo em foco é rolado para a vista (nos 4, inclusive o último)', () => {
    // Posições simuladas dentro do ScrollView: o bloco de campos começa em y=300 e
    // cada campo tem 80 de altura mais 8 de espaço — o último fica bem abaixo da dobra.
    function layoutFields(utils: ReturnType<typeof renderScreen>) {
      const scroll = utils.UNSAFE_getByType(ScrollView);
      const scrollTo = jest.fn<void, [{ y: number; animated: boolean }]>();
      (scroll.instance as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;

      fireEvent(utils.getByTestId('goal-fields'), 'layout', { nativeEvent: { layout: { x: 0, y: 300, width: 360, height: 360 } } });
      ['dailyProteinTarget', 'dailyCarbTarget', 'dailyCalorieTarget', 'dailyHydrationTarget'].forEach((field, index) => {
        fireEvent(utils.getByTestId(`goal-field-${field}`), 'layout', {
          nativeEvent: { layout: { x: 0, y: index * 88, width: 360, height: 80 } },
        });
      });

      return scrollTo;
    }

    it.each([
      ['proteína', 'protein', 0],
      ['carboidratos', 'carbs', 88],
      ['calorias', 'calories', 176],
      ['hidratação (último)', 'hydration', 264],
    ] as const)('%s', (_label, field, offsetInBlock) => {
      const utils = renderScreen();
      const scrollTo = layoutFields(utils);

      fireEvent(utils[field], 'focus');

      expect(scrollTo).toHaveBeenCalledTimes(1);
      const call = scrollTo.mock.calls[0]?.[0];
      // Topo do campo menos uma folga; nunca negativo.
      expect(call?.y).toBe(300 + offsetInBlock - 24);
      expect(call?.animated).toBe(true);
    });

    it('quando o teclado termina de abrir, reforça a rolagem para o campo que ficou em foco', () => {
      const utils = renderScreen();
      const scrollTo = layoutFields(utils);

      fireEvent(utils.hydration, 'focus');
      scrollTo.mockClear();
      emitKeyboard('keyboardDidShow');

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]?.[0]?.y).toBe(300 + 264 - 24);
    });

    it('sem campo em foco, o teclado abrindo não rola nada', () => {
      const utils = renderScreen();
      const scrollTo = layoutFields(utils);

      emitKeyboard('keyboardDidShow');

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it('cada campo tem rótulo de acessibilidade (o rótulo flutuante do AuthInput não é lido pelo leitor de tela)', () => {
    const { inputs } = renderScreen();

    expect(inputs().map((input) => propOf(input, 'accessibilityLabel'))).toEqual([
      PROTEIN_LABEL,
      'onboarding.carbTarget',
      KCAL_LABEL,
      HYDRATION_LABEL,
    ]);
  });

  it('fonte do sistema ampliada: os campos herdam o teto de escala padrão do AuthInput (a tela não define o seu)', () => {
    const { inputs } = renderScreen();

    for (const input of inputs()) {
      expect(input.props.maxFontSizeMultiplier).toBe(1.3);
    }
  });
});

describe('NutritionGoalsScreen — Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it("KeyboardAvoidingView com 'height' (padrão do projeto), fecha o teclado ao arrastar e não usa a barra do iOS", () => {
    const utils = renderScreen();

    expect(utils.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
    const scroll = utils.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
    // "Próximo/Concluir" é a ação do próprio teclado (returnKeyType), não a barra do iOS.
    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    expect(utils.queryByText('nutritionGoals.done')).toBeNull();
    expect(utils.inputs().every((input) => propOf(input, 'inputAccessoryViewID') === undefined)).toBe(true);
    expect(utils.inputs().map((input) => propOf(input, 'returnKeyType'))).toEqual(['next', 'next', 'next', 'done']);
  });

  it('o rodapé encosta no teclado usando os eventos keyboardDidShow/Hide', () => {
    const utils = renderScreen();
    const footerOf = () =>
      StyleSheet.flatten(utils.getByTestId('goal-footer').props.style) as { paddingBottom: number };
    const closed = footerOf().paddingBottom;

    emitKeyboard('keyboardDidShow');
    expect(footerOf().paddingBottom).toBeLessThan(closed);

    emitKeyboard('keyboardDidHide', {});
    expect(footerOf().paddingBottom).toBe(closed);
  });
});

// ─── Hidratação ───────────────────────────────────────────────────────────────

describe('NutritionGoalsScreen — hidratação, sistema métrico (sem mudança)', () => {
  it('é editada em ml inteiro, com teclado numérico, e o rótulo diz "(ml)"', async () => {
    const utils = renderScreen({ ...PROFILE, dailyHydrationTarget: 2500 });

    expect(utils.hydration.props.value).toBe('2500');
    expect(utils.hydration.props.keyboardType).toBe('number-pad');
    utils.type(utils.hydration, '3000');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyHydrationTarget: 3000 });
    expect(utils.getByText(HYDRATION_LABEL)).toBeTruthy();
    expect(utils.queryByText(HYDRATION_LABEL_IMPERIAL)).toBeNull();
  });

  it('decimal continua inválido no métrico, com a faixa em ml', () => {
    const utils = renderScreen();

    for (const text of ['2500.5', '2500,5']) {
      utils.type(utils.hydration, text);
      expect(utils.getByText(RANGE.hydration)).toBeTruthy();
      expect(utils.getByRole('button', SAVE)).toBeDisabled();
    }
  });

  it('sem unidade conhecida no usuário local, usa ml', () => {
    mockAuthState = { ...mockAuthState, user: { dailyProteinTarget: 120, unitSystem: undefined } };
    const utils = renderScreen();

    expect(utils.hydration.props.value).toBe('2500');
    expect(utils.getByText(HYDRATION_LABEL)).toBeTruthy();
  });
});

describe('NutritionGoalsScreen — hidratação, sistema imperial (fl oz)', () => {
  const RANGE_FL_OZ = 'errors.validation.number_range:{"min":"17.0","max":"270.5"}';

  beforeEach(() => {
    mockAuthState = {
      ...mockAuthState,
      user: { ...(mockAuthState.user as Record<string, unknown>), unitSystem: 'imperial' },
    };
  });

  it('mostra o valor salvo em fl oz com uma casa (2500 ml -> 84.5, igual à Home), rótulo "(fl oz)" e teclado decimal', () => {
    const utils = renderScreen({ ...PROFILE, dailyHydrationTarget: 2500 });

    expect(utils.hydration.props.value).toBe('84.5');
    expect(utils.hydration.props.keyboardType).toBe('decimal-pad');
    expect(utils.getByText(HYDRATION_LABEL_IMPERIAL)).toBeTruthy();
    expect(utils.queryByText(HYDRATION_LABEL)).toBeNull();
    expect(propOf(utils.hydration, 'accessibilityLabel')).toBe(HYDRATION_LABEL_IMPERIAL);
  });

  it.each([
    [3000, '101.4'],
    [500, '16.9'],
    [8000, '270.5'],
  ])('%i ml aparece como %s', (ml, shown) => {
    const utils = renderScreen({ ...PROFILE, dailyHydrationTarget: ml });
    expect(utils.hydration.props.value).toBe(shown);
  });

  it('os outros campos continuam inteiros e com teclado numérico', () => {
    const utils = renderScreen();

    expect(utils.protein.props.keyboardType).toBe('number-pad');
    utils.type(utils.protein, '150.5');
    expect(utils.getByText(RANGE.protein)).toBeTruthy();
  });

  it.each([
    ['ponto', '100.0', 2957],
    ['vírgula', '100,0', 2957],
    ['inteiro', '100', 2957],
    ['ponto com casa', '84.6', 2502],
    ['vírgula com casa', '84,6', 2502],
  ])('aceita %s ("%s") e manda ml inteiro (%i) no PATCH', async (_name, text, ml) => {
    const utils = renderScreen();

    utils.type(utils.hydration, text);
    expect(utils.queryByText(RANGE_FL_OZ)).toBeNull();
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyHydrationTarget: ml });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ dailyHydrationTarget: ml });
  });

  it.each(['84.55', '84,55', '-84.5', '+84.5', '8e1', '84.5abc', '.5', '84..5', '84.5.1', '84 .5', '1,000'])(
    'rejeita "%s": erro com a faixa em fl oz e "Salvar" desabilitado',
    (text) => {
      const utils = renderScreen();

      utils.type(utils.hydration, text);
      expect(utils.getByText(RANGE_FL_OZ)).toBeTruthy();
      expect(utils.getByRole('button', SAVE)).toBeDisabled();
    },
  );

  it.each([
    ['16.9', false],
    ['17.0', true],
    ['17', true],
    ['270.5', true],
    ['270.6', false],
  ])('limites derivados do shared: "%s" válido = %s', (text, valid) => {
    const utils = renderScreen();

    utils.type(utils.hydration, text);
    if (valid) {
      expect(utils.queryByText(RANGE_FL_OZ)).toBeNull();
      expect(utils.getByRole('button', SAVE)).toBeEnabled();
    } else {
      expect(utils.getByText(RANGE_FL_OZ)).toBeTruthy();
      expect(utils.getByRole('button', SAVE)).toBeDisabled();
    }
  });

  it('os extremos válidos viram ml dentro da faixa do backend (17.0 -> 503, 270.5 -> 8000)', async () => {
    const utils = renderScreen();

    utils.type(utils.hydration, '17.0');
    await pressSave(utils);
    expect(mockApiPatch).toHaveBeenLastCalledWith('/users/me', { dailyHydrationTarget: 503 });

    const second = renderScreen();
    second.type(second.hydration, '270.5');
    await pressSave(second);
    expect(mockApiPatch).toHaveBeenLastCalledWith('/users/me', { dailyHydrationTarget: 8000 });
  });

  it('abrir e salvar sem mexer na hidratação não a manda (nem invalida hydrationToday)', async () => {
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyProteinTarget: 180 });
    const keys = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).not.toContainEqual(QUERY_KEYS.hydrationToday);
  });

  it.each(['84.5', '84,5', ' 84.5 ', '084.5'])(
    'digitar de volta o valor exibido ("%s") não conta como mudança: nada a salvar e sem confirmação ao sair',
    (text) => {
      const utils = renderScreen();

      utils.type(utils.hydration, text);
      expect(utils.getByRole('button', SAVE)).toBeDisabled();
      const event = leaveWithGuard();
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );

  it('valor exibido igual ao salvo mais outra mudança: o PATCH não leva a hidratação (2500 não vira 2499)', async () => {
    const utils = renderScreen();

    utils.type(utils.hydration, '84,5');
    utils.type(utils.calories, '2100');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyCalorieTarget: 2100 });
    const keys = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).not.toContainEqual(QUERY_KEYS.hydrationToday);
  });

  it('500 ml salvos aparecem como 16.9: redigitar 16.9 não é erro nem bloqueia salvar outro campo', async () => {
    const utils = renderScreen({ ...PROFILE, dailyHydrationTarget: 500 });

    utils.type(utils.hydration, '16,9');
    expect(utils.queryByText(RANGE_FL_OZ)).toBeNull();
    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyProteinTarget: 180 });
  });

  it('trocar o valor manda ml inteiro e invalida hydrationToday', async () => {
    const utils = renderScreen();

    utils.type(utils.hydration, '101.4');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyHydrationTarget: 2999 });
    const keys = utils.invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(QUERY_KEYS.userProfile);
    expect(keys).toContainEqual(QUERY_KEYS.hydrationToday);
  });

  it('depois de salvar (com avisos de outro campo), o campo volta a mostrar o salvo em fl oz', async () => {
    mockApiPatch.mockImplementation(() =>
      patchResponse({ warnings: [warning('macros/protein-above-range', 'dailyProteinTarget')] }),
    );
    const utils = renderScreen();

    utils.type(utils.hydration, '101.4');
    utils.type(utils.protein, '400');
    await pressSave(utils);

    expect(utils.hydration.props.value).toBe('101.4');
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });
});
