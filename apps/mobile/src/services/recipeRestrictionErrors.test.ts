// CP-1.1.1c: os codes novos de restrição (dieta / gelo no Lite) chegam ao app
// como mensagem traduzida, e o Pantry aceita 1 receita em vez de 2.
//
// api.post é mockado (sem rede, sem ../config/api, que lança no import sem
// EXPO_PUBLIC_API_URL). Os módulos sob teste são carregados via require pelo
// mesmo motivo de hoisting explicado em auth.service.test.ts.
import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';

const mockPost = jest.fn();

jest.mock('../config/api', () => ({
  api: { post: mockPost, get: jest.fn() },
}));
jest.mock('../locales/i18n', () => ({
  __esModule: true,
  default: { language: 'pt-BR' },
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

/* eslint-disable @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting de import */
const pulseAi = require('./pulseAi.service') as typeof import('./pulseAi.service');
const pantry = require('./pantryScanner.service') as typeof import('./pantryScanner.service');
/* eslint-enable @typescript-eslint/no-require-imports */

function axiosError(status: number, code: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { success: false, code, message: 'msg' } },
  });
}

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
});

describe('traduções novas', () => {
  it('existem em en e pt-BR', () => {
    for (const locale of [en, ptBR]) {
      expect(locale.errors.pulseai_dietary_restriction_unmet).toEqual(expect.any(String));
      expect(locale.errors.scanner_dietary_restriction_unmet).toEqual(expect.any(String));
    }
    expect(ptBR.errors.pulseai_dietary_restriction_unmet).toMatch(/Tente pedir de outro jeito/);
  });
});

describe('pulseAi.service — pulseai/dietary-restriction-unmet', () => {
  it('mapeia para errors.pulseai_dietary_restriction_unmet', async () => {
    mockPost.mockRejectedValueOnce(axiosError(422, 'pulseai/dietary-restriction-unmet'));

    await expect(pulseAi.sendMessage('smoothie com pasta de amendoim')).rejects.toMatchObject({
      name: 'PulseAiServiceError',
      translationKey: 'errors.pulseai_dietary_restriction_unmet',
      apiCode: 'pulseai/dietary-restriction-unmet',
    });
  });
});

describe('pantryScanner.service', () => {
  it('mapeia scanner/dietary-restriction-unmet para errors.scanner_dietary_restriction_unmet', async () => {
    mockPost.mockRejectedValueOnce(axiosError(422, 'scanner/dietary-restriction-unmet'));

    await expect(pantry.analyzePantry('base64', 'image/jpeg')).rejects.toMatchObject({
      name: 'PantryScannerServiceError',
      translationKey: 'errors.scanner_dietary_restriction_unmet',
      apiCode: 'scanner/dietary-restriction-unmet',
    });
  });

  it('aceita resposta com 1 receita (a outra descartada no backend)', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ingredients: [{ name: 'Banana', confidence: 'high' }],
          noFoodDetected: false,
          recipes: [recipe],
          scansUsed: 1,
          scansLimit: 3,
          resetDate: new Date('2026-12-01T00:00:00.000Z').toISOString(),
          xpAwarded: 15,
        },
      },
    });

    const result = await pantry.analyzePantry('base64', 'image/jpeg');
    // CP-1.1.4b: analyzePantry também pode devolver a prévia bloqueada; aqui
    // é um scan normal (só estreita o tipo).
    if (pantry.isPantryLockedPreview(result)) throw new Error('esperava scan normal');

    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].title).toBe('Oat Banana');
  });
});
