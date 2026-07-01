// apps/mobile/src/screens/ShoppingListsScreen.tsx
// Exibe as listas de compras do usuário (ativas e arquivadas).
//
// Dados:
//   • shoppingLists         → GET /shopping-lists (ativas + canCreateMore)
//   • shoppingListsArchived → GET /shopping-lists/archived (lazy, ao expandir seção)
//
// Mutations:
//   • createList  → POST /shopping-lists → navega para ShoppingListDetail
//   • updateList  → PATCH /shopping-lists/:id (renomear / arquivar / restaurar)
//   • deleteList  → DELETE /shopping-lists/:id

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ShoppingListSummary, UpdateShoppingListInput } from '@blendi/shared';
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useDateFormat } from '../hooks/useDateFormat';
import { useNetworkStore } from '../store/network.store';
import {
  createList,
  deleteList,
  getArchivedLists,
  getLists,
  updateList,
  ShoppingListServiceError,
  type ShoppingListsResult,
} from '../services/shoppingList.service';
import type { RootStackParamList, TrackStackScreenProps } from '../navigation/types';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton, AuthInput } from '../components/ui';
import { showToast } from '../utils/toast.utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_BG = 'rgba(255,255,255,0.07)';
const CARD_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const EMPTY_ICON_SIZE = 64;
const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';
const ARCHIVED_OPACITY = 0.65;
const SKELETON_BG = 'rgba(255,255,255,0.05)';
const ARCHIVED_TOGGLE_BORDER = 'rgba(255,255,255,0.08)';
const UPDATED_AT_OPACITY = 0.55;
const CHEVRON_COLOR = 'rgba(255,255,255,0.45)';

// ─── Types ────────────────────────────────────────────────────────────────────

type NameSheetMode = 'create' | 'rename';

interface RenameTarget {
  id: string;
  name: string;
}

// ─── ShoppingListCard ─────────────────────────────────────────────────────────

interface ShoppingListCardProps {
  list: ShoppingListSummary;
  onPress: () => void;
  onPressOptions: () => void;
  dimmed?: boolean;
}

function ShoppingListCard({
  list,
  onPress,
  onPressOptions,
  dimmed = false,
}: ShoppingListCardProps) {
  const { t } = useAppTranslation();
  const { formatDate } = useDateFormat();

  const pendingText =
    list.pendingItems === 0
      ? t('shoppingList.allBought')
      : t('shoppingList.pendingItem', { count: list.pendingItems });
  const pendingColor =
    list.pendingItems === 0 ? colors.feedback.success : colors.brand.pulse;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, dimmed && styles.cardDimmed]}
    >
      <View style={styles.cardHeader}>
        <Text numberOfLines={1} style={styles.cardName}>
          {list.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={{ bottom: 8, left: 8, right: 0, top: 8 }}
          onPress={onPressOptions}
          style={styles.cardOptionsButton}
        >
          <Ionicons color={colors.text.secondary} name="ellipsis-horizontal" size={18} />
        </Pressable>
      </View>

      <Text style={styles.cardDate}>{formatDate(list.updatedAt)}</Text>

      <View style={styles.cardFooter}>
        <Text style={[styles.cardBadge, { color: pendingColor }]}>
          {pendingText}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── ArchivedSection ──────────────────────────────────────────────────────────

interface ArchivedSectionProps {
  isExpanded: boolean;
  isLoading: boolean;
  isError: boolean;
  lists: ShoppingListSummary[];
  onToggle: () => void;
  onPressCard: (list: ShoppingListSummary) => void;
  onPressOptions: (list: ShoppingListSummary) => void;
}

function ArchivedSection({
  isExpanded,
  isLoading,
  isError,
  lists,
  onToggle,
  onPressCard,
  onPressOptions,
}: ArchivedSectionProps) {
  const { t } = useAppTranslation();

  return (
    <View style={styles.archivedSection}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={styles.archivedToggle}
      >
        <Text style={styles.archivedToggleLabel}>
          {t('shoppingList.archivedSection')}
        </Text>
        <Ionicons
          color={CHEVRON_COLOR}
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
        />
      </Pressable>

      {isExpanded ? (
        isLoading ? (
          <Text style={styles.archivedStatusText}>{t('common.states.loading')}</Text>
        ) : isError ? (
          <Text style={styles.archivedStatusText}>{t('common.states.error')}</Text>
        ) : lists.length === 0 ? null : (
          <View style={styles.archivedList}>
            {lists.map((list) => (
              <ShoppingListCard
                key={list.id}
                dimmed
                list={list}
                onPress={() => onPressCard(list)}
                onPressOptions={() => onPressOptions(list)}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

// ─── ListNameSheet ────────────────────────────────────────────────────────────

interface ListNameSheetProps {
  visible: boolean;
  mode: NameSheetMode;
  initialName: string;
  isLoading: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

function ListNameSheet({
  visible,
  mode,
  initialName,
  isLoading,
  onConfirm,
  onClose,
}: ListNameSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (visible) {
      setName(initialName);
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

    animation.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
        setName('');
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, initialName, translateY, visible]);

  if (!isMounted) {
    return null;
  }

  const title =
    mode === 'create' ? t('shoppingList.newList') : t('shoppingList.renameList');
  const buttonLabel =
    mode === 'create' ? t('shoppingList.createList') : t('common.actions.save');
  const trimmedName = name.trim();

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={isMounted}>
      <View style={styles.sheetModalRoot}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        >
          <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetKeyboardContainer}
        >
          <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}
          >
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>{title}</Text>

            <View style={styles.sheetInputWrapper}>
              <AuthInput
                autoFocus
                onChangeText={setName}
                placeholder={t('shoppingList.listNamePlaceholder')}
                returnKeyType="done"
                value={name}
              />
            </View>

            <AuthButton
              disabled={trimmedName.length === 0 || isLoading}
              loading={isLoading}
              onPress={() => {
                if (trimmedName.length > 0) {
                  onConfirm(trimmedName);
                }
              }}
            >
              {buttonLabel}
            </AuthButton>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── ShoppingListsScreen ──────────────────────────────────────────────────────

export function ShoppingListsScreen({
  navigation,
}: TrackStackScreenProps<'ShoppingLists'>) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isConnected = useNetworkStore((state) => state.isConnected);

  // ── State ────────────────────────────────────────────────────────────────

  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: shoppingListsData,
    isLoading,
    isError,
    refetch,
  } = useQuery<
    ShoppingListsResult,
    Error,
    ShoppingListsResult,
    typeof QUERY_KEYS.shoppingLists
  >({
    queryKey: QUERY_KEYS.shoppingLists,
    queryFn: getLists,
    staleTime: CACHE_CONFIG.SHOPPING_LISTS_TTL,
    retry: 1,
  });

  const {
    data: archivedData,
    isLoading: isLoadingArchived,
    isError: isErrorArchived,
  } = useQuery<
    ShoppingListSummary[],
    Error,
    ShoppingListSummary[],
    typeof QUERY_KEYS.shoppingListsArchived
  >({
    queryKey: QUERY_KEYS.shoppingListsArchived,
    queryFn: getArchivedLists,
    enabled: isArchivedExpanded,
    staleTime: 0,
    retry: 1,
  });

  const activeLists = shoppingListsData?.lists ?? [];
  const canCreateMore = shoppingListsData?.canCreateMore ?? true;
  const archivedLists = useMemo(() => archivedData ?? [], [archivedData]);

  const navigateToUpgrade = useCallback(() => {
    navigation
      .getParent()
      ?.getParent<NavigationProp<RootStackParamList>>()
      ?.navigate('Upgrade');
  }, [navigation]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const { mutate: mutateCreate, isPending: isCreating } = useMutation({
    mutationFn: (name: string) => createList(name),
    onSuccess: (newList) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingLists });
      setCreateSheetVisible(false);
      navigation.navigate('ShoppingListDetail', {
        listId: newList.id,
        listName: newList.name,
      });
    },
    onError: (error: unknown) => {
      if (error instanceof ShoppingListServiceError) {
        if (error.upgradeRequired) {
          setCreateSheetVisible(false);
          navigateToUpgrade();
          return;
        }
        showToast(t(error.translationKey));
        return;
      }
      showToast(t('common.states.error'));
    },
  });

  const { mutate: mutateUpdate, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateShoppingListInput }) =>
      updateList(id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingLists });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingListsArchived });
      setRenameTarget(null);
    },
    onError: (error: unknown) => {
      if (error instanceof ShoppingListServiceError && error.upgradeRequired) {
        navigateToUpgrade();
        return;
      }
      showToast(t('common.states.error'));
    },
  });

  const { mutate: mutateDelete } = useMutation({
    mutationFn: (listId: string) => deleteList(listId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingLists });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingListsArchived });
    },
    onError: () => {
      showToast(t('common.states.error'));
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePressAdd = useCallback(() => {
    if (!canCreateMore) {
      navigateToUpgrade();
      return;
    }
    setCreateSheetVisible(true);
  }, [canCreateMore, navigateToUpgrade]);

  const handlePressCard = useCallback(
    (list: ShoppingListSummary) => {
      navigation.navigate('ShoppingListDetail', {
        listId: list.id,
        listName: list.name,
      });
    },
    [navigation],
  );

  const handleDeleteConfirm = useCallback(
    (listId: string) => {
      Alert.alert(
        t('shoppingList.deleteList'),
        t('shoppingList.deleteListConfirm'),
        [
          { text: t('common.actions.cancel'), style: 'cancel' },
          {
            text: t('shoppingList.deleteList'),
            style: 'destructive',
            onPress: () => mutateDelete(listId),
          },
        ],
      );
    },
    [mutateDelete, t],
  );

  const handleArchive = useCallback(
    (listId: string) => {
      if (!isConnected) {
        showToast(t('common.actionRequiresConnection'));
        return;
      }
      mutateUpdate({ id: listId, updates: { isArchived: true } });
    },
    [isConnected, mutateUpdate, t],
  );

  const handleRestore = useCallback(
    (listId: string) => {
      if (!isConnected) {
        showToast(t('common.actionRequiresConnection'));
        return;
      }
      if (!canCreateMore) {
        showToast(t('shoppingList.freeTierLimit'));
        return;
      }
      mutateUpdate({ id: listId, updates: { isArchived: false } });
    },
    [canCreateMore, isConnected, mutateUpdate, t],
  );

  const handlePressOptions = useCallback(
    (list: ShoppingListSummary, isArchived: boolean) => {
      const activeOptions = [
        t('shoppingList.rename'),
        t('shoppingList.archive'),
        t('shoppingList.deleteList'),
        t('common.actions.cancel'),
      ];
      const archivedOptions = [
        t('shoppingList.restore'),
        t('shoppingList.deleteList'),
        t('common.actions.cancel'),
      ];

      if (Platform.OS === 'ios') {
        if (!isArchived) {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: activeOptions,
              cancelButtonIndex: 3,
              destructiveButtonIndex: 2,
            },
            (buttonIndex) => {
              if (buttonIndex === 0) setRenameTarget({ id: list.id, name: list.name });
              else if (buttonIndex === 1) handleArchive(list.id);
              else if (buttonIndex === 2) handleDeleteConfirm(list.id);
            },
          );
        } else {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: archivedOptions,
              cancelButtonIndex: 2,
              destructiveButtonIndex: 1,
            },
            (buttonIndex) => {
              if (buttonIndex === 0) handleRestore(list.id);
              else if (buttonIndex === 1) handleDeleteConfirm(list.id);
            },
          );
        }
      } else {
        if (!isArchived) {
          Alert.alert(list.name, undefined, [
            {
              text: activeOptions[0],
              onPress: () => setRenameTarget({ id: list.id, name: list.name }),
            },
            { text: activeOptions[1], onPress: () => handleArchive(list.id) },
            {
              text: activeOptions[2],
              style: 'destructive',
              onPress: () => handleDeleteConfirm(list.id),
            },
            { text: activeOptions[3], style: 'cancel' },
          ]);
        } else {
          Alert.alert(list.name, undefined, [
            { text: archivedOptions[0], onPress: () => handleRestore(list.id) },
            {
              text: archivedOptions[1],
              style: 'destructive',
              onPress: () => handleDeleteConfirm(list.id),
            },
            { text: archivedOptions[2], style: 'cancel' },
          ]);
        }
      }
    },
    [handleArchive, handleDeleteConfirm, handleRestore, t],
  );

  const handleCreateConfirm = useCallback(
    (name: string) => {
      if (!isConnected) {
        showToast(t('common.actionRequiresConnection'));
        return;
      }
      mutateCreate(name);
    },
    [isConnected, mutateCreate, t],
  );

  const handleRenameConfirm = useCallback(
    (name: string) => {
      if (!renameTarget) return;
      if (!isConnected) {
        showToast(t('common.actionRequiresConnection'));
        return;
      }
      mutateUpdate({ id: renameTarget.id, updates: { name } });
    },
    [isConnected, mutateUpdate, renameTarget, t],
  );

  const handleCloseNameSheet = useCallback(() => {
    setCreateSheetVisible(false);
    setRenameTarget(null);
  }, []);

  const handleToggleArchived = useCallback(() => {
    setIsArchivedExpanded((prev) => !prev);
  }, []);

  const handleArchivedOptions = useCallback(
    (list: ShoppingListSummary) => handlePressOptions(list, true),
    [handlePressOptions],
  );

  // ── Derived state ─────────────────────────────────────────────────────────

  const nameSheetVisible = createSheetVisible || renameTarget !== null;
  const nameSheetMode: NameSheetMode = renameTarget !== null ? 'rename' : 'create';
  const nameSheetInitialName = renameTarget?.name ?? '';
  const nameSheetLoading = nameSheetMode === 'create' ? isCreating : isUpdating;
  const nameSheetConfirm =
    nameSheetMode === 'create' ? handleCreateConfirm : handleRenameConfirm;

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: ShoppingListSummary }) => (
      <ShoppingListCard
        list={item}
        onPress={() => handlePressCard(item)}
        onPressOptions={() => handlePressOptions(item, false)}
      />
    ),
    [handlePressCard, handlePressOptions],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons color={EMPTY_ICON_COLOR} name="cart-outline" size={EMPTY_ICON_SIZE} />
        <Text style={styles.emptyTitle}>{t('shoppingList.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('shoppingList.emptySubtitle')}</Text>
        <AuthButton
          fullWidth={false}
          onPress={handlePressAdd}
          style={styles.emptyButton}
        >
          {t('shoppingList.createFirst')}
        </AuthButton>
      </View>
    ),
    [handlePressAdd, t],
  );

  const renderFooter = useCallback(
    () => (
      <ArchivedSection
        isError={isErrorArchived}
        isExpanded={isArchivedExpanded}
        isLoading={isLoadingArchived}
        lists={archivedLists}
        onPressCard={handlePressCard}
        onPressOptions={handleArchivedOptions}
        onToggle={handleToggleArchived}
      />
    ),
    [
      archivedLists,
      handleArchivedOptions,
      handlePressCard,
      handleToggleArchived,
      isArchivedExpanded,
      isErrorArchived,
      isLoadingArchived,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <AuroraBackground intensity="reduced" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable
          accessibilityLabel={t('common.actions.back')}
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <Ionicons color={colors.text.primary} name="chevron-back" size={24} />
        </Pressable>

        <Text style={styles.headerTitle}>{t('shoppingList.title')}</Text>

        <Pressable
          accessibilityLabel={t('shoppingList.createNewList')}
          accessibilityRole="button"
          onPress={handlePressAdd}
          style={[
            styles.headerButton,
            !canCreateMore && styles.headerAddButtonDisabled,
          ]}
        >
          <Ionicons
            color={canCreateMore ? colors.brand.pulse : colors.text.tertiary}
            name="add"
            size={26}
          />
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard} />
          ))}
        </View>
      ) : isError ? (
        <View style={styles.centeredContainer}>
          <Ionicons color="rgba(255,255,255,0.35)" name="wifi-outline" size={40} />
          <Text style={styles.errorText}>{t('common.states.error')}</Text>
          <AuthButton
            fullWidth={false}
            onPress={() => void refetch()}
            style={styles.retryButton}
          >
            {t('common.actions.retry')}
          </AuthButton>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            activeLists.length === 0 && styles.listContentEmpty,
          ]}
          data={activeLists}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom sheets */}
      <ListNameSheet
        initialName={nameSheetInitialName}
        isLoading={nameSheetLoading}
        mode={nameSheetMode}
        onClose={handleCloseNameSheet}
        onConfirm={nameSheetConfirm}
        visible={nameSheetVisible}
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
  headerAddButtonDisabled: {
    opacity: 0.45,
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: 12,
  },
  skeletonCard: {
    height: 96,
    borderRadius: 14,
    backgroundColor: SKELETON_BG,
  },

  // Error / centered
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

  // FlatList
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: 10,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['4xl'],
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
  emptyButton: {
    width: 200,
    height: 44,
  },

  // ShoppingListCard
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER_COLOR,
    borderRadius: 14,
    padding: spacing.xl,
    gap: 6,
  },
  cardDimmed: {
    opacity: ARCHIVED_OPACITY,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
  cardOptionsButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDate: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: UPDATED_AT_OPACITY,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  cardBadge: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },

  // Archived section
  archivedSection: {
    marginTop: spacing['3xl'],
  },
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderTopWidth: 1,
    borderColor: ARCHIVED_TOGGLE_BORDER,
  },
  archivedToggleLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  archivedStatusText: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  archivedList: {
    gap: 10,
    marginTop: spacing.md,
  },

  // Bottom sheets — shared
  sheetModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetKeyboardContainer: {
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheetContainer: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER_COLOR,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing['3xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing['5xl'],
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: HANDLE_COLOR,
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  sheetInputWrapper: {
    marginBottom: spacing['2xl'],
  },

});