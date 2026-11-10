// Pentest da tela "Minhas metas" (CP-1.1.1b): cenários hostis ou de corrida que
// o fluxo feliz não cobre — duplo toque, edição durante o envio, saída da tela
// com o PATCH em voo, resposta malformada do servidor, perfil legado/absurdo,
// zero (falsy) como valor legítimo, vazamento de listeners e entradas enormes.
//
// Mesmo harness de NutritionGoalsScreen.test.tsx (tema/i18n/área segura/API/
// toast/store mockados; React Query, AuthInput, AuthButton e SelectionCard reais).
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard, TextInput, type EmitterSubscription } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
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

import { QUERY_KEYS } from '../config/cache.config';
import { NutritionGoalsScreen } from './NutritionGoalsScreen';

// ─── Harness ──────────────────────────────────────────────────────────────────

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
const RANGE_PROTEIN = 'errors.validation.number_range:{"min":10,"max":800}';

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockUnsubscribeNavigation = jest.fn();
const mockAddListener = jest.fn<() => void, [string, BeforeRemoveListener]>();
const navigation = { goBack: mockGoBack, dispatch: mockDispatch, addListener: mockAddListener };

type KeyboardHandler = (event: unknown) => void;
let keyboardHandlers: Record<string, KeyboardHandler[]> = {};
const mockKeyboardRemove = jest.fn();

function renderScreen(profile: Record<string, unknown> | null = PROFILE, queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (profile) {
    client.setQueryData(QUERY_KEYS.userProfile, { success: true, data: { user: profile } });
  }

  const props = { navigation, route: { key: 'nutrition-goals', name: 'NutritionGoals' } } as unknown as ScreenProps;
  const utils = render(
    <QueryClientProvider client={client}>
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

  return { ...utils, client, protein, carbs, calories, hydration, inputs, type };
}

function ok(user: Record<string, unknown> = {}) {
  return Promise.resolve({ data: { success: true, data: { user: { ...PROFILE, ...user } } } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function propOf(input: ReactTestInstance, name: string): unknown {
  const props: Record<string, unknown> = input.props;
  return props[name];
}

beforeEach(() => {
  jest.restoreAllMocks();
  keyboardHandlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, handler) => {
    (keyboardHandlers[eventName] ??= []).push(handler as KeyboardHandler);
    return { remove: mockKeyboardRemove } as unknown as EmitterSubscription;
  });
  mockKeyboardRemove.mockReset();
  mockUnsubscribeNavigation.mockReset();
  mockAddListener.mockReset().mockImplementation(() => mockUnsubscribeNavigation);
  mockGoBack.mockReset();
  mockDispatch.mockReset();
  mockApiGet.mockReset().mockResolvedValue({ data: { success: true, data: { user: PROFILE } } });
  mockApiPatch.mockReset().mockImplementation(() => ok());
  mockUpdateUserProfile.mockReset();
  mockShowToast.mockReset();
  mockAuthState = {
    user: { dailyProteinTarget: 120, dailyCarbTarget: 150, dailyCalorieTarget: 1800 },
    updateUserProfile: mockUpdateUserProfile,
  };
});

// ─── Corridas: duplo toque, edição e saída durante o envio ────────────────────

describe('pentest — corridas durante o envio', () => {
  it('duplo toque em "Salvar" no mesmo instante envia UM só PATCH', async () => {
    const gate = deferred<unknown>();
    mockApiPatch.mockImplementation(() => gate.promise);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    const save = utils.getByRole('button', SAVE);
    // Dois toques antes de a tela re-renderizar (os dois handlers veem o mesmo estado).
    act(() => {
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await act(async () => {
      gate.resolve(await ok());
    });

    expect(mockApiPatch).toHaveBeenCalledTimes(1);
  });

  it('durante o envio os campos ficam bloqueados (nada digitado depois do toque se perde em silêncio)', async () => {
    const gate = deferred<unknown>();
    mockApiPatch.mockImplementation(() => gate.promise);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    for (const input of utils.inputs()) {
      expect(propOf(input, 'editable')).toBe(false);
    }

    await act(async () => {
      gate.resolve(await ok());
    });
  });

  it('durante o envio, tocar num card de dieta não altera nada', async () => {
    const gate = deferred<unknown>();
    mockApiPatch.mockImplementation(() => gate.promise);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });
    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    await act(async () => {
      gate.resolve(await ok());
    });

    // O PATCH levou só a proteína e a dieta continua a do perfil (1 selecionado: vegan).
    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyProteinTarget: 180 });
    expect(utils.getAllByRole('button', { selected: true })).toHaveLength(1);
  });

  it('sair da tela com o PATCH em voo: ao terminar NÃO chama goBack (não desempilha outra tela)', async () => {
    const gate = deferred<unknown>();
    mockApiPatch.mockImplementation(() => gate.promise);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });
    utils.unmount(); // a pessoa descartou e saiu enquanto o servidor ainda respondia

    await act(async () => {
      gate.resolve(await ok());
    });

    expect(mockGoBack).not.toHaveBeenCalled();
    // O servidor salvou: o resto do app precisa saber (invalidação e usuário local).
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ dailyProteinTarget: 180 });
  });

  it('PATCH em voo que falha depois de a tela sair não quebra nada', async () => {
    const gate = deferred<unknown>();
    mockApiPatch.mockImplementation(() => gate.promise);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });
    utils.unmount();

    await act(async () => {
      gate.reject(new Error('Network Error'));
      await Promise.resolve();
    });

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

// ─── Resposta do servidor fora do contrato ────────────────────────────────────

describe('pentest — resposta do servidor fora do contrato', () => {
  it.each([
    ['corpo vazio', {}],
    ['data nulo', { success: true, data: null }],
    ['sem user', { success: true, data: {} }],
    ['user nulo', { success: true, data: { user: null } }],
    ['HTML de gateway (string)', '<html><body>502 Bad Gateway</body></html>'],
    ['null', null],
  ])('PATCH 200 com %s: a meta foi salva, então a tela conclui normalmente (sem erro falso)', async (_label, body) => {
    mockApiPatch.mockResolvedValue({ data: body });
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(utils.queryByText(/errors\./)).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith('nutritionGoals.saved');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ dailyProteinTarget: 180 });
  });

  it('1.000 avisos repetidos/hostis não travam nem duplicam texto (um aviso por campo)', async () => {
    const warnings = Array.from({ length: 1000 }, (_unused, index) =>
      index % 2 === 0
        ? { field: 'dailyProteinTarget', code: 'macros/protein-above-range', message: '<script>alert(1)</script>' }
        : { field: 'dailyProteinTarget', code: `macros/inventado-${index}`, message: 'x' },
    );
    mockApiPatch.mockImplementation(() => ok({ warnings }));
    const utils = renderScreen();

    utils.type(utils.protein, '800');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(utils.getAllByText('nutritionGoals.warnings.proteinAboveRange')).toHaveLength(1);
    expect(utils.queryByText(/script/)).toBeNull();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('erro HTTP do servidor com code hostil não vaza o texto cru do backend', async () => {
    mockApiPatch.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { data: { code: 'validation/invalid-input', message: '<img src=x onerror=alert(1)>' } },
      }),
    );
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(utils.getByText('errors.validation_invalid_input')).toBeTruthy();
    expect(utils.queryByText(/onerror/)).toBeNull();
  });
});

// ─── Perfil: legado, absurdo, zero e chegada tardia ───────────────────────────

describe('pentest — dados do perfil', () => {
  it('zero é valor legítimo (falsy): carboidrato 0 aparece, e digitar 0 envia 0', async () => {
    const utils = renderScreen({ ...PROFILE, dailyCarbTarget: 0 });
    expect(utils.carbs.props.value).toBe('0');

    utils.type(utils.carbs, '30');
    utils.type(utils.carbs, '0'); // volta ao salvo: não é mudança
    expect(utils.getByRole('button', SAVE)).toBeDisabled();

    const other = renderScreen({ ...PROFILE, dailyCarbTarget: 200 });
    other.type(other.carbs, '0');
    await act(async () => {
      fireEvent.press(other.getAllByRole('button', SAVE)[0] ?? other.getByRole('button', SAVE));
      await Promise.resolve();
    });
    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyCarbTarget: 0 });
  });

  it('conta legada com meta fora da faixa (proteína 5): não acusa erro no campo que a pessoa não tocou e nunca reenvia esse valor', async () => {
    const utils = renderScreen({ ...PROFILE, dailyProteinTarget: 5 });

    expect(utils.protein.props.value).toBe('5');
    expect(utils.queryByText(/errors\.validation\.number_range/)).toBeNull();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();

    utils.type(utils.calories, '2300');
    expect(utils.getByRole('button', SAVE)).not.toBeDisabled();
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyCalorieTarget: 2300 });
  });

  it('campos nulos/ausentes no perfil caem no usuário local (não viram "null" nem "NaN")', () => {
    const utils = renderScreen({
      dailyProteinTarget: null,
      dailyCarbTarget: undefined,
      dailyCalorieTarget: null,
      dailyHydrationTarget: null,
      dietaryPreferences: null,
    });

    expect(utils.protein.props.value).toBe('120');
    expect(utils.carbs.props.value).toBe('150');
    expect(utils.calories.props.value).toBe('1800');
    expect(utils.hydration.props.value).toBe('2500');
    expect(utils.queryByRole('button', { selected: true })).toBeNull();
  });

  it('dieta do perfil com valor desconhecido: marcar uma válida não reenvia o desconhecido', async () => {
    const utils = renderScreen({ ...PROFILE, dietaryPreferences: ['gluten_free', 'vegan'] });

    fireEvent.press(utils.getByText('onboarding.diet.nutFree'));
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dietaryPreferences: ['vegan', 'nut_free'] });
  });

  it('o perfil que chega DEPOIS da digitação não apaga o que a pessoa já digitou', async () => {
    // Sem cache: a tela abre com o usuário local e o perfil só chega depois.
    const gate = deferred<unknown>();
    mockApiGet.mockImplementation(() => gate.promise);
    const utils = renderScreen(null);
    expect(utils.protein.props.value).toBe('120');

    utils.type(utils.protein, '175');
    await act(async () => {
      gate.resolve({ data: { success: true, data: { user: { ...PROFILE, dailyCalorieTarget: 2100 } } } });
      await Promise.resolve();
    });

    // O React Query entrega o dado num tick posterior: espera em vez de adivinhar o tempo.
    await waitFor(() => { expect(utils.inputs()[2]?.props.value).toBe('2100'); }); // não tocado: acompanha o perfil novo
    expect(utils.inputs()[0]?.props.value).toBe('175'); // digitado: preservado
  });
});

// ─── Entradas hostis nos campos ───────────────────────────────────────────────

describe('pentest — entradas hostis nos campos', () => {
  it.each([
    ['notação científica', '1e3'],
    ['hexadecimal', '0x1F4'],
    ['com sinal', '+300'],
    ['negativo', '-300'],
    ['decimal com ponto', '300.5'],
    ['decimal com vírgula', '300,5'],
    ['milhar com ponto', '1.500'],
    ['dígitos de largura total (colados)', '３００'],
    ['dígitos arábico-índicos', '٣٠٠'],
    ['espaço de largura zero colado', '300​'],
    ['tentativa de injeção NoSQL', '{"$gt":0}'],
    ['tentativa de proto-pollution', '__proto__'],
    ['só espaços', '     '],
    ['quebra de linha', '300\n'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
  ])('%s (%j) nunca vira PATCH', async (_label, text) => {
    const utils = renderScreen();
    utils.type(utils.calories, text);

    const trimmedIsDigits = /^\s*\d+\s*$/.test(text);
    if (trimmedIsDigits) {
      return; // ("300\n" é dígito + espaço em branco: o trim() o aceita — coberto abaixo)
    }
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });
    expect(mockApiPatch).not.toHaveBeenCalled();
  });

  it('espaços e quebra de linha nas pontas são aparados: "300\\n" vale 300', async () => {
    const utils = renderScreen();
    utils.type(utils.calories, '   2300\n');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyCalorieTarget: 2300 });
  });

  it('zeros à esquerda não enganam o limite: "0000000150" vale 150', async () => {
    const utils = renderScreen();
    utils.type(utils.protein, '0000000180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyProteinTarget: 180 });
  });

  it('colar 200.000 caracteres não trava a tela e só mostra o erro de faixa', () => {
    const utils = renderScreen();
    const startedAt = Date.now();

    utils.type(utils.protein, '9'.repeat(200_000));

    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(utils.getByText(RANGE_PROTEIN)).toBeTruthy();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });
});

describe('pentest — hidratação imperial (fl oz, decimal)', () => {
  beforeEach(() => {
    mockAuthState = {
      ...mockAuthState,
      user: { ...(mockAuthState.user as Record<string, unknown>), unitSystem: 'imperial' },
    };
  });

  async function pressSave(utils: ReturnType<typeof renderScreen>) {
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });
  }

  it.each([
    ['duas casas', '84.55'],
    ['duas casas com vírgula', '84,55'],
    ['notação científica', '8.4e1'],
    ['notação científica sem ponto', '84e0'],
    ['hexadecimal', '0x54'],
    ['com sinal', '+84.6'],
    ['negativo', '-84.6'],
    ['sem parte inteira', '.6'],
    ['dois separadores', '84.6.1'],
    ['separador misto', '1,084.6'],
    ['dígitos de largura total', '８４.６'],
    ['dígitos arábico-índicos', '٨٤.٦'],
    ['separador decimal arábico', '84٫6'],
    ['espaço de largura zero colado', '84.6​'],
    ['espaço no meio', '84. 6'],
    ['tentativa de injeção NoSQL', '{"$gt":0}'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['só o separador', '.'],
  ])('%s (%j) nunca vira PATCH', async (_label, text) => {
    const utils = renderScreen();
    utils.type(utils.hydration, text);

    expect(utils.getByRole('button', SAVE)).toBeDisabled();
    await pressSave(utils);
    expect(mockApiPatch).not.toHaveBeenCalled();
  });

  it('decimal não vaza para os outros campos: proteína "150.5" segue inválida no imperial', async () => {
    const utils = renderScreen();
    utils.type(utils.protein, '150.5');

    expect(utils.getByRole('button', SAVE)).toBeDisabled();
    await pressSave(utils);
    expect(mockApiPatch).not.toHaveBeenCalled();
  });

  it('espaços nas pontas e "84." no meio da digitação: "  100,\n" vale 100.0 fl oz -> 2957 ml', async () => {
    const utils = renderScreen();
    utils.type(utils.hydration, '  100,\n');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyHydrationTarget: 2957 });
  });

  it('zeros à esquerda não enganam o limite: "0000016.9" continua abaixo de 17.0', () => {
    const utils = renderScreen();
    utils.type(utils.hydration, '0000016.9');

    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it('colar 200.000 dígitos com separador não trava e só mostra o erro de faixa em fl oz', () => {
    const utils = renderScreen();
    const startedAt = Date.now();

    utils.type(utils.hydration, `${'9'.repeat(200_000)}.5`);

    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(
      utils.getByText('errors.validation.number_range:{"min":"17.0","max":"270.5"}'),
    ).toBeTruthy();
    expect(utils.getByRole('button', SAVE)).toBeDisabled();
  });

  it('meta salva fora do comum (ml que não é múltiplo exato de 0,1 fl oz) não é reenviada só por abrir e salvar', async () => {
    const utils = renderScreen({ ...PROFILE, dailyHydrationTarget: 2501 });

    expect(utils.hydration.props.value).toBe('84.6');
    utils.type(utils.hydration, '84.6');
    utils.type(utils.protein, '180');
    await pressSave(utils);

    expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { dailyProteinTarget: 180 });
  });
});

// ─── Ciclo de vida: nada vaza ao sair ─────────────────────────────────────────

describe('pentest — ciclo de vida', () => {
  it('ao sair da tela remove o listener de navegação e TODAS as assinaturas de teclado (as 3 da tela e as do KeyboardAvoidingView)', () => {
    const utils = renderScreen();
    const subscribed = Object.values(keyboardHandlers).flat().length;
    expect(mockAddListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));
    expect(subscribed).toBeGreaterThanOrEqual(3);

    utils.unmount();

    expect(mockUnsubscribeNavigation).toHaveBeenCalled();
    expect(mockKeyboardRemove).toHaveBeenCalledTimes(subscribed);
  });

  it('a tela não escreve nada no console no fluxo normal (nenhum log de dado de saúde)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const utils = renderScreen();

    utils.type(utils.protein, '180');
    await act(async () => {
      fireEvent.press(utils.getByRole('button', SAVE));
      await Promise.resolve();
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
