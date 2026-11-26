import { useEffect, useRef } from 'react';
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
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useBlendStore } from '../../store/blend.store';
import { MacroChips } from '../ui/MacroChips';

const INGREDIENT_AMOUNT_OPACITY = 0.7;
const INSTRUCTION_OPACITY = 0.8;

interface ActiveRecipeHeaderProps {
  recipe: PulseAiRecipe;
}

export function ActiveRecipeHeader({ recipe }: ActiveRecipeHeaderProps) {
  const colors = useColors();
  const HEADER_BACKGROUND = colors.overlay.plum[7];
  const HEADER_BORDER = colors.overlay.plum[10];
  const INGREDIENT_CARD_BACKGROUND = colors.overlay.plum[8];
  const INGREDIENT_CARD_BORDER = colors.overlay.plum[12];
  const HEADER_CLOSE_BACKGROUND = colors.overlay.plum[8];
  const HEADER_CLOSE_BORDER = colors.overlay.plum[12];

  const { t } = useAppTranslation();
  const resetToFree = useBlendStore((state) => state.resetToFree);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;


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
      marginTop: spacing.md,
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
            <MacroChips
              protein={recipe.macros.protein}
              carbs={recipe.macros.carbs}
              fat={recipe.macros.fat}
              calories={recipe.macros.calories}
              alcoholGrams={recipe.alcoholGrams}
            />
          </View>
        </View>

        <Pressable
          accessibilityLabel={t('common.actions.close')}
          accessibilityRole="button"
          onPress={resetToFree}
          style={styles.closeButton}
        >
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
