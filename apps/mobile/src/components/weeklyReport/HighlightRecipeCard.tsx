import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WeeklyReportHighlightRecipe } from '@blendi/shared';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const PROTEIN_PILL_BACKGROUND = 'rgba(154,72,147,0.25)';
const CARBS_PILL_BACKGROUND = 'rgba(245,158,11,0.25)';
const FAT_PILL_BACKGROUND = 'rgba(107,114,128,0.25)';
const CALORIES_PILL_BACKGROUND = 'rgba(34,197,94,0.25)';
const STAR_COLOR = 'rgba(245,158,11,0.90)';
const STAR_EMPTY_COLOR = 'rgba(255,255,255,0.20)';
const MAX_RATING = 5;

interface MacroPillProps {
  value: number;
  unit: string;
  backgroundColor: string;
}

function formatMacroValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MacroPill({ value, unit, backgroundColor }: MacroPillProps) {
  return (
    <View style={[styles.macroPill, { backgroundColor }]}>
      <Text style={styles.macroPillText}>{`${formatMacroValue(value)} ${unit}`}</Text>
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
  const { t } = useAppTranslation();

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
  ratingRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 10,
  },
});
