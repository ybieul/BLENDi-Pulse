// CP-1.1.4b — prévia bloqueada no Pantry Scanner: cards só com macros (com uma
// resposta "vazada", nenhum texto real da receita na árvore), toque abre os
// planos com evento, voltar como Pro desbloqueia, expirada avisa, sem assinar
// nada muda, e o aviso "Receitas do seu último scan" na captura.
//
// O fluxo é simulado pela galeria, como em PantryScannerScreen.test.tsx. O
// LockedRecipeCard é o real; o RecipeCard completo é trocado por um Text.
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

jest.mock('../hooks/useFormatNumbers', () => ({
  useFormatNumbers: () => ({ formatDecimal: (value: number) => String(value) }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  return { SafeAreaView: View };
});

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

// Dependências pesadas do RecipeCard completo, que mora no mesmo arquivo do
// LockedRecipeCard real.
jest.mock('../utils/shareCard.utils', () => ({ generateAndShare: jest.fn() }));
jest.mock('../utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../components/shareCards/RecipeShareCard', () => ({ RecipeShareCard: () => null }));
jest.mock('../components/shareCards/ShareFormatSheet', () => ({ ShareFormatSheet: () => null }));
jest.mock('../components/shoppingList/AddToListSheet', () => ({ AddToListSheet: () => null }));

jest.mock('../components/pulseAi/RecipeCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Text } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../components/pulseAi/RecipeCard');
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- idem
    LockedRecipeCard: actual.LockedRecipeCard,
    RecipeCard: ({ recipe }: { recipe: { title: string } }) => <Text testID="recipe-card">{recipe.title}</Text>,
  };
});

jest.mock('../config/api', () => ({ api: {} }));

const mockStorage = new Map<string, string>();
jest.mock('../config/storage', () => ({
  createAppStorage: () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string | number | boolean) => {
      mockStorage.set(key, String(value));
    },
    delete: (key: string) => {
      mockStorage.delete(key);
    },
  }),
}));

jest.mock('../hooks/useFavorites', () => ({
  useFavorites: () => ({ favorites: [] }),
  useAddFavorite: () => ({ isPending: false, mutate: jest.fn() }),
  useRemoveFavorite: () => ({ isPending: false, mutate: jest.fn() }),
}));

const mockAuthState: { user: { id: string; isPro: boolean } } = { user: { id: 'user-1', isPro: false } };
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAuthState),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));

jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { View } = require('react-native');
  return {
    Camera: {
      getCameraPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
      requestCameraPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
    CameraView: View,
    PermissionStatus: { GRANTED: 'granted' },
  };
});

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => Promise.resolve({ canceled: false, assets: [{ uri: 'file://pantry.jpg' }] }),
  MediaTypeOptions: { Images: 'Images' },
}));

const mockAnalyzePantry = jest.fn<Promise<unknown>, unknown[]>();
const mockUnlockPantryPreview = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../services/pantryScanner.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pantryScanner.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    analyzePantry: (...args: unknown[]) => mockAnalyzePantry(...args),
    unlockPantryPreview: (...args: unknown[]) => mockUnlockPantryPreview(...args),
    compressAndEncodeImage: () => Promise.resolve({ ok: true, imageBase64: 'base64' }),
  };
});

const mockTrackEvent = jest.fn<void, unknown[]>();
jest.mock('../services/analytics.service', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.events', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { PantryScannerServiceError } from '../services/pantryScanner.service';
import {
  markLastPantryPreviewSeen,
  readLastPantryPreview,
  saveLastPantryPreview,
} from '../utils/pantryLastPreview.utils';
import { PantryScannerScreen } from './PantryScannerScreen';

type ScreenProps = Parameters<typeof PantryScannerScreen>[0];

const PREVIEW_ID = '6af7a33d1ba7ebd3163c41aa';
const EXPIRES_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

// Resposta de prévia "vazada": se o backend mandasse campos escondidos, o app
// ainda não poderia renderizá-los.
const SECRETS = [
  '137 g Frozen dragonfruit',
  'Coconut kefir 213 ml',
  'Pulse 7 times',
  'add 11 g of chia',
  'Secret step one',
  'Pink Kefir Cooler',
  'analysis notes secret',
];

const LEAKY_PREVIEW = {
  locked: true,
  previewId: PREVIEW_ID,
  previewExpiresAt: EXPIRES_AT,
  analysisNotes: 'analysis notes secret',
  ingredients: [
    { name: 'banana', confidence: 'high' },
    { name: 'oats', confidence: 'medium' },
  ],
  recipes: [
    {
      macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
      title: '137 g Frozen dragonfruit',
      ingredients: [{ name: 'Coconut kefir 213 ml', amount: '213 ml' }],
      blendInstruction: 'Pulse 7 times',
      tip: 'add 11 g of chia',
      steps: [{ text: 'Secret step one' }],
    },
    {
      macros: { protein: 10, carbs: 25, fat: 5, calories: 185 },
      title: 'Pink Kefir Cooler',
    },
  ],
  scansUsed: 3,
  scansLimit: 3,
  resetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
};

function fullRecipe(title: string) {
  return {
    title,
    ingredients: [{ name: 'banana', amount: '1' }],
    macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
    prepTimeSeconds: 120,
    blendInstruction: 'Blend',
    hasSubstitutes: false,
  };
}

const UNLOCKED = {
  previewId: PREVIEW_ID,
  ingredients: [
    { name: 'banana', confidence: 'high' },
    { name: 'oats', confidence: 'medium' },
  ],
  recipes: [fullRecipe('Dragon Kefir'), fullRecipe('Pink Kefir Cooler')],
};

const mockNavigateUpgrade = jest.fn();

function renderScreen() {
  const navigation = {
    goBack: jest.fn(),
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: mockNavigateUpgrade }) }),
  };
  const props = { navigation } as unknown as ScreenProps;
  const utils = render(<PantryScannerScreen {...props} />);
  return { ...utils, rerenderScreen: () => utils.rerender(<PantryScannerScreen {...props} />) };
}

type Screen = ReturnType<typeof renderScreen>;

async function waitForCapture(utils: Screen) {
  await waitFor(() => {
    expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
  });
}

// Galeria = penúltimo botão da captura (o aviso da última prévia, quando há,
// fica entre o fechar e a galeria).
async function scanFromGallery(utils: Screen) {
  await waitForCapture(utils);
  const buttons = utils.getAllByRole('button');
  const gallery = buttons[buttons.length - 2];
  if (!gallery) throw new Error('botão da galeria não encontrado');
  fireEvent.press(gallery);
}

async function openRecipesStep(utils: Screen) {
  await waitFor(() => {
    expect(utils.getByText('pantryScanner.generateRecipes')).toBeTruthy();
  });
  fireEvent.press(utils.getByText('pantryScanner.generateRecipes'));
}

async function scanToLockedCards(): Promise<Screen> {
  mockAnalyzePantry.mockResolvedValueOnce(LEAKY_PREVIEW);
  const utils = renderScreen();
  await scanFromGallery(utils);
  await openRecipesStep(utils);
  await waitFor(() => {
    expect(utils.getAllByTestId('locked-recipe-card')).toHaveLength(2);
  });
  return utils;
}

beforeEach(() => {
  mockStorage.clear();
  mockAuthState.user = { id: 'user-1', isPro: false };
  mockAnalyzePantry.mockReset();
  mockUnlockPantryPreview.mockReset();
  mockTrackEvent.mockReset();
  mockShowToast.mockReset();
  mockNavigateUpgrade.mockReset();
});

describe('PantryScannerScreen — prévia bloqueada', () => {
  it('cards só com macros e título genérico; nada da resposta "vazada" na árvore; evento sem dados', async () => {
    const utils = await scanToLockedCards();

    expect(utils.getAllByText('pantryScanner.lockedPreview.genericTitle')).toHaveLength(2);
    expect(utils.getAllByText('pantryScanner.lockedPreview.badge')).toHaveLength(2);
    for (const value of ['12', '30', '6', '222', '10', '25', '5', '185']) {
      expect(utils.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(utils.queryByTestId('recipe-card')).toBeNull();
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();

    const tree = JSON.stringify(utils.toJSON());
    for (const secret of SECRETS) {
      expect(tree).not.toContain(secret);
    }

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith('paywall_preview_shown', { source: 'pantry_scanner' });
    expect(mockTrackEvent).not.toHaveBeenCalledWith('pantry_scan_completed');

    // Guardada para este usuário, só id e validade.
    expect(readLastPantryPreview('user-1')).toEqual({
      previewId: PREVIEW_ID,
      expiresAt: EXPIRES_AT,
      unlockedSeen: false,
    });
    expect(readLastPantryPreview('user-2')).toBeNull();
    expect([...mockStorage.values()].join('')).not.toContain('Pulse 7 times');
  });

  it('toque abre Upgrade com evento', async () => {
    const utils = await scanToLockedCards();
    mockTrackEvent.mockReset();

    fireEvent.press(utils.getAllByTestId('locked-recipe-card')[0]);

    expect(mockTrackEvent).toHaveBeenCalledWith('paywall_preview_tapped', { source: 'pantry_scanner' });
    expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade');
  });

  it('voltou da tela de planos como Pro: troca os cards pelas receitas', async () => {
    const utils = await scanToLockedCards();
    mockUnlockPantryPreview.mockResolvedValueOnce(UNLOCKED);

    mockAuthState.user = { id: 'user-1', isPro: true };
    utils.rerenderScreen();

    await waitFor(() => {
      expect(utils.getAllByTestId('recipe-card')).toHaveLength(2);
    });
    expect(mockUnlockPantryPreview).toHaveBeenCalledTimes(1);
    expect(mockUnlockPantryPreview).toHaveBeenCalledWith(PREVIEW_ID);
    expect(utils.queryByTestId('locked-recipe-card')).toBeNull();
    expect(utils.getByText('Dragon Kefir')).toBeTruthy();
    // Viu as receitas desbloqueadas: o próximo scan novo limpa a prévia.
    expect(readLastPantryPreview('user-1')?.unlockedSeen).toBe(true);
  });

  it('expirada: card expirado e aviso curto, sem erro genérico; prévia guardada sai', async () => {
    const utils = await scanToLockedCards();
    mockUnlockPantryPreview.mockRejectedValueOnce(
      new PantryScannerServiceError('gone', 'errors.scanner_preview_expired', 'scanner/preview-not-found'),
    );

    mockAuthState.user = { id: 'user-1', isPro: true };
    utils.rerenderScreen();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_preview_expired');
    });
    expect(utils.getAllByText('pantryScanner.lockedPreview.expired')).toHaveLength(2);
    expect(mockShowToast).not.toHaveBeenCalledWith('errors.network_internal_server_error');
    expect(readLastPantryPreview('user-1')).toBeNull();
  });

  it('não assinou: nada muda e não tenta desbloquear', async () => {
    const utils = await scanToLockedCards();

    utils.rerenderScreen();

    expect(utils.getAllByTestId('locked-recipe-card')).toHaveLength(2);
    expect(mockUnlockPantryPreview).not.toHaveBeenCalled();
  });

  it('Pro mas o backend ainda responde 403: os cards continuam bloqueados', async () => {
    const utils = await scanToLockedCards();
    mockUnlockPantryPreview.mockRejectedValueOnce(
      new PantryScannerServiceError('locked', 'errors.scanner_preview_locked', 'scanner/preview-locked'),
    );

    mockAuthState.user = { id: 'user-1', isPro: true };
    utils.rerenderScreen();

    await waitFor(() => {
      expect(mockUnlockPantryPreview).toHaveBeenCalledTimes(1);
    });
    expect(utils.getAllByTestId('locked-recipe-card')).toHaveLength(2);
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(readLastPantryPreview('user-1')).not.toBeNull();
  });

  it('5º scan: limite de hoje (volta para a captura e abre Upgrade)', async () => {
    mockAnalyzePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('limit', 'errors.scanner_monthly_limit_reached', 'scanner/monthly-limit-reached'),
    );
    const utils = renderScreen();
    await scanFromGallery(utils);

    await waitFor(() => {
      expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade');
    });
    await waitForCapture(utils);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});

describe('PantryScannerScreen — "Receitas do seu último scan"', () => {
  it('Pro com prévia válida: aviso na captura; tocar abre ingredientes e receitas', async () => {
    mockAuthState.user = { id: 'user-1', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });
    mockUnlockPantryPreview.mockResolvedValueOnce(UNLOCKED);

    const utils = renderScreen();
    await waitFor(() => {
      expect(utils.getByText('pantryScanner.lockedPreview.lastScanTitle')).toBeTruthy();
    });

    fireEvent.press(utils.getByTestId('pantry-last-preview-open'));

    await waitFor(() => {
      expect(utils.getAllByTestId('recipe-card')).toHaveLength(2);
    });
    expect(mockUnlockPantryPreview).toHaveBeenCalledWith(PREVIEW_ID);
    expect(utils.getByText(/pantryScanner\.basedOnIngredients.*banana, oats/)).toBeTruthy();
    expect(readLastPantryPreview('user-1')?.unlockedSeen).toBe(true);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('grátis com prévia guardada: nada novo na captura', async () => {
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });

    const utils = renderScreen();
    await waitForCapture(utils);

    expect(utils.queryByTestId('pantry-last-preview')).toBeNull();
    expect(utils.getAllByRole('button')).toHaveLength(3);
    expect(readLastPantryPreview('user-1')).not.toBeNull();
  });

  it('dispensar o aviso limpa o id', async () => {
    mockAuthState.user = { id: 'user-1', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });

    const utils = renderScreen();
    await waitFor(() => {
      expect(utils.getByTestId('pantry-last-preview')).toBeTruthy();
    });

    fireEvent.press(utils.getByTestId('pantry-last-preview-dismiss'));

    expect(utils.queryByTestId('pantry-last-preview')).toBeNull();
    expect(readLastPantryPreview('user-1')).toBeNull();
  });

  it('prévia guardada já expirada: sem aviso e o id sai', async () => {
    mockAuthState.user = { id: 'user-1', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: new Date(Date.now() - 1000).toISOString() });

    const utils = renderScreen();
    await waitForCapture(utils);

    expect(utils.queryByTestId('pantry-last-preview')).toBeNull();
    expect(mockStorage.size).toBe(0);
  });

  it('desbloqueio responde 404: aviso some, id sai e aparece o aviso curto', async () => {
    mockAuthState.user = { id: 'user-1', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });
    mockUnlockPantryPreview.mockRejectedValueOnce(
      new PantryScannerServiceError('gone', 'errors.scanner_preview_expired', 'scanner/preview-not-found'),
    );

    const utils = renderScreen();
    await waitFor(() => {
      expect(utils.getByTestId('pantry-last-preview')).toBeTruthy();
    });
    fireEvent.press(utils.getByTestId('pantry-last-preview-open'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_preview_expired');
    });
    expect(utils.queryByTestId('pantry-last-preview')).toBeNull();
    expect(readLastPantryPreview('user-1')).toBeNull();
  });

  it('a prévia de outro usuário não aparece', async () => {
    mockAuthState.user = { id: 'user-2', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });

    const utils = renderScreen();
    await waitForCapture(utils);

    expect(utils.queryByTestId('pantry-last-preview')).toBeNull();
    expect(readLastPantryPreview('user-1')).not.toBeNull();
  });

  it('scan novo depois de ver as receitas desbloqueadas limpa o id; sem ver, mantém', async () => {
    mockAuthState.user = { id: 'user-1', isPro: true };
    saveLastPantryPreview('user-1', { previewId: PREVIEW_ID, expiresAt: EXPIRES_AT });
    mockAnalyzePantry.mockResolvedValue({
      ingredients: [{ name: 'banana', confidence: 'high' }],
      recipes: [fullRecipe('Fresh Scan')],
      noFoodDetected: false,
      scansUsed: 4,
      scansLimit: 3,
    });

    // Sem ter visto: o scan novo mantém a prévia guardada.
    const first = renderScreen();
    await scanFromGallery(first);
    await waitFor(() => {
      expect(first.getByText('pantryScanner.generateRecipes')).toBeTruthy();
    });
    expect(readLastPantryPreview('user-1')).not.toBeNull();
    first.unmount();

    // Depois de ver: o scan novo limpa.
    markLastPantryPreviewSeen('user-1', PREVIEW_ID);
    const second = renderScreen();
    await scanFromGallery(second);
    await waitFor(() => {
      expect(second.getByText('pantryScanner.generateRecipes')).toBeTruthy();
    });
    expect(readLastPantryPreview('user-1')).toBeNull();
  });
});
