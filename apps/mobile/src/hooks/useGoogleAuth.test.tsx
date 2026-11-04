// Teste de regressão do achado de segurança corrigido em useGoogleAuth.ts:
// quando `userBase64` vem ausente do deep link mas `accessToken`/
// `refreshToken` estão presentes (reais e válidos), o log de erro não pode
// mais vazar `result.url` por completo — só flags booleanas de quais
// campos estavam presentes. Mesmo padrão de prova usado em
// useAppleAuth.test.tsx: mock, reproduzir o cenário, confirmar que nenhum
// dado sensível aparece em console.error.
//
// Mocks declarados ANTES de jest.mock (ver comentário em
// auth.service.test.ts sobre hoisting de import) e o hook carregado via
// require, não import estático.
const mockGetGoogleAuthUrl = jest.fn<Promise<string>, []>();
const mockOpenAuthSessionAsync = jest.fn<Promise<{ type: string; url?: string }>, [unknown?]>();
const mockMaybeCompleteAuthSession = jest.fn();
const mockSetSession = jest.fn<Promise<void>, [unknown]>();

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: mockMaybeCompleteAuthSession,
  openAuthSessionAsync: mockOpenAuthSessionAsync,
  WebBrowserResultType: { SUCCESS: 'success', CANCEL: 'cancel', DISMISS: 'dismiss' },
}));

jest.mock('../services/auth.service', () => ({
  getGoogleAuthUrl: mockGetGoogleAuthUrl,
}));

jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (s: { _setSession: typeof mockSetSession }) => unknown) =>
    selector({ _setSession: mockSetSession }),
}));

import { act, create } from 'react-test-renderer';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting de import
const { useGoogleAuth } = require('./useGoogleAuth') as typeof import('./useGoogleAuth');
type UseGoogleAuthReturn = ReturnType<typeof useGoogleAuth>;

async function renderGoogleAuthHook(): Promise<{ current: UseGoogleAuthReturn }> {
  const ref: { current: UseGoogleAuthReturn | null } = { current: null };

  function Harness() {
    ref.current = useGoogleAuth();
    return null;
  }

  await act(() => {
    create(<Harness />);
  });

  return ref as { current: UseGoogleAuthReturn };
}

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  mockGetGoogleAuthUrl.mockReset();
  mockOpenAuthSessionAsync.mockReset();
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

describe('useGoogleAuth — achado de segurança corrigido', () => {
  it('userBase64 ausente: NUNCA loga o accessToken/refreshToken reais presentes no deep link', async () => {
    mockGetGoogleAuthUrl.mockResolvedValue('https://backend/auth/google/url');
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url:
        'blendipulse://auth/callback?accessToken=REAL-ACCESS-TOKEN&refreshToken=REAL-REFRESH-TOKEN',
      // userBase64 ausente de propósito
    });

    const hook = await renderGoogleAuthHook();
    await act(async () => {
      await hook.current.signInWithGoogle();
    });

    expect(hook.current.error).toBe('errors.auth.google_auth_failed');
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(loggedTextContains('REAL-ACCESS-TOKEN')).toBe(false);
    expect(loggedTextContains('REAL-REFRESH-TOKEN')).toBe(false);
  });
});
