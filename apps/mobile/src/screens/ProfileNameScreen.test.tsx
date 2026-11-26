// Teste no build EAS (25-26/11) — tela "Seu nome" do perfil: começa com o
// nome salvo (conta antiga: derivado do name), "Salvar" só com alteração,
// PATCH só com firstName/lastName, atualiza o usuário local e volta; conta
// "a confirmar" abre com o Nome vazio e o aviso; aviso ao sair sem salvar.
import { Alert } from 'react-native';
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

import { ProfileNameScreen } from './ProfileNameScreen';

type Props = Parameters<typeof ProfileNameScreen>[0];
type BeforeRemoveHandler = (event: { preventDefault: () => void; data: { action: unknown } }) => void;

const goBack = jest.fn();
const dispatch = jest.fn();
let beforeRemove: BeforeRemoveHandler | null = null;

function renderScreen() {
  const navigation = {
    goBack,
    dispatch,
    addListener: (_event: string, handler: BeforeRemoveHandler) => {
      beforeRemove = handler;
      return () => undefined;
    },
  };
  return render(<ProfileNameScreen {...({ navigation, route: { key: 'n', name: 'ProfileName' } } as unknown as Props)} />);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }) {
  return node.props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  mockUser = { name: 'Gabriel Barboza da Silva' };
  mockPatch.mockReset();
  mockUpdateUserProfile.mockReset();
  mockShowToast.mockReset();
  goBack.mockReset();
  dispatch.mockReset();
  beforeRemove = null;
});

describe('ProfileNameScreen', () => {
  it('conta antiga (só name): Nome e Sobrenome derivados; "Salvar" desativado sem alteração', () => {
    const utils = renderScreen();
    expect(utils.getByTestId('profile-name-first').props.value).toBe('Gabriel');
    expect(utils.getByTestId('profile-name-last').props.value).toBe('Barboza da Silva');
    expect(isDisabled(utils.getByTestId('profile-name-save'))).toBe(true);
    expect(utils.queryByTestId('profile-name-confirm-hint')).toBeNull();
  });

  it('salva só firstName/lastName, atualiza o usuário local com o nome montado e volta', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const utils = renderScreen();

    fireEvent.changeText(utils.getByTestId('profile-name-first'), 'Gabi');
    fireEvent.changeText(utils.getByTestId('profile-name-last'), '  Silva ');
    fireEvent.press(utils.getByTestId('profile-name-save'));

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/users/me', { firstName: 'Gabi', lastName: 'Silva' });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({
      firstName: 'Gabi',
      lastName: 'Silva',
      name: 'Gabi Silva',
      nameNeedsConfirmation: false,
    });
    expect(mockShowToast).toHaveBeenCalledWith('me.name.saved');
  });

  it('conta "a confirmar" (nome do e-mail): Nome abre vazio, aviso visível, sobrenome real mantido', () => {
    mockUser = { name: 'biel782003', firstName: 'biel782003', lastName: '', nameNeedsConfirmation: true };
    const utils = renderScreen();

    expect(utils.getByTestId('profile-name-first').props.value).toBe('');
    expect(utils.getByTestId('profile-name-confirm-hint')).toBeTruthy();
  });

  it('Nome vazio: não salva e mostra o erro', () => {
    mockUser = { name: 'biel782003', nameNeedsConfirmation: true };
    const utils = renderScreen();

    fireEvent.press(utils.getByTestId('profile-name-save'));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(utils.getByText(/errors\.validation\.required/)).toBeTruthy();
  });

  it('erro do servidor aparece na tela e não volta', async () => {
    mockPatch.mockRejectedValue(new Error('offline'));
    const utils = renderScreen();

    fireEvent.changeText(utils.getByTestId('profile-name-first'), 'Gabi');
    fireEvent.press(utils.getByTestId('profile-name-save'));

    expect(await utils.findByText('errors.network_internal_server_error')).toBeTruthy();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('sair com alteração não salva pede confirmação; sem alteração, sai direto', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const utils = renderScreen();

    const cleanEvent = { preventDefault: jest.fn(), data: { action: {} } };
    beforeRemove?.(cleanEvent);
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled();

    fireEvent.changeText(utils.getByTestId('profile-name-first'), 'Outro');
    const dirtyEvent = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    beforeRemove?.(dirtyEvent);

    expect(dirtyEvent.preventDefault).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('me.name.unsavedTitle', 'me.name.unsavedMessage', expect.any(Array));
    alertSpy.mockRestore();
  });
});
