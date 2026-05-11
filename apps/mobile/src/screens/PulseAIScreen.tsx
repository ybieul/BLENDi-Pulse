// apps/mobile/src/screens/PulseAIScreen.tsx
// Tela principal do Pulse AI Chat — CP1.5.
//
// Arquitetura local:
//   - Histórico de mensagens em useState (sem persistência na Fase 1)
//   - Limite de 20 itens no array (10 trocas = 10 user + 10 assistant)
//   - FlatList inverted=false com auto-scroll via flatListRef
//   - ChatInput absolutamente posicionado (gerencia seu próprio bottom)
//   - UsageIndicator acima do ChatInput quando usuário free

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
import type { PulseAiRecipe } from '@blendi/shared';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useAuthStore } from '../store/auth.store';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ChatMessage } from '../components/pulseAi/ChatMessage';
import { ChatInput, type ChatInputHandle } from '../components/pulseAi/ChatInput';
import { ChatMessageSkeleton } from '../components/pulseAi/ChatMessageSkeleton';
import { UsageIndicator } from '../components/pulseAi/UsageIndicator';
import { imagePlaceholderStyles } from '../assets';
import * as pulseAiService from '../services/pulseAi.service';
import {
  FavoritesServiceError,
  getRecipeFavoriteKey,
  toggleFavorite,
} from '../services/favorites.service';
import { PulseAiServiceError } from '../services/pulseAi.service';
import { QUERY_KEYS } from '../config/cache.config';
import type { AppTabScreenProps, RootStackParamList } from '../navigation/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAILY_FREE_LIMIT = 3;
const MAX_MESSAGES = 20;
const LOGO_PLACEHOLDER_SIZE = 64;
const TOAST_HIDE_DELAY_MS = 3200;
const TOAST_BORDER_COLOR = 'rgba(255,107,107,0.22)';
const TOAST_BACKGROUND_COLOR = 'rgba(60,24,24,0.94)';
const SUGGESTION_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const SUGGESTION_BACKGROUND_COLOR = 'rgba(255,255,255,0.06)';

// Altura estimada do ChatInput acima da tab bar (fade + campo + padding).
// Usado para garantir que o conteúdo não fique atrás do input fixado.
const ESTIMATED_CHAT_INPUT_HEIGHT = 172;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type PulseAiGoalKey = 'muscle' | 'wellness' | 'energy' | 'recovery';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string | PulseAiRecipe;
  timestamp: Date;
  isError?: boolean;
  isFromCache?: boolean;
}

interface ToastState {
  id: number;
  message: string;
}

const GOAL_I18N_KEYS: Record<UserGoal, PulseAiGoalKey> = {
  Muscle: 'muscle',
  Wellness: 'wellness',
  Energy: 'energy',
  Recovery: 'recovery',
};

const GOAL_SUGGESTION_FIELDS = ['suggestion1', 'suggestion2', 'suggestion3'] as const;

function toUsageRemaining(dailyAiUsage: number, isPro: boolean): number | null {
  return isPro ? null : Math.max(0, DAILY_FREE_LIMIT - dailyAiUsage);
}

// ─── WelcomeState ─────────────────────────────────────────────────────────────

interface WelcomeStateProps {
  title: string;
  subtitle: string;
  suggestions: readonly [string, string, string];
  onSuggestionPress: (text: string) => void;
}

function WelcomeState({ title, subtitle, suggestions, onSuggestionPress }: WelcomeStateProps) {
  return (
    <View style={styles.welcomeContainer}>
      <View style={[styles.logoPlaceholder, imagePlaceholderStyles.blendiLogo]} />
      <Text style={styles.welcomeTitle}>{title}</Text>
      <Text style={styles.welcomeSubtitle}>{subtitle}</Text>
      <View style={styles.suggestionRow}>
        {suggestions.map((text, index) => (
          <Pressable
            key={index}
            style={styles.suggestionChip}
            onPress={() => onSuggestionPress(text)}
            accessibilityRole="button"
            accessibilityLabel={text}
          >
            <Text style={styles.suggestionText} numberOfLines={3}>
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── PulseAIScreen ────────────────────────────────────────────────────────────

export function PulseAIScreen({ route, navigation }: AppTabScreenProps<'PulseAI'>) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const userGoal = useAuthStore((state) => state.user?.goal ?? 'Wellness');
  const goalKey = GOAL_I18N_KEYS[userGoal];

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [favoriteStates, setFavoriteStates] = useState<Record<string, boolean>>({});
  const [toastState, setToastState] = useState<ToastState | null>(null);

  const flatListRef = useRef<FlatList<ChatMessageItem>>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const pendingFavoriteKeysRef = useRef(new Set<string>());

  const welcomeTitle = t(`pulseAi.goals.${goalKey}.welcomeTitle`);
  const welcomeSubtitle = t(`pulseAi.goals.${goalKey}.welcomeSubtitle`);
  const suggestions = GOAL_SUGGESTION_FIELDS.map((field) =>
    t(`pulseAi.goals.${goalKey}.${field}`),
  ) as [string, string, string];

  // ── Auto-scroll ao final quando uma nova mensagem chega ──────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  useEffect(() => {
    if (!toastState) return;

    const timeoutId = setTimeout(() => {
      setToastState(null);
    }, TOAST_HIDE_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [toastState]);

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

  // ── Envio de mensagem ─────────────────────────────────────────────────────
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
      setIsLoading(true);

      try {
        const result = await pulseAiService.sendMessage(trimmed);

        const assistantMessage: ChatMessageItem = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.recipe,
          timestamp: new Date(),
          isFromCache: result.fromCache,
        };

        setMessages((prev) => [...prev, assistantMessage].slice(-MAX_MESSAGES));
        setUsageRemaining(result.usageRemaining);
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      } catch (err) {
        const is429 =
          err instanceof PulseAiServiceError &&
          err.apiCode === 'pulseai/daily-limit-reached';

        if (is429) {
          // Remove a mensagem do usuário — a consulta não chegou ao GPT-4o
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          setUsageRemaining(0);
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
              ? t(err.translationKey as Parameters<typeof t>[0])
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

  // ── Auto-envio do protocolo vindo da Home (executa a cada novo param) ─────
  useEffect(() => {
    const protocol = route.params?.protocol?.trim();

    if (!protocol) {
      return;
    }

    navigation.setParams({ protocol: undefined });
    void handleSend(protocol);
  }, [handleSend, navigation, route.params?.protocol]);

  // ── Chip de sugestão → preenche ChatInput sem enviar ─────────────────────
  const handleSuggestionPress = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  // ── Navegação ─────────────────────────────────────────────────────────────
  const handleStartBlend = useCallback((recipe: PulseAiRecipe) => {
    void recipe;
    navigation.navigate('Blend');
  }, [navigation]);

  const handleFavoriteToggle = useCallback(
    async (recipe: PulseAiRecipe) => {
      const recipeKey = getRecipeFavoriteKey(recipe);

      if (pendingFavoriteKeysRef.current.has(recipeKey)) {
        return;
      }

      pendingFavoriteKeysRef.current.add(recipeKey);

      const previousValue = Boolean(favoriteStates[recipeKey]);
      const nextValue = !previousValue;

      setFavoriteStates((prev) => ({
        ...prev,
        [recipeKey]: nextValue,
      }));

      try {
        const result = await toggleFavorite(recipe);

        setFavoriteStates((prev) => ({
          ...prev,
          [recipeKey]: result.isFavorited,
        }));

        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
      } catch (error) {
        setFavoriteStates((prev) => ({
          ...prev,
          [recipeKey]: previousValue,
        }));

        const errorText =
          error instanceof FavoritesServiceError
            ? t(error.translationKey as Parameters<typeof t>[0])
            : t('recipes.favorites.toggle_error');

        setToastState({
          id: Date.now(),
          message: errorText,
        });
      } finally {
        pendingFavoriteKeysRef.current.delete(recipeKey);
      }
    },
    [favoriteStates, queryClient, t],
  );

  const handleFavoritesPress = useCallback(() => {
    navigation
      .getParent<NavigationProp<RootStackParamList>>()
      ?.navigate('FavoritesList');
  }, [navigation]);

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

    const recipe = item.content as PulseAiRecipe;
    const favoriteKey = getRecipeFavoriteKey(recipe);

    return (
      <ChatMessage
        role="assistant"
        content={recipe}
        timestamp={item.timestamp}
        isFromCache={item.isFromCache}
        isFavorited={Boolean(favoriteStates[favoriteKey])}
        onFavorite={() => {
          void handleFavoriteToggle(recipe);
        }}
        onStartBlend={() => handleStartBlend(recipe)}
      />
    );
  }, [favoriteStates, handleFavoriteToggle, handleStartBlend]);

  const ListFooterComponent = isLoading ? <ChatMessageSkeleton /> : null;

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
        <Pressable
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={t('pulseAi.historyButton')}
          // Placeholder para Fase 3 — histórico persistido
        >
          <Ionicons name="time-outline" size={24} color={colors.text.secondary} />
        </Pressable>

        <Text style={styles.headerTitle}>{t('navigation.pulseAI')}</Text>

        <Pressable
          style={styles.headerButton}
          onPress={handleFavoritesPress}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.favorites.title')}
        >
          <Ionicons name="heart-outline" size={24} color={colors.text.secondary} />
        </Pressable>
      </View>

      {/* ── Histórico de mensagens ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: ESTIMATED_CHAT_INPUT_HEIGHT + spacing.xl },
        ]}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
        inverted={false}
      />

      {toastState ? (
        <View pointerEvents="none" style={[styles.toastViewport, { top: insets.top + 88 }]}> 
          <View style={styles.toast}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.text.primary}
            />
            <Text style={styles.toastText}>{toastState.message}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Indicador de uso (acima do ChatInput) ── */}
      <UsageIndicator usageRemaining={usageRemaining} />

      {/* ── Campo de input fixado no bottom ── */}
      <ChatInput
        ref={chatInputRef}
        onSend={handleSend}
        isLoading={isLoading}
        usageRemaining={usageRemaining}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  toastViewport: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: TOAST_BORDER_COLOR,
    backgroundColor: TOAST_BACKGROUND_COLOR,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  toastText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },

  // FlatList
  listContent: {
    flexGrow: 1,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xl,
  },

  // Welcome State
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
    borderColor: SUGGESTION_BORDER_COLOR,
    backgroundColor: SUGGESTION_BACKGROUND_COLOR,
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