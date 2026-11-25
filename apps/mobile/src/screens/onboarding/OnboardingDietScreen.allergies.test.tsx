// CP-B6 — onboarding: a pergunta "Você tem alguma alergia?" é opcional, fica
// junto da dieta, grava no store e pode ser pulada.
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

beforeEach(() => {
  navigate.mockReset();
  mockLayoutStep.mockReset();
  act(() => {
    useOnboardingStore.getState().resetOnboarding();
  });
});

describe('OnboardingDietScreen — alergias (CP-B6)', () => {
  it('a seção opcional aparece com os 8 botões e o texto de honestidade', () => {
    const utils = render(<OnboardingDietScreen navigation={{ navigate }} />);
    expect(utils.getByTestId('onboarding-allergies-section')).toBeTruthy();
    expect(utils.getByText('allergies.picker.title')).toBeTruthy();
    expect(utils.getByTestId('allergy-option-peanut')).toBeTruthy();
    expect(utils.getByText('allergies.picker.honesty')).toBeTruthy();
  });

  it('marcar grava no store; dá para seguir sem marcar nada (pular)', () => {
    const utils = render(<OnboardingDietScreen navigation={{ navigate }} />);
    fireEvent.press(utils.getByTestId('allergy-option-sesame'));
    expect(useOnboardingStore.getState().allergies).toEqual({ common: ['sesame'], custom: [] });

    fireEvent.press(utils.getByTestId('allergy-option-sesame'));
    fireEvent.press(utils.getByText('onboarding.diet.continueNoRestrictions'));
    expect(navigate).toHaveBeenCalledWith('OnboardingBody');
    expect(useOnboardingStore.getState().allergies).toEqual({ common: [], custom: [] });
  });

  it('resetOnboarding limpa as alergias', () => {
    act(() => {
      useOnboardingStore.getState().setAllergies({ common: ['egg'], custom: ['kiwi'] });
      useOnboardingStore.getState().resetOnboarding();
    });
    expect(useOnboardingStore.getState().allergies).toEqual({ common: [], custom: [] });
  });
});
