// apps/mobile/src/screens/PulseAIScreen.tsx
// Tela principal do Pulse AI Chat — CP1.5.
//
// Arquitetura local:
//   - Histórico de mensagens em useState (sem persistência na Fase 1)
//   - Limite de 20 itens no array (10 trocas = 10 user + 10 assistant)
//   - FlatList inverted=false com auto-scroll via flatListRef
//   - ChatInput no fim da tela, no fluxo do layout (gerencia o espaço do teclado)
//   - UsageIndicator acima do ChatInput quando usuário free

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  AllergenSelection,
  FavoriteItem,
  PantryAnalysisResult,
  PulseAiRecipe,
  PulseAiRecipePreview,
  UserGoal,
} from '@blendi/shared';

import {
  PULSE_AI_MESSAGE_MAX,
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
  FREE_PULSE_AI_MESSAGES_PER_DAY,
  FREE_PANTRY_SCANS_PER_MONTH,
} from '@blendi/shared';
import { useFavorites } from '../hooks/useFavorites';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/auth.store';
import { resolveBlenderTextKey } from '../utils/blenderText.utils';
import { useNetworkStore } from '../store/network.store';
import { usePulseAIStore } from '../store/pulseAi.store';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ChatMessage } from '../components/pulseAi/ChatMessage';
import { ChatInput, type ChatInputHandle } from '../components/pulseAi/ChatInput';
import { ChatMessageSkeleton } from '../components/pulseAi/ChatMessageSkeleton';
import { UsageIndicator } from '../components/pulseAi/UsageIndicator';
import { HowToUseSheet } from '../components/pulseAi/HowToUseSheet';
import { AgeConfirmationSheet } from '../components/pulseAi/AgeConfirmationSheet';
import { images } from '../assets';
import * as pulseAiService from '../services/pulseAi.service';
import * as conversationService from '../services/conversation.service';
import { getRecipeFavoriteKey } from '../services/favorites.service';
import {
  AGE_CONFIRMATION_REQUIRED_CODE,
  ALLERGY_CONFIRMATION_REQUIRED_CODE,
  PulseAiServiceError,
  type SendMessageAllergyChoice,
} from '../services/pulseAi.service';
import { AllergyConfirmationSheet } from '../components/allergies/AllergyConfirmationSheet';
import { formatAllergenList, readProfileAllergies } from '../utils/allergies.utils';
import { trackEvent } from '../services/analytics.service';
import { showToast } from '../utils/toast.events';
import { TutorialAnchor } from '../features/tutorial/TutorialAnchor';
import { QUERY_KEYS } from '../config/cache.config';
import type {
  AppTabParamList,
  PulseAIStackScreenProps,
  RootStackParamList,
} from '../navigation/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_MESSAGES = 20;
const LOGO_PLACEHOLDER_SIZE = 64;

// Teste no build EAS (25-26/11): a lista reservava ESTIMATED_CHAT_INPUT_HEIGHT
// (172, que incluía a barra de abas de novo) porque o ChatInput era absoluto.
// Agora o ChatInput fica no fluxo do layout, abaixo da lista: a lista termina
// onde o campo começa e a última mensagem nunca fica escondida atrás dele.

const BADGE_SIZE = 16;
const BADGE_FONT_SIZE_NORMAL = 10;
const BADGE_FONT_SIZE_OVERFLOW = 8;
const HEADER_SIDE_WIDTH = 96;
const SCANNER_BADGE_BACKGROUND = colors.overlay.warning[90];

const TAKING_LONGER_THRESHOLD_SECONDS = 8;
const TAKING_LONGER_FADE_DURATION_MS = 300;

// CP-1.1.4a: código do backend para prévia expirada/inexistente no desbloqueio.
const PREVIEW_NOT_FOUND_CODE = 'pulseai/preview-not-found';
const PAYWALL_PREVIEW_SOURCE = 'pulse_ai';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PulseAiGoalKey = 'muscle' | 'wellness' | 'energy' | 'recovery' | 'weightLoss';

interface LockedPreviewState {
  previewId: string;
  /** 'expired': o desbloqueio respondeu 404 ou a validade já passou. */
  status: 'locked' | 'expired';
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  /** Com lockedPreview, content é só nome + macros (PulseAiRecipePreview). */
  content: string | PulseAiRecipe | PulseAiRecipePreview;
  timestamp: Date;
  isError?: boolean;
  isFromCache?: boolean;
  lockedPreview?: LockedPreviewState;
}

type PantryScanStatus = Pick<PantryAnalysisResult, 'scansUsed' | 'scansLimit' | 'resetDate'>;

const GOAL_I18N_KEYS: Record<UserGoal, PulseAiGoalKey> = {
  Muscle: 'muscle',
  Wellness: 'wellness',
  Energy: 'energy',
  Recovery: 'recovery',
  WeightLoss: 'weightLoss',
};

const GOAL_SUGGESTION_FIELDS = ['suggestion1', 'suggestion2', 'suggestion3'] as const;

function toUsageRemaining(dailyAiUsage: number, isPro: boolean): number | null {
  return isPro ? null : Math.max(0, FREE_PULSE_AI_MESSAGES_PER_DAY - dailyAiUsage);
}

function favoriteItemToRecipe(favorite: FavoriteItem): PulseAiRecipe {
  return {
    title: favorite.recipeName,
    ingredients: favorite.ingredients,
    macros: {
      protein: favorite.protein,
      carbs: favorite.carbs,
      fat: favorite.fat,
      calories: favorite.calories,
    },
    prepTimeSeconds: favorite.prepTimeSeconds,
    blendInstruction: favorite.blendInstruction,
    tip: favorite.tip,
    hasSubstitutes: favorite.hasSubstitutes,
  };
}

function getRemainingPantryScans(scanStatus: PantryScanStatus | null): number {
  const scansUsed = scanStatus?.scansUsed ?? 0;
  const scansLimit = scanStatus?.scansLimit ?? FREE_PANTRY_SCANS_PER_MONTH;

  return Math.max(0, scansLimit - scansUsed);
}

function conversationMessagesToChatItems(
  conversationId: string,
  messages: conversationService.ConversationMessage[],
): ChatMessageItem[] {
  const now = Date.now();

  return messages.map((message, index) => ({
    id: `${conversationId}-${index}`,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    ...(message.locked && message.previewId
      ? {
          lockedPreview: {
            previewId: message.previewId,
            status:
              message.previewExpiresAt && new Date(message.previewExpiresAt).getTime() <= now
                ? 'expired'
                : 'locked',
          } satisfies LockedPreviewState,
        }
      : {}),
  }));
}

// ─── WelcomeState ─────────────────────────────────────────────────────────────

interface WelcomeStateProps {
  title: string;
  subtitle: string;
  suggestions: readonly [string, string, string];
  onSuggestionPress: (text: string) => void;
}

function WelcomeState({ title, subtitle, suggestions, onSuggestionPress }: WelcomeStateProps) {
  const colors = useColors();

  const welcomeStyles = StyleSheet.create({
    welcomeContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing['2xl'],
      paddingBottom: spacing['4xl'],
      gap: spacing.lg,
    },
    logoPlaceholder: {
      width: LOGO_PLACEHOLDER_SIZE,
      height: LOGO_PLACEHOLDER_SIZE,
      marginBottom: spacing.md,
    },
    welcomeTitle: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: fontWeights.bold,
      textAlign: 'center',
    },
    welcomeSubtitle: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
      lineHeight: 20,
    },
    suggestionRow: {
      flexDirection: 'column',
      width: '100%',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    suggestionChip: {
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.overlay.plum[6],
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
    },
    suggestionText: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
  });

  return (
    <View style={welcomeStyles.welcomeContainer}>
      <Image source={images.blendiLogo} resizeMode="contain" style={welcomeStyles.logoPlaceholder} />
      <Text style={welcomeStyles.welcomeTitle}>{title}</Text>
      <Text style={welcomeStyles.welcomeSubtitle}>{subtitle}</Text>
      <View style={welcomeStyles.suggestionRow}>
        {suggestions.map((text, index) => (
          <Pressable
            key={index}
            style={welcomeStyles.suggestionChip}
            onPress={() => onSuggestionPress(text)}
            accessibilityRole="button"
            accessibilityLabel={text}
          >
            <Text style={welcomeStyles.suggestionText} numberOfLines={3}>
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── PulseAIScreen ────────────────────────────────────────────────────────────

export function PulseAIScreen({ navigation, route }: PulseAIStackScreenProps<'PulseAIChat'>) {
  const colors = useColors();
  const SUGGESTION_BORDER_COLOR = colors.overlay.plum[10];
  const SUGGESTION_BACKGROUND_COLOR = colors.overlay.plum[6];

  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const pendingProtocol = usePulseAIStore((state) => state.pendingProtocol);
  const clearPendingProtocol = usePulseAIStore((state) => state.clearPendingProtocol);
  const authUser = useAuthStore((state) => state.user);
  const userGoal = authUser?.goal ?? 'Wellness';
  const isPro = authUser?.isPro ?? false;
  const blendiOwnership = authUser?.blendiOwnership;
  // CP-B4: quem não tem BLENDi lê os textos neutros (blenderText.utils). O ref
  // deixa os handlers de erro lerem o valor atual sem entrar nas dependências.
  const blendiOwnershipRef = useRef(blendiOwnership);
  blendiOwnershipRef.current = blendiOwnership;
  const isConnected = useNetworkStore((state) => state.isConnected);
  const goalKey = GOAL_I18N_KEYS[userGoal];

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedLoadingSeconds, setElapsedLoadingSeconds] = useState(0);
  const takingLongerOpacity = useRef(new Animated.Value(0)).current;
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [pantryScanStatus, setPantryScanStatus] = useState<PantryScanStatus | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Rastreado para uso futuro (ex.: ações que dependem da conversa ativa) — ainda não lido nesta tela.
  void activeConversationId;
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  // CP-B5: "Como usar" e a confirmação única de idade (guarda a mensagem
  // que o backend devolveu com pulseai/age-confirmation-required, para
  // reenviar depois da resposta sem repetir o balão do usuário).
  const [isHowToUseVisible, setIsHowToUseVisible] = useState(false);
  const [pendingAgeMessage, setPendingAgeMessage] = useState<string | null>(null);
  // CP-B6: resposta da folha de alergia que acompanha o reenvio depois da
  // idade (o mesmo pedido pode precisar das duas confirmações).
  const pendingAgeAllergyChoiceRef = useRef<SendMessageAllergyChoice>({});
  // CP-B6: mensagem que nomeou um alérgeno cadastrado (428) e os alérgenos.
  const [pendingAllergy, setPendingAllergy] = useState<{ message: string; allergens: AllergenSelection } | null>(null);
  const messagesRef = useRef<ChatMessageItem[]>([]);
  messagesRef.current = messages;

  const flatListRef = useRef<FlatList<ChatMessageItem>>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // ── Badge de favoritos ────────────────────────────────────────────────────
  const favoritesCount = favorites.length;
  const badgeScale = useRef(new Animated.Value(favoritesCount > 0 ? 1 : 0)).current;
  const prevCountRef = useRef(favoritesCount);

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = favoritesCount;

    if (prev === 0 && favoritesCount > 0) {
      badgeScale.setValue(0);
      Animated.spring(badgeScale, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 12,
      }).start();
    } else if (favoritesCount === 0) {
      badgeScale.setValue(0);
    }
  }, [favoritesCount, badgeScale]);

  const welcomeTitle = t(`pulseAi.goals.${goalKey}.welcomeTitle`);
  const welcomeSubtitle = t(
    resolveBlenderTextKey(`pulseAi.goals.${goalKey}.welcomeSubtitle`, blendiOwnership),
  );
  const suggestions = GOAL_SUGGESTION_FIELDS.map((field) =>
    t(`pulseAi.goals.${goalKey}.${field}`),
  ) as [string, string, string];
  const remainingPantryScans = useMemo(
    () => getRemainingPantryScans(pantryScanStatus),
    [pantryScanStatus],
  );
  const favoriteIdsByRecipeKey = useMemo<Record<string, string>>(() => {
    const nextFavoriteIdsByRecipeKey: Record<string, string> = {};

    favorites.forEach((favorite) => {
      nextFavoriteIdsByRecipeKey[getRecipeFavoriteKey(favoriteItemToRecipe(favorite))] = favorite.id;
    });

    return nextFavoriteIdsByRecipeKey;
  }, [favorites]);

  useEffect(() => {
    const syncPantryScanStatus = () => {
      setPantryScanStatus(
        queryClient.getQueryData<PantryScanStatus>(QUERY_KEYS.pantryScans) ?? null,
      );
    };

    syncPantryScanStatus();

    const unsubscribe = navigation.addListener('focus', syncPantryScanStatus);

    return unsubscribe;
  }, [navigation, queryClient]);

  // ── Auto-scroll ao final quando uma nova mensagem chega ──────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // Teclado aberto: a lista encolhe (o campo sobe junto) — rola até a última
  // mensagem para ela continuar visível logo acima do campo.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (messages.length > 0) {
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [messages.length]);

  // ── Cronômetro de espera — mostra aviso após 8s sem resposta ─────────────
  useEffect(() => {
    if (!isLoading) {
      setElapsedLoadingSeconds(0);
      takingLongerOpacity.setValue(0);
      return;
    }

    const intervalId = setInterval(() => {
      setElapsedLoadingSeconds((current) => current + 1);
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isLoading, takingLongerOpacity]);

  const showTakingLonger = isLoading && elapsedLoadingSeconds >= TAKING_LONGER_THRESHOLD_SECONDS;

  useEffect(() => {
    if (!showTakingLonger) {
      return;
    }

    Animated.timing(takingLongerOpacity, {
      toValue: 1,
      duration: TAKING_LONGER_FADE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [showTakingLonger, takingLongerOpacity]);

  // ── Busca uso inicial na montagem ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    pulseAiService
      .getUsage()
      .then((data) => {
        if (cancelled) return;
        setUsageRemaining(toUsageRemaining(data.dailyAiUsage, data.isPro));
      })
      .catch(() => {
        // Não-crítico: o ChatInput mostrará o estado correto após o primeiro envio
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isPro) {
      setUsageRemaining(null);
    }
  }, [isPro]);

  // ── Carrega conversa vinda da ConversationHistoryScreen, se houver ────────
  useEffect(() => {
    const routeConversation = route.params?.conversation;

    if (!routeConversation) {
      return;
    }

    setMessages(
      conversationMessagesToChatItems(routeConversation.id, routeConversation.messages),
    );
    setActiveConversationId(routeConversation.id);
    setIsViewingHistory(true);
    navigation.setParams({ conversation: undefined });
  }, [navigation, route.params?.conversation]);

  // ── Continua a conversa de hoje automaticamente, se existir ──────────────
  // Valor de route.params.conversation na montagem. O efeito acima limpa o param via
  // setParams depois de carregá-lo; este efeito deve rodar só uma vez (deps []) e NÃO
  // reexecutar nessa limpeza, senão sobrescreveria a conversa do histórico em exibição.
  const initialRouteConversationRef = useRef(route.params?.conversation);

  useEffect(() => {
    // Uma conversa específica já chegou via navegação (efeito acima) — não sobrescrever.
    if (initialRouteConversationRef.current) {
      return;
    }

    let cancelled = false;

    conversationService
      .getConversations()
      .then((conversations) => {
        if (cancelled) return;

        const mostRecent = conversations[0];
        if (!mostRecent || mostRecent.daysAgo !== 0) {
          return;
        }

        return conversationService.getConversationById(mostRecent.id).then((conversation) => {
          if (cancelled) return;

          setMessages(conversationMessagesToChatItems(conversation.id, conversation.messages));
          setActiveConversationId(conversation.id);
        });
      })
      .catch(() => {
        // Não-crítico: histórico é progressivo — em falha, mantém o welcome state atual.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Envio de mensagem ─────────────────────────────────────────────────────
  // Pede a receita para uma mensagem que JÁ está no chat. CP-B5: separado do
  // handleSend para o reenvio depois da confirmação de idade não duplicar o
  // balão do usuário.
  const requestRecipe = useCallback(
    async (
      trimmed: string,
      options: { afterAgeConfirmation?: boolean; allergyChoice?: SendMessageAllergyChoice } = {},
    ) => {
      setIsLoading(true);
      const allergyChoice = options.allergyChoice ?? {};

      try {
        const result = await pulseAiService.sendMessage(trimmed, allergyChoice);

        if (result.locked) {
          // Prévia bloqueada: só nome e macros; o chat fica como no limite
          // (usageRemaining 0 → campo desabilitado e botão "Upgrade").
          const lockedMessage: ChatMessageItem = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.preview,
            timestamp: new Date(),
            lockedPreview: { previewId: result.previewId, status: 'locked' },
          };

          setMessages((prev) => [...prev, lockedMessage].slice(-MAX_MESSAGES));
          setUsageRemaining(0);
          setActiveConversationId(result.conversationId);
          trackEvent('paywall_preview_shown', { source: PAYWALL_PREVIEW_SOURCE });
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
          return;
        }

        const assistantMessage: ChatMessageItem = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.recipe,
          timestamp: new Date(),
          isFromCache: result.fromCache,
        };

        setMessages((prev) => [...prev, assistantMessage].slice(-MAX_MESSAGES));
        setUsageRemaining(result.usageRemaining);
        setActiveConversationId(result.conversationId);
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      } catch (err) {
        // CP-B5: pedido com bebida alcoólica sem idade conhecida. O backend
        // não gastou a mensagem; a folha pergunta uma vez e o app reenvia.
        // Depois de responder, o código não pode voltar (cai no erro abaixo).
        if (
          err instanceof PulseAiServiceError &&
          err.apiCode === AGE_CONFIRMATION_REQUIRED_CODE &&
          !options.afterAgeConfirmation
        ) {
          pendingAgeAllergyChoiceRef.current = allergyChoice;
          setPendingAgeMessage(trimmed);
          return;
        }

        // CP-B6: a mensagem nomeia um alérgeno cadastrado. Nada foi gasto; a
        // folha pergunta e o app reenvia o MESMO pedido com a resposta (que
        // vale só para ele). Sem os alérgenos no corpo, cai no erro comum.
        if (
          err instanceof PulseAiServiceError &&
          err.apiCode === ALLERGY_CONFIRMATION_REQUIRED_CODE &&
          err.allergens &&
          !allergyChoice.allergyOverride &&
          !allergyChoice.allergyDeclined
        ) {
          setPendingAllergy({ message: trimmed, allergens: err.allergens });
          return;
        }

        const is429 =
          err instanceof PulseAiServiceError &&
          err.apiCode === 'pulseai/daily-limit-reached';

        if (is429) {
          // A mensagem do usuário permanece visível — não chegou ao GPT-4o,
          // mas o motivo aparece como resposta do assistente logo abaixo,
          // no mesmo lugar onde o usuário está olhando (em vez de só na
          // limitRow do ChatInput, que pode passar despercebida).
          setUsageRemaining(0);

          const limitReachedMessage: ChatMessageItem = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current)),
            timestamp: new Date(),
            isError: true,
          };

          setMessages((prev) => [...prev, limitReachedMessage].slice(-MAX_MESSAGES));
        } else {
          void pulseAiService
            .getUsage()
            .then((data) => {
              setUsageRemaining(toUsageRemaining(data.dailyAiUsage, data.isPro));
            })
            .catch(() => {
              // Mantém o último contador conhecido se o sync também falhar.
            });

          const errorText =
            err instanceof PulseAiServiceError
              ? t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current))
              : t('errors.network_internal_server_error');

          const errorMessage: ChatMessageItem = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: errorText,
            timestamp: new Date(),
            isError: true,
          };

          setMessages((prev) => [...prev, errorMessage].slice(-MAX_MESSAGES));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient, t],
  );

  const handleSend = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed) return;

      const userMessage: ChatMessageItem = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage].slice(-MAX_MESSAGES));
      await requestRecipe(trimmed);
    },
    [requestRecipe],
  );

  // ── CP-B6: "Quero com X" — o pedido de antes, agora nomeando o alérgeno.
  // Vai como mensagem nova (balão do usuário) e cai na confirmação.
  const handleAllergySuggestion = useCallback(
    (recipe: PulseAiRecipe) => {
      if (!recipe.allergySuggestion || isLoading) return;

      const list = messagesRef.current;
      const recipeIndex = list.findIndex((item) => item.content === recipe);
      const previousUser = [...list.slice(0, recipeIndex < 0 ? list.length : recipeIndex)]
        .reverse()
        .find((item) => item.role === 'user' && typeof item.content === 'string');
      const items = formatAllergenList({ common: recipe.allergySuggestion.allergens, custom: [] }, t);
      const suffix = t('allergies.card.suggestionMessage', { message: '', items }).trim();
      const original = typeof previousUser?.content === 'string'
        ? previousUser.content
        : recipe.allergySuggestion.dish;
      const room = Math.max(0, PULSE_AI_MESSAGE_MAX - suffix.length - 1);
      void handleSend(t('allergies.card.suggestionMessage', { message: original.slice(0, room).trim(), items }));
    },
    [handleSend, isLoading, t],
  );

  // ── CP-B5: confirmação única de idade → grava e reenvia o mesmo pedido ────
  const handleAgeAnswer = useCallback(
    async (isAdult: boolean) => {
      const pendingMessage = pendingAgeMessage;
      setPendingAgeMessage(null);

      if (!pendingMessage) {
        return;
      }

      setIsLoading(true);

      try {
        await pulseAiService.confirmAlcoholAge(isAdult);
      } catch (err) {
        const errorMessage: ChatMessageItem = {
          id: Date.now().toString(),
          role: 'assistant',
          content:
            err instanceof PulseAiServiceError
              ? t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current))
              : t('errors.network_internal_server_error'),
          timestamp: new Date(),
          isError: true,
        };

        setMessages((prev) => [...prev, errorMessage].slice(-MAX_MESSAGES));
        setIsLoading(false);
        return;
      }

      const allergyChoice = pendingAgeAllergyChoiceRef.current;
      pendingAgeAllergyChoiceRef.current = {};
      await requestRecipe(pendingMessage, { afterAgeConfirmation: true, allergyChoice });
    },
    [pendingAgeMessage, requestRecipe, t],
  );

  // ── CP-B6: confirmação de alergia → reenvia o mesmo pedido ────────────────
  const handleAllergyAnswer = useCallback(
    async (include: boolean) => {
      const pending = pendingAllergy;
      setPendingAllergy(null);
      if (!pending) return;

      await requestRecipe(pending.message, {
        allergyChoice: include
          ? { allergyOverride: pending.allergens }
          : { allergyDeclined: pending.allergens },
      });
    },
    [pendingAllergy, requestRecipe],
  );

  const handleAllergyDismiss = useCallback(() => {
    setPendingAllergy(null);
  }, []);

  const handleAgeDismiss = useCallback(() => {
    pendingAgeAllergyChoiceRef.current = {};
    setPendingAgeMessage(null);
  }, []);

  // ── CP-B5: "Como usar" — exemplo preenche o campo, não envia ─────────────
  const handleHowToUsePress = useCallback(() => {
    setIsHowToUseVisible(true);
  }, []);

  const handleHowToUseClose = useCallback(() => {
    setIsHowToUseVisible(false);
  }, []);

  const handleHowToUseExample = useCallback((text: string) => {
    setIsHowToUseVisible(false);
    chatInputRef.current?.setText(text);
  }, []);

  // ── Prévia bloqueada: toque abre os planos; virou Pro → desbloqueia ──────
  const handleLockedPreviewPress = useCallback(() => {
    trackEvent('paywall_preview_tapped', { source: PAYWALL_PREVIEW_SOURCE });
    navigation
      .getParent()
      ?.getParent<NavigationProp<RootStackParamList>>()
      ?.navigate('Upgrade');
  }, [navigation]);

  const unlockingPreviewIdsRef = useRef(new Set<string>());

  const unlockPreview = useCallback(
    async (previewId: string) => {
      unlockingPreviewIdsRef.current.add(previewId);

      try {
        const unlocked = await pulseAiService.unlockPreview(previewId);

        setMessages((prev) =>
          prev.map((item) =>
            item.lockedPreview?.previewId === previewId
              ? { ...item, content: unlocked.recipe, lockedPreview: undefined }
              : item,
          ),
        );
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      } catch (err) {
        if (err instanceof PulseAiServiceError && err.apiCode === PREVIEW_NOT_FOUND_CODE) {
          setMessages((prev) =>
            prev.map((item) =>
              item.lockedPreview?.previewId === previewId
                ? { ...item, lockedPreview: { previewId, status: 'expired' } }
                : item,
            ),
          );
          showToast(t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current)));
        }
        // 403 (backend ainda não vê o Pro) ou falha de rede: o card continua
        // bloqueado e a próxima mudança tenta de novo.
      } finally {
        unlockingPreviewIdsRef.current.delete(previewId);
      }
    },
    [queryClient, t],
  );

  // Dispara quando o perfil vira Pro (a compra atualiza o auth store antes do
  // goBack da tela de planos, então ao voltar o card já foi trocado) e quando
  // uma conversa com turno bloqueado é aberta por quem já é Pro.
  useEffect(() => {
    if (!isPro) {
      return;
    }

    messages.forEach((item) => {
      const previewId = item.lockedPreview?.previewId;

      if (
        previewId &&
        item.lockedPreview?.status === 'locked' &&
        !unlockingPreviewIdsRef.current.has(previewId)
      ) {
        void unlockPreview(previewId);
      }
    });
  }, [isPro, messages, unlockPreview]);

  // ── Auto-envio do protocolo vindo da Home (transitório via store) ─────────
  useEffect(() => {
    const protocol = pendingProtocol?.trim();

    if (!protocol) {
      return;
    }

    clearPendingProtocol();
    void handleSend(protocol);
  }, [clearPendingProtocol, handleSend, pendingProtocol]);

  useEffect(() => {
    const prefilledMessage = route.params?.prefilledMessage?.trim();

    if (!prefilledMessage) {
      return;
    }

    chatInputRef.current?.setText(prefilledMessage);
    navigation.setParams({ prefilledMessage: null });
  }, [navigation, route.params?.prefilledMessage]);

  // ── Chip de sugestão → preenche ChatInput sem enviar ─────────────────────
  const handleSuggestionPress = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  // ── Navegação ─────────────────────────────────────────────────────────────
  const handleStartBlend = useCallback((recipe: PulseAiRecipe) => {
    navigation
      .getParent<BottomTabNavigationProp<AppTabParamList>>()
      ?.navigate('Blend', { recipe });
  }, [navigation]);

  const handleFavoritesPress = useCallback(() => {
    navigation.push('Favorites');
  }, [navigation]);

  const handlePantryScannerPress = useCallback(() => {
    navigation.push('PantryScanner');
  }, [navigation]);

  const handleNewConversationPress = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setIsViewingHistory(false);
  }, []);

  const handleHistoryPress = useCallback(() => {
    navigation.push('ConversationHistory');
  }, [navigation]);

  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.lg,
    },
    headerSide: {
      width: HEADER_SIDE_WIDTH,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerLeftActions: {
      gap: spacing.md,
    },
    headerRightActions: {
      justifyContent: 'flex-end',
      gap: spacing.md,
    },
    headerActionWithBadge: {
      alignItems: 'center',
    },
    headerButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Banner de conversa carregada do histórico
    historyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginHorizontal: spacing.xl,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: SUGGESTION_BORDER_COLOR,
      backgroundColor: SUGGESTION_BACKGROUND_COLOR,
    },
    historyBannerText: {
      flex: 1,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
    },
    historyBannerAction: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.bold,
    },

    // Badge de favoritos
    badge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      borderRadius: BADGE_SIZE / 2,
      backgroundColor: colors.brand.pulse,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanBadge: {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      marginTop: -8,
      borderRadius: BADGE_SIZE / 2,
      backgroundColor: SCANNER_BADGE_BACKGROUND,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: colors.text.inverse,
      fontFamily: fonts.body,
      fontSize: BADGE_FONT_SIZE_NORMAL,
      fontWeight: fontWeights.bold,
      lineHeight: BADGE_FONT_SIZE_NORMAL + 2,
      includeFontPadding: false,
    },
    badgeTextOverflow: {
      fontSize: BADGE_FONT_SIZE_OVERFLOW,
      lineHeight: BADGE_FONT_SIZE_OVERFLOW + 2,
    },
    headerTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    headerTitle: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
      lineHeight: 20,
    },
    howToUseButton: {
      width: 32,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // FlatList
    listContent: {
      flexGrow: 1,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.xl,
    },
    takingLongerText: {
      marginTop: spacing.md,
      marginHorizontal: spacing.xl,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
    },
  });

  // ── FlatList render ───────────────────────────────────────────────────────
  const renderItem: ListRenderItem<ChatMessageItem> = useCallback(({ item }) => {
    if (item.role === 'user') {
      return (
        <ChatMessage
          role="user"
          content={item.content as string}
          timestamp={item.timestamp}
        />
      );
    }

    if (item.isError) {
      return (
        <ChatMessage
          role="assistant"
          content={item.content as string}
          isError={true}
          timestamp={item.timestamp}
        />
      );
    }

    if (item.lockedPreview) {
      return (
        <ChatMessage
          role="assistant"
          content={item.content as PulseAiRecipePreview}
          locked
          expired={item.lockedPreview.status === 'expired'}
          onLockedPress={handleLockedPreviewPress}
          timestamp={item.timestamp}
        />
      );
    }

    const recipe = item.content as PulseAiRecipe;
    const favoriteKey = getRecipeFavoriteKey(recipe);

    return (
      <ChatMessage
        role="assistant"
        content={recipe}
        timestamp={item.timestamp}
        isFromCache={item.isFromCache}
        isFavorited={Boolean(favoriteIdsByRecipeKey[favoriteKey])}
        favoriteId={favoriteIdsByRecipeKey[favoriteKey]}
        onStartBlend={() => handleStartBlend(recipe)}
        onAllergySuggestionPress={handleAllergySuggestion}
      />
    );
  }, [favoriteIdsByRecipeKey, handleAllergySuggestion, handleLockedPreviewPress, handleStartBlend]);

  const ListFooterComponent = isLoading ? (
    <View>
      <ChatMessageSkeleton />
      {showTakingLonger ? (
        <Animated.Text style={[styles.takingLongerText, { opacity: takingLongerOpacity }]}>
          {t('pulseAi.takingLonger')}
        </Animated.Text>
      ) : null}
    </View>
  ) : null;

  const ListEmptyComponent = (
    <WelcomeState
      title={welcomeTitle}
      subtitle={welcomeSubtitle}
      suggestions={suggestions}
      onSuggestionPress={handleSuggestionPress}
    />
  );

  return (
    <View style={styles.screen}>
      <AuroraBackground intensity="reduced" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={[styles.headerSide, styles.headerLeftActions]}>
          <Pressable
            style={styles.headerButton}
            onPress={handleNewConversationPress}
            accessibilityRole="button"
            accessibilityLabel={t('pulseAi.newConversation')}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.text.secondary} />
          </Pressable>

          <TutorialAnchor id="pulseAi.history">
            <Pressable
              style={styles.headerButton}
              onPress={handleHistoryPress}
              accessibilityRole="button"
              accessibilityLabel={t('pulseAi.historyButton')}
            >
              <Ionicons name="time-outline" size={24} color={colors.text.secondary} />
            </Pressable>
          </TutorialAnchor>
        </View>

        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{t('navigation.pulseAI')}</Text>
          {/* CP-B5: "Como usar" — discreto, ao lado do título. */}
          <TutorialAnchor id="pulseAi.howToUse">
            <Pressable
              style={styles.howToUseButton}
              onPress={handleHowToUsePress}
              accessibilityRole="button"
              accessibilityLabel={t('pulseAi.howToUse.a11yLabel')}
              hitSlop={6}
              testID="pulse-ai-how-to-use-button"
            >
              <Ionicons name="help-circle-outline" size={18} color={colors.text.secondary} />
            </Pressable>
          </TutorialAnchor>
        </View>

        <View style={[styles.headerSide, styles.headerRightActions]}>
          <TutorialAnchor id="pulseAi.pantry" style={styles.headerActionWithBadge}>
            <Pressable
              style={styles.headerButton}
              onPress={handlePantryScannerPress}
              accessibilityRole="button"
              accessibilityLabel={t('pantryScanner.permissionTitle')}
            >
              <Ionicons name="scan-outline" size={22} color={colors.text.primary} />
            </Pressable>

            {!isPro ? (
              <View style={styles.scanBadge}>
                <Text style={styles.badgeText}>{String(remainingPantryScans)}</Text>
              </View>
            ) : null}
          </TutorialAnchor>

          <TutorialAnchor id="pulseAi.favorites" style={styles.headerActionWithBadge}>
            <Pressable
              style={styles.headerButton}
              onPress={handleFavoritesPress}
              accessibilityRole="button"
              accessibilityLabel={t('favorites.title')}
            >
              <Ionicons name="heart-outline" size={24} color={colors.text.secondary} />
              {favoritesCount > 0 && (
                <Animated.View
                  style={[styles.badge, { transform: [{ scale: badgeScale }] }]}
                >
                  <Text style={[
                    styles.badgeText,
                    favoritesCount > 9 && styles.badgeTextOverflow,
                  ]}>
                    {favoritesCount > 9 ? '9+' : String(favoritesCount)}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </TutorialAnchor>
        </View>
      </View>

      {/* ── Banner de conversa carregada do histórico ── */}
      {isViewingHistory ? (
        <View style={styles.historyBanner}>
          <Text style={styles.historyBannerText} numberOfLines={1}>
            {t('pulseAi.historyBanner')}
          </Text>
          <Pressable
            onPress={handleNewConversationPress}
            accessibilityRole="button"
            accessibilityLabel={t('pulseAi.historyNewFromHere')}
          >
            <Text style={styles.historyBannerAction}>{t('pulseAi.historyNewFromHere')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Histórico de mensagens ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={styles.listContent}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
        inverted={false}
      />

      {/* ── Indicador de uso (acima do ChatInput) ── */}
      {isConnected ? (
        <TutorialAnchor id="pulseAi.usage">
          <UsageIndicator usageRemaining={usageRemaining} />
        </TutorialAnchor>
      ) : null}

      {/* ── Campo de input fixado no bottom ── */}
      <TutorialAnchor id="pulseAi.input">
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          isLoading={isLoading}
          usageRemaining={usageRemaining}
        />
      </TutorialAnchor>

      <HowToUseSheet
        allergies={readProfileAllergies(authUser)}
        visible={isHowToUseVisible}
        onClose={handleHowToUseClose}
        onExamplePress={handleHowToUseExample}
      />

      <AllergyConfirmationSheet
        allergens={pendingAllergy?.allergens ?? null}
        onConfirm={() => {
          void handleAllergyAnswer(true);
        }}
        onDecline={() => {
          void handleAllergyAnswer(false);
        }}
        onDismiss={handleAllergyDismiss}
      />

      <AgeConfirmationSheet
        visible={pendingAgeMessage !== null}
        onAnswer={(isAdult) => {
          void handleAgeAnswer(isAdult);
        }}
        onDismiss={handleAgeDismiss}
      />
    </View>
  );
}