import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeeklyReportHighlightRecipe } from '@blendi/shared';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';

const PROTEIN_PILL_BACKGROUND = colors.overlay.pulse[25];
const CARBS_PILL_BACKGROUND = colors.overlay.warning[25];
const FAT_PILL_BACKGROUND = colors.overlay.neutralGray[25];
const CALORIES_PILL_BACKGROUND = colors.overlay.success[25];
const STAR_COLOR = colors.overlay.warning[90];
const MAX_RATING = 5;

interface MacroPillProps {
  value: number;
  unit: string;
  backgroundColor: string;
}

function MacroPill({ value, unit, backgroundColor }: MacroPillProps) {
  const colors = useColors();
  const { formatDecimal } = useFormatNumbers();

  const pillStyles = StyleSheet.create({
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
  });

  return (
    <View style={[pillStyles.macroPill, { backgroundColor }]}>
      <Text style={pillStyles.macroPillText}>{`${formatDecimal(value)} ${unit}`}</Text>
    </View>
  );
}

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

  const { t } = useAppTranslation();

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
        <MacroPill value={recipe.protein} unit={t('common.units.grams')} backgroundColor={PROTEIN_PILL_BACKGROUND} />
        <MacroPill value={recipe.carbs} unit={t('common.units.grams')} backgroundColor={CARBS_PILL_BACKGROUND} />
        <MacroPill value={recipe.fat} unit={t('common.units.grams')} backgroundColor={FAT_PILL_BACKGROUND} />
        <MacroPill value={recipe.calories} unit={t('common.units.kilocalories')} backgroundColor={CALORIES_PILL_BACKGROUND} />
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
