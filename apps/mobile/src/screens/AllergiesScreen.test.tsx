// CP-B6 — tela "Alergias" do perfil: começa com o que está salvo, "Salvar"
// só com alteração, PATCH só com `allergies`, atualiza o usuário local e
// volta; duplo toque envia um só; erro aparece na tela.
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});
jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('../components/ui/AuthButton', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Pressable, Text } = require('react-native');
  return {
    AuthButton: ({ children, onPress, disabled, testID }: { children: string; onPress: () => void; disabled?: boolean; testID?: string }) => (
      <Pressable testID={testID} onPress={disabled ? undefined : onPress} accessibilityState={{ disabled }}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});
const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.utils', () => ({ showToast: (...args: unknown[]) => { mockShowToast(...args); } }));

const mockPatch = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../config/api', () => ({ api: { patch: (...args: unknown[]) => mockPatch(...args) } }));

const mockUpdateUserProfile = jest.fn();
let mockUser: Record<string, unknown> = {};
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ user: mockUser, updateUserProfile: mockUpdateUserProfile }),
}));

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

import { AllergiesScreen } from './AllergiesScreen';

type Props = Parameters<typeof AllergiesScreen>[0];

const goBack = jest.fn();

function renderScreen() {
  const navigation = { goBack, addListener: () => () => undefined, dispatch: jest.fn() };
  return render(<AllergiesScreen {...({ navigation, route: { key: 'a', name: 'Allergies' } } as unknown as Props)} />);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }) {
  return node.props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  mockUser = { allergies: { common: ['peanut'], custom: ['kiwi'] } };
  mockPatch.mockReset();
  mockUpdateUserProfile.mockReset();
  goBack.mockReset();
});

describe('AllergiesScreen (CP-B6)', () => {
  it('começa com o que está salvo; "Salvar" desativado sem alteração', () => {
    const utils = renderScreen();
    expect(utils.getByTestId('allergy-option-peanut').props.accessibilityState).toMatchObject({ checked: true });
    expect(utils.getAllByTestId('allergy-custom-item')).toHaveLength(1);
    expect(isDisabled(utils.getByTestId('allergies-save'))).toBe(true);
    expect(utils.getByText('allergies.picker.honesty')).toBeTruthy();
  });

  it('salva só o campo de alergias, atualiza o usuário local e volta', async () => {
    mockPatch.mockResolvedValue({ data: { success: true } });
    const utils = renderScreen();

    fireEvent.press(utils.getByTestId('allergy-option-milk'));
    fireEvent.press(utils.getByTestId('allergies-save'));
    fireEvent.press(utils.getByTestId('allergies-save'));

    await waitFor(() => {
      expect(goBack).toHaveBeenCalled();
    });
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith('/users/me', { allergies: { common: ['peanut', 'milk'], custom: ['kiwi'] } });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ allergies: { common: ['peanut', 'milk'], custom: ['kiwi'] } });
  });

  it('erro no PATCH: mensagem na tela e fica', async () => {
    mockPatch.mockRejectedValue(new Error('offline'));
    const utils = renderScreen();

    fireEvent.press(utils.getByTestId('allergy-option-egg'));
    fireEvent.press(utils.getByTestId('allergies-save'));

    await waitFor(() => {
      expect(utils.getByText('errors.network_internal_server_error')).toBeTruthy();
    });
    expect(goBack).not.toHaveBeenCalled();
  });

  it('conta antiga sem o campo: começa vazia', () => {
    mockUser = {};
    const utils = renderScreen();
    expect(utils.getByTestId('allergy-option-peanut').props.accessibilityState).toMatchObject({ checked: false });
  });
});
