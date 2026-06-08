// apps/mobile/src/screens/PulseAIScreen.tsx
// Tela principal do Pulse AI Chat — CP1.5.
//
// Arquitetura local:
//   - Histórico de mensagens em useState (sem persistência na Fase 1)
//   - Limite de 20 itens no array (10 trocas = 10 user + 10 assistant)
//   - FlatList inverted=false com auto-scroll via flatListRef
//   - ChatInput absolutamente posicionado (gerencia seu próprio bottom)
//   - UsageIndicator acima do ChatInput quando usuário free

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FavoriteItem, PantryAnalysisResult, PulseAiRecipe } from '@blendi/shared';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useFavorites } from '../hooks/useFavorites';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useAuthStore } from '../store/auth.store';
import { useNetworkStore } from '../store/network.store';
import { usePulseAIStore } from '../store/pulseAi.store';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ChatMessage } from '../components/pulseAi/ChatMessage';
import { ChatInput, type ChatInputHandle } from '../components/pulseAi/ChatInput';
import { ChatMessageSkeleton } from '../components/pulseAi/ChatMessageSkeleton';
import { UsageIndicator } from '../components/pulseAi/UsageIndicator';
import { imagePlaceholderStyles } from '../assets';
import * as pulseAiService from '../services/pulseAi.service';
import { getRecipeFavoriteKey } from '../services/favorites.service';
import { PulseAiServiceError } from '../services/pulseAi.service';
import { PANTRY_SCAN_LIMIT_FREE, QUERY_KEYS } from '../config/cache.config';
import type { AppTabParamList, PulseAIStackScreenProps } from '../navigation/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAILY_FREE_LIMIT = 3;
const MAX_MESSAGES = 20;
const LOGO_PLACEHOLDER_SIZE = 64;
const SUGGESTION_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const SUGGESTION_BACKGROUND_COLOR = 'rgba(255,255,255,0.06)';

// Altura estimada do ChatInput acima da tab bar (fade + campo + padding).
// Usado para garantir que o conteúdo não fique atrás do input fixado.
const ESTIMATED_CHAT_INPUT_HEIGHT = 172;

const BADGE_SIZE = 16;
const BADGE_FONT_SIZE_NORMAL = 10;
const BADGE_FONT_SIZE_OVERFLOW = 8;
const HEADER_SIDE_WIDTH = 96;
const SCANNER_BADGE_BACKGROUND = 'rgba(245,158,11,0.90)';

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

type PantryScanStatus = Pick<PantryAnalysisResult, 'scansUsed' | 'scansLimit' | 'resetDate'>;

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
  const scansLimit = scanStatus?.scansLimit ?? PANTRY_SCAN_LIMIT_FREE;

  return Math.max(0, scansLimit - scansUsed);
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

export function PulseAIScreen({ navigation }: PulseAIStackScreenProps<'PulseAIChat'>) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const pendingProtocol = usePulseAIStore((state) => state.pendingProtocol);
  const clearPendingProtocol = usePulseAIStore((state) => state.clearPendingProtocol);
  const authUser = useAuthStore((state) => state.user);
  const userGoal = authUser?.goal ?? 'Wellness';
  const isPro = (authUser?.blendiModel ?? 'Lite') !== 'Lite';
  const isConnected = useNetworkStore((state) => state.isConnected);
  const goalKey = GOAL_I18N_KEYS[userGoal];

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [pantryScanStatus, setPantryScanStatus] = useState<PantryScanStatus | null>(null);

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
  const welcomeSubtitle = t(`pulseAi.goals.${goalKey}.welcomeSubtitle`);
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

  // ── Auto-envio do protocolo vindo da Home (transitório via store) ─────────
  useEffect(() => {
    const protocol = pendingProtocol?.trim();

    if (!protocol) {
      return;
    }

    clearPendingProtocol();
    void handleSend(protocol);
  }, [clearPendingProtocol, handleSend, pendingProtocol]);

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
        isFavorited={Boolean(favoriteIdsByRecipeKey[favoriteKey])}
        favoriteId={favoriteIdsByRecipeKey[favoriteKey]}
        onStartBlend={() => handleStartBlend(recipe)}
      />
    );
  }, [favoriteIdsByRecipeKey, handleStartBlend]);

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
        <View style={styles.headerSide}>
          <Pressable
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('pulseAi.historyButton')}
            // Placeholder para Fase 3 — histórico persistido
          >
            <Ionicons name="time-outline" size={24} color={colors.text.secondary} />
          </Pressable>
        </View>

        <Text style={styles.headerTitle}>{t('navigation.pulseAI')}</Text>

        <View style={[styles.headerSide, styles.headerRightActions]}>
          <View style={styles.headerActionWithBadge}>
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
          </View>

          <View style={styles.headerActionWithBadge}>
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
          </View>
        </View>
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

      {/* ── Indicador de uso (acima do ChatInput) ── */}
      {isConnected ? <UsageIndicator usageRemaining={usageRemaining} /> : null}

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
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerSide: {
    width: HEADER_SIDE_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
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
    color: colors.text.primary,
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
  headerTitle: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
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