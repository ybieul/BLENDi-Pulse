// CP-B6 — PantryScannerScreen × alergias: item da foto com alergia vem com
// "⚠️ Alergia" e desmarcado; marcar abre a confirmação NA HORA ("Não" deixa
// desmarcado); adicionar à mão um alérgeno também; alérgeno no "Algum
// pedido?" pergunta ao tocar em Gerar; a geração leva a confirmação; e o
// "Como usar" do Pantry, cujos exemplos preenchem o pedido.
// (CP-1.1.1d) e os outros estados com a mensagem própria.
//
// O fluxo é simulado pela galeria: permissão concedida → galeria → leitura
// (readPantryPhoto mockado) → ingredientes → gerar (generatePantryRecipes
// mockado).
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
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));

jest.mock('../components/pulseAi/RecipeCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Text } = require('react-native');
  return {
    RecipeCard: ({ recipe }: { recipe: { title: string } }) => <Text testID="recipe-card">{recipe.title}</Text>,
  };
});

// Folha de idade simplificada: os dois botões quando visível.
jest.mock('../components/pulseAi/AgeConfirmationSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Pressable, Text, View } = require('react-native');
  return {
    AgeConfirmationSheet: ({ visible, onAnswer }: { visible: boolean; onAnswer: (isAdult: boolean) => void }) =>
      visible ? (
        <View testID="age-confirmation-sheet">
          <Pressable testID="age-yes" onPress={() => onAnswer(true)}>
            <Text>yes</Text>
          </Pressable>
          <Pressable testID="age-no" onPress={() => onAnswer(false)}>
            <Text>no</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

const mockConfirmAlcoholAge = jest.fn<Promise<boolean>, [boolean]>();
jest.mock('../services/pulseAi.service', () => ({
  confirmAlcoholAge: (isAdult: boolean) => mockConfirmAlcoholAge(isAdult),
}));

jest.mock('../config/api', () => ({ api: {} }));

jest.mock('../hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [] }) }));

const mockAuthState: { user: Record<string, unknown> } = { user: { isPro: false } };
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAuthState),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));

// CP-C3: câmera trocada por react-native-vision-camera (aparelho de 1 lente:
// sem botões de lente, mesma ordem de botões de antes).
jest.mock('react-native-vision-camera', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- idem
  require('../testUtils/visionCameraMock').createVisionCameraMock(),
);

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => Promise.resolve({ canceled: false, assets: [{ uri: 'file://pantry.jpg' }] }),
  MediaTypeOptions: { Images: 'Images' },
}));

const mockReadPantryPhoto = jest.fn<Promise<unknown>, unknown[]>();
const mockGeneratePantry = jest.fn<Promise<unknown>, unknown[]>();
const mockCheckAllergy = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../services/pantryScanner.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pantryScanner.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    readPantryPhoto: (...args: unknown[]) => mockReadPantryPhoto(...args),
    generatePantryRecipes: (...args: unknown[]) => mockGeneratePantry(...args),
    checkPantryAllergy: (...args: unknown[]) => mockCheckAllergy(...args),
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

const RECIPE = {
  title: 'Banana Oat Shake',
  ingredients: [{ name: 'banana', amount: '1' }],
  macros: { protein: 10, carbs: 40, fat: 5, calories: 250 },
  prepTimeSeconds: 120,
  blendInstruction: 'Blend',
  tip: 'Tip',
  hasSubstitutes: false,
};

function readResult(overrides: Record<string, unknown> = {}) {
  return {
    readId: 'read-1',
    readExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ingredients: [
      { name: 'banana', confidence: 'high', isAlcoholic: false },
      { name: 'oats', confidence: 'medium', isAlcoholic: false },
    ],
    hasLiquid: true,
    noFoodDetected: false,
    alcoholAge: 'unknown',
    nextGenerationIsPreview: false,
    scansUsed: 1,
    scansLimit: 3,
    resetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function generated(overrides: Record<string, unknown> = {}) {
  return {
    ingredients: [{ name: 'banana', confidence: 'high' }],
    recipes: [RECIPE],
    noFoodDetected: false,
    scansUsed: 2,
    scansLimit: 3,
    readId: 'read-2',
    readExpiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    ...overrides,
  };
}


const mockNavigateUpgrade = jest.fn();

async function renderAndRead() {
  const navigation = {
    goBack: jest.fn(),
    isFocused: () => true,
    addListener: () => () => undefined,
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: mockNavigateUpgrade }) }),
  };
  const utils = render(<PantryScannerScreen {...({ navigation } as unknown as ScreenProps)} />);

  // Etapa de captura (permissão já concedida).
  await waitFor(() => {
    expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
  });
  // CP-C3a: a galeria pelo rótulo (não pela posição entre os botões).
  fireEvent.press(utils.getByLabelText('pantryScanner.galleryA11yLabel'));
  return utils;
}

type Screen = Awaited<ReturnType<typeof renderAndRead>>;

async function toIngredients(read = readResult()): Promise<Screen> {
  mockReadPantryPhoto.mockResolvedValueOnce(read);
  const utils = await renderAndRead();
  await waitFor(() => {
    expect(utils.getByTestId('pantry-generate-button')).toBeTruthy();
  });
  return utils;
}

function pressGenerate(utils: Screen) {
  fireEvent.press(utils.getByTestId('pantry-generate-button'));
}

function lastGenerateBody(): Record<string, unknown> {
  const call = mockGeneratePantry.mock.calls.at(-1);
  if (!call) throw new Error('generatePantryRecipes não foi chamado');
  return call[0] as Record<string, unknown>;
}


beforeEach(() => {
  mockAuthState.user = { isPro: false };
  mockReadPantryPhoto.mockReset();
  mockGeneratePantry.mockReset();
  mockConfirmAlcoholAge.mockReset();
  mockShowToast.mockReset();
  mockNavigateUpgrade.mockReset();
});


const PEANUT = { common: ['peanut' as const], custom: [] };

const PEANUT_READ = readResult({
  ingredients: [
    { name: 'banana', confidence: 'high', isAlcoholic: false },
    { name: 'peanut butter', confidence: 'high', isAlcoholic: false, isAllergen: true, allergens: PEANUT },
  ],
});

function isChecked(utils: Screen, testID: string): boolean {
  const props = utils.getByTestId(testID).props as { accessibilityState?: { checked?: boolean } };
  return props.accessibilityState?.checked === true;
}

beforeEach(() => {
  mockAuthState.user = { isPro: false, allergies: { common: ['peanut'], custom: [] } };
  mockReadPantryPhoto.mockReset();
  mockGeneratePantry.mockReset();
  mockCheckAllergy.mockReset();
});

describe('PantryScannerScreen — alergias (CP-B6)', () => {
  it('item com alergia: rótulo "⚠️ Alergia", desmarcado e fora do pedido', async () => {
    const utils = await toIngredients(PEANUT_READ);

    expect(utils.getByTestId('pantry-ingredient-1-allergy').props.children).toBe('allergies.pantryLabel');
    expect(isChecked(utils, 'pantry-ingredient-1')).toBe(false);

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => {
      expect(mockGeneratePantry).toHaveBeenCalledTimes(1);
    });
    expect(lastGenerateBody().selected).toEqual(['banana']);
    expect(lastGenerateBody().allergyOverride).toBeUndefined();
  });

  it('marcar abre a confirmação na hora; "Não" deixa desmarcado', async () => {
    const utils = await toIngredients(PEANUT_READ);

    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    fireEvent.press(utils.getByTestId('allergy-confirmation-decline'));

    await waitFor(() => {
      expect(utils.queryByTestId('allergy-confirmation-sheet')).toBeNull();
    });
    expect(isChecked(utils, 'pantry-ingredient-1')).toBe(false);
  });

  it('"Sim, incluir" marca e a geração leva a confirmação daquela leitura', async () => {
    const utils = await toIngredients(PEANUT_READ);

    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    fireEvent.press(utils.getByTestId('allergy-confirmation-confirm'));
    await waitFor(() => {
      expect(isChecked(utils, 'pantry-ingredient-1')).toBe(true);
    });

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => {
      expect(mockGeneratePantry).toHaveBeenCalledTimes(1);
    });
    expect(lastGenerateBody().selected).toEqual(['banana', 'peanut butter']);
    expect(lastGenerateBody().allergyOverride).toEqual(PEANUT);
  });

  it('adicionar à mão um alérgeno abre a confirmação antes de entrar na lista', async () => {
    mockCheckAllergy.mockResolvedValueOnce({ isAllergen: true, allergens: PEANUT });
    const utils = await toIngredients();

    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'paçoca');
    fireEvent.press(utils.getByTestId('pantry-add-button'));

    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    });
    expect(utils.queryAllByTestId('pantry-added-item')).toHaveLength(0);
    fireEvent.press(utils.getByTestId('allergy-confirmation-confirm'));
    await waitFor(() => {
      expect(utils.getAllByTestId('pantry-added-item')).toHaveLength(1);
    });
  });

  it('sem alergia cadastrada, adicionar não consulta o backend', async () => {
    mockAuthState.user = { isPro: false };
    const utils = await toIngredients();

    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'cacau');
    fireEvent.press(utils.getByTestId('pantry-add-button'));

    expect(utils.getAllByTestId('pantry-added-item')).toHaveLength(1);
    expect(mockCheckAllergy).not.toHaveBeenCalled();
  });

  it('alérgeno no "Algum pedido?": 428 na geração abre a folha; "Não" reenvia recusado; sem laço', async () => {
    const utils = await toIngredients();
    fireEvent.changeText(utils.getByTestId('pantry-request-input'), 'com amendoim');

    mockGeneratePantry
      .mockRejectedValueOnce(
        new PantryScannerServiceError('allergy', 'errors.scanner_allergy_confirmation_required', 'scanner/allergy-confirmation-required', PEANUT),
      )
      .mockResolvedValueOnce(generated());
    pressGenerate(utils);

    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    });
    fireEvent.press(utils.getByTestId('allergy-confirmation-decline'));

    await waitFor(() => {
      expect(mockGeneratePantry).toHaveBeenCalledTimes(2);
    });
    expect(lastGenerateBody().allergyDeclined).toEqual(PEANUT);
    expect(lastGenerateBody().allergyOverride).toBeUndefined();
  });
});

describe('PantryScannerScreen — Como usar (CP-B6)', () => {
  it('botão no cabeçalho; exemplos preenchem o "Algum pedido?" sem gerar', async () => {
    const utils = await toIngredients();

    fireEvent.press(utils.getByTestId('pantry-how-to-use-button'));
    expect(utils.getByTestId('pantry-how-to-use-sheet')).toBeTruthy();
    for (const key of ['photo', 'mark', 'otherItems', 'added', 'liquid', 'alcohol', 'allergies', 'scan']) {
      expect(utils.getByText(`pantryScanner.howToUse.${key}`)).toBeTruthy();
    }

    fireEvent.press(utils.getByTestId('pantry-how-to-use-example-exampleProtein'));

    expect(utils.getByTestId('pantry-request-input').props.value).toBe('pantryScanner.howToUse.exampleProtein');
    expect(mockGeneratePantry).not.toHaveBeenCalled();
    expect(utils.queryByTestId('pantry-how-to-use-sheet')).toBeNull();
  });
});
