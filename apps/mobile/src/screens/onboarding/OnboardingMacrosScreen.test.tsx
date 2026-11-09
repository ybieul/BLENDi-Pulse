// Reproduz o relato do usuário: no fluxo de onboarding, após "Pular por agora"
// na tela de corpo, o usuário chega em OnboardingMacros com os 3 campos vazios,
// preenche manualmente proteína/calorias/carboidratos e aperta "Finalizar
// configuração" — e, segundo o relato, nada acontece.
//
// useColors/useAppTranslation são mockados (identidade) pra isolar da store de
// tema (MMKV) e do i18next real, igual ao padrão já usado em StepModeView.test.tsx.
// OnboardingLayout é mockado pra só renderizar topContent/bottomContent, sem
// precisar de NavigationContainer/safe-area-context reais.
//
// Os mocks de store constroem o objeto de estado DENTRO da própria factory
// (não a partir de uma variável `let` externa) — mesmo padrão já usado em
// useAppleAuth.test.tsx. Referenciar um objeto pré-construído externamente
// aqui disparou uma peculiaridade real de hoisting do babel-plugin-jest-hoist
// (jest.mock() é hoisted acima de `const`/`let` não prefixados com "mock",
// então o objeto externo capturava os jest.fn() como `undefined`).
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import axios from 'axios';

// require() dentro das factories abaixo (não import estático no topo) é
// deliberado: o babel-plugin-jest-hoist recusa (ReferenceError em build-time)
// qualquer referência a uma variável fora do escopo da factory que não
// comece com "mock" — só fazendo o require() de forma lazy, dentro da própria
// factory, é que `lightColors`/`View` ficam disponíveis sem violar essa regra.
jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- ver comentário acima
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- ver comentário acima
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('../../components/ui/OnboardingLayout', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- ver comentário acima
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

const mockPatch = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../../config/api', () => ({
  api: { patch: (...args: unknown[]) => mockPatch(...args) },
}));

const mockUpdateUserProfile = jest.fn();
const mockCompleteOnboarding = jest.fn();
jest.mock('../../store/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      updateUserProfile: mockUpdateUserProfile,
      completeOnboarding: mockCompleteOnboarding,
    }),
  },
}));

const mockResetOnboarding = jest.fn();
// Sobrescritas por teste (modelo/posse/dieta). Lida só quando o selector roda
// (render), nunca na factory — por isso o prefixo "mock" basta para o hoisting.
let mockOnboardingOverrides: Record<string, unknown> = {};
jest.mock('../../store/onboarding.store', () => ({
  useOnboardingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    // Estado inline = exatamente o resultado do fluxo "Pular por agora":
    // nenhum dado corporal, nenhuma macro pré-calculada.
    selector({
      selectedModel: 'Lite',
      blendiOwnership: 'blendi',
      otherBlenderModel: '',
      dietaryPreferences: [],
      selectedGoal: 'Wellness',
      unitSystem: 'metric',
      weight: null,
      height: null,
      birthDate: null,
      biologicalSex: null,
      weightGoal: null,
      activityLevel: null,
      calculatedProtein: null,
      calculatedCalories: null,
      calculatedCarbs: null,
      ...mockOnboardingOverrides,
      resetOnboarding: mockResetOnboarding,
    }),
}));

import { OnboardingMacrosScreen } from './OnboardingMacrosScreen';

function renderScreen() {
  return render(
    // @ts-expect-error -- props de navegação não são usadas pelo componente
    <OnboardingMacrosScreen />
  );
}

function fillValidMacrosAndFinish(
  utils: ReturnType<typeof renderScreen>,
) {
  const inputs = utils.UNSAFE_getAllByType(TextInput);
  fireEvent.changeText(inputs[0], '150'); // protein
  fireEvent.changeText(inputs[1], '2000'); // calories
  fireEvent.changeText(inputs[2], '200'); // carbs
  fireEvent.press(utils.getByRole('button', { name: 'onboarding.finishSetup' }));
}

const BASE_MACROS_PAYLOAD = {
  goal: 'Wellness',
  dailyProteinTarget: 150,
  dailyCalorieTarget: 2000,
  dailyCarbTarget: 200,
  unitSystem: 'metric',
};

beforeEach(() => {
  mockOnboardingOverrides = {};
  mockPatch.mockReset();
  mockUpdateUserProfile.mockReset();
  mockCompleteOnboarding.mockReset().mockResolvedValue(undefined);
  mockResetOnboarding.mockReset();
});

describe('OnboardingMacrosScreen — botão "Finalizar configuração"', () => {
  it('começa desabilitado com os campos vazios (fluxo "Pular por agora")', () => {
    const { getByRole } = renderScreen();

    expect(getByRole('button', { name: 'onboarding.finishSetup' })).toBeDisabled();
  });

  it('carboidratos fora do range (50-800g) mantém o botão desabilitado, mas agora mostra o motivo', () => {
    const { getByRole, getByText, UNSAFE_getAllByType } = renderScreen();
    const inputs = UNSAFE_getAllByType(TextInput);

    // Valor plausível para quem não sabe dos limites internos (ex.: dieta
    // low-carb com 30g) — mesmo agora que macroRecommendation menciona a
    // faixa de carboidratos, o erro inline por campo continua garantindo
    // que o motivo apareça no exato campo que está fora do range.
    fireEvent.changeText(inputs[0], '150'); // protein válido
    fireEvent.changeText(inputs[1], '2000'); // calories válido
    fireEvent.changeText(inputs[2], '30'); // carbs INVÁLIDO (min 50g)

    expect(getByRole('button', { name: 'onboarding.finishSetup' })).toBeDisabled();
    expect(getByText('errors.validation.number_range:{"min":50,"max":800}')).toBeTruthy();
  });

  it('habilita o botão e dispara o PATCH ao preencher valores válidos', async () => {
    const { getByRole, UNSAFE_getAllByType } = renderScreen();

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(3);

    fireEvent.changeText(inputs[0], '150'); // protein
    fireEvent.changeText(inputs[1], '2000'); // calories
    fireEvent.changeText(inputs[2], '200'); // carbs

    const button = getByRole('button', { name: 'onboarding.finishSetup' });
    expect(button).not.toBeDisabled();

    fireEvent.press(button);

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));

    expect(mockPatch).toHaveBeenCalledWith('/users/me', {
      blendiModel: 'Lite',
      blendiOwnership: 'blendi',
      dietaryPreferences: [],
      goal: 'Wellness',
      dailyProteinTarget: 150,
      dailyCalorieTarget: 2000,
      dailyCarbTarget: 200,
      unitSystem: 'metric',
    });

    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockResetOnboarding).toHaveBeenCalledTimes(1));
  });

  it('mostra mensagem de erro visível quando o PATCH falha (não fica em silêncio)', async () => {
    mockPatch.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { data: { code: 'resource/not-found' } },
      })
    );
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    const { getByRole, getByText, UNSAFE_getAllByType } = renderScreen();
    const inputs = UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(inputs[0], '150');
    fireEvent.changeText(inputs[1], '2000');
    fireEvent.changeText(inputs[2], '200');

    fireEvent.press(getByRole('button', { name: 'onboarding.finishSetup' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText(/errors\./)).toBeTruthy());

    expect(mockCompleteOnboarding).not.toHaveBeenCalled();

    jest.spyOn(axios, 'isAxiosError').mockRestore();
  });
});

describe('OnboardingMacrosScreen — posse do liquidificador e dieta no PATCH', () => {
  it('"Other or older model" com texto: Lite, posse "other", texto com trim e dietas', async () => {
    mockOnboardingOverrides = {
      selectedModel: 'Lite',
      blendiOwnership: 'other',
      otherBlenderModel: '  Ninja BN401  ',
      dietaryPreferences: ['vegan', 'nut_free'],
    };

    fillValidMacrosAndFinish(renderScreen());

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/users/me', {
      ...BASE_MACROS_PAYLOAD,
      blendiModel: 'Lite',
      blendiOwnership: 'other',
      otherBlenderModel: 'Ninja BN401',
      dietaryPreferences: ['vegan', 'nut_free'],
    });
    await waitFor(() => expect(mockResetOnboarding).toHaveBeenCalledTimes(1));
  });

  it('"Other or older model" sem texto: não envia otherBlenderModel', async () => {
    mockOnboardingOverrides = {
      selectedModel: 'Lite',
      blendiOwnership: 'other',
      otherBlenderModel: '   ',
    };

    fillValidMacrosAndFinish(renderScreen());

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/users/me', {
      ...BASE_MACROS_PAYLOAD,
      blendiModel: 'Lite',
      blendiOwnership: 'other',
      dietaryPreferences: [],
    });
    await waitFor(() => expect(mockResetOnboarding).toHaveBeenCalledTimes(1));
  });

  it('"No BLENDi yet": modelo Lite, posse "none" e sem texto (mesmo com texto antigo no store)', async () => {
    mockOnboardingOverrides = {
      selectedModel: 'Lite',
      blendiOwnership: 'none',
      // Digitado antes de trocar de "Other" para "No BLENDi yet".
      otherBlenderModel: 'NutriBullet',
      dietaryPreferences: ['dairy_free'],
    };

    fillValidMacrosAndFinish(renderScreen());

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    const [, payload] = mockPatch.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toEqual({
      ...BASE_MACROS_PAYLOAD,
      blendiModel: 'Lite',
      blendiOwnership: 'none',
      dietaryPreferences: ['dairy_free'],
    });
    expect(payload).not.toHaveProperty('otherBlenderModel');
    await waitFor(() => expect(mockResetOnboarding).toHaveBeenCalledTimes(1));
  });

  it('BLENDi atual (Steel): posse "blendi" e nenhum texto de outro modelo', async () => {
    mockOnboardingOverrides = {
      selectedModel: 'Steel',
      blendiOwnership: 'blendi',
      otherBlenderModel: 'Ninja',
      dietaryPreferences: ['no_added_sugar'],
    };

    fillValidMacrosAndFinish(renderScreen());

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/users/me', {
      ...BASE_MACROS_PAYLOAD,
      blendiModel: 'Steel',
      blendiOwnership: 'blendi',
      dietaryPreferences: ['no_added_sugar'],
    });
    await waitFor(() => expect(mockResetOnboarding).toHaveBeenCalledTimes(1));
  });
});
