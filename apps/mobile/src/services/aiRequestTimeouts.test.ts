// CP-B1 — timeout do app nas rotas de IA: Pulse AI chat e Pantry analyze
// esperam mais que o teto do servidor (AI_REQUEST_BUDGET_MS + folga); todas
// as outras rotas continuam com os 10 s da instância compartilhada.
//
// Os serviços usam api mockado (sem rede); a instância real de ../config/api
// é carregada à parte, com EXPO_PUBLIC_API_URL definida, para conferir o
// timeout padrão. Módulos via require pelo hoisting do jest.mock.
import {
  AI_CLIENT_TIMEOUT_MS,
  AI_REQUEST_BUDGET_MS,
} from '@blendi/shared';

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('../config/api', () => ({
  api: { post: mockPost, get: mockGet },
}));
jest.mock('../locales/i18n', () => ({
  __esModule: true,
  default: { language: 'en' },
}));
jest.mock('./analytics.service', () => ({ trackEvent: jest.fn() }));
jest.mock('../utils/xp.utils', () => ({
  handleXPResponse: jest.fn(),
  handleMissionResponse: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting */
const pulseAi = require('./pulseAi.service') as typeof import('./pulseAi.service');
const pantry = require('./pantryScanner.service') as typeof import('./pantryScanner.service');
/* eslint-enable @typescript-eslint/no-require-imports */

const DEFAULT_TIMEOUT_MS = 10_000;

const recipe = {
  title: 'Oat Banana',
  ingredients: [{ name: 'Banana', amount: '1' }],
  macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
  prepTimeSeconds: 120,
  blendInstruction: 'Blend for 45 seconds.',
  hasSubstitutes: false,
};

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
});

describe('timeout das rotas de IA (CP-B1)', () => {
  it('os timeouts do app passam do teto do servidor com folga', () => {
    expect(AI_CLIENT_TIMEOUT_MS.pulseAiChat).toBeGreaterThan(AI_REQUEST_BUDGET_MS.pulseAiChat);
    expect(AI_CLIENT_TIMEOUT_MS.pantryScannerAnalyze).toBeGreaterThan(
      AI_REQUEST_BUDGET_MS.pantryScannerAnalyze,
    );
    expect(AI_CLIENT_TIMEOUT_MS.pulseAiChat).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
  });

  it('Pulse AI chat usa o timeout próprio', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          recipe,
          fromCache: false,
          usageRemaining: 2,
          xpAwarded: 10,
          conversationId: 'c1',
          macrosValidated: true,
        },
      },
    });

    await pulseAi.sendMessage('banana smoothie');

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, , config] = mockPost.mock.calls[0] as [string, unknown, { timeout?: number }];
    expect(url).toBe('/pulse-ai/chat');
    expect(config).toEqual({ timeout: AI_CLIENT_TIMEOUT_MS.pulseAiChat });
  });

  it('Pantry analyze usa o timeout próprio', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          ingredients: [{ name: 'Banana', confidence: 'high' }],
          noFoodDetected: false,
          recipes: [recipe],
          scansUsed: 1,
          scansLimit: 3,
          resetDate: '2026-12-01T00:00:00.000Z',
          xpAwarded: 15,
        },
      },
    });

    await pantry.analyzePantry('/9j/AAAA', 'image/jpeg');

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, , config] = mockPost.mock.calls[0] as [string, unknown, { timeout?: number }];
    expect(url).toBe('/pantry-scanner/analyze');
    expect(config).toEqual({ timeout: AI_CLIENT_TIMEOUT_MS.pantryScannerAnalyze });
  });

  it('as outras rotas desses serviços não passam timeout (ficam com o padrão)', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { dailyAiUsage: 0, isPro: false } } });

    await pulseAi.getUsage();

    expect(mockGet).toHaveBeenCalledWith('/pulse-ai/usage');
    expect(mockGet.mock.calls[0]).toHaveLength(1);
  });

  it('tempo esgotado no Pantry vira a mensagem de timeout', async () => {
    mockPost.mockRejectedValue(
      Object.assign(new Error('timeout of 100000ms exceeded'), {
        isAxiosError: true,
        code: 'ECONNABORTED',
      }),
    );

    await expect(pantry.analyzePantry('/9j/AAAA', 'image/jpeg')).rejects.toMatchObject({
      translationKey: 'errors.network.timeout',
    });
  });
});

describe('instância compartilhada do axios', () => {
  it('timeout padrão continua 10 s', () => {
    const previousUrl = process.env['EXPO_PUBLIC_API_URL'] as string | undefined;
    process.env['EXPO_PUBLIC_API_URL'] = 'http://localhost:3000/api/v1';

    try {
      jest.isolateModules(() => {
        const actual = jest.requireActual<typeof import('../config/api')>('../config/api');
        expect(actual.DEFAULT_API_TIMEOUT_MS).toBe(DEFAULT_TIMEOUT_MS);
        expect(actual.api.defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
      });
    } finally {
      if (previousUrl === undefined) {
        delete process.env['EXPO_PUBLIC_API_URL'];
      } else {
        process.env['EXPO_PUBLIC_API_URL'] = previousUrl;
      }
    }
  });
});
