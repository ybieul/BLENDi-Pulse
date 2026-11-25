// CP-B6 — PulseAIScreen × alergias: 428 de alergia → folha → reenvia o MESMO
// pedido com a resposta (confirmada ou recusada, sem gravar e sem repetir o
// balão); botão "Quero com X" da sugestão; "Como usar" com a seção de
// alergias e sem exemplo com o alérgeno da pessoa.
import { Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
    RecipeCard: ({
      recipe,
      onAllergySuggestionPress,
    }: {
      recipe: { title: string; ingredients: Array<{ name: string }> };
      onAllergySuggestionPress?: (recipe: unknown) => void;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
      const { Pressable } = require('react-native');
      return (
        <>
          <Text testID="recipe-card">{`${recipe.title}|${recipe.ingredients.map((i) => i.name).join(',')}`}</Text>
          {onAllergySuggestionPress ? (
            <Pressable testID="suggestion-button" onPress={() => onAllergySuggestionPress(recipe)} />
          ) : null}
        </>
      );
    },
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

let mockAuthState: { user: Record<string, unknown> } = { user: { isPro: false, goal: 'Wellness' } };
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

import { ALLERGY_CONFIRMATION_REQUIRED_CODE, PulseAiServiceError } from '../services/pulseAi.service';
import { PulseAIScreen } from './PulseAIScreen';

type ScreenProps = Parameters<typeof PulseAIScreen>[0];

const PEANUT = { common: ['peanut' as const], custom: [] };

const RESULT = {
  recipe: {
    title: 'Shake de paçoca',
    ingredients: [{ name: 'Banana', amount: '1' }],
    macros: { protein: 5, carbs: 30, fat: 5, calories: 185 },
    prepTimeSeconds: 60,
    blendInstruction: 'Bata por 30 segundos.',
    hasSubstitutes: false,
    allergySuggestion: { dish: 'Paçoca', allergens: ['peanut'] },
  },
  fromCache: false,
  usageRemaining: 2,
  xpAwarded: 10,
  conversationId: 'conversation-1',
  macrosValidated: true,
};

function allergyError() {
  return new PulseAiServiceError(
    'Allergy confirmation is required.',
    'errors.pulseai_allergy_confirmation_required',
    ALLERGY_CONFIRMATION_REQUIRED_CODE,
    PEANUT,
  );
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
  mockOutgoingMessage = 'shake com amendoim';
});


async function renderAndSend() {
  const utils = render(<PulseAIScreen {...makeProps()} />);
  fireEvent.press(utils.getByTestId('send'));
  await waitFor(() => {
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
  return utils;
}

describe('PulseAIScreen — confirmação de alergia (CP-B6)', () => {
  it('428 de alergia abre a folha com o alérgeno; "Sim, incluir" reenvia o mesmo pedido confirmado, sem repetir o balão', async () => {
    mockSendMessage.mockRejectedValueOnce(allergyError()).mockResolvedValueOnce(RESULT);

    const utils = await renderAndSend();
    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    });
    expect(utils.getByTestId('allergy-confirmation-body').props.children).toContain('allergies.inSentence.peanut');

    fireEvent.press(utils.getByTestId('allergy-confirmation-confirm'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
    expect(mockSendMessage.mock.calls[1]).toEqual(['shake com amendoim', { allergyOverride: PEANUT }]);
    expect(utils.getAllByText('shake com amendoim')).toHaveLength(1);
    await waitFor(() => {
      expect(utils.getByTestId('recipe-card')).toBeTruthy();
    });
  });

  it('"Não, fazer sem" reenvia com o alérgeno recusado', async () => {
    mockSendMessage.mockRejectedValueOnce(allergyError()).mockResolvedValueOnce(RESULT);

    const utils = await renderAndSend();
    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-decline')).toBeTruthy();
    });
    fireEvent.press(utils.getByTestId('allergy-confirmation-decline'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
    expect(mockSendMessage.mock.calls[1]).toEqual(['shake com amendoim', { allergyDeclined: PEANUT }]);
  });

  it('a confirmação não fica guardada: o próximo pedido vai sem ela', async () => {
    mockSendMessage
      .mockRejectedValueOnce(allergyError())
      .mockResolvedValueOnce(RESULT)
      .mockResolvedValueOnce(RESULT);

    const utils = await renderAndSend();
    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-confirm')).toBeTruthy();
    });
    fireEvent.press(utils.getByTestId('allergy-confirmation-confirm'));
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    fireEvent.press(utils.getByTestId('send'));
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });
    expect(mockSendMessage.mock.calls[2]).toEqual(['shake com amendoim', {}]);
  });

  it('fechar a folha não envia nada', async () => {
    mockSendMessage.mockRejectedValueOnce(allergyError());

    const utils = await renderAndSend();
    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    });
    const modal = utils.UNSAFE_getAllByType(Modal).find((node) => (node.props as { visible: boolean }).visible);
    act(() => {
      (modal?.props as { onRequestClose: () => void }).onRequestClose();
    });

    expect(utils.queryByTestId('allergy-confirmation-sheet')).toBeNull();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('"Quero com X" manda o pedido anterior nomeando o alérgeno (que cai na confirmação)', async () => {
    mockOutgoingMessage = 'shake de paçoca';
    mockSendMessage.mockResolvedValueOnce(RESULT).mockRejectedValueOnce(allergyError());

    const utils = await renderAndSend();
    await waitFor(() => {
      expect(utils.getByTestId('suggestion-button')).toBeTruthy();
    });
    fireEvent.press(utils.getByTestId('suggestion-button'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
    const [sent, choice] = mockSendMessage.mock.calls[1] as [string, unknown];
    expect(sent).toContain('allergies.card.suggestionMessage');
    expect(sent).toContain('shake de paçoca');
    expect(sent).toContain('allergies.inSentence.peanut');
    expect(choice).toEqual({});
    await waitFor(() => {
      expect(utils.getByTestId('allergy-confirmation-sheet')).toBeTruthy();
    });
  });
});

describe('PulseAIScreen — Como usar com alergias (CP-B6)', () => {
  it('tem a seção de alergias; exemplos com o alérgeno da pessoa saem', () => {
    mockAuthState = { user: { isPro: false, goal: 'Wellness', allergies: { common: ['peanut'], custom: [] } } };
    const utils = render(<PulseAIScreen {...makeProps()} />);
    fireEvent.press(utils.getByTestId('pulse-ai-how-to-use-button'));

    expect(utils.getByTestId('how-to-use-allergies')).toBeTruthy();
    expect(utils.getByText('pulseAi.howToUse.allergiesOtherPerson')).toBeTruthy();
    expect(utils.getByText('allergies.picker.honesty')).toBeTruthy();
    expect(utils.queryByText('pulseAi.howToUse.exampleIngredient')).toBeNull();
    expect(utils.queryByText('pulseAi.howToUse.exampleAmount')).toBeNull();
    expect(utils.getByText('pulseAi.howToUse.exampleFlavor')).toBeTruthy();
  });

  it('sem alergia, todos os exemplos continuam; nenhum exemplo da seção de alergias é tocável', () => {
    const utils = render(<PulseAIScreen {...makeProps()} />);
    fireEvent.press(utils.getByTestId('pulse-ai-how-to-use-button'));

    expect(utils.getByText('pulseAi.howToUse.exampleIngredient')).toBeTruthy();
    for (const locale of [en, ptBR]) {
      const howTo = locale.pulseAi.howToUse as Record<string, string>;
      for (const key of ['allergiesTitle', 'allergiesRegister', 'allergiesOtherPerson', 'allergiesDish']) {
        expect(howTo[key].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
