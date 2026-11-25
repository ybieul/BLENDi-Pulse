// PantryScannerScreen — fluxo em duas etapas (CP-B7): foto → leitura (não
// conta scan) → confirmação com efeito real → geração (conta o scan) →
// receitas. Também o estado vazio quando a IA não entrega receita
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

const mockAuthState: { user: { isPro: boolean } } = { user: { isPro: false } };
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

const mockReadPantryPhoto = jest.fn<Promise<unknown>, unknown[]>();
const mockGeneratePantry = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../services/pantryScanner.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pantryScanner.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    readPantryPhoto: (...args: unknown[]) => mockReadPantryPhoto(...args),
    generatePantryRecipes: (...args: unknown[]) => mockGeneratePantry(...args),
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

const RUM_READ = readResult({
  ingredients: [
    { name: 'pineapple', confidence: 'high', isAlcoholic: false },
    { name: 'white rum', confidence: 'high', isAlcoholic: true },
  ],
});

const mockNavigateUpgrade = jest.fn();

async function renderAndRead() {
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

function isDisabled(utils: Screen, testID: string): boolean {
  const props = utils.getByTestId(testID).props as { accessibilityState?: { disabled?: boolean } };
  return props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  mockAuthState.user = { isPro: false };
  mockReadPantryPhoto.mockReset();
  mockGeneratePantry.mockReset();
  mockConfirmAlcoholAge.mockReset();
  mockShowToast.mockReset();
  mockNavigateUpgrade.mockReset();
});

describe('PantryScannerScreen — fluxo em duas etapas (CP-B7)', () => {
  it('foto → leitura → confirmação → geração → receitas; desmarcar e adicionar mudam o pedido enviado', async () => {
    const utils = await toIngredients();
    expect(mockReadPantryPhoto).toHaveBeenCalledWith('base64', 'image/jpeg');
    expect(mockGeneratePantry).not.toHaveBeenCalled();

    // Desmarca "oats" e adiciona dois itens (o segundo pelo botão).
    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'Whey ');
    fireEvent(utils.getByTestId('pantry-add-input'), 'submitEditing');
    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'cacau');
    fireEvent.press(utils.getByTestId('pantry-add-button'));
    expect(utils.getAllByTestId('pantry-added-item')).toHaveLength(2);
    expect(utils.getAllByText('pantryScanner.addedLabel')).toHaveLength(2);

    // Remover um adicionado.
    fireEvent.press(utils.getByLabelText('pantryScanner.removeAdded:{"name":"cacau"}'));
    expect(utils.getAllByTestId('pantry-added-item')).toHaveLength(1);

    fireEvent.changeText(utils.getByTestId('pantry-request-input'), ' com 30 g de proteína ');
    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);

    await waitFor(() => {
      expect(utils.getAllByTestId('recipe-card')).toHaveLength(1);
    });
    expect(lastGenerateBody()).toEqual({
      readId: 'read-1',
      selected: ['banana'],
      added: ['Whey'],
      request: 'com 30 g de proteína',
    });
  });

  it('adicionar um item que já veio da foto só marca o item (não vira "você adicionou")', async () => {
    const utils = await toIngredients();
    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'Oats');
    fireEvent.press(utils.getByTestId('pantry-add-button'));

    expect(utils.queryByTestId('pantry-added-item')).toBeNull();
    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().selected).toEqual(['banana', 'oats']);
  });

  it('sem líquido na foto: a pergunta aparece e escolher é obrigatório antes de gerar', async () => {
    const utils = await toIngredients(readResult({ hasLiquid: false }));

    expect(utils.getByTestId('pantry-liquid-question')).toBeTruthy();
    expect(isDisabled(utils, 'pantry-generate-button')).toBe(true);

    fireEvent.press(utils.getByTestId('pantry-liquid-none'));
    expect((utils.getByTestId('pantry-liquid-none').props as { accessibilityState: { selected: boolean } }).accessibilityState.selected).toBe(true);
    expect(isDisabled(utils, 'pantry-generate-button')).toBe(false);

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().liquid).toBe('none');
  });

  it('com líquido na foto: sem pergunta e sem liquid no pedido', async () => {
    const utils = await toIngredients();
    expect(utils.queryByTestId('pantry-liquid-question')).toBeNull();

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody()).not.toHaveProperty('liquid');
  });

  it('aviso de scan: free "Usa 1 dos seus N"; prévia avisa; Pro sem contagem', async () => {
    let utils = await toIngredients();
    expect(utils.getByTestId('pantry-scan-notice').props.children).toBe('pantryScanner.usesScan:{"count":2}');
    utils.unmount();

    utils = await toIngredients(readResult({ scansUsed: 3, nextGenerationIsPreview: true }));
    expect(utils.getByTestId('pantry-scan-notice').props.children).toBe('pantryScanner.usesPreview');
    utils.unmount();

    mockAuthState.user = { isPro: true };
    utils = await toIngredients();
    expect(utils.queryByTestId('pantry-scan-notice')).toBeNull();
  });

  it('voltar das receitas para editar: aviso de novo scan e o novo readId, sem nova leitura', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(utils.getByTestId('pantry-edit-ingredients')).toBeTruthy());

    fireEvent.press(utils.getByTestId('pantry-edit-ingredients'));
    expect(utils.getByTestId('pantry-regenerate-notice').props.children).toBe('pantryScanner.regenerateNotice');
    expect(utils.getByTestId('pantry-scan-notice').props.children).toBe('pantryScanner.usesScan:{"count":1}');

    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    mockGeneratePantry.mockResolvedValueOnce(generated({ readId: 'read-3', scansUsed: 3 }));
    pressGenerate(utils);

    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalledTimes(2));
    expect(lastGenerateBody()).toMatchObject({ readId: 'read-2', selected: ['banana'] });
    expect(mockReadPantryPhoto).toHaveBeenCalledTimes(1);
  });

  it('leitura expirada na geração: aviso e volta para a câmera (nova foto)', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('gone', 'errors.scanner_read_expired', 'scanner/read-expired'),
    );
    pressGenerate(utils);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_read_expired'));
    await waitFor(() => expect(utils.getByLabelText('common.actions.close')).toBeTruthy());
  });

  it('leitura vencida no aparelho: pede nova foto sem chamar a geração', async () => {
    const utils = await toIngredients(readResult({ readExpiresAt: new Date(Date.now() - 1000).toISOString() }));
    pressGenerate(utils);

    expect(mockGeneratePantry).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_read_expired');
    await waitFor(() => expect(utils.getByLabelText('common.actions.close')).toBeTruthy());
  });
});

describe('PantryScannerScreen — álcool (CP-B7)', () => {
  it('item alcoólico: rótulo, desmarcado por padrão e fora do pedido', async () => {
    const utils = await toIngredients(RUM_READ);

    expect(utils.getByText('pantryScanner.alcoholicLabel')).toBeTruthy();
    const rum = utils.getByTestId('pantry-ingredient-1').props as { accessibilityState: { checked: boolean } };
    expect(rum.accessibilityState.checked).toBe(false);

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().selected).toEqual(['pineapple']);
  });

  it('menor/"Não": item alcoólico desativado, não marca', async () => {
    const utils = await toIngredients({ ...RUM_READ, alcoholAge: 'under-age' });

    expect(utils.getByText('pantryScanner.alcoholicUnavailable')).toBeTruthy();
    expect(isDisabled(utils, 'pantry-ingredient-1')).toBe(true);
    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    expect((utils.getByTestId('pantry-ingredient-1').props as { accessibilityState: { checked: boolean } }).accessibilityState.checked).toBe(false);
    expect(utils.queryByTestId('age-confirmation-sheet')).toBeNull();
  });

  it('21+: marca direto, sem pergunta', async () => {
    const utils = await toIngredients({ ...RUM_READ, alcoholAge: 'of-age' });
    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));

    expect(utils.queryByTestId('age-confirmation-sheet')).toBeNull();
    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().selected).toEqual(['pineapple', 'white rum']);
  });

  it('sem idade: marcar abre a folha; "Tenho 21+" grava pelo POST do Pulse AI e marca', async () => {
    mockConfirmAlcoholAge.mockResolvedValueOnce(true);
    const utils = await toIngredients(RUM_READ);

    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy();
    fireEvent.press(utils.getByTestId('age-yes'));

    await waitFor(() => {
      expect((utils.getByTestId('pantry-ingredient-1').props as { accessibilityState: { checked: boolean } }).accessibilityState.checked).toBe(true);
    });
    expect(mockConfirmAlcoholAge).toHaveBeenCalledWith(true);
  });

  it('sem idade: "Não" deixa o item desmarcado e desativado', async () => {
    mockConfirmAlcoholAge.mockResolvedValueOnce(false);
    const utils = await toIngredients(RUM_READ);

    fireEvent.press(utils.getByTestId('pantry-ingredient-1'));
    fireEvent.press(utils.getByTestId('age-no'));

    await waitFor(() => expect(isDisabled(utils, 'pantry-ingredient-1')).toBe(true));
    expect((utils.getByTestId('pantry-ingredient-1').props as { accessibilityState: { checked: boolean } }).accessibilityState.checked).toBe(false);
  });

  it('428 na geração (álcool adicionado ou pedido): abre a folha e reenvia depois da resposta', async () => {
    const utils = await toIngredients();
    fireEvent.changeText(utils.getByTestId('pantry-request-input'), 'com rum');
    mockGeneratePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('age', 'errors.pulseai_age_confirmation_required', 'scanner/age-confirmation-required'),
    );
    pressGenerate(utils);

    await waitFor(() => expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy());
    expect(mockShowToast).not.toHaveBeenCalled();

    mockConfirmAlcoholAge.mockResolvedValueOnce(true);
    mockGeneratePantry.mockResolvedValueOnce(generated());
    fireEvent.press(utils.getByTestId('age-yes'));

    await waitFor(() => expect(utils.getAllByTestId('recipe-card')).toHaveLength(1));
    expect(mockGeneratePantry).toHaveBeenCalledTimes(2);
    expect(lastGenerateBody()).toMatchObject({ readId: 'read-1', request: 'com rum' });
  });
});

describe('PantryScannerScreen — sem receita (CP-1.1.1d)', () => {
  it('lista vazia: mostra o estado vazio com a mensagem e mantém "Escanear novamente"', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockResolvedValueOnce(generated({ recipes: [], scansUsed: 1, readId: 'read-1' }));
    pressGenerate(utils);

    await waitFor(() => expect(utils.getByTestId('pantry-no-recipes')).toBeTruthy());
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
    // O contador vem do backend: 3 - 1 (scan devolvido) = 2.
    expect(utils.getByText('pantryScanner.scansRemaining:{"count":2}')).toBeTruthy();
  });

  it('com receita: cards e subtítulo, sem o estado vazio', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);

    await waitFor(() => expect(utils.getAllByTestId('recipe-card')).toHaveLength(1));
    expect(utils.getByText(/pantryScanner\.basedOnIngredients/)).toBeTruthy();
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();
  });
});

describe('PantryScannerScreen — os outros estados continuam com a mensagem própria', () => {
  async function expectBackToCameraWithoutEmptyState(utils: Screen) {
    await waitFor(() => {
      expect(utils.getByLabelText('common.actions.close')).toBeTruthy();
    });
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();
    expect(utils.queryByText('pantryScanner.noRecipesMessage')).toBeNull();
  }

  it('nenhuma comida detectada', async () => {
    mockReadPantryPhoto.mockResolvedValueOnce(readResult({ noFoodDetected: true, ingredients: [], readId: undefined }));
    const utils = await renderAndRead();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('pantryScanner.noFoodDetected');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('nenhum ingrediente utilizável', async () => {
    mockReadPantryPhoto.mockResolvedValueOnce(readResult({ noUsableIngredients: true, ingredients: [], readId: undefined }));
    const utils = await renderAndRead();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('pantryScanner.noUsableIngredients');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('free sem leituras: mensagem própria e Upgrade', async () => {
    mockReadPantryPhoto.mockRejectedValueOnce(
      new PantryScannerServiceError('limit', 'errors.scanner_read_limit_reached', 'scanner/read-limit-reached'),
    );
    const utils = await renderAndRead();
    await waitFor(() => {
      expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade');
    });
    expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_read_limit_reached');
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('Pro: "aguarde um momento", sem Upgrade', async () => {
    mockAuthState.user = { isPro: true };
    mockReadPantryPhoto.mockRejectedValueOnce(
      new PantryScannerServiceError('wait', 'errors.scanner_read_rate_limited', 'scanner/read-rate-limited'),
    );
    const utils = await renderAndRead();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_read_rate_limited');
    });
    expect(mockNavigateUpgrade).not.toHaveBeenCalled();
    await expectBackToCameraWithoutEmptyState(utils);
  });

  it('limite de scans na geração: abre o Upgrade e fica na confirmação', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('limit', 'errors.scanner_monthly_limit_reached', 'scanner/monthly-limit-reached'),
    );
    pressGenerate(utils);
    await waitFor(() => expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade'));
    expect(utils.getByTestId('pantry-generate-button')).toBeTruthy();
  });

  // CP-B7: a dieta não atendida vem da geração; a pessoa fica na
  // confirmação para ajustar (antes voltava para a câmera).
  it('dieta não atendida (scanner/dietary-restriction-unmet): aviso e fica na confirmação', async () => {
    const utils = await toIngredients();
    mockGeneratePantry.mockRejectedValueOnce(
      new PantryScannerServiceError('diet', 'errors.scanner_dietary_restriction_unmet', 'scanner/dietary-restriction-unmet'),
    );
    pressGenerate(utils);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_dietary_restriction_unmet');
    });
    expect(utils.getByTestId('pantry-generate-button')).toBeTruthy();
    expect(utils.queryByTestId('pantry-no-recipes')).toBeNull();
  });

  it('erro de rede na leitura', async () => {
    mockReadPantryPhoto.mockRejectedValueOnce(new Error('Network Error'));
    const utils = await renderAndRead();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('errors.network_internal_server_error');
    });
    await expectBackToCameraWithoutEmptyState(utils);
  });
});

describe('PantryScannerScreen — "Outros itens na foto" (CP-B7)', () => {
  const OTHER_ITEMS_READ = readResult({
    ingredients: [
      { name: 'banana', confidence: 'high', isAlcoholic: false, blendSuitable: true },
      { name: 'ketchup', confidence: 'high', isAlcoholic: false, blendSuitable: false },
      { name: 'pickles', confidence: 'medium', isAlcoholic: false, blendSuitable: false },
      { name: 'white rum', confidence: 'high', isAlcoholic: true, blendSuitable: true },
    ],
  });

  function expandedState(utils: Screen): boolean | undefined {
    const props = utils.getByTestId('pantry-other-items-toggle').props as { accessibilityState?: { expanded?: boolean } };
    return props.accessibilityState?.expanded;
  }

  it('grupo recolhido com a contagem; ao abrir, os itens aparecem desmarcados; fora do pedido', async () => {
    const utils = await toIngredients(OTHER_ITEMS_READ);

    const toggle = utils.getByTestId('pantry-other-items-toggle');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityLabel).toBe('pantryScanner.otherItemsTitle:{"count":2}');
    expect(toggle.props.accessibilityHint).toBe('pantryScanner.otherItemsA11yHint');
    expect(expandedState(utils)).toBe(false);
    expect(utils.queryByTestId('pantry-ingredient-1')).toBeNull();
    expect(utils.queryByTestId('pantry-ingredient-2')).toBeNull();
    // A bebida alcoólica fica no grupo principal (desmarcada, com rótulo).
    expect(utils.getByTestId('pantry-ingredient-3')).toBeTruthy();
    expect(utils.getByText('pantryScanner.alcoholicLabel')).toBeTruthy();

    fireEvent.press(toggle);
    expect(expandedState(utils)).toBe(true);
    expect(utils.getByText('pantryScanner.otherItemsHint')).toBeTruthy();
    for (const testID of ['pantry-ingredient-1', 'pantry-ingredient-2']) {
      const props = utils.getByTestId(testID).props as { accessibilityRole: string; accessibilityState: { checked: boolean } };
      expect(props.accessibilityRole).toBe('checkbox');
      expect(props.accessibilityState.checked).toBe(false);
    }

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().selected).toEqual(['banana']);
  });

  it('marcar um item de "Outros itens" o leva para o pedido', async () => {
    const utils = await toIngredients(OTHER_ITEMS_READ);
    fireEvent.press(utils.getByTestId('pantry-other-items-toggle'));
    fireEvent.press(utils.getByTestId('pantry-ingredient-2'));

    mockGeneratePantry.mockResolvedValueOnce(generated());
    pressGenerate(utils);
    await waitFor(() => expect(mockGeneratePantry).toHaveBeenCalled());
    expect(lastGenerateBody().selected).toEqual(['banana', 'pickles']);
  });

  it('digitar o nome de um item de "Outros itens" marca o item e abre o grupo', async () => {
    const utils = await toIngredients(OTHER_ITEMS_READ);
    fireEvent.changeText(utils.getByTestId('pantry-add-input'), 'Ketchup');
    fireEvent.press(utils.getByTestId('pantry-add-button'));

    expect(utils.queryByTestId('pantry-added-item')).toBeNull();
    expect(expandedState(utils)).toBe(true);
    const ketchup = utils.getByTestId('pantry-ingredient-1').props as { accessibilityState: { checked: boolean } };
    expect(ketchup.accessibilityState.checked).toBe(true);
  });

  it('sem "Outros itens": nenhum grupo', async () => {
    const utils = await toIngredients();
    expect(utils.queryByTestId('pantry-other-items')).toBeNull();
  });
});
