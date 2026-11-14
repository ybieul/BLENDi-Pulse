// CP-1.1.4a — prévia bloqueada na PulseAIScreen: a 4ª mensagem do usuário
// grátis vira card bloqueado; toque abre os planos; quem vira Pro tem a
// receita desbloqueada sem pedir de novo; expirada mostra aviso; não Pro, nada
// muda; conversa reaberta com turno bloqueado.
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

// ChatInput real depende de navegação e teclado: aqui só um botão que envia.
jest.mock('../components/pulseAi/ChatInput', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { Pressable, Text } = require('react-native');
  function MockChatInput({
    onSend,
    usageRemaining,
  }: {
    onSend: (text: string) => void;
    usageRemaining: number | null;
  }) {
    return (
      <Pressable testID="send" onPress={() => onSend('a 4th smoothie')}>
        <Text testID="usage-remaining">{String(usageRemaining)}</Text>
      </Pressable>
    );
  }
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
jest.mock('../services/pulseAi.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pulseAi.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    unlockPreview: (...args: unknown[]) => mockUnlockPreview(...args),
    getUsage: () => Promise.resolve({ dailyAiUsage: 3, isPro: false }),
  };
});

jest.mock('../services/conversation.service', () => ({
  getConversations: () => Promise.resolve([]),
  getConversationById: jest.fn(),
}));

import { PulseAiServiceError } from '../services/pulseAi.service';
import { PulseAIScreen } from './PulseAIScreen';

type ScreenProps = Parameters<typeof PulseAIScreen>[0];

const PREVIEW = {
  macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
};

const FULL_RECIPE = {
  ...PREVIEW,
  title: 'Dragon Kefir Smoothie',
  ingredients: [{ name: 'Frozen dragonfruit', amount: '137 g' }],
  prepTimeSeconds: 150,
  blendInstruction: 'Pulse 7 times',
  hasSubstitutes: false,
};

const LOCKED_RESULT = {
  locked: true,
  previewId: 'preview-1',
  previewExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  preview: PREVIEW,
  usageRemaining: 0,
  conversationId: 'conversation-1',
};

const mockNavigateUpgrade = jest.fn();

function makeProps(routeParams?: unknown) {
  const navigation = {
    addListener: () => () => undefined,
    setParams: jest.fn(),
    push: jest.fn(),
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: mockNavigateUpgrade }) }),
  };
  return { navigation, route: { params: routeParams } } as unknown as ScreenProps;
}

async function renderWithPreview() {
  mockSendMessage.mockResolvedValueOnce(LOCKED_RESULT);
  const props = makeProps();
  const utils = render(<PulseAIScreen {...props} />);
  fireEvent.press(utils.getByTestId('send'));
  await waitFor(() => expect(utils.getByTestId('locked-recipe-card')).toBeTruthy());
  return { ...utils, props };
}

function becomePro(utils: Awaited<ReturnType<typeof renderWithPreview>>) {
  mockAuthState = { user: { isPro: true, goal: 'Wellness' } };
  utils.rerender(<PulseAIScreen {...utils.props} />);
}

beforeEach(() => {
  mockAuthState = { user: { isPro: false, goal: 'Wellness' } };
  mockSendMessage.mockReset();
  mockUnlockPreview.mockReset();
  mockTrackEvent.mockReset();
  mockShowToast.mockReset();
  mockNavigateUpgrade.mockReset();
});

describe('PulseAIScreen — prévia bloqueada', () => {
  it('4ª mensagem: card bloqueado com título genérico e macros, chat no limite e evento de exibição', async () => {
    const utils = await renderWithPreview();

    expect(utils.getByText('pulseAi.lockedPreview.genericTitle')).toBeTruthy();
    expect(utils.getByText('222')).toBeTruthy();
    expect(utils.queryByTestId('recipe-card')).toBeNull();
    expect(utils.getByTestId('usage-remaining').props.children).toBe('0');
    expect(mockTrackEvent).toHaveBeenCalledWith('paywall_preview_shown', { source: 'pulse_ai' });
    // Sem dados da receita no evento.
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toMatch(/222|macros/);
    expect(mockUnlockPreview).not.toHaveBeenCalled();
  });

  it('toque no card abre a tela de planos e dispara o evento de toque', async () => {
    const utils = await renderWithPreview();

    fireEvent.press(utils.getByTestId('locked-recipe-card'));

    expect(mockNavigateUpgrade).toHaveBeenCalledWith('Upgrade');
    expect(mockTrackEvent).toHaveBeenCalledWith('paywall_preview_tapped', { source: 'pulse_ai' });
  });

  it('voltou como Pro: desbloqueia e troca pelo card normal', async () => {
    const utils = await renderWithPreview();
    mockUnlockPreview.mockResolvedValueOnce({
      previewId: 'preview-1',
      recipe: FULL_RECIPE,
      conversationId: 'conversation-1',
    });

    becomePro(utils);

    await waitFor(() => expect(utils.getByTestId('recipe-card')).toBeTruthy());
    expect(mockUnlockPreview).toHaveBeenCalledTimes(1);
    expect(mockUnlockPreview).toHaveBeenCalledWith('preview-1');
    expect(utils.getByTestId('recipe-card').props.children).toBe('Dragon Kefir Smoothie|Frozen dragonfruit');
    expect(utils.queryByTestId('locked-recipe-card')).toBeNull();
  });

  it('voltou como Pro mas a prévia expirou: aviso curto, sem erro genérico', async () => {
    const utils = await renderWithPreview();
    mockUnlockPreview.mockRejectedValueOnce(
      new PulseAiServiceError('expired', 'errors.pulseai_preview_expired', 'pulseai/preview-not-found'),
    );

    becomePro(utils);

    await waitFor(() => expect(utils.getByText('pulseAi.lockedPreview.expired')).toBeTruthy());
    expect(mockShowToast).toHaveBeenCalledWith('errors.pulseai_preview_expired');
    expect(utils.queryByText('errors.network_internal_server_error')).toBeNull();
    expect(utils.queryByTestId('recipe-card')).toBeNull();
  });

  it('voltou sem assinar: nada muda', async () => {
    const utils = await renderWithPreview();

    utils.rerender(<PulseAIScreen {...utils.props} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUnlockPreview).not.toHaveBeenCalled();
    expect(utils.getByTestId('locked-recipe-card')).toBeTruthy();
    expect(utils.getByText('pulseAi.lockedPreview.unlockCta')).toBeTruthy();
  });

  it('conversa reaberta com turno bloqueado: mostra o card bloqueado (não Pro)', async () => {
    const conversation = {
      id: 'conversation-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'a 4th smoothie', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: PREVIEW,
          timestamp: new Date().toISOString(),
          locked: true,
          previewId: 'preview-1',
          previewExpiresAt: LOCKED_RESULT.previewExpiresAt,
        },
      ],
    };

    const utils = render(<PulseAIScreen {...makeProps({ conversation })} />);

    await waitFor(() => expect(utils.getByTestId('locked-recipe-card')).toBeTruthy());
    expect(mockUnlockPreview).not.toHaveBeenCalled();
  });

  it('conversa reaberta com turno bloqueado por quem já é Pro: desbloqueia', async () => {
    mockAuthState = { user: { isPro: true, goal: 'Wellness' } };
    mockUnlockPreview.mockResolvedValueOnce({
      previewId: 'preview-1',
      recipe: FULL_RECIPE,
      conversationId: 'conversation-1',
    });
    const conversation = {
      id: 'conversation-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'a 4th smoothie', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: PREVIEW,
          timestamp: new Date().toISOString(),
          locked: true,
          previewId: 'preview-1',
          previewExpiresAt: LOCKED_RESULT.previewExpiresAt,
        },
      ],
    };

    const utils = render(<PulseAIScreen {...makeProps({ conversation })} />);

    await waitFor(() => expect(utils.getByTestId('recipe-card')).toBeTruthy());
    expect(mockUnlockPreview).toHaveBeenCalledWith('preview-1');
  });
});
