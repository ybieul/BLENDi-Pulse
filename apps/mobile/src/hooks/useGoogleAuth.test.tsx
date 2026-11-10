// Testes do useGoogleAuth com código de uso único + verificador (CP-1.1.1d).
// O deep link traz só `code`; o hook gera o verificador/desafio, manda o
// desafio ao pedir a URL e troca código + verificador pela sessão. Também
// cobre o achado de log: nenhuma URL, código, verificador ou token em
// console.error/console.warn.
//
// Mocks declarados ANTES de jest.mock (ver comentário em
// auth.service.test.ts sobre hoisting de import) e o hook carregado via
// require, não import estático.
import { createHash } from 'crypto';

const mockGetGoogleAuthUrl = jest.fn<Promise<string>, [string]>();
const mockExchangeGoogleCode = jest.fn<
  Promise<{ user: unknown; accessToken: string; refreshToken: string; isNewUser: boolean }>,
  [{ code: string; codeVerifier: string }]
>();
const mockOpenAuthSessionAsync = jest.fn<Promise<{ type: string; url?: string }>, [unknown?]>();
const mockMaybeCompleteAuthSession = jest.fn();
const mockSetSession = jest.fn<Promise<void>, [unknown]>();

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: mockMaybeCompleteAuthSession,
  openAuthSessionAsync: mockOpenAuthSessionAsync,
  WebBrowserResultType: { SUCCESS: 'success', CANCEL: 'cancel', DISMISS: 'dismiss' },
}));

// expo-crypto com a implementação do Node (o módulo nativo não existe no Jest).
jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory do jest.mock não pode usar import
  const nodeCrypto = require('crypto') as typeof import('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    getRandomBytesAsync: (count: number) => Promise.resolve(new Uint8Array(nodeCrypto.randomBytes(count))),
    digestStringAsync: (_algorithm: string, data: string, options?: { encoding?: 'hex' | 'base64' }) =>
      Promise.resolve(nodeCrypto.createHash('sha256').update(data).digest(options?.encoding ?? 'hex')),
  };
});

jest.mock('../services/auth.service', () => ({
  getGoogleAuthUrl: mockGetGoogleAuthUrl,
  exchangeGoogleCode: mockExchangeGoogleCode,
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

const ONE_TIME_CODE = 'ONE-TIME-CODE-abcdefghijklmnopqrstuvwxyz0123';
const FAKE_USER = { id: 'user-1', email: 'g@example.com', name: 'G' };

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  mockGetGoogleAuthUrl.mockReset();
  mockExchangeGoogleCode.mockReset();
  mockOpenAuthSessionAsync.mockReset();
  mockSetSession.mockReset();
  mockGetGoogleAuthUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?state=s');
  mockOpenAuthSessionAsync.mockResolvedValue({
    type: 'success',
    url: `blendipulse://auth/callback?code=${ONE_TIME_CODE}`,
  });
  mockExchangeGoogleCode.mockResolvedValue({
    user: FAKE_USER,
    accessToken: 'REAL-ACCESS-TOKEN',
    refreshToken: 'REAL-REFRESH-TOKEN',
    isNewUser: false,
  });
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

function loggedText(): string {
  return JSON.stringify([...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]);
}

async function runSignIn(): Promise<{ current: UseGoogleAuthReturn }> {
  const hook = await renderGoogleAuthHook();
  await act(async () => {
    await hook.current.signInWithGoogle();
  });
  return hook;
}

describe('useGoogleAuth — código de uso único + verificador', () => {
  it('gera verificador e desafio, manda o desafio na URL e o verificador na troca', async () => {
    await runSignIn();

    expect(mockGetGoogleAuthUrl).toHaveBeenCalledTimes(1);
    const challenge = mockGetGoogleAuthUrl.mock.calls[0]?.[0] ?? '';
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(mockExchangeGoogleCode).toHaveBeenCalledTimes(1);
    const { code, codeVerifier } = mockExchangeGoogleCode.mock.calls[0]?.[0] ?? {
      code: '',
      codeVerifier: '',
    };
    expect(code).toBe(ONE_TIME_CODE);
    // 32 bytes em base64url
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // desafio = base64url(SHA-256(verificador))
    expect(createHash('sha256').update(codeVerifier).digest('base64url')).toBe(challenge);
    // o verificador nunca vai para a URL de login
    expect(challenge).not.toBe(codeVerifier);
  });

  it('cada login gera um verificador novo', async () => {
    await runSignIn();
    await runSignIn();

    const [first, second] = mockExchangeGoogleCode.mock.calls.map(call => call[0].codeVerifier);
    expect(first).not.toBe(second);
  });

  it('isNewUser da troca segue para o _setSession (evento sign_up) e para o hook', async () => {
    mockExchangeGoogleCode.mockResolvedValue({
      user: FAKE_USER,
      accessToken: 'REAL-ACCESS-TOKEN',
      refreshToken: 'REAL-REFRESH-TOKEN',
      isNewUser: true,
    });

    const hook = await runSignIn();

    expect(mockSetSession).toHaveBeenCalledWith({
      user: FAKE_USER,
      accessToken: 'REAL-ACCESS-TOKEN',
      refreshToken: 'REAL-REFRESH-TOKEN',
      isNewUser: true,
    });
    expect(hook.current.isNewUser).toBe(true);
    expect(hook.current.error).toBeNull();
  });

  it('login de conta existente: isNewUser false', async () => {
    const hook = await runSignIn();

    expect(mockSetSession).toHaveBeenCalledWith(expect.objectContaining({ isNewUser: false }));
    expect(hook.current.isNewUser).toBe(false);
  });

  it('erro no deep link: repassa a chave e não troca nada', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'blendipulse://auth/callback?error=errors.auth.invalid_state',
    });

    const hook = await runSignIn();

    expect(hook.current.error).toBe('errors.auth.invalid_state');
    expect(mockExchangeGoogleCode).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('deep link sem código: erro e nenhuma troca', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'blendipulse://auth/callback' });

    const hook = await runSignIn();

    expect(hook.current.error).toBe('errors.auth.google_auth_failed');
    expect(mockExchangeGoogleCode).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('usuário cancela o browser: sem erro, sem troca, sem log', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    const hook = await runSignIn();

    expect(hook.current.error).toBeNull();
    expect(mockExchangeGoogleCode).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('useGoogleAuth — nada sensível em log', () => {
  it('URL do deep link que não pode ser lida: não registra a URL nem o código', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      // IPv6 malformado: new URL lança
      url: `http://[${ONE_TIME_CODE}/auth/callback?code=${ONE_TIME_CODE}`,
    });

    const hook = await runSignIn();

    expect(hook.current.error).toBe('errors.auth.google_auth_failed');
    expect(loggedText()).toContain('Falha ao parsear URL de deep link');
    expect(loggedText()).not.toContain(ONE_TIME_CODE);
    expect(loggedText()).not.toContain('auth/callback');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('falha na troca: erro genérico, sem código, verificador nem corpo da requisição no log', async () => {
    const axiosLikeError = Object.assign(new Error('Request failed with status code 401'), {
      name: 'AxiosError',
      config: { data: JSON.stringify({ code: ONE_TIME_CODE, codeVerifier: 'VERIFIER-SECRET' }) },
    });
    mockExchangeGoogleCode.mockRejectedValue(axiosLikeError);

    const hook = await runSignIn();

    expect(hook.current.error).toBe('errors.auth.google_auth_failed');
    expect(mockSetSession).not.toHaveBeenCalled();
    const verifier = mockExchangeGoogleCode.mock.calls[0]?.[0].codeVerifier ?? 'missing';
    expect(loggedText()).not.toContain(ONE_TIME_CODE);
    expect(loggedText()).not.toContain(verifier);
    expect(loggedText()).not.toContain('VERIFIER-SECRET');
  });

  it('fluxo completo: verificador, código e tokens nunca aparecem em log', async () => {
    mockSetSession.mockRejectedValue(new Error('storage failed'));

    await runSignIn();

    const verifier = mockExchangeGoogleCode.mock.calls[0]?.[0].codeVerifier ?? 'missing';
    const logged = loggedText();
    for (const secret of [verifier, ONE_TIME_CODE, 'REAL-ACCESS-TOKEN', 'REAL-REFRESH-TOKEN']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('falha ao pedir a URL: registra só o nome do erro', async () => {
    mockGetGoogleAuthUrl.mockRejectedValue(
      Object.assign(new Error('Network Error'), { name: 'AxiosError', config: { params: { x: 'y' } } })
    );

    const hook = await runSignIn();

    expect(hook.current.error).toBe('errors.network.server');
    expect(loggedText()).not.toContain('params');
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
  });
});
