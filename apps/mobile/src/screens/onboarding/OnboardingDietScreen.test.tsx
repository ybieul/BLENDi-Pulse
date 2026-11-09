// Tela de dieta (passo 3 de 5): múltipla escolha com toggle, seguir sem marcar
// nada, alerta de alergia e navegação para a tela de corpo. A store é a real
// (e o SelectionCard também); só tema, i18n e o layout são mockados — mesmo
// padrão de OnboardingMacrosScreen.test.tsx.
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const mockLayoutStep = jest.fn();
jest.mock('../../components/ui/OnboardingLayout', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { View } = require('react-native');
  return {
    OnboardingLayout: ({ step, topContent, bottomContent }: { step: number; topContent: unknown; bottomContent: unknown }) => {
      mockLayoutStep(step);
      return (
        <View>
          <View>{topContent}</View>
          <View>{bottomContent}</View>
        </View>
      );
    },
  };
});

import { useOnboardingStore } from '../../store/onboarding.store';
import { OnboardingDietScreen } from './OnboardingDietScreen';

const navigate = jest.fn();

function renderScreen() {
  return render(<OnboardingDietScreen navigation={{ navigate }} />);
}

const DIET_TITLES = [
  'onboarding.diet.dairyFree',
  'onboarding.diet.vegan',
  'onboarding.diet.nutFree',
  'onboarding.diet.noAddedSugar',
];

beforeEach(() => {
  navigate.mockReset();
  mockLayoutStep.mockReset();
  act(() => {
    useOnboardingStore.getState().resetOnboarding();
  });
});

describe('OnboardingDietScreen', () => {
  it('é o passo 3 e mostra título, subtítulo, os 4 cards e o alerta de alergia', () => {
    const { getByText } = renderScreen();

    expect(mockLayoutStep).toHaveBeenCalledWith(3);
    expect(getByText('onboarding.diet.title')).toBeTruthy();
    expect(getByText('onboarding.diet.subtitle')).toBeTruthy();
    for (const title of DIET_TITLES) expect(getByText(title)).toBeTruthy();
    expect(getByText('onboarding.diet.disclaimer')).toBeTruthy();
  });

  it('nada marcado: botão habilitado com o texto de "Sem restrições" e segue para a tela de corpo', () => {
    const { getByRole, queryByRole } = renderScreen();

    const button = getByRole('button', { name: 'onboarding.diet.continueNoRestrictions' });
    expect(button).not.toBeDisabled();
    expect(queryByRole('button', { name: 'onboarding.continue' })).toBeNull();

    fireEvent.press(button);

    expect(navigate).toHaveBeenCalledWith('OnboardingBody');
    expect(useOnboardingStore.getState().dietaryPreferences).toEqual([]);
  });

  it('tocar marca e tocar de novo desmarca; o texto do botão acompanha', () => {
    const { getByText, getByRole, queryByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.diet.vegan'));
    expect(useOnboardingStore.getState().dietaryPreferences).toEqual(['vegan']);
    expect(getByRole('button', { name: 'onboarding.continue' })).toBeTruthy();
    expect(queryByRole('button', { name: 'onboarding.diet.continueNoRestrictions' })).toBeNull();

    fireEvent.press(getByText('onboarding.diet.vegan'));
    expect(useOnboardingStore.getState().dietaryPreferences).toEqual([]);
    expect(getByRole('button', { name: 'onboarding.diet.continueNoRestrictions' })).toBeTruthy();
  });

  it('múltipla escolha: marca as 4 e o estado selecionado aparece nos cards', () => {
    const { getByText, getAllByRole } = renderScreen();

    for (const title of DIET_TITLES) fireEvent.press(getByText(title));

    expect(useOnboardingStore.getState().dietaryPreferences).toEqual([
      'dairy_free',
      'vegan',
      'nut_free',
      'no_added_sugar',
    ]);
    // 4 cards selecionados (o botão de continuar não tem estado "selected").
    expect(getAllByRole('button', { selected: true })).toHaveLength(4);
  });

  it('continuar com seleção também navega para a tela de corpo e mantém a escolha na store', () => {
    const { getByText, getByRole } = renderScreen();

    fireEvent.press(getByText('onboarding.diet.nutFree'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(navigate).toHaveBeenCalledWith('OnboardingBody');
    expect(useOnboardingStore.getState().dietaryPreferences).toEqual(['nut_free']);
  });
});
