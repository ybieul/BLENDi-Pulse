// Tela de modelo (passo 1 de 5): 5 cards (3 BLENDi + "outro modelo" + "ainda não
// tenho"), badges de potência certos, campo opcional de marca/modelo só em
// "other" (máx. 60) e o que cada opção grava na store.
import { act, fireEvent, render } from '@testing-library/react-native';
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

import { useOnboardingStore } from '../../store/onboarding.store';
import { OnboardingModelScreen } from './OnboardingModelScreen';

const navigate = jest.fn();
const store = () => useOnboardingStore.getState();

function renderScreen() {
  return render(<OnboardingModelScreen navigation={{ navigate }} />);
}

beforeEach(() => {
  navigate.mockReset();
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
