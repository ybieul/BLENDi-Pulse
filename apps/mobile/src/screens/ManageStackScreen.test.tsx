// ManageStackScreen — "Meta diária" (teclado numérico): no iPhone, a barra
// NumericKeyboardAccessory dá o "Concluir"; no Android, a tecla de ação fecha.
// A leitura do campo (só dígitos) e o maxLength não mudam.
import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, TextInput } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

jest.mock('../store/network.store', () => ({
  useNetworkStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ isConnected: true }),
}));

jest.mock('../utils/toast.utils', () => ({ showToast: jest.fn() }));

import { ManageStackScreen } from './ManageStackScreen';

function openForm() {
  const onAdd = jest.fn();
  const utils = render(<ManageStackScreen onAdd={onAdd} />);
  fireEvent.press(utils.getByRole('button', { name: 'track.addSupplement' }));
  const [name, dosage, dailyTarget] = utils.UNSAFE_getAllByType(TextInput) as [
    ReactTestInstance,
    ReactTestInstance,
    ReactTestInstance,
  ];
  return { ...utils, onAdd, name, dosage, dailyTarget };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ManageStackScreen — "Meta diária" no iOS', () => {
  it('o campo se liga à barra e "Concluir" fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = openForm();

    expect(utils.dailyTarget.props.inputAccessoryViewID).toBeTruthy();
    // Nome e dosagem continuam como antes (teclado de texto, sem barra).
    expect(utils.name.props.inputAccessoryViewID).toBeUndefined();
    expect(utils.dosage.props.inputAccessoryViewID).toBeUndefined();

    fireEvent(utils.dailyTarget, 'focus');
    expect(utils.queryByText('nutritionGoals.next')).toBeNull();
    fireEvent.press(utils.getByText('nutritionGoals.done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('leitura, maxLength e teclado não mudam', () => {
    const utils = openForm();
    expect(utils.dailyTarget.props.keyboardType).toBe('number-pad');
    expect(utils.dailyTarget.props.maxLength).toBe(2);
    expect(utils.dailyTarget.props.returnKeyType).toBe('done');

    fireEvent.changeText(utils.dailyTarget, '1a2');
    expect(utils.dailyTarget.props.value).toBe('12');
  });

  it('o "Próximo" da dosagem continua levando à meta diária', () => {
    const utils = openForm();
    const focus = jest.fn();
    (utils.dailyTarget.instance as { focus: () => void }).focus = focus;
    fireEvent(utils.dosage, 'submitEditing');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('o formulário salva como antes', () => {
    const utils = openForm();
    fireEvent.changeText(utils.name, 'Creatina');
    fireEvent.changeText(utils.dailyTarget, '3');
    fireEvent.press(utils.getByRole('button', { name: 'track.save' }));
    expect(utils.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Creatina', dailyTargetCount: 3 }));
  });
});

describe('ManageStackScreen — "Meta diária" no Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('sem barra; a tecla de ação ("done") fecha o teclado', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const utils = openForm();

    expect(utils.queryByText('nutritionGoals.done')).toBeNull();
    expect(utils.dailyTarget.props.inputAccessoryViewID).toBeUndefined();
    expect(utils.dailyTarget.props.returnKeyType).toBe('done');

    fireEvent(utils.dailyTarget, 'submitEditing');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });
});
