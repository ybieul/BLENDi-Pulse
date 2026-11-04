// Testes críticos de useAppleAuth.ts — cobre a lógica que não depende do
// módulo nativo (expo-apple-authentication, auth.service e auth.store são
// mockados). O painel nativo real só é testável num build EAS/dev client
// (ver docs/fixes/apple-signin-mobile.md) — aqui testamos a lógica do hook
// em si: montagem de fullName, cancelamento silencioso, tratamento de erro
// e, criticamente, se nenhum dado sensível (identityToken/authorizationCode)
// acaba em console.error.
//
// mockSignInAsync/mockSignInWithApple/mockSetSession são declarados ANTES
// dos jest.mock (mesmo padrão de auth.service.test.ts) e o hook é carregado
// via require (não import estático) para evitar o hoisting do import ESM
// rodar antes dos mocks existirem.
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';
import { act, create } from 'react-test-renderer';

const mockSignInAsync = jest.fn<Promise<AppleAuthenticationCredential>, [unknown?]>();
const mockSignInWithApple = jest.fn<
  Promise<{ user: unknown; accessToken: string; refreshToken: string; isNewUser: boolean }>,
  [unknown]
>();
const mockSetSession = jest.fn<Promise<void>, [unknown]>();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: mockSignInAsync,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('../services/auth.service', () => ({
  signInWithApple: mockSignInWithApple,
}));

jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (s: { _setSession: typeof mockSetSession }) => unknown) =>
    selector({ _setSession: mockSetSession }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting de import
const { useAppleAuth } = require('./useAppleAuth') as typeof import('./useAppleAuth');
type UseAppleAuthReturn = ReturnType<typeof useAppleAuth>;

function buildCredential(
  overrides: Partial<AppleAuthenticationCredential> = {}
): AppleAuthenticationCredential {
  return {
    user: 'apple-user-id',
    state: null,
    fullName: null,
    email: null,
    realUserStatus: 1,
    identityToken: 'fake-identity-token',
    authorizationCode: 'fake-authorization-code',
    ...overrides,
  };
}

async function renderAppleAuthHook(): Promise<{ current: UseAppleAuthReturn }> {
  const ref: { current: UseAppleAuthReturn | null } = { current: null };

  function Harness() {
    ref.current = useAppleAuth();
    return null;
  }

  await act(() => {
    create(<Harness />);
  });

  return ref as { current: UseAppleAuthReturn };
}

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  mockSignInAsync.mockReset();
  mockSignInWithApple.mockReset();
  mockSetSession.mockReset();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function loggedTextContains(needle: string): boolean {
  return consoleErrorSpy.mock.calls.some((call) =>
    call.some((arg) => JSON.stringify(arg).includes(needle))
  );
}

describe('useAppleAuth', () => {
  it('cancelamento (ERR_REQUEST_CANCELED) é silencioso: sem erro, sem log, sem chamar o backend', async () => {
    mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    const hook = await renderAppleAuthHook();

    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(hook.current.error).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(mockSignInWithApple).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(hook.current.isLoading).toBe(false);
  });

  it('sucesso: chama _setSession com os dados do backend e expõe isNewUser', async () => {
    mockSignInAsync.mockResolvedValue(buildCredential());
    mockSignInWithApple.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: false,
    });

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      user: { id: 'u1' },
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: false,
    });
    expect(hook.current.isNewUser).toBe(false);
    expect(hook.current.error).toBeNull();
  });

  it('monta fullName a partir de givenName+familyName (primeiro signInAsync)', async () => {
    mockSignInAsync.mockResolvedValue(
      buildCredential({
        fullName: {
          namePrefix: null,
          givenName: 'Gabriel',
          middleName: null,
          familyName: 'Silva',
          nameSuffix: null,
          nickname: null,
        },
      })
    );
    mockSignInWithApple.mockResolvedValue({
      user: {},
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: true,
    });

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(mockSignInWithApple).toHaveBeenCalledWith({
      identityToken: 'fake-identity-token',
      authorizationCode: 'fake-authorization-code',
      fullName: 'Gabriel Silva',
    });
  });

  it('fullName com só uma parte presente (familyName nulo)', async () => {
    mockSignInAsync.mockResolvedValue(
      buildCredential({
        fullName: {
          namePrefix: null,
          givenName: 'Gabriel',
          middleName: null,
          familyName: null,
          nameSuffix: null,
          nickname: null,
        },
      })
    );
    mockSignInWithApple.mockResolvedValue({
      user: {},
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: true,
    });

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(mockSignInWithApple).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Gabriel' })
    );
  });

  it('não manda fullName no corpo serializado quando credential.fullName vem nulo (assinaturas seguintes)', async () => {
    mockSignInAsync.mockResolvedValue(buildCredential({ fullName: null }));
    mockSignInWithApple.mockResolvedValue({
      user: {},
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: false,
    });

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    const sentBody = mockSignInWithApple.mock.calls[0][0];
    // A chave pode existir como `undefined` no objeto JS (ver auth.service.ts),
    // mas nunca sobrevive à serialização JSON que o axios faz de fato no wire.
    expect(JSON.stringify(sentBody)).not.toContain('fullName');
  });

  it('identityToken ausente: erro genérico e NUNCA loga o authorizationCode real', async () => {
    mockSignInAsync.mockResolvedValue(
      buildCredential({ identityToken: null, authorizationCode: 'REAL-SECRET-AUTH-CODE' })
    );

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(hook.current.error).toBe('errors.auth.apple_auth_failed');
    expect(mockSignInWithApple).not.toHaveBeenCalled();
    expect(loggedTextContains('REAL-SECRET-AUTH-CODE')).toBe(false);
  });

  it('falha no backend: erro genérico e NUNCA loga identityToken/authorizationCode reais', async () => {
    mockSignInAsync.mockResolvedValue(buildCredential());
    const axiosLikeError = {
      message: 'Request failed with status code 401',
      config: {
        url: '/auth/apple',
        data: JSON.stringify({
          identityToken: 'REAL-IDENTITY-TOKEN',
          authorizationCode: 'REAL-AUTH-CODE',
        }),
      },
    };
    mockSignInWithApple.mockRejectedValue(axiosLikeError);

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(hook.current.error).toBe('errors.auth.apple_auth_failed');
    expect(loggedTextContains('REAL-IDENTITY-TOKEN')).toBe(false);
    expect(loggedTextContains('REAL-AUTH-CODE')).toBe(false);
  });

  it('erro inesperado (_setSession lança): cai no catch externo', async () => {
    mockSignInAsync.mockResolvedValue(buildCredential());
    mockSignInWithApple.mockResolvedValue({
      user: {},
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: false,
    });
    mockSetSession.mockRejectedValue(new Error('SecureStore indisponível'));

    const hook = await renderAppleAuthHook();
    await act(async () => {
      await hook.current.signInWithApple();
    });

    expect(hook.current.error).toBe('errors.auth.apple_auth_failed');
    expect(hook.current.isLoading).toBe(false);
  });
});
