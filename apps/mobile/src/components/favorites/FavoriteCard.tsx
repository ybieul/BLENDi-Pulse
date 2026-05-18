import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FavoriteItem } from '@blendi/shared';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
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

export function FavoriteCard({ item, onStartBlend, onRemove }: FavoriteCardProps) {
  const { t } = useAppTranslation();
  const visibleIngredients = item.ingredients.slice(0, 3).map((ingredient) => ingredient.name);
  const remainingIngredientsCount = Math.max(item.ingredients.length - visibleIngredients.length, 0);
  const ingredientsPreview = visibleIngredients.join(' · ');
  const moreIngredientsSuffix = remainingIngredientsCount > 0
    ? ` · ${t('favorites.moreIngredients', { count: remainingIngredientsCount })}`
    : '';

  return (
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

        <Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="heart" size={20} color={REMOVE_ICON_COLOR} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flex: 0.65,
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
    flex: 0.35,
    height: 40,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: REMOVE_BUTTON_BORDER,
    backgroundColor: REMOVE_BUTTON_BACKGROUND,
  },
});