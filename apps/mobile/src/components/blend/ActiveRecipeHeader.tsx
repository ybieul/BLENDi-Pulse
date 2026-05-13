import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PulseAiRecipe } from '@blendi/shared';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useBlendStore } from '../../store/blend.store';

const HEADER_BACKGROUND = 'rgba(255,255,255,0.07)';
const HEADER_BORDER = 'rgba(255,255,255,0.10)';
const INGREDIENT_CARD_BACKGROUND = 'rgba(255,255,255,0.08)';
const INGREDIENT_CARD_BORDER = 'rgba(255,255,255,0.12)';
const PROTEIN_PILL_BACKGROUND = 'rgba(154,72,147,0.25)';
const CARBS_PILL_BACKGROUND = 'rgba(245,158,11,0.25)';
const FAT_PILL_BACKGROUND = 'rgba(107,114,128,0.25)';
const CALORIES_PILL_BACKGROUND = 'rgba(34,197,94,0.25)';
const HEADER_CLOSE_BACKGROUND = 'rgba(255,255,255,0.08)';
const HEADER_CLOSE_BORDER = 'rgba(255,255,255,0.12)';
const INGREDIENT_AMOUNT_OPACITY = 0.7;
const INSTRUCTION_OPACITY = 0.8;

type MacroTone = 'protein' | 'carbs' | 'fat' | 'calories';

interface ActiveRecipeHeaderProps {
  recipe: PulseAiRecipe;
}

interface MacroPillData {
  tone: MacroTone;
  icon: ComponentProps<typeof Ionicons>['name'];
  value: number;
  unit: string;
}

function formatMacroValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1);
}

function MacroPill({ icon, value, unit, tone }: MacroPillData) {
  const backgroundColor =
    tone === 'protein'
      ? PROTEIN_PILL_BACKGROUND
      : tone === 'carbs'
        ? CARBS_PILL_BACKGROUND
        : tone === 'fat'
          ? FAT_PILL_BACKGROUND
          : CALORIES_PILL_BACKGROUND;

  return (
    <View style={[styles.macroPill, { backgroundColor }]}> 
      <Ionicons color={colors.text.primary} name={icon} size={10} />
      <Text style={styles.macroValue}>{formatMacroValue(value)}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

export function ActiveRecipeHeader({ recipe }: ActiveRecipeHeaderProps) {
  const { t } = useAppTranslation();
  const resetToFree = useBlendStore((state) => state.resetToFree);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  const macroPills = useMemo<MacroPillData[]>(() => [
    {
      tone: 'protein',
      icon: 'barbell-outline',
      value: recipe.macros.protein,
      unit: t('common.units.grams'),
    },
    {
      tone: 'carbs',
      icon: 'leaf-outline',
      value: recipe.macros.carbs,
      unit: t('common.units.grams'),
    },
    {
      tone: 'fat',
      icon: 'water-outline',
      value: recipe.macros.fat,
      unit: t('common.units.grams'),
    },
    {
      tone: 'calories',
      icon: 'flame-outline',
      value: recipe.macros.calories,
      unit: t('common.units.kilocalories'),
    },
  ], [recipe.macros, t]);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          <View style={styles.macroRow}>
            {macroPills.map((macro) => (
              <MacroPill key={macro.tone} {...macro} />
            ))}
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={resetToFree} style={styles.closeButton}>
          <Ionicons color={colors.text.primary} name="close" size={18} />
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.ingredientsContent}
        data={recipe.ingredients}
        horizontal
        keyExtractor={(item, index) => `${item.name}-${index}`}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.ingredientCard,
              index === recipe.ingredients.length - 1 && styles.lastIngredientCard,
            ]}
          >
            <Text numberOfLines={2} style={styles.ingredientName}>{item.name}</Text>
            <Text numberOfLines={1} style={styles.ingredientAmount}>{item.amount}</Text>
          </View>
        )}
        showsHorizontalScrollIndicator={false}
      />

      <Text style={styles.blendInstruction}>{recipe.blendInstruction}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HEADER_BORDER,
    backgroundColor: HEADER_BACKGROUND,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headerContent: {
    flex: 1,
  },
  recipeTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  macroValue: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  macroUnit: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
    opacity: 0.7,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: HEADER_CLOSE_BORDER,
    backgroundColor: HEADER_CLOSE_BACKGROUND,
  },
  ingredientsContent: {
    gap: spacing.md,
    paddingLeft: 16,
    paddingTop: spacing.lg,
  },
  ingredientCard: {
    width: 80,
    minHeight: 80,
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: INGREDIENT_CARD_BORDER,
    backgroundColor: INGREDIENT_CARD_BACKGROUND,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  lastIngredientCard: {
    marginRight: 16,
  },
  ingredientName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
    lineHeight: 16,
  },
  ingredientAmount: {
    marginTop: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    opacity: INGREDIENT_AMOUNT_OPACITY,
  },
  blendInstruction: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    fontStyle: 'italic',
    lineHeight: 19,
    opacity: INSTRUCTION_OPACITY,
  },
});