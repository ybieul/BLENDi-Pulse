import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FavoriteItem } from '@blendi/shared';
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { QUERY_KEYS } from '../../config/cache.config';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { showToast } from '../../utils/toast.utils';
import { appendIngredientsToShoppingList } from '../../utils/shoppingListAddItems.utils';
import { AuthButton } from '../ui/AuthButton';

const SHEET_RADIUS = 24;
const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const SHEET_BORDER = 'rgba(255,255,255,0.10)';
const ROW_BACKGROUND = 'rgba(255,255,255,0.06)';
const ROW_BORDER = 'rgba(255,255,255,0.08)';
const CHECKBOX_BORDER = 'rgba(255,255,255,0.25)';
const RECIPE_ROW_CHEVRON = 'rgba(255,255,255,0.45)';
const EMPTY_ICON_COLOR = 'rgba(154,72,147,0.35)';
const SUBTITLE_OPACITY = 0.6;
const QUANTITY_OPACITY = 0.55;

type ImportStep = 'selectRecipe' | 'selectIngredients';

export interface ImportFromFavoritesSheetProps {
  visible: boolean;
  listId: string;
  onClose: () => void;
}

function getIngredientKey(index: number): number {
  return index;
}

export function ImportFromFavoritesSheet({
  visible,
  listId,
  onClose,
}: ImportFromFavoritesSheetProps) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [step, setStep] = useState<ImportStep>('selectRecipe');
  const [selectedRecipe, setSelectedRecipe] = useState<FavoriteItem | null>(null);
  const [selectedIngredientIndexes, setSelectedIngredientIndexes] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const favoriteRecipes = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEYS.favorites) ?? [];

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (visible) {
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
        setStep('selectRecipe');
        setSelectedRecipe(null);
        setSelectedIngredientIndexes(new Set());
        setIsSubmitting(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, translateY, visible]);

  const selectedIngredientsCount = selectedIngredientIndexes.size;

  const selectedRecipeIngredients = useMemo(
    () => selectedRecipe?.ingredients ?? [],
    [selectedRecipe],
  );

  if (!isMounted) {
    return null;
  }

  const handleSelectRecipe = (recipe: FavoriteItem) => {
    setSelectedRecipe(recipe);
    setStep('selectIngredients');
    setSelectedIngredientIndexes(
      new Set(recipe.ingredients.map((_, index) => getIngredientKey(index))),
    );
  };

  const handleGoBack = () => {
    setStep('selectRecipe');
    setSelectedRecipe(null);
    setSelectedIngredientIndexes(new Set());
  };

  const handleToggleIngredient = (index: number) => {
    setSelectedIngredientIndexes((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedRecipe || selectedIngredientIndexes.size === 0 || isSubmitting) {
      return;
    }

    const ingredients = selectedRecipe.ingredients
      .filter((_, index) => selectedIngredientIndexes.has(index))
      .map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.amount,
      }));

    setIsSubmitting(true);

    try {
      await appendIngredientsToShoppingList(queryClient, listId, ingredients);
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error && 'message' in error
          ? t('common.actionRequiresConnection')
          : t('common.states.error'),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={isMounted}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + spacing['3xl'],
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />

          {step === 'selectRecipe' ? (
            <View style={styles.headerBlock}>
              <Text style={styles.sheetTitle}>{t('shoppingList.importFromFavorites')}</Text>
              <Text style={styles.sheetSubtitle}>{t('shoppingList.selectRecipe')}</Text>
            </View>
          ) : (
            <View style={styles.recipeHeaderRow}>
              <Pressable
                accessibilityLabel={t('common.actions.back')}
                accessibilityRole="button"
                onPress={handleGoBack}
                style={styles.headerButton}
              >
                <Ionicons color={colors.text.primary} name="chevron-back" size={22} />
              </Pressable>

              <Text numberOfLines={1} style={styles.recipeHeaderTitle}>
                {selectedRecipe?.recipeName}
              </Text>

              <View style={styles.headerSpacer} />
            </View>
          )}

          {step === 'selectRecipe' ? (
            favoriteRecipes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons color={EMPTY_ICON_COLOR} name="heart-outline" size={56} />
                <Text style={styles.emptyTitle}>{t('shoppingList.noFavoriteRecipes')}</Text>
                <Text style={styles.emptySubtitle}>{t('favorites.emptySubtitle')}</Text>
              </View>
            ) : (
              <FlatList
                data={favoriteRecipes}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleSelectRecipe(item)}
                    style={styles.recipeRow}
                  >
                    <Text numberOfLines={1} style={styles.recipeRowLabel}>
                      {item.recipeName}
                    </Text>
                    <Ionicons color={RECIPE_ROW_CHEVRON} name="chevron-forward" size={18} />
                  </Pressable>
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )
          ) : (
            <>
              <FlatList
                data={selectedRecipeIngredients}
                keyExtractor={(item, index) => `${item.name}-${item.amount}-${index}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => {
                  const isChecked = selectedIngredientIndexes.has(index);

                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isChecked }}
                      onPress={() => handleToggleIngredient(index)}
                      style={styles.ingredientRow}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isChecked && styles.checkboxChecked,
                        ]}
                      >
                        {isChecked ? (
                          <Ionicons color={colors.text.primary} name="checkmark" size={14} />
                        ) : null}
                      </View>

                      <View style={styles.ingredientTextBlock}>
                        <Text numberOfLines={1} style={styles.ingredientName}>
                          {item.name}
                        </Text>
                      </View>

                      <Text numberOfLines={1} style={styles.ingredientQuantity}>
                        {item.amount}
                      </Text>
                    </Pressable>
                  );
                }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />

              <AuthButton
                disabled={selectedIngredientsCount === 0 || isSubmitting}
                loading={isSubmitting}
                onPress={() => {
                  void handleImport();
                }}
                style={styles.footerButton}
              >
                {t('shoppingList.addSelectedIngredients')}
              </AuthButton>
            </>
          )}
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
    maxHeight: '82%',
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER,
    backgroundColor: colors.background.secondary,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
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
  recipeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  recipeHeaderTitle: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  recipeRow: {
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
  recipeRowLabel: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  ingredientRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: ROW_BORDER,
    backgroundColor: ROW_BACKGROUND,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CHECKBOX_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  checkboxChecked: {
    borderColor: colors.brand.pulse,
    backgroundColor: colors.brand.pulse,
  },
  ingredientTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  ingredientName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  ingredientQuantity: {
    marginLeft: spacing.lg,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: QUANTITY_OPACITY,
    textAlign: 'right',
    maxWidth: 120,
  },
  footerButton: {
    marginTop: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
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
    textAlign: 'center',
    lineHeight: 20,
  },
});