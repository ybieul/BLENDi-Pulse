// Ordem final do onboarding: Model, Goal, Diet, Body, Macros. A tela de goal
// agora leva para a de dieta (antes ia direto para a de corpo).
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
import { OnboardingGoalScreen } from './OnboardingGoalScreen';

describe('OnboardingGoalScreen', () => {
  beforeEach(() => {
    mockLayoutStep.mockReset();
    act(() => {
      useOnboardingStore.getState().resetOnboarding();
    });
  });

  it('é o passo 2 e continuar navega para OnboardingDiet (não mais para OnboardingBody)', () => {
    const navigate = jest.fn();
    const { getByText, getByRole } = render(<OnboardingGoalScreen navigation={{ navigate }} />);

    expect(mockLayoutStep).toHaveBeenCalledWith(2);
    expect(getByRole('button', { name: 'onboarding.continue' })).toBeDisabled();

    fireEvent.press(getByText('onboarding.goalMuscle'));
    fireEvent.press(getByRole('button', { name: 'onboarding.continue' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('OnboardingDiet');
  });
});
