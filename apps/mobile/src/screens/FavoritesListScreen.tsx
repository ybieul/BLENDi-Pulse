// apps/mobile/src/screens/FavoritesListScreen.tsx
// CP1.7 — Lista de receitas favoritas do usuário.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FavoriteItem, PulseAiRecipe } from '@blendi/shared';
import { colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';

import { FavoriteCard } from '../components/favorites/FavoriteCard';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton, RecipeCardSkeleton } from '../components/ui';
import { StaleDataIndicator } from '../components/ui/StaleDataIndicator';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useFavorites, useRemoveFavorite } from '../hooks/useFavorites';
import { useNetworkStore } from '../store/network.store';
import type { AppTabParamList, PulseAIStackParamList } from '../navigation/types';
import { showToast } from '../utils/toast.utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<PulseAIStackParamList, 'Favorites'>;

const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const EMPTY_ICON_SIZE = 64;
const ERROR_ICON_SIZE = 40;
const ERROR_ICON_COLOR = 'rgba(255,255,255,0.50)';

function favoriteItemToRecipe(item: FavoriteItem): PulseAiRecipe {
  return {
    title: item.recipeName,
    ingredients: item.ingredients,
    macros: {
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      calories: item.calories,
    },
    prepTimeSeconds: item.prepTimeSeconds,
    blendInstruction: item.blendInstruction,
    tip: item.tip,
    hasSubstitutes: item.hasSubstitutes,
  };
}

export function FavoritesListScreen({ navigation }: Props) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { favorites, isLoading, isError, refetch, dataUpdatedAt } = useFavorites();
  const removeFavorite = useRemoveFavorite();
  const isConnected = useNetworkStore((state) => state.isConnected);

  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayedFavorites = useMemo(
    () => favorites.filter((favorite) => !pendingRemovals.has(favorite.id)),
    [favorites, pendingRemovals],
  );

  const emptyOpacity = useRef(new Animated.Value(0)).current;
  const emptyScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (!isLoading && !isError && displayedFavorites.length === 0) {
      emptyOpacity.setValue(0);
      emptyScale.setValue(0.95);

      Animated.parallel([
        Animated.timing(emptyOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(emptyScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [displayedFavorites.length, emptyOpacity, emptyScale, isError, isLoading]);

  const handleStartBlend = useCallback(
    (item: FavoriteItem) => {
      const recipe = favoriteItemToRecipe(item);
      navigation
        .getParent<BottomTabNavigationProp<AppTabParamList>>()
        ?.navigate('Blend', { recipe });
    },
    [navigation],
  );

  const handleRemove = useCallback(
    (item: FavoriteItem) => {
      if (!isConnected) {
        showToast(t('common.actionRequiresConnection'));
        return;
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPendingRemovals((prev) => new Set([...prev, item.id]));

      removeFavorite.mutate(item.id, {
        onError: (error) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setPendingRemovals((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
          showToast(t(error.translationKey as Parameters<typeof t>[0]));
        },
        onSuccess: () => {
          setPendingRemovals((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        },
      });
    },
    [isConnected, removeFavorite, t],
  );

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.skeletonList}>
          <RecipeCardSkeleton />
          <RecipeCardSkeleton />
          <RecipeCardSkeleton />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredContainer}>
          <Ionicons name="wifi-outline" size={ERROR_ICON_SIZE} color={ERROR_ICON_COLOR} />
          <Text style={styles.errorText}>{t('common.states.error')}</Text>
          <AuthButton
            fullWidth={false}
            onPress={() => void refetch()}
            style={styles.retryButton}
          >
            {t('common.actions.retry')}
          </AuthButton>
        </View>
      );
    }

    if (displayedFavorites.length === 0) {
      return (
        <Animated.View
          style={[
            styles.centeredContainer,
            { opacity: emptyOpacity, transform: [{ scale: emptyScale }] },
          ]}
        >
          <Ionicons name="heart-outline" size={EMPTY_ICON_SIZE} color={EMPTY_ICON_COLOR} />
          <Text style={styles.emptyTitle}>{t('favorites.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('favorites.emptySubtitle')}</Text>
          <AuthButton
            fullWidth={false}
            onPress={() => navigation.goBack()}
            style={styles.discoverButton}
          >
            {t('favorites.discoverRecipes')}
          </AuthButton>
        </Animated.View>
      );
    }

    return (
      <FlashList
        data={displayedFavorites}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onRefresh={() => void handleRefresh()}
        refreshing={isRefreshing}
        renderItem={({ item }) => (
          <FavoriteCard
            item={item}
            onStartBlend={() => handleStartBlend(item)}
            onRemove={() => handleRemove(item)}
          />
        )}
        style={styles.list}
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

        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>{t('favorites.title')}</Text>
          <View style={styles.staleIndicatorAnchor}>
            <StaleDataIndicator dataUpdatedAt={dataUpdatedAt} />
          </View>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {renderContent()}
    </View>
  );
}

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
  headerTitleBlock: {
    position: 'relative',
    minWidth: 120,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },
  staleIndicatorAnchor: {
    position: 'relative',
    width: '100%',
    minHeight: 12,
    marginTop: spacing.xs,
  },
  skeletonList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
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
  discoverButton: {
    width: 200,
    height: 44,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  separator: {
    height: 12,
  },
});
