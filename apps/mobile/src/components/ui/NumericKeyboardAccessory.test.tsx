// Barra "Próximo/Concluir" acima do teclado numérico do iOS.
import { fireEvent, render } from '@testing-library/react-native';
import { InputAccessoryView, Keyboard, Platform } from 'react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

import { NumericKeyboardAccessory, keyboardAccessoryId } from './NumericKeyboardAccessory';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NumericKeyboardAccessory — iOS', () => {
  it('fica no InputAccessoryView com o nativeID dos campos', () => {
    const utils = render(<NumericKeyboardAccessory isLastField={false} nativeID="bar-id" onNext={jest.fn()} />);
    expect(utils.UNSAFE_getByType(InputAccessoryView).props.nativeID).toBe('bar-id');
    expect(keyboardAccessoryId('bar-id')).toBe('bar-id');
  });

  it('"Próximo" chama onNext (a tela foca o campo seguinte) e não fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const onNext = jest.fn();
    const utils = render(<NumericKeyboardAccessory isLastField={false} nativeID="bar-id" onNext={onNext} />);

    expect(utils.queryByText('nutritionGoals.done')).toBeNull();
    fireEvent.press(utils.getByText('nutritionGoals.next'));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(dismissSpy).not.toHaveBeenCalled();
  });

  it('"Concluir" (último campo) fecha o teclado e não chama onNext', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const onNext = jest.fn();
    const utils = render(<NumericKeyboardAccessory isLastField nativeID="bar-id" onNext={onNext} />);

    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    fireEvent.press(utils.getByText('nutritionGoals.done'));

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('NumericKeyboardAccessory — Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('não renderiza nada e os campos não se ligam a barra nenhuma', () => {
    const utils = render(<NumericKeyboardAccessory isLastField={false} nativeID="bar-id" onNext={jest.fn()} />);

    expect(utils.UNSAFE_queryByType(InputAccessoryView)).toBeNull();
    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    expect(keyboardAccessoryId('bar-id')).toBeUndefined();
  });
});
