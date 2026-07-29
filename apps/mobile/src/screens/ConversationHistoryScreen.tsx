// apps/mobile/src/screens/ConversationHistoryScreen.tsx
// CP3.3 — Histórico de conversas do Pulse AI.

import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton, SkeletonLoader } from '../components/ui';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useDateFormat } from '../hooks/useDateFormat';
import { QUERY_KEYS } from '../config/cache.config';
import {
  getConversationById,
  getConversations,
  type ConversationSummary,
} from '../services/conversation.service';
import type { PulseAIStackScreenProps } from '../navigation/types';
import { showToast } from '../utils/toast.utils';

const EMPTY_ICON_SIZE = 48;
const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const CARD_BACKGROUND = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const SKELETON_COUNT = 3;

// ─── Card de conversa ───────────────────────────────────────────────────────

interface ConversationHistoryCardProps {
  item: ConversationSummary;
  disabled: boolean;
  onPress: (item: ConversationSummary) => void;
}

function ConversationHistoryCard({ item, disabled, onPress }: ConversationHistoryCardProps) {
  const { t } = useAppTranslation();
  const { formatTime } = useDateFormat();

  const recipeName = item.lastRecipeName ?? t('pulseAi.historyNoRecipe');

  let relativeTime: string;
  if (item.daysAgo <= 0) {
    relativeTime = t('common.daysAgoToday', { time: formatTime(item.createdAt) });
  } else if (item.daysAgo === 1) {
    relativeTime = t('common.daysAgoYesterday');
  } else {
    relativeTime = t('common.daysAgoN', { days: item.daysAgo });
  }

  return (
    <Pressable
      style={styles.card}
      disabled={disabled}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={recipeName}
    >
      <Text style={styles.cardTitle} numberOfLines={1}>
        {recipeName}
      </Text>
      <View style={styles.cardFooterRow}>
        <Text style={styles.cardTime}>{relativeTime}</Text>
        <Text style={styles.cardMessageCount}>{item.messageCount}</Text>
      </View>
    </Pressable>
  );
}

// ─── Skeleton de carregamento ───────────────────────────────────────────────

function ConversationCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonLoader variant="line" width="60%" height={15} />
      <View style={styles.cardFooterRow}>
        <SkeletonLoader variant="line" width="30%" height={11} />
        <SkeletonLoader variant="line" width={18} height={11} />
      </View>
    </View>
  );
}

// ─── ConversationHistoryScreen ───────────────────────────────────────────────

export function ConversationHistoryScreen({
  navigation,
}: PulseAIStackScreenProps<'ConversationHistory'>) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.conversations,
    queryFn: getConversations,
  });

  const handleConversationPress = useCallback(
    async (item: ConversationSummary) => {
      if (openingConversationId) {
        return;
      }

      setOpeningConversationId(item.id);

      try {
        const conversation = await getConversationById(item.id);
        navigation.navigate('PulseAIChat', { conversation });
      } catch {
        showToast(t('common.states.error'));
      } finally {
        setOpeningConversationId(null);
      }
    },
    [navigation, openingConversationId, t],
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.listContent}>
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <ConversationCardSkeleton key={index} />
          ))}
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>{t('common.states.error')}</Text>
          <AuthButton fullWidth={false} onPress={() => void refetch()} style={styles.retryButton}>
            {t('common.actions.retry')}
          </AuthButton>
        </View>
      );
    }

    if (!data || data.length === 0) {
      return (
        <View style={styles.centeredContainer}>
          <Ionicons name="time-outline" size={EMPTY_ICON_SIZE} color={EMPTY_ICON_COLOR} />
          <Text style={styles.emptyTitle}>{t('pulseAi.historyEmptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('pulseAi.historyEmptySubtitle')}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <ConversationHistoryCard
            item={item}
            disabled={openingConversationId !== null}
            onPress={(conversation) => void handleConversationPress(conversation)}
          />
        )}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <AuroraBackground intensity="reduced" />

      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable
          accessibilityLabel={t('common.actions.back')}
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>

        <Text style={styles.headerTitle}>{t('pulseAi.historyTitle')}</Text>

        <View style={styles.headerSpacer} />
      </View>

      {renderContent()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
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
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: fontWeights.bold,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTime: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  cardMessageCount: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    opacity: 0.4,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
  },
  errorText: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  retryButton: {
    width: 160,
    height: 44,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 20,
  },
});
