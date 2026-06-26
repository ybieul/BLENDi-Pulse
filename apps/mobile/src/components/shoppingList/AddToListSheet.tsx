import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ShoppingListSummary } from '@blendi/shared';
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { CACHE_CONFIG, QUERY_KEYS } from '../../config/cache.config';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { AppTabParamList } from '../../navigation/types';
import { getLists, type ShoppingListsResult } from '../../services/shoppingList.service';
import { appendIngredientsToShoppingList, type ShoppingListIngredientInput } from '../../utils/shoppingListAddItems.utils';
import { showToast } from '../../utils/toast.utils';
import { AuthButton } from '../ui/AuthButton';

const SHEET_RADIUS = 24;
const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const SHEET_BORDER = 'rgba(255,255,255,0.10)';
const ROW_BACKGROUND = 'rgba(255,255,255,0.06)';
const ROW_BORDER = 'rgba(255,255,255,0.08)';
const CHEVRON_COLOR = 'rgba(255,255,255,0.45)';
const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const SUBTITLE_OPACITY = 0.6;
const META_OPACITY = 0.55;

export interface AddToListSheetProps {
  visible: boolean;
  ingredients: ShoppingListIngredientInput[];
  onClose: () => void;
}

export function AddToListSheet({
  visible,
  ingredients,
  onClose,
}: AddToListSheetProps) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const autoAddTriggeredRef = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shoppingListsQuery = useQuery<
    ShoppingListsResult,
    Error,
    ShoppingListsResult,
    typeof QUERY_KEYS.shoppingLists
  >({
    queryKey: QUERY_KEYS.shoppingLists,
    queryFn: getLists,
    enabled: visible,
    staleTime: CACHE_CONFIG.SHOPPING_LISTS_TTL,
    retry: 1,
  });

  const activeLists = useMemo(
    () => shoppingListsQuery.data?.lists ?? [],
    [shoppingListsQuery.data],
  );
        const shouldOpenSheet = (shoppingListsQuery.isSuccess && activeLists.length !== 1) || shoppingListsQuery.isError;

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (!visible) {
      autoAddTriggeredRef.current = false;
      setIsMounted(false);
      setIsSubmitting(false);
      return;
    }

    if (shouldOpenSheet) {
      setIsMounted(true);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 220,
          damping: 26,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [backdropOpacity, height, shouldOpenSheet, translateY, visible]);

  useEffect(() => {
    if (visible) {
      return undefined;
    }

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, translateY, visible]);

  const closeSheet = useCallback(() => {
    setIsMounted(false);
    onClose();
  }, [onClose]);

  const showAddConfirmation = useCallback(
    (listName: string, didSync: boolean) => {
      showToast(
        didSync
          ? t('shoppingList.addedToList', { listName })
          : t('shoppingList.savedLocally'),
      );
    },
    [t],
  );

  const handleAddToList = useCallback(
    async (list: ShoppingListSummary) => {
      if (isSubmitting || ingredients.length === 0) {
        return;
      }

      setIsSubmitting(true);

      try {
        const result = await appendIngredientsToShoppingList(queryClient, list.id, ingredients);
        showAddConfirmation(list.name, result.didSync);
        closeSheet();
      } catch {
        showToast(t('common.states.error'));
        closeSheet();
      }
    },
    [closeSheet, ingredients, isSubmitting, queryClient, showAddConfirmation, t],
  );

  useEffect(() => {
    if (!visible || !shoppingListsQuery.isSuccess || activeLists.length !== 1 || autoAddTriggeredRef.current) {
      return;
    }

    autoAddTriggeredRef.current = true;
    void handleAddToList(activeLists[0]);
  }, [activeLists, handleAddToList, shoppingListsQuery.isSuccess, visible]);

  const handleCreateNewList = () => {
    closeSheet();
    navigation.getParent<BottomTabNavigationProp<AppTabParamList>>()?.navigate('Track', {
      screen: 'ShoppingLists',
    });
  };

  const shouldRenderSheet = visible && shouldOpenSheet;

  if (!shouldRenderSheet || !isMounted) {
    return null;
  }

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={isMounted}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={closeSheet}
          style={StyleSheet.absoluteFillObject}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
          <View style={styles.handle} />

          <View style={styles.headerBlock}>
            <Text style={styles.sheetTitle}>{t('shoppingList.addToWhichList')}</Text>
            {activeLists.length === 0 && shoppingListsQuery.isSuccess ? (
              <Text style={styles.sheetSubtitle}>{t('shoppingList.noActiveLists')}</Text>
            ) : null}
          </View>

          {shoppingListsQuery.isError ? (
            <View style={styles.centeredState}>
              <Ionicons color={colors.text.secondary} name="wifi-outline" size={36} />
              <Text style={styles.errorText}>{t('common.states.error')}</Text>
              <AuthButton fullWidth={false} onPress={() => void shoppingListsQuery.refetch()} style={styles.retryButton}>
                {t('common.actions.retry')}
              </AuthButton>
            </View>
          ) : activeLists.length === 0 ? (
            <View style={styles.centeredState}>
              <Ionicons color={EMPTY_ICON_COLOR} name="cart-outline" size={56} />
              <Text style={styles.emptyText}>{t('shoppingList.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('shoppingList.emptySubtitle')}</Text>
            </View>
          ) : (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={activeLists}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={() => {
                    void handleAddToList(item);
                  }}
                  style={styles.listRow}
                >
                  <View style={styles.listTextBlock}>
                    <Text numberOfLines={1} style={styles.listName}>
                      {item.name}
                    </Text>
                    <Text style={styles.listMeta}>
                      {t('shoppingList.pendingItem', { count: item.pendingItems })}
                    </Text>
                  </View>

                  <Ionicons color={CHEVRON_COLOR} name="chevron-forward" size={18} />
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}

          <AuthButton
            disabled={isSubmitting}
            fullWidth={false}
            onPress={handleCreateNewList}
            style={styles.createButton}
          >
            {t('shoppingList.createNewList')}
          </AuthButton>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: HANDLE_COLOR,
    marginBottom: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  sheetSubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    opacity: SUBTITLE_OPACITY,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  listRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    backgroundColor: ROW_BACKGROUND,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  listTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  listName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  listMeta: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: META_OPACITY,
  },
  separator: {
    height: spacing.md,
  },
  createButton: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    minWidth: 180,
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['4xl'],
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
  emptyText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    opacity: SUBTITLE_OPACITY,
    lineHeight: 20,
    textAlign: 'center',
  },
});