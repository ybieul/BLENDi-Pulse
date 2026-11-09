// O indicador de progresso do onboarding passou de 4 para 5 passos
// (Model, Goal, Diet, Body, Macros).
import { render } from '@testing-library/react-native';
import { View } from 'react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ getParent: () => undefined, canGoBack: () => false, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('./AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('./AuthProgressDots', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { Text } = require('react-native');
  return {
    AuthProgressDots: ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
      <Text>{`dots:${currentStep}/${totalSteps}`}</Text>
    ),
  };
});

import { OnboardingLayout } from './OnboardingLayout';

describe('OnboardingLayout — 5 passos', () => {
  it.each([1, 2, 3, 4, 5] as const)('passo %i mostra o indicador "%i/5"', (step) => {
    const { getByText } = render(
      <OnboardingLayout step={step} topContent={<View />} bottomContent={<View />} />
    );

    expect(getByText(`dots:${step}/5`)).toBeTruthy();
  });
});
