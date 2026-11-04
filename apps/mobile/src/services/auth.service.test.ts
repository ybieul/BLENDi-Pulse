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

jest.mock('../config/api', () => ({
  api: { post: mockPost },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting de import
const { signInWithApple } = require('./auth.service') as typeof import('./auth.service');

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
