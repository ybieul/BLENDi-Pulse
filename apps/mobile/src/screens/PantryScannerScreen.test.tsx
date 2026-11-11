// PantryScannerScreen — estado vazio quando a IA não entrega receita
// (CP-1.1.1d: o backend devolve 200 com recipes vazio e o scan é devolvido) e
// os outros estados, que continuam com a mensagem própria.
//
// O fluxo é simulado pela galeria: permissão concedida → galeria → análise
// (analyzePantry mockado) → ingredientes → gerar receitas.
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

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  return { SafeAreaView: View };
});

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

jest.mock('../components/pulseAi/RecipeCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Text } = require('react-native');
  return {
    RecipeCard: ({ recipe }: { recipe: { title: string } }) => <Text testID="recipe-card">{recipe.title}</Text>,
  };
});

jest.mock('../config/api', () => ({ api: {} }));

jest.mock('../hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [] }) }));

jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ user: { isPro: false } }),
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
jest.mock('../services/pantryScanner.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pantryScanner.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    analyzePantry: (...args: unknown[]) => mockAnalyzePantry(...args),
    compressAndEncodeImage: () => Promise.resolve({ ok: true, imageBase64: 'base64' }),
  };
});

const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.events', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { PantryScannerServiceError } from '../services/pantryScanner.service';
import { PantryScannerScreen } from './PantryScannerScreen';

type ScreenProps = Parameters<typeof PantryScannerScreen>[0];

const INGREDIENTS = [
  { name: 'banana', confidence: 'high' },
  { name: 'oats', confidence: 'medium' },
];

const RECIPE = {
  title: 'Banana Oat Shake',
  ingredients: [{ name: 'banana', amount: '1' }],
  macros: { protein: 10, carbs: 40, fat: 5, calories: 250 },
  prepTimeSeconds: 120,
  blendInstruction: 'Blend',
  tip: 'Tip',
  hasSubstitutes: false,
};

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    ingredients: INGREDIENTS,
    recipes: [],
    noFoodDetected: false,
    scansUsed: 2,
    scansLimit: 5,
    resetDate: undefined,
    ...overrides,
  };
}

const mockNavigateUpgrade = jest.fn();

async function renderAndScan() {
  const navigation = {
    goBack: jest.fn(),
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: mockNavigateUpgrade }) }),
  };
  const utils = render(<PantryScannerScreen {...({ navigation } as unknown as ScreenProps)} />);

  // Etapa de captura (permissão já concedida): botões fechar, galeria, capturar.
  await waitFor(() => {
    expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
  });
  const galleryButton = utils.getAllByRole('button')[1];
  if (!galleryButton) throw new Error('botão da galeria não encontrado');
  fireEvent.press(galleryButton);
  return utils;
}

beforeEach(() => {
  mockAnalyzePantry.mockReset();
  mockShowToast.mockReset();
  mockNavigateUpgrade.mockReset();
});

describe('PantryScannerScreen — sem receita', () => {
  it('lista vazia: mostra o estado vazio com a mensagem e mantém "Escanear novamente"', async () => {
    mockAnalyzePantry.mockResolvedValueOnce(analysis({ recipes: [] }));
    const utils = await renderAndScan();

    await waitFor(() => {
      expect(utils.getByText('pantryScanner.generateRecipes')).toBeTruthy();
    });
    fireEvent.press(utils.getByText('pantryScanner.generateRecipes'));

    expect(utils.getByTestId('pantry-no-recipes')).toBeTruthy();
    expect(utils.getByText('pantryScanner.noRecipesTitle')).toBeTruthy();
    expect(utils.getByText('pantryScanner.noRecipesMessage')).toBeTruthy();
    expect(utils.queryByTestId('recipe-card')).toBeNull();
    // O "com base em…" sai: não há receita baseada em nada.
    expect(utils.queryByText(/pantryScanner\.basedOnIngredients/)).toBeNull();

    // "Escanear novamente" continua e volta para a câmera.
    fireEvent.press(utils.getByText('pantryScanner.scanAgain'));
    await waitFor(() => {
      expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
    });
    // O contador vem do backend: 5 - 2 (scan devolvido) = 3.
    expect(utils.getByText('pantryScanner.scansRemaining:{"count":3}')).toBeTruthy();
  });

  it('com receita: cards e subtítulo, sem o estado vazio', async () => {
    mockAnalyzePantry.mockResolvedValueOnce(analysis({ recipes: [RECIPE], scansUsed: 3 }));
    const utils = await renderAndScan();

    await waitFor(() => {
      expect(utils.getByText('pantryScanner.generateRecipes')).toBeTruthy();
    });
    fireEvent.press(utils.getByText('pantryScanner.generateRecipes'));

    expect(utils.getAllByTestId('recipe-card')).toHaveLength(1);
    expect(utils.getByText(/pantryScanner\.basedOnIngredients/)).toBeTruthy();
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();
  });
});

describe('PantryScannerScreen — os outros estados continuam com a mensagem própria', () => {
  async function expectBackToCameraWithoutEmptyState(utils: Awaited<ReturnType<typeof renderAndScan>>) {
    await waitFor(() => {
      expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
    });
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();
    expect(utils.queryByText('pantryScanner.noRecipesMessage')).toBeNull();
  }

  it('nenhuma comida detectada', async () => {
    mockAnalyzePantry.mockResolvedValueOnce(analysis({ noFoodDetected: true, ingredients: [] }));
    const utils = await renderAndScan();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('pantryScanner.noFoodDetected');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('nenhum ingrediente utilizável', async () => {
    mockAnalyzePantry.mockResolvedValueOnce(analysis({ noUsableIngredients: true, ingredients: [] }));
    const utils = await renderAndScan();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('pantryScanner.noUsableIngredients');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('limite de scans: abre o Upgrade', async () => {
    mockAnalyzePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('limit', 'errors.scanner_monthly_limit_reached', 'scanner/monthly-limit-reached'),
    );
    const utils = await renderAndScan();
    await waitFor(() => {
      expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('dieta não atendida (scanner/dietary-restriction-unmet)', async () => {
    mockAnalyzePantry.mockRejectedValueOnce(
      new PantryScannerServiceError(
        'diet',
        'errors.scanner_dietary_restriction_unmet',
        'scanner/dietary-restriction-unmet',
      ),
    );
    const utils = await renderAndScan();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_dietary_restriction_unmet');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('erro de rede', async () => {
    mockAnalyzePantry.mockRejectedValueOnce(new Error('Network Error'));
    const utils = await renderAndScan();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.network_internal_server_error');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });
});
