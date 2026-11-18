// CP-B5 — PulseAIScreen: botão "Como usar" (exemplos preenchem o campo, sem
// enviar; nenhum exemplo de álcool) e confirmação única de idade (código do
// backend → folha → grava → reenvia o mesmo pedido sem repetir o balão).
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';

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

jest.mock('../hooks/useDateFormat', () => ({
  useDateFormat: () => ({ formatTime: () => '10:00' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('../components/pulseAi/UsageIndicator', () => ({ UsageIndicator: () => null }));
jest.mock('../components/pulseAi/ChatMessageSkeleton', () => ({ ChatMessageSkeleton: () => null }));
jest.mock('../assets', () => ({ images: { blendiLogo: 1 } }));

// ChatInput real depende de navegação e teclado: aqui um campo simulado que
// expõe setText (o "Como usar" preenche) e um botão que envia.
jest.mock('../components/pulseAi/ChatInput', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Pressable, Text } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- idem
  const React = require('react') as typeof import('react');
  const MockChatInput = React.forwardRef(function MockChatInput(
    { onSend }: { onSend: (text: string) => void },
    ref: React.ForwardedRef<{ setText: (text: string) => void }>,
  ) {
    const [text, setText] = React.useState('');
    React.useImperativeHandle(ref, () => ({ setText }), []);
    return (
      <>
        <Text testID="input-text">{text}</Text>
        <Pressable testID="send" onPress={() => onSend(mockOutgoingMessage)} />
      </>
    );
  });
  return { ChatInput: MockChatInput };
});

// RecipeCard completo é testado à parte; aqui só a marca de "card normal".
// O LockedRecipeCard é o real.
jest.mock('../components/pulseAi/RecipeCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Text } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../components/pulseAi/RecipeCard');
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- idem
    LockedRecipeCard: actual.LockedRecipeCard,
    RecipeCard: ({ recipe }: { recipe: { title: string; ingredients: Array<{ name: string }> } }) => (
      <Text testID="recipe-card">{`${recipe.title}|${recipe.ingredients.map((i) => i.name).join(',')}`}</Text>
    ),
  };
});
jest.mock('../hooks/useFavorites', () => ({
  useFavorites: () => ({ favorites: [] }),
  useAddFavorite: () => ({ isPending: false, mutate: jest.fn() }),
  useRemoveFavorite: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock('../utils/shareCard.utils', () => ({ generateAndShare: jest.fn() }));
jest.mock('../utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../components/shareCards/RecipeShareCard', () => ({ RecipeShareCard: () => null }));
jest.mock('../components/shareCards/ShareFormatSheet', () => ({ ShareFormatSheet: () => null }));
jest.mock('../components/shoppingList/AddToListSheet', () => ({ AddToListSheet: () => null }));
jest.mock('../components/ui/AuthButton', () => ({ AuthButton: () => null }));

jest.mock('../config/api', () => ({ api: {} }));
jest.mock('../locales/i18n', () => ({ __esModule: true, default: { language: 'en' } }));
jest.mock('../utils/xp.utils', () => ({ handleXPResponse: jest.fn(), handleMissionResponse: jest.fn() }));

let mockAuthState = { user: { isPro: false, goal: 'Wellness' } };
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAuthState),
}));
jest.mock('../store/network.store', () => ({
  useNetworkStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ isConnected: true }),
}));
jest.mock('../store/pulseAi.store', () => ({
  usePulseAIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ pendingProtocol: null, clearPendingProtocol: jest.fn() }),
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries, getQueryData: () => undefined }),
}));

const mockTrackEvent = jest.fn<void, unknown[]>();
jest.mock('../services/analytics.service', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.events', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

const mockSendMessage = jest.fn<Promise<unknown>, unknown[]>();
const mockUnlockPreview = jest.fn<Promise<unknown>, unknown[]>();
const mockConfirmAlcoholAge = jest.fn<Promise<unknown>, unknown[]>();
let mockOutgoingMessage = 'caipirinha de morango';
jest.mock('../services/pulseAi.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pulseAi.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    unlockPreview: (...args: unknown[]) => mockUnlockPreview(...args),
    confirmAlcoholAge: (...args: unknown[]) => mockConfirmAlcoholAge(...args),
    getUsage: () => Promise.resolve({ dailyAiUsage: 3, isPro: false }),
  };
});

jest.mock('../services/conversation.service', () => ({
  getConversations: () => Promise.resolve([]),
  getConversationById: jest.fn(),
}));

import { AGE_CONFIRMATION_REQUIRED_CODE, PulseAiServiceError } from '../services/pulseAi.service';
import { HOW_TO_USE_EXAMPLE_KEYS } from '../components/pulseAi/HowToUseSheet';
import { PulseAIScreen } from './PulseAIScreen';

type ScreenProps = Parameters<typeof PulseAIScreen>[0];

const RECIPE = {
  title: 'Caipirinha de morango',
  ingredients: [{ name: 'Cachaça', amount: '50 ml' }],
  macros: { protein: 1, carbs: 20, fat: 0, calories: 196 },
  alcoholGrams: 16,
  prepTimeSeconds: 60,
  blendInstruction: 'Bata por 20 segundos.',
  hasSubstitutes: false,
};

const RESULT = {
  recipe: RECIPE,
  fromCache: false,
  usageRemaining: 2,
  xpAwarded: 10,
  conversationId: 'conversation-1',
  macrosValidated: true,
};

function ageError() {
  return new PulseAiServiceError('Age confirmation is required.', 'errors.pulseai_age_confirmation_required', AGE_CONFIRMATION_REQUIRED_CODE);
}

function makeProps() {
  const navigation = {
    addListener: () => () => undefined,
    setParams: jest.fn(),
    push: jest.fn(),
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  };
  return { navigation, route: { params: undefined } } as unknown as ScreenProps;
}

beforeEach(() => {
  mockAuthState = { user: { isPro: false, goal: 'Wellness' } };
  mockSendMessage.mockReset();
  mockUnlockPreview.mockReset();
  mockConfirmAlcoholAge.mockReset();
  mockOutgoingMessage = 'caipirinha de morango';
});

describe('PulseAIScreen — Como usar (CP-B5)', () => {
  it('botão acessível no cabeçalho abre a folha com a regra, os exemplos e o limite', () => {
    const utils = render(<PulseAIScreen {...makeProps()} />);
    const button = utils.getByTestId('pulse-ai-how-to-use-button');
    expect(button.props.accessibilityLabel).toBe('pulseAi.howToUse.a11yLabel');

    fireEvent.press(button);

    expect(utils.getByTestId('how-to-use-sheet')).toBeTruthy();
    expect(utils.getByText('pulseAi.howToUse.rule')).toBeTruthy();
    expect(utils.getByText('pulseAi.howToUse.limit')).toBeTruthy();
    for (const key of HOW_TO_USE_EXAMPLE_KEYS) {
      expect(utils.getByText(key)).toBeTruthy();
    }
  });

  it('tocar num exemplo preenche o campo, fecha a folha e NÃO envia', () => {
    const utils = render(<PulseAIScreen {...makeProps()} />);
    fireEvent.press(utils.getByTestId('pulse-ai-how-to-use-button'));

    fireEvent.press(utils.getByText('pulseAi.howToUse.exampleOffDiet'));

    expect(utils.getByTestId('input-text').props.children).toBe('pulseAi.howToUse.exampleOffDiet');
    expect(utils.queryByTestId('how-to-use-sheet')).toBeNull();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('textos reais: 6 exemplos em en e pt-BR, nenhum com álcool, sem marca de terceiros', () => {
    const alcohol = /alco|álcool|rum|vodka|gin\b|cacha|wine|vinho|beer|cerveja|caipirinha|mojito|colada|drink|tequila|whisk/i;
    for (const locale of [en, ptBR]) {
      const howTo = locale.pulseAi.howToUse as Record<string, string>;
      const examples = HOW_TO_USE_EXAMPLE_KEYS.map((key) => howTo[key.split('.').pop() as string]);
      expect(examples).toHaveLength(6);
      for (const example of examples) {
        expect(example.trim().length).toBeGreaterThan(0);
        expect(example).not.toMatch(alcohol);
        expect(example).not.toMatch(/BLENDi|Nutella|Ninja|NutriBullet/);
      }
      expect(Object.values(howTo).join(' ')).not.toMatch(alcohol);
    }
    expect(ptBR.pulseAi.howToUse.rule).toBe('Peça de forma explícita: o que você pedir, a receita traz.');
    expect(ptBR.pulseAi.howToUse.limit).toBe('Se não couber no copo, a receita vem o mais perto possível, com um aviso.');
    expect(ptBR.pulseAi.ageConfirmation.confirm).toBe('Tenho 21 anos ou mais');
    expect(en.pulseAi.ageConfirmation.confirm).toBe("I'm 21 or older");
    expect(ptBR.pulseAi.ageConfirmation.decline).toBe('Não');
    expect(en.pulseAi.ageConfirmation.decline).toBe('No');
  });
});

describe('PulseAIScreen — confirmação de idade (CP-B5)', () => {
  it('código do backend abre a folha (sem balão de erro); "Tenho 21+" grava e reenvia o mesmo pedido', async () => {
    mockSendMessage.mockRejectedValueOnce(ageError()).mockResolvedValueOnce(RESULT);
    mockConfirmAlcoholAge.mockResolvedValueOnce(true);
    const utils = render(<PulseAIScreen {...makeProps()} />);

    fireEvent.press(utils.getByTestId('send'));
    await waitFor(() => expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy());
    expect(utils.queryByText('errors.pulseai_age_confirmation_required')).toBeNull();

    fireEvent.press(utils.getByText('pulseAi.ageConfirmation.confirm'));

    await waitFor(() => expect(utils.getByTestId('recipe-card')).toBeTruthy());
    expect(mockConfirmAlcoholAge).toHaveBeenCalledWith(true);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage.mock.calls[1][0]).toBe('caipirinha de morango');
    // O balão do usuário aparece uma vez só.
    expect(utils.getAllByText('caipirinha de morango')).toHaveLength(1);
    expect(utils.queryByTestId('age-confirmation-sheet')).toBeNull();
  });

  it('"Não" grava false e reenvia (o backend devolve a versão sem álcool)', async () => {
    mockSendMessage
      .mockRejectedValueOnce(ageError())
      .mockResolvedValueOnce({ ...RESULT, recipe: { ...RECIPE, title: 'Sem álcool', ingredients: [{ name: 'Morango', amount: '150 g' }], alcoholGrams: undefined, alcoholFreeVersion: true } });
    mockConfirmAlcoholAge.mockResolvedValueOnce(false);
    const utils = render(<PulseAIScreen {...makeProps()} />);

    fireEvent.press(utils.getByTestId('send'));
    await waitFor(() => expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy());
    fireEvent.press(utils.getByText('pulseAi.ageConfirmation.decline'));

    await waitFor(() => expect(utils.getByText('Sem álcool|Morango')).toBeTruthy());
    expect(mockConfirmAlcoholAge).toHaveBeenCalledWith(false);
  });

  it('se o código voltar depois da resposta, mostra erro em vez de perguntar de novo', async () => {
    mockSendMessage.mockRejectedValueOnce(ageError()).mockRejectedValueOnce(ageError());
    mockConfirmAlcoholAge.mockResolvedValueOnce(true);
    const utils = render(<PulseAIScreen {...makeProps()} />);

    fireEvent.press(utils.getByTestId('send'));
    await waitFor(() => expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy());
    fireEvent.press(utils.getByText('pulseAi.ageConfirmation.confirm'));

    await waitFor(() => expect(utils.getByText('errors.pulseai_age_confirmation_required')).toBeTruthy());
    expect(utils.queryByTestId('age-confirmation-sheet')).toBeNull();
  });

  it('falha ao gravar a resposta: erro no chat, sem reenviar', async () => {
    mockSendMessage.mockRejectedValueOnce(ageError());
    mockConfirmAlcoholAge.mockRejectedValueOnce(new PulseAiServiceError('x', 'errors.network_internal_server_error'));
    const utils = render(<PulseAIScreen {...makeProps()} />);

    fireEvent.press(utils.getByTestId('send'));
    await waitFor(() => expect(utils.getByTestId('age-confirmation-sheet')).toBeTruthy());
    fireEvent.press(utils.getByText('pulseAi.ageConfirmation.confirm'));

    await waitFor(() => expect(utils.getByText('errors.network_internal_server_error')).toBeTruthy());
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
