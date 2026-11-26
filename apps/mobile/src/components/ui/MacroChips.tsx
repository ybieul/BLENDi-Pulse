// apps/mobile/src/components/ui/MacroChips.tsx
// Números de macros COM o nome visível (teste no build EAS 25-26/11: os
// chips mostravam só ícone + número — "51 g, 38 g, 4 g, 388 kcal" — e não
// dava para saber qual era proteína, carboidrato ou gordura).
//
// Componente único usado em todos os cards que mostram macros: RecipeCard
// (Pulse AI e Pantry), prévia bloqueada, card da Home, favoritos, relatório
// semanal, cabeçalho da receita no Blend/Modo Passo a Passo e histórico.
//
//   • Cada chip: o número em cima ("51 g" / "388") e o nome embaixo
//     ("Proteína" / "kcal"). Álcool (CP-B5) só quando > 0, também rotulado.
//   • Leitor de tela: o chip é um elemento só, com a frase completa
//     ("51 gramas de proteína") — os textos visíveis não são lidos soltos.
//   • Tela pequena (iPhone SE, 320 pt): os chips têm largura mínima e
//     quebram de linha em vez de cortar o texto ou rolar na horizontal; o
//     nome reduz um pouco a fonte (até 85%) antes de quebrar.

import { StyleSheet, Text, View } from 'react-native';

import { colors as staticColors, fonts, fontWeights, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import type { TranslationKey } from '../../locales/i18n';

export type MacroChipTone = 'protein' | 'carbs' | 'fat' | 'calories' | 'alcohol';

export interface MacroChipsProps {
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
  /** Gramas de álcool (CP-B5) — o chip só aparece quando > 0. */
  alcoholGrams?: number;
  /**
   * 'chip' (padrão): fundo colorido por macro, para cards.
   * 'compact': sem fundo, número na cor do macro — linhas densas (histórico).
   */
  variant?: 'chip' | 'compact';
  /** Arredonda para inteiro (histórico) em vez de uma casa decimal. */
  integer?: boolean;
  testID?: string;
}

// Mesmas cores de fundo que os chips já usavam (fixas, iguais nos dois temas).
const CHIP_BACKGROUND: Record<MacroChipTone, string> = {
  protein: staticColors.overlay.pulse[25],
  carbs: staticColors.overlay.warning[25],
  fat: staticColors.overlay.neutralGray[25],
  calories: staticColors.overlay.success[25],
  alcohol: staticColors.overlay.neutralGray[25],
};

const LABEL_KEYS: Record<MacroChipTone, TranslationKey> = {
  protein: 'common.macroChips.protein',
  carbs: 'common.macroChips.carbs',
  fat: 'common.macroChips.fat',
  calories: 'common.macroChips.calories',
  alcohol: 'common.macroChips.alcohol',
};

const A11Y_KEYS: Record<MacroChipTone, TranslationKey> = {
  protein: 'common.macroChips.a11y.protein',
  carbs: 'common.macroChips.a11y.carbs',
  fat: 'common.macroChips.a11y.fat',
  calories: 'common.macroChips.a11y.calories',
  alcohol: 'common.macroChips.a11y.alcohol',
};

/** Largura mínima de um chip: cabe "Proteína" e 4 chips numa linha no iPhone SE. */
export const MACRO_CHIP_MIN_WIDTH = 56;
const LABEL_MIN_FONT_SCALE = 0.85;

interface ChipItem {
  tone: MacroChipTone;
  value: number;
}

function buildItems({ protein, carbs, fat, calories, alcoholGrams }: MacroChipsProps): ChipItem[] {
  const items: ChipItem[] = [];
  const push = (tone: MacroChipTone, value: number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      items.push({ tone, value });
    }
  };

  push('protein', protein);
  push('carbs', carbs);
  push('fat', fat);
  push('calories', calories);
  if (typeof alcoholGrams === 'number' && alcoholGrams > 0) {
    push('alcohol', alcoholGrams);
  }

  return items;
}

export function MacroChips(props: MacroChipsProps) {
  const { variant = 'chip', integer = false, testID } = props;
  const colors = useColors();
  const { t } = useAppTranslation();
  const { formatDecimal, formatCount } = useFormatNumbers();
  const items = buildItems(props);

  const isCompact = variant === 'compact';

  // Variante compacta: o número na cor do macro (as mesmas do histórico).
  // Marca e aviso são cores fixas; o cinza do resto acompanha o tema.
  const getCompactValueColor = (tone: MacroChipTone): string => {
    if (tone === 'protein') return staticColors.brand.pulse;
    if (tone === 'carbs') return staticColors.feedback.warning;
    return colors.overlay.plum[70];
  };

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: isCompact ? spacing.sm : 6,
      justifyContent: isCompact ? 'flex-end' : 'flex-start',
    },
    chip: {
      minWidth: MACRO_CHIP_MIN_WIDTH,
      flexGrow: isCompact ? 0 : 1,
      flexBasis: isCompact ? 'auto' : MACRO_CHIP_MIN_WIDTH,
      alignItems: 'center',
      borderRadius: 12,
      paddingHorizontal: isCompact ? 0 : spacing.sm,
      paddingVertical: isCompact ? 0 : 6,
    },
    compactChip: {
      minWidth: 0,
    },
    value: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: fontWeights.medium,
      lineHeight: 16,
    },
    label: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: 10,
      fontWeight: fontWeights.regular,
      lineHeight: 13,
    },
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.row} testID={testID}>
      {items.map(({ tone, value }) => {
        const formatted = integer ? formatCount(Math.round(value)) : formatDecimal(value);
        const valueText = tone === 'calories' ? formatted : `${formatted} ${t('common.units.grams')}`;

        return (
          <View
            key={tone}
            accessible
            accessibilityLabel={t(A11Y_KEYS[tone], { value: formatted })}
            style={[
              styles.chip,
              isCompact ? styles.compactChip : { backgroundColor: CHIP_BACKGROUND[tone] },
            ]}
            testID={`macro-pill-${tone}`}
          >
            <Text
              numberOfLines={1}
              style={[styles.value, isCompact && { color: getCompactValueColor(tone) }]}
            >
              {valueText}
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={LABEL_MIN_FONT_SCALE}
              numberOfLines={1}
              style={styles.label}
            >
              {t(LABEL_KEYS[tone])}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
