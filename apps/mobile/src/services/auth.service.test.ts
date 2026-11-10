// Testes críticos de auth.service.ts — signInWithApple.
//
// Foco: o body enviado ao backend é EXATAMENTE o que foi passado (sem
// campos extras, sem perda de campos) e o shape da resposta usado
// (user, accessToken, refreshToken, isNewUser) é o correto. api.post é
// mockado — sem rede, sem tocar em ../config/api (que lança no import se
// EXPO_PUBLIC_API_URL não estiver definida).
//
// mockPost precisa ser declarado ANTES de jest.mock e o módulo sob teste
// precisa ser carregado via require (não import estático): imports ESM são
// hoisted pelo babel para o topo do arquivo, rodando antes do `const
// mockPost = jest.fn()` — o factory do jest.mock acabaria capturando
// `mockPost` como undefined. Mesmo padrão já usado em
// analytics.service.test.ts.
const mockPost = jest.fn<
  Promise<{ data: { success: true; data: unknown } }>,
  [string, Record<string, unknown>]
>();

const mockGet = jest.fn<
  Promise<{ data: { success: true; data: unknown } }>,
  [string, Record<string, unknown>?]
>();

jest.mock('../config/api', () => ({
  api: { post: mockPost, get: mockGet },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting de import
const authService = require('./auth.service') as typeof import('./auth.service');
const { signInWithApple, getGoogleAuthUrl, exchangeGoogleCode } = authService;

describe('auth.service — signInWithApple', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('envia POST /auth/apple com exatamente os campos recebidos (com fullName)', async () => {
    const fakeResponseData = {
      user: { id: 'u1', email: 'a@b.com' },
      accessToken: 'at',
      refreshToken: 'rt',
      isNewUser: true,
    };
    mockPost.mockResolvedValue({ data: { success: true, data: fakeResponseData } });

    const input = {
      identityToken: 'tok-123',
      authorizationCode: 'code-456',
      fullName: 'Gabriel Silva',
    };

    const result = await signInWithApple(input);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/auth/apple', input);
    // Confirma que nenhum campo extra foi injetado no body (ex: campos do
    // state global, timestamps, etc.) — o body é só o que foi passado.
    expect(Object.keys(mockPost.mock.calls[0][1])).toEqual([
      'identityToken',
      'authorizationCode',
      'fullName',
    ]);
    expect(result).toEqual(fakeResponseData);
    expect(result.isNewUser).toBe(true);
  });

  it('omite fullName no corpo serializado quando ele é undefined (JSON.stringify descarta a chave)', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: { user: {}, accessToken: 'at', refreshToken: 'rt', isNewUser: false },
      },
    });

    await signInWithApple({ identityToken: 'tok', authorizationCode: 'code' });

    const sentBody = mockPost.mock.calls[0][1];
    // A chave pode existir como `undefined` no objeto JS, mas nunca pode
    // sobreviver à serialização JSON que o axios faz de fato no wire.
    expect(JSON.stringify(sentBody)).not.toContain('fullName');
  });

  it('propaga o erro do axios sem mascarar (quem decide o que fazer é o caller)', async () => {
    const axiosError = new Error('Network Error');
    mockPost.mockRejectedValue(axiosError);

    await expect(
      signInWithApple({ identityToken: 'tok', authorizationCode: 'code' })
    ).rejects.toBe(axiosError);
  });
});

// CP-1.1.1d: login Google com código de uso único + verificador.
describe('auth.service — login Google', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
  });

  it('getGoogleAuthUrl manda o desafio como query param', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { url: 'https://accounts.google.com/x' } } });

    const url = await getGoogleAuthUrl('C'.repeat(43));

    expect(url).toBe('https://accounts.google.com/x');
    expect(mockGet).toHaveBeenCalledWith('/auth/google/url', { params: { codeChallenge: 'C'.repeat(43) } });
  });

  it('exchangeGoogleCode: POST com código + verificador e usuário convertido do formato do getMe', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          user: {
            id: 'u1',
            email: 'g@example.com',
            name: 'G',
            blendiModel: 'Steel',
            blendiOwnership: 'blendi',
            otherBlenderModel: null,
            dietaryPreferences: ['vegan'],
            goal: 'Muscle',
            preferredLanguage: 'pt-BR',
            unitSystem: 'metric',
            timezone: 'America/Sao_Paulo',
            dailyProteinTarget: 160,
            dailyCalorieTarget: 2200,
            dailyCarbTarget: 220,
            isPro: true,
            longestStreak: 4,
            totalXP: 50,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          accessToken: 'at',
          refreshToken: 'rt',
          isNewUser: true,
        },
      },
    });

    const input = { code: 'K'.repeat(43), codeVerifier: 'V'.repeat(43) };
    const result = await exchangeGoogleCode(input);

    expect(mockPost).toHaveBeenCalledWith('/auth/google/exchange', input);
    expect(Object.keys(mockPost.mock.calls[0][1])).toEqual(['code', 'codeVerifier']);
    expect(result.accessToken).toBe('at');
    expect(result.refreshToken).toBe('rt');
    expect(result.isNewUser).toBe(true);
    expect(result.user.locale).toBe('pt-BR');
    expect(result.user.dietaryPreferences).toEqual(['vegan']);
    expect(result.user.isPro).toBe(true);
  });
});
