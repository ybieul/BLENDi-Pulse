// Tela de modelo (passo 1 de 5): 5 cards (3 BLENDi + "outro modelo" + "ainda não
// tenho"), badges de potência certos, campo opcional de marca/modelo só em
// "other" (máx. 60) e o que cada opção grava na store.
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../components/ui/OnboardingLayout', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
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

// Teste no build EAS (25-26/11): a etapa de nome usa o usuário logado e o
// PATCH /users/me — os dois simulados aqui (sem rede, sem SecureStore).
const mockPatch = jest.fn<Promise<unknown>, [string, unknown]>();
jest.mock('../../config/api', () => ({
  api: { patch: (url: string, body: unknown) => mockPatch(url, body) },
}));

let mockAuthUser: Record<string, unknown> | null = null;
const mockUpdateUserProfile = jest.fn();
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: mockAuthUser, updateUserProfile: mockUpdateUserProfile }),
}));

import { useOnboardingStore } from '../../store/onboarding.store';
import { OnboardingModelScreen } from './OnboardingModelScreen';

const navigate = jest.fn();
const store = () => useOnboardingStore.getState();

function renderScreen() {
  return render(<OnboardingModelScreen navigation={{ navigate }} />);
}

beforeEach(() => {
  navigate.mockReset();
  mockPatch.mockReset();
  mockUpdateUserProfile.mockReset();
  mockAuthUser = null;
  act(() => {
    store().resetOnboarding();
  });
});

describe('OnboardingModelScreen', () => {
  it('mostra as 5 opções e os badges de potência corretos (70W, 120W, 180W), sem "Starter"', () => {
    const { getByText, queryByText } = renderScreen();

    for (const title of [
      'onboarding.model.lite.name',
      'onboarding.model.pro_plus.name',
      'onboarding.model.steel.name',
      'onboarding.modelOtherTitle',
      'onboarding.modelNoneTitle',
    ]) {
      expect(getByText(title)).toBeTruthy();
    }

    expect(getByText('70W')).toBeTruthy();
    expect(getByText('120W')).toBeTruthy();
    expect(getByText('180W')).toBeTruthy();
    expect(queryByText('Starter')).toBeNull();

    // As duas novas têm descrição curta e nenhum badge de potência.
    expect(getByText('onboarding.modelOtherDesc')).toBeTruthy();
    expect(getByText('onboarding.modelNoneDesc')).toBeTruthy();
  });

  it('continuar começa desabilitado e só habilita depois de escolher', () => {
    const { getByRole, getByText } = renderScreen();

    expect(getByRole('button', { name: 'onboarding.continue' })).toBeDisabled();

    fireEvent.press(getByText('onboarding.model.steel.name'));

    expect(getByRole('button', { name: 'onboarding.continue' })).not.toBeDisabled();
  });

  it('BLENDi atual grava o modelo com posse "blendi" e não mostra o campo de texto', () => {
    const { getByText, UNSAFE_queryAllByType } = renderScreen();

    fireEvent.press(getByText('onboarding.model.steel.name'));

    expect(store().selectedModel).toBe('Steel');
    expect(store().blendiOwnership).toBe('blendi');
    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  });

  it('"Other or older model": grava Lite + posse "other" e mostra o campo opcional (máx. 60)', () => {
    const { getByText, UNSAFE_getAllByType, getByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.modelOtherTitle'));

    expect(store().selectedModel).toBe('Lite');
    expect(store().blendiOwnership).toBe('other');

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.props.maxLength).toBe(60);

    fireEvent.changeText(inputs[0], 'Ninja BN401');
    expect(store().otherBlenderModel).toBe('Ninja BN401');

    // O botão não depende do texto: já estava habilitado antes de digitar.
    expect(getByRole('button', { name: 'onboarding.continue' })).not.toBeDisabled();
  });

  it('continuar com "other" e o campo vazio funciona (campo é opcional)', () => {
    const { getByText, getByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.modelOtherTitle'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(store().otherBlenderModel).toBe('');
    expect(navigate).toHaveBeenCalledWith('OnboardingGoal');
  });

  it('"No BLENDi yet": grava Lite + posse "none" e esconde o campo', () => {
    const { getByText, UNSAFE_queryAllByType } = renderScreen();

    fireEvent.press(getByText('onboarding.modelOtherTitle'));
    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(1);

    fireEvent.press(getByText('onboarding.modelNoneTitle'));

    expect(store().selectedModel).toBe('Lite');
    expect(store().blendiOwnership).toBe('none');
    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  });

  it('só um card fica selecionado por vez', () => {
    const { getByText, getAllByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.modelOtherTitle'));
    fireEvent.press(getByText('onboarding.model.pro_plus.name'));

    expect(getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(store().selectedModel).toBe('ProPlus');
    expect(store().blendiOwnership).toBe('blendi');
  });
});

describe('OnboardingModelScreen — nome a confirmar (Apple/Google sem nome real)', () => {
  const pendingUser = {
    id: 'u1',
    email: 'biel782003@privaterelay.appleid.com',
    name: 'biel782003 Silva',
    firstName: 'biel782003',
    lastName: 'Silva',
    nameNeedsConfirmation: true,
  };

  it('conta sem a marca: nenhum campo de nome, continua direto', () => {
    mockAuthUser = { id: 'u1', name: 'Gabriel Silva', nameNeedsConfirmation: false };
    const { getByText, getByRole, queryByTestId } = renderScreen();

    expect(queryByTestId('onboarding-name-step')).toBeNull();
    fireEvent.press(getByText('onboarding.model.steel.name'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('OnboardingGoal');
  });

  it('conta "a confirmar": mostra Nome (vazio) e Sobrenome (o real, já preenchido)', () => {
    mockAuthUser = pendingUser;
    const { getByTestId } = renderScreen();

    expect(getByTestId('onboarding-name-step')).toBeTruthy();
    expect(getByTestId('onboarding-name-first').props.value).toBe('');
    expect(getByTestId('onboarding-name-last').props.value).toBe('Silva');
  });

  it('Nome vazio: mostra o erro e não salva nem avança', () => {
    mockAuthUser = pendingUser;
    const { getByText, getByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.model.lite.name'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(getByText('errors.validation.required')).toBeTruthy();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Nome preenchido: PATCH só com firstName/lastName limpos, atualiza o usuário e avança', async () => {
    mockAuthUser = pendingUser;
    mockPatch.mockResolvedValue({ data: {} });
    const { getByText, getByRole, getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('onboarding-name-first'), '  Gabriel ');
    fireEvent.press(getByText('onboarding.model.lite.name'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('OnboardingGoal'));
    expect(mockPatch).toHaveBeenCalledWith('/users/me', { firstName: 'Gabriel', lastName: 'Silva' });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({
      firstName: 'Gabriel',
      lastName: 'Silva',
      name: 'Gabriel Silva',
      nameNeedsConfirmation: false,
    });
  });

  it('falha ao salvar: mostra o erro e não avança', async () => {
    mockAuthUser = pendingUser;
    mockPatch.mockRejectedValue(new Error('offline'));
    const { getByText, getByRole, getByTestId, findByText } = renderScreen();

    fireEvent.changeText(getByTestId('onboarding-name-first'), 'Gabriel');
    fireEvent.press(getByText('onboarding.model.lite.name'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(await findByText('errors.network_internal_server_error')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a marca chega depois do primeiro render (hydrate do login): a etapa aparece', () => {
    mockAuthUser = null;
    const utils = renderScreen();
    expect(utils.queryByTestId('onboarding-name-step')).toBeNull();

    mockAuthUser = pendingUser;
    utils.rerender(<OnboardingModelScreen navigation={{ navigate }} />);

    expect(utils.getByTestId('onboarding-name-step')).toBeTruthy();
    expect(utils.getByTestId('onboarding-name-last').props.value).toBe('Silva');
  });
});
