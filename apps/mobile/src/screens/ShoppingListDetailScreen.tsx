import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ShoppingListDetail, ShoppingListItem } from '@blendi/shared';
import {
  borderRadius,
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QUERY_KEYS } from '../config/cache.config';
import { ImportFromFavoritesSheet } from '../components/shoppingList/ImportFromFavoritesSheet';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { useAppTranslation } from '../hooks/useAppTranslation';
import type { TrackStackParamList } from '../navigation/types';
import {
  clearCheckedItems,
  getListById,
  toggleItemCheck,
  updateItems,
} from '../services/shoppingList.service';
import { useNetworkStore } from '../store/network.store';
import { markListDirty } from '../utils/shoppingListSync.utils';
import { showToast } from '../utils/toast.utils';

const DETAIL_STALE_TIME_MS = 30_000;
const SKELETON_BG = 'rgba(255,255,255,0.05)';
const SKELETON_BORDER = 'rgba(255,255,255,0.08)';
const ROW_BACKGROUND = 'rgba(255,255,255,0.06)';
const ROW_BORDER = 'rgba(255,255,255,0.08)';
const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const SECTION_TEXT_COLOR = 'rgba(255,255,255,0.50)';
const INPUT_BG = 'rgba(255,255,255,0.08)';
const INPUT_BORDER = 'rgba(255,255,255,0.10)';
const INPUT_PLACEHOLDER = 'rgba(255,255,255,0.35)';
const DELETE_ICON_COLOR = 'rgba(239,68,68,0.65)';
const UNCHECKED_BORDER = 'rgba(255,255,255,0.25)';
const FOOTER_BORDER = 'rgba(255,255,255,0.08)';
const HEADER_ICON_COLOR = 'rgba(255,255,255,0.70)';

interface ShoppingListItemRowProps {
  item: ShoppingListItem;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

function ShoppingListItemRow({ item, onToggle, onDelete }: ShoppingListItemRowProps) {
  const fillProgress = useRef(new Animated.Value(item.checked ? 1 : 0)).current;
  const iconScale = useRef(new Animated.Value(item.checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(fillProgress, {
      toValue: item.checked ? 1 : 0,
      stiffness: 260,
      damping: 24,
      mass: 0.7,
      useNativeDriver: false,
    }).start();

    Animated.spring(iconScale, {
      toValue: item.checked ? 1 : 0,
      stiffness: 280,
      damping: 20,
      mass: 0.55,
      useNativeDriver: true,
    }).start();
  }, [fillProgress, iconScale, item.checked]);

  const quantity = item.quantity?.trim() ?? '';

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => onToggle(item.itemId)}>
      <View style={[styles.itemRowContainer, item.checked && styles.itemRowContainerChecked]}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.88}
          onPress={() => onToggle(item.itemId)}
          style={styles.itemCheckboxTouch}
        >
          <Animated.View
            style={[
              styles.itemCheckbox,
              {
                backgroundColor: fillProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(0,0,0,0)', colors.brand.pulse],
                }),
                borderColor: fillProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [UNCHECKED_BORDER, colors.brand.pulse],
                }),
                borderWidth: fillProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, 0],
                }),
              },
            ]}
          >
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons color={colors.text.primary} name="checkmark" size={14} />
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.itemTextBlock}>
          <Text numberOfLines={1} style={[styles.itemName, item.checked && styles.itemNameChecked]}>
            {item.name}
          </Text>

          {quantity.length > 0 && !item.checked ? (
            <Text numberOfLines={1} style={styles.itemQuantity}>
              {quantity}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => onDelete(item.itemId)}
          style={styles.deleteButton}
        >
          <Ionicons color={DELETE_ICON_COLOR} name="trash-outline" size={16} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ShoppingListLoadingPlaceholder() {
  const pulseOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [pulseOpacity]);

  return (
    <View style={styles.skeletonContainer}>
      {[0, 1, 2].map((index) => (
        <Animated.View key={index} style={[styles.skeletonCard, { opacity: pulseOpacity }]} />
      ))}
    </View>
  );
}

type ShoppingListDetailScreenProps = NativeStackScreenProps<
  TrackStackParamList,
  'ShoppingListDetail'
>;

function sortItemsByAddedAtDesc(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items].sort(
    (left, right) => new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime(),
  );
}

export function ShoppingListDetailScreen({ navigation, route }: ShoppingListDetailScreenProps) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isInternetReachable = useNetworkStore((state) => state.isInternetReachable);
  const isOffline = !isConnected || !isInternetReachable;
  const { listId, listName } = route.params;

  const [localItems, setLocalItems] = useState<ShoppingListItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImportSheetVisible, setIsImportSheetVisible] = useState(false);
  // Marcado antes de um patch otimista no cache offline para o useEffect abaixo
  // pular o reset de localItems a partir de `data` nesse ciclo — evita que o
  // patch otimista seja imediatamente sobrescrito pelo próprio dado que ele gerou.
  const isOfflinePatchRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.shoppingListDetail, listId] as const,
    queryFn: () => getListById(listId),
    staleTime: DETAIL_STALE_TIME_MS,
    enabled: true,
  });

  useEffect(() => {
    if (isOfflinePatchRef.current) {
      isOfflinePatchRef.current = false;
      return;
    }

    if (data?.items) {
      setLocalItems(data.items);
    }
  }, [data]);

  const patchShoppingListDetailCache = useCallback(
    (nextItems: ShoppingListItem[]) => {
      const detailKey = [...QUERY_KEYS.shoppingListDetail, listId] as const;
      const currentDetail = queryClient.getQueryData<ShoppingListDetail>(detailKey);

      if (!currentDetail) {
        return;
      }

      isOfflinePatchRef.current = true;
      queryClient.setQueryData<ShoppingListDetail>(detailKey, {
        ...currentDetail,
        items: nextItems,
        totalItems: nextItems.length,
        pendingItems: nextItems.filter((item) => !item.checked).length,
        updatedAt: new Date().toISOString(),
      });
    },
    [listId, queryClient],
  );

  const pendingItems = useMemo(
    () => sortItemsByAddedAtDesc(localItems.filter((item) => !item.checked)),
    [localItems],
  );

  const checkedItems = useMemo(
    () => sortItemsByAddedAtDesc(localItems.filter((item) => item.checked)),
    [localItems],
  );

  const handleToggleCheck = useCallback(
    (itemId: string) => {
      const previousItems = localItems;
      const currentItem = previousItems.find((item) => item.itemId === itemId);

      if (!currentItem) {
        return;
      }

      const nextItems = previousItems.map((item) =>
        item.itemId === itemId
          ? {
              ...item,
              checked: !item.checked,
            }
          : item,
      );

      setLocalItems(nextItems);

      if (isOffline) {
        markListDirty(listId);
        patchShoppingListDetailCache(nextItems);
        showToast(t('shoppingList.savedLocally'));
        return;
      }

      setIsSyncing(true);

      void toggleItemCheck(listId, itemId)
        .then((syncedItem) => {
          setLocalItems((currentItems) =>
            currentItems.map((item) => (item.itemId === itemId ? syncedItem : item)),
          );
        })
        .catch(() => {
          setLocalItems(previousItems);
        })
        .finally(() => {
          setIsSyncing(false);
        });
    },
    [isOffline, listId, localItems, patchShoppingListDetailCache, t],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      const previousItems = localItems;
      const nextItems = previousItems.filter((item) => item.itemId !== itemId);

      if (nextItems.length === previousItems.length) {
        return;
      }

      setLocalItems(nextItems);
      setIsSyncing(true);

      void updateItems(listId, nextItems)
        .then((shoppingList) => {
          setLocalItems(shoppingList.items);
        })
        .catch(() => {
          setLocalItems(previousItems);
          showToast(t('common.states.error'));
        })
        .finally(() => {
          setIsSyncing(false);
        });
    },
    [listId, localItems, t],
  );

  const handleAddItem = useCallback(() => {
    const trimmedName = newItemName.trim();

    if (trimmedName.length === 0 || isAdding) {
      return;
    }

    const previousItems = localItems;
    const nextItem: ShoppingListItem = {
      itemId: `temp_${Date.now()}`,
      name: trimmedName,
      quantity: newItemQuantity.trim() || '',
      checked: false,
      addedAt: new Date().toISOString(),
      source: 'manual',
    };
    const nextItems = [nextItem, ...previousItems];

    setIsAdding(true);
    setIsSyncing(true);
    setLocalItems(nextItems);
    setNewItemName('');
    setNewItemQuantity('');

    void updateItems(listId, nextItems)
      .then((shoppingList) => {
        setLocalItems(shoppingList.items);
        void queryClient.invalidateQueries({
          queryKey: [...QUERY_KEYS.shoppingListDetail, listId] as const,
        });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingLists });
      })
      .catch(() => {
        // Não reverte o item local — mesmo padrão de appendIngredientsToShoppingList:
        // mantém o item otimista, marca a lista dirty, e deixa o reconnect sync
        // reenviar o array completo (incluindo este item) para o backend.
        markListDirty(listId);
        patchShoppingListDetailCache(nextItems);
        showToast(t('shoppingList.savedLocally'));
      })
      .finally(() => {
        setIsAdding(false);
        setIsSyncing(false);
      });
  }, [isAdding, listId, localItems, newItemName, newItemQuantity, patchShoppingListDetailCache, queryClient, t]);

  const handleClearChecked = useCallback(() => {
    if (checkedItems.length === 0 || isSyncing) {
      return;
    }

    Alert.alert(
      t('shoppingList.clearChecked'),
      t('shoppingList.clearCheckedConfirm', { count: checkedItems.length }),
      [
        {
          text: t('common.actions.cancel'),
          style: 'cancel',
        },
        {
          text: t('shoppingList.clearChecked'),
          style: 'destructive',
          onPress: () => {
            setIsSyncing(true);

            void clearCheckedItems(listId)
              .then((result) => {
                setLocalItems(result.shoppingList.items);
              })
              .catch(() => {
                showToast(t('common.states.error'));
              })
              .finally(() => {
                setIsSyncing(false);
              });
          },
        },
      ],
    );
  }, [checkedItems.length, isSyncing, listId, t]);

  const sections = useMemo(
    () => [
      {
        title: t('shoppingList.sectionToBuy'),
        data: pendingItems,
      },
      {
        title: t('shoppingList.sectionInCart'),
        data: checkedItems,
      },
    ].filter((section) => section.data.length > 0),
    [checkedItems, pendingItems, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: ShoppingListItem }) => (
      <ShoppingListItemRow
        item={item}
        onDelete={handleDeleteItem}
        onToggle={handleToggleCheck}
      />
    ),
    [handleDeleteItem, handleToggleCheck],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; data: ShoppingListItem[] } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    ),
    [],
  );

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />

      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}> 
        <TouchableOpacity
          accessibilityLabel={t('common.actions.back')}
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => navigation.goBack()}
          style={styles.headerBackButton}
        >
          <Ionicons color={colors.text.primary} name="arrow-back" size={22} />
        </TouchableOpacity>

        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          {listName}
        </Text>

        <View style={styles.headerActions}>
          {checkedItems.length > 0 ? (
            <TouchableOpacity
              accessibilityLabel={t('shoppingList.clearChecked')}
              accessibilityRole="button"
              activeOpacity={0.82}
              onPress={handleClearChecked}
              style={styles.headerIconButton}
            >
              <Ionicons
                color={HEADER_ICON_COLOR}
                name="checkmark-done-outline"
                size={20}
              />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            accessibilityLabel={t('shoppingList.importFromFavorites')}
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={() => setIsImportSheetVisible(true)}
            style={styles.headerIconButton}
          >
            <Ionicons color={HEADER_ICON_COLOR} name="download-outline" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && localItems.length === 0 ? (
        <ShoppingListLoadingPlaceholder />
      ) : (
        <SectionList
          contentContainerStyle={[
            styles.listContent,
            localItems.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          keyExtractor={(item) => item.itemId}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons color={EMPTY_ICON_COLOR} name="cart-outline" size={48} />
              <Text style={styles.emptyStateTitle}>{t('shoppingList.emptyListTitle')}</Text>
              <Text style={styles.emptyStateSubtitle}>{t('shoppingList.emptyListSubtitle')}</Text>
            </View>
          }
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          sections={sections}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}> 
        <LinearGradient
          colors={['transparent', colors.background.primary]}
          pointerEvents="none"
          style={styles.footerGradient}
        />

        <View style={styles.footerRow}>
          <TextInput
            onChangeText={setNewItemName}
            onSubmitEditing={handleAddItem}
            placeholder={t('shoppingList.addItemPlaceholder')}
            placeholderTextColor={INPUT_PLACEHOLDER}
            returnKeyType="done"
            selectionColor={colors.brand.pulse}
            style={styles.nameInput}
            value={newItemName}
          />

          <TextInput
            onChangeText={setNewItemQuantity}
            placeholder={t('shoppingList.quantityPlaceholder')}
            placeholderTextColor={INPUT_PLACEHOLDER}
            returnKeyType="done"
            selectionColor={colors.brand.pulse}
            style={styles.quantityInput}
            value={newItemQuantity}
          />

          <TouchableOpacity
            accessibilityLabel={t('common.actions.add')}
            accessibilityRole="button"
            activeOpacity={0.86}
            disabled={isAdding}
            onPress={handleAddItem}
            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
          >
            <Ionicons color={colors.text.primary} name="add" size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ImportFromFavoritesSheet
        listId={listId}
        onClose={() => setIsImportSheetVisible(false)}
        visible={isImportSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: spacing.lg,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  headerIconButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonContainer: {
    paddingHorizontal: spacing.xl,
    gap: 6,
  },
  skeletonCard: {
    height: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SKELETON_BORDER,
    backgroundColor: SKELETON_BG,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingVertical: spacing.md,
  },
  sectionHeaderText: {
    color: SECTION_TEXT_COLOR,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  sectionSeparator: {
    height: spacing.md,
  },
  itemSeparator: {
    height: 6,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['4xl'],
  },
  emptyStateTitle: {
    marginTop: spacing.xl,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
  itemRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    backgroundColor: ROW_BACKGROUND,
    padding: 14,
  },
  itemRowContainerChecked: {
    opacity: 0.5,
  },
  itemCheckboxTouch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextBlock: {
    flex: 1,
    marginHorizontal: spacing.lg,
    minWidth: 0,
  },
  itemName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
  },
  itemQuantity: {
    marginTop: spacing.xs,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: 0.55,
  },
  deleteButton: {
    padding: spacing.md,
    marginRight: -spacing.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.primary,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderTopWidth: 0.5,
    borderTopColor: FOOTER_BORDER,
  },
  footerGradient: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    height: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nameInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: INPUT_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  quantityInput: {
    width: 80,
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: INPUT_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.pulse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
});