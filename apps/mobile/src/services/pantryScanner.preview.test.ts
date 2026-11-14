// CP-1.1.4b — serviço do Pantry: resposta de prévia (sem XP, missão nem
// pantry_scan_completed), resposta "vazada" recusada pelo schema estrito,
// desbloqueio e os códigos novos mapeados para tradução.
//
// api é mockado (sem rede, sem ../config/api, que lança no import sem
// EXPO_PUBLIC_API_URL). Módulos carregados via require pelo hoisting do jest.mock.

// Módulo (e não script global): as variáveis mock* não colidem com as de
// outros arquivos de teste no typecheck.
export {};

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockTrackEvent = jest.fn<void, unknown[]>();
const mockHandleXP = jest.fn<void, unknown[]>();
const mockHandleMission = jest.fn<void, unknown[]>();

jest.mock('../config/api', () => ({
  api: { post: mockPost, get: mockGet },
}));
jest.mock('./analytics.service', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
jest.mock('../utils/xp.utils', () => ({
  handleXPResponse: (...args: unknown[]) => mockHandleXP(...args),
  handleMissionResponse: (...args: unknown[]) => mockHandleMission(...args),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- ver comentário acima sobre hoisting */
const pantry = require('./pantryScanner.service') as typeof import('./pantryScanner.service');
/* eslint-enable @typescript-eslint/no-require-imports */

const PREVIEW_RESPONSE = {
  locked: true,
  previewId: '6af7a33d1ba7ebd3163c41aa',
  previewExpiresAt: '2026-11-20T12:00:00.000Z',
  ingredients: [{ name: 'Banana', confidence: 'high' }],
  recipes: [{ macros: { protein: 12, carbs: 30, fat: 6, calories: 222 } }],
  scansUsed: 3,
  scansLimit: 3,
  resetDate: '2026-12-01T00:00:00.000Z',
};

const FULL_RECIPE = {
  title: 'Oat Banana',
  ingredients: [{ name: 'Banana', amount: '1' }],
  macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
  prepTimeSeconds: 120,
  blendInstruction: 'Blend',
  hasSubstitutes: false,
};

function axiosError(status: number, code: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { success: false, code, message: 'msg' } },
  });
}

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockTrackEvent.mockReset();
  mockHandleXP.mockReset();
  mockHandleMission.mockReset();
});

describe('pantryScanner.service — prévia bloqueada', () => {
  it('reconhece a prévia, sem XP, missão nem pantry_scan_completed', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, data: PREVIEW_RESPONSE } });

    const result = await pantry.analyzePantry('base64', 'image/jpeg');

    expect(pantry.isPantryLockedPreview(result)).toBe(true);
    expect(result).toEqual(PREVIEW_RESPONSE);
    expect(mockTrackEvent).not.toHaveBeenCalled();
    expect(mockHandleXP).not.toHaveBeenCalled();
    expect(mockHandleMission).not.toHaveBeenCalled();
  });

  it('scan normal continua disparando pantry_scan_completed e XP', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ingredients: [{ name: 'Banana', confidence: 'high' }],
          noFoodDetected: false,
          recipes: [FULL_RECIPE],
          scansUsed: 1,
          scansLimit: 3,
          resetDate: '2026-12-01T00:00:00.000Z',
          xpAwarded: 15,
        },
      },
    });

    const result = await pantry.analyzePantry('base64', 'image/jpeg');

    expect(pantry.isPantryLockedPreview(result)).toBe(false);
    expect(mockTrackEvent).toHaveBeenCalledWith('pantry_scan_completed');
    expect(mockHandleXP).toHaveBeenCalledTimes(1);
  });

  it('prévia "vazada" (receita com título/ingredientes) é recusada pelo schema estrito', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...PREVIEW_RESPONSE, recipes: [{ ...FULL_RECIPE }] },
      },
    });

    await expect(pantry.analyzePantry('base64', 'image/jpeg')).rejects.toBeInstanceOf(
      pantry.PantryScannerServiceError,
    );
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('prévia com campo a mais (analysisNotes) também é recusada', async () => {
    mockPost.mockResolvedValueOnce({
      data: { success: true, data: { ...PREVIEW_RESPONSE, analysisNotes: '137 g dragonfruit' } },
    });

    await expect(pantry.analyzePantry('base64', 'image/jpeg')).rejects.toBeInstanceOf(
      pantry.PantryScannerServiceError,
    );
  });
});

describe('pantryScanner.service — desbloqueio', () => {
  it('Pro: devolve ingredientes e receitas completas', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          previewId: PREVIEW_RESPONSE.previewId,
          ingredients: [{ name: 'Banana', confidence: 'high' }],
          recipes: [FULL_RECIPE],
        },
      },
    });

    const unlocked = await pantry.unlockPantryPreview(PREVIEW_RESPONSE.previewId);

    expect(mockGet).toHaveBeenCalledWith(`/pantry-scanner/previews/${PREVIEW_RESPONSE.previewId}`);
    expect(unlocked.recipes[0]?.title).toBe('Oat Banana');
    expect(unlocked.ingredients).toHaveLength(1);
  });

  it('id é codificado na URL', async () => {
    mockGet.mockRejectedValueOnce(axiosError(404, 'scanner/preview-not-found'));

    await expect(pantry.unlockPantryPreview('../users/me')).rejects.toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/pantry-scanner/previews/..%2Fusers%2Fme');
  });

  it.each([
    [404, 'scanner/preview-not-found', 'errors.scanner_preview_expired'],
    [403, 'scanner/preview-locked', 'errors.scanner_preview_locked'],
  ])('%s %s → %s', async (status, code, translationKey) => {
    mockGet.mockRejectedValueOnce(axiosError(status, code));

    await expect(pantry.unlockPantryPreview('6af7a33d1ba7ebd3163c41aa')).rejects.toMatchObject({
      translationKey,
      apiCode: code,
    });
  });
});
