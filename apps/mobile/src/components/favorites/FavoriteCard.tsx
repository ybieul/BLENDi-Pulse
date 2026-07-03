import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FavoriteItem, PulseAiRecipe } from '@blendi/shared';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useAuthStore } from '../../store/auth.store';
import { generateAndShare } from '../../utils/shareCard.utils';
import {
  RecipeShareCard,
  type RecipeShareCardHandle,
  type ShareCardFormat,
} from '../shareCards/RecipeShareCard';
import { ShareFormatSheet } from '../shareCards/ShareFormatSheet';
import { AddToListSheet } from '../shoppingList/AddToListSheet';
import { AuthButton } from '../ui/AuthButton';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const PROTEIN_PILL_BACKGROUND = 'rgba(154,72,147,0.25)';
const CARBS_PILL_BACKGROUND = 'rgba(245,158,11,0.25)';
const FAT_PILL_BACKGROUND = 'rgba(107,114,128,0.25)';
const CALORIES_PILL_BACKGROUND = 'rgba(34,197,94,0.25)';
const INGREDIENTS_OPACITY = 0.65;
const REMOVE_BUTTON_BACKGROUND = 'rgba(239,68,68,0.12)';
const REMOVE_BUTTON_BORDER = 'rgba(239,68,68,0.25)';
const REMOVE_ICON_COLOR = 'rgb(239,68,68)';
const CART_BUTTON_BACKGROUND = 'rgba(154,72,147,0.10)';
const CART_BUTTON_BORDER = 'rgba(154,72,147,0.20)';
const SHARE_BUTTON_BACKGROUND = 'rgba(255,255,255,0.05)';
const SHARE_BUTTON_BORDER = 'rgba(255,255,255,0.15)';

interface MacroPillProps {
  value: number;
  unit: string;
  backgroundColor: string;
}

export interface FavoriteCardProps {
  item: FavoriteItem;
  onStartBlend: () => void;
  onRemove: () => void;
}

function formatMacroValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function MacroPill({ value, unit, backgroundColor }: MacroPillProps) {
  return (
    <View style={[styles.macroPill, { backgroundColor }]}>
      <Text style={styles.macroPillText}>{`${formatMacroValue(value)} ${unit}`}</Text>
    </View>
  );
}

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

export function FavoriteCard({ item, onStartBlend, onRemove }: FavoriteCardProps) {
  const { t } = useAppTranslation();
  const authUser = useAuthStore((state) => state.user);
  const shareCardRef = useRef<RecipeShareCardHandle | null>(null);
  const [isAddToListVisible, setIsAddToListVisible] = useState(false);
  const [isShareFormatVisible, setIsShareFormatVisible] = useState(false);
  const [pendingShareFormat, setPendingShareFormat] = useState<ShareCardFormat | null>(null);
  const visibleIngredients = item.ingredients.slice(0, 3).map((ingredient) => ingredient.name);
  const remainingIngredientsCount = Math.max(item.ingredients.length - visibleIngredients.length, 0);
  const ingredientsPreview = visibleIngredients.join(' · ');
  const moreIngredientsSuffix = remainingIngredientsCount > 0
    ? ` · ${t('favorites.moreIngredients', { count: remainingIngredientsCount })}`
    : '';
  const shoppingListIngredients = useMemo(
    () => item.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.amount,
    })),
    [item.ingredients],
  );
  const shareRecipe = useMemo(() => favoriteItemToRecipe(item), [item]);

  useEffect(() => {
    if (!pendingShareFormat) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        await generateAndShare(shareCardRef);
        setPendingShareFormat(null);
      })();
    }, 240);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingShareFormat]);

  return (
    <View style={styles.cardContainer}>
      <View style={styles.card}>
        <View style={styles.sectionStack}>
          <Text style={styles.title}>{item.recipeName}</Text>

          <View style={styles.macroRow}>
            <MacroPill value={item.protein} unit={t('common.units.grams')} backgroundColor={PROTEIN_PILL_BACKGROUND} />
            <MacroPill value={item.carbs} unit={t('common.units.grams')} backgroundColor={CARBS_PILL_BACKGROUND} />
            <MacroPill value={item.fat} unit={t('common.units.grams')} backgroundColor={FAT_PILL_BACKGROUND} />
            <MacroPill value={item.calories} unit={t('common.units.kilocalories')} backgroundColor={CALORIES_PILL_BACKGROUND} />
          </View>
        </View>

        <View style={styles.sectionStack}>
          <Text numberOfLines={2} style={styles.ingredientsPreview}>
            {`${ingredientsPreview}${moreIngredientsSuffix}`}
          </Text>
        </View>

        <View style={styles.footerRow}>
          <AuthButton fullWidth={false} onPress={onStartBlend} style={styles.startBlendButton}>
            <Text style={styles.startBlendLabel}>{t('home.startBlend')}</Text>
          </AuthButton>

          <Pressable
            accessibilityLabel={t('shoppingList.addToShoppingList')}
            accessibilityRole="button"
            onPress={() => setIsAddToListVisible(true)}
            style={styles.cartButton}
          >
            <Ionicons name="cart-outline" size={18} color={colors.brand.pulse} />
          </Pressable>

          <TouchableOpacity
            accessibilityLabel={t('share.shareRecipe')}
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={() => setIsShareFormatVisible(true)}
            style={styles.shareButton}
          >
            <Ionicons color={colors.text.primary} name="share-outline" size={20} />
          </TouchableOpacity>

          <Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeButton}>
            <Ionicons name="heart" size={20} color={REMOVE_ICON_COLOR} />
          </Pressable>
        </View>

      </View>

      <AddToListSheet
        ingredients={shoppingListIngredients}
        onClose={() => setIsAddToListVisible(false)}
        visible={isAddToListVisible}
      />

      <ShareFormatSheet
        onClose={() => setIsShareFormatVisible(false)}
        onSelect={setPendingShareFormat}
        visible={isShareFormatVisible}
      />

      {pendingShareFormat ? (
        <RecipeShareCard
          ref={shareCardRef}
          format={pendingShareFormat}
          recipe={shareRecipe}
          user={{
            userId: authUser?.id,
            name: authUser?.name ?? '',
            hasProfilePhoto: authUser?.hasProfilePhoto ?? false,
            profilePhotoUpdatedAt: authUser?.profilePhotoUpdatedAt ?? null,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'relative',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: 16,
    gap: spacing.md,
  },
  sectionStack: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  macroPill: {
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  macroPillText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.medium,
    lineHeight: 14,
  },
  ingredientsPreview: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    opacity: INGREDIENTS_OPACITY,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startBlendButton: {
    flex: 1,
    height: 40,
    minWidth: 0,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  startBlendLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  removeButton: {
    width: 40,
    height: 40,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: REMOVE_BUTTON_BORDER,
    backgroundColor: REMOVE_BUTTON_BACKGROUND,
  },
  cartButton: {
    width: 40,
    height: 40,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CART_BUTTON_BORDER,
    backgroundColor: CART_BUTTON_BACKGROUND,
  },
  shareButton: {
    width: 40,
    height: 40,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHARE_BUTTON_BORDER,
    backgroundColor: SHARE_BUTTON_BACKGROUND,
  },
});