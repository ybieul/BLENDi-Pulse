import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeeklyReportHighlightRecipe } from '@blendi/shared';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useColors } from '../../hooks/useColors';
import { MacroChips } from '../ui/MacroChips';

const STAR_COLOR = colors.overlay.warning[90];
const MAX_RATING = 5;

export interface HighlightRecipeCardProps {
  recipe: WeeklyReportHighlightRecipe;
}

// Card puramente informativo — o BlendLog de origem não guarda ingredientes,
// instruções nem referência ao favorito original, então não há como oferecer
// "fazer esse blend" ou "salvar nos favoritos" (ambos exigem um PulseAiRecipe
// completo). Decisão confirmada com o usuário durante a Tarefa 8 do CP3.4.
export function HighlightRecipeCard({ recipe }: HighlightRecipeCardProps) {
  const colors = useColors();
  const STAR_EMPTY_COLOR = colors.overlay.plum[20];

  const styles = StyleSheet.create({
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
      marginTop: 10,
    },
    ratingRow: {
      flexDirection: 'row',
      gap: 3,
      marginTop: 10,
    },
  });

  return (
    <View>
      <Text style={styles.title}>{recipe.name}</Text>

      <View style={styles.macroRow}>
        <MacroChips protein={recipe.protein} carbs={recipe.carbs} fat={recipe.fat} calories={recipe.calories} />
      </View>

      {recipe.rating ? (
        <View style={styles.ratingRow}>
          {Array.from({ length: MAX_RATING }, (_, index) => (
            <Ionicons
              key={index}
              name={index < recipe.rating! ? 'star' : 'star-outline'}
              size={14}
              color={index < recipe.rating! ? STAR_COLOR : STAR_EMPTY_COLOR}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
