// Teste no build EAS (25-26/11): a Home cumprimenta pelo PRIMEIRO nome e um
// texto longo fica numa linha com reticências, sem passar por baixo do nível
// e do badge do plano (antes eles eram absolutos por cima do texto).
import { render } from '@testing-library/react-native';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { getDisplayFirstName } from '@blendi/shared';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

import { HomeGreetingHeader } from './HomeGreetingHeader';

type StyledNode = { props: { [propName: string]: unknown } };
const styleOf = (node: StyledNode): ViewStyle => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

const LONG_FIRST_NAME = 'Maximiliano-Bartolomeu-Constantino-Aurelianoooooo';

function renderHeader(greeting: string) {
  return render(
    <HomeGreetingHeader
      greeting={greeting}
      formattedDate="quinta-feira, 26 de novembro"
      level={3}
      levelProgressWidth={new Animated.Value(10)}
      isPro={false}
      onLevelPress={jest.fn()}
    />,
  );
}

describe('HomeGreetingHeader', () => {
  it('saudação usa só o primeiro nome (firstName; sem ele, a 1ª palavra do name)', () => {
    expect(`Bom dia, ${getDisplayFirstName({ firstName: 'Gabriel', name: 'Gabriel Barboza da Silva' })}.`).toBe('Bom dia, Gabriel.');
    expect(getDisplayFirstName({ name: 'Gabriel Barboza da Silva' })).toBe('Gabriel');
  });

  it('nome bem longo: uma linha com reticências no fim', () => {
    const { getByTestId } = renderHeader(`Bom dia, ${LONG_FIRST_NAME}.`);
    const greeting = getByTestId('home-greeting');

    expect(greeting.props.numberOfLines).toBe(1);
    expect(greeting.props.ellipsizeMode).toBe('tail');
    expect(greeting.props.children).toBe(`Bom dia, ${LONG_FIRST_NAME}.`);
  });

  it('o texto ocupa só o espaço que sobra; nível e badge ficam ao lado, sem sobrepor', () => {
    const { getByTestId } = renderHeader(`Bom dia, ${LONG_FIRST_NAME}.`);

    const container = styleOf(getByTestId('home-greeting-header'));
    const textBlock = styleOf(getByTestId('home-greeting-text-block'));
    const actions = styleOf(getByTestId('home-greeting-actions'));

    expect(container.flexDirection).toBe('row');
    expect(textBlock.flex).toBe(1);
    expect(textBlock.minWidth).toBe(0);
    expect(actions.flexShrink).toBe(0);
    expect(actions.position).toBeUndefined();
  });

  it('nível e badge continuam lá, com rótulo acessível no nível', () => {
    const { getByRole, getByText } = renderHeader('Bom dia, Gabriel.');

    expect(getByRole('button', { name: 'gamification.levelPrefix 3' })).toBeTruthy();
    expect(getByText('home.freePlan')).toBeTruthy();
  });
});
