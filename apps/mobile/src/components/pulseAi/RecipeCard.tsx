import { useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
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
import { AuthButton } from '../ui/AuthButton';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const BADGE_BACKGROUND = 'rgba(154,72,147,0.20)';
const BADGE_BORDER = 'rgba(154,72,147,0.35)';
const PROTEIN_PILL_BACKGROUND = 'rgba(154,72,147,0.25)';
const CARBS_PILL_BACKGROUND = 'rgba(245,158,11,0.25)';
const FAT_PILL_BACKGROUND = 'rgba(107,114,128,0.25)';
const CALORIES_PILL_BACKGROUND = 'rgba(34,197,94,0.25)';
const SEPARATOR_COLOR = 'rgba(255,255,255,0.08)';
const SECTION_LABEL_COLOR = 'rgba(255,255,255,0.70)';
const BLEND_TEXT_COLOR = 'rgba(255,255,255,0.80)';
const SUBSTITUTES_BACKGROUND = 'rgba(245,158,11,0.08)';
const SUBSTITUTES_BORDER = 'rgba(245,158,11,0.15)';
const TIP_BACKGROUND = 'rgba(59,130,246,0.08)';
const TIP_BORDER = 'rgba(59,130,246,0.15)';
const GHOST_BUTTON_BORDER = 'rgba(255,255,255,0.15)';
const UNIT_OPACITY = 0.7;
const HEART_SCALE_DEFAULT = 1;
const HEART_SCALE_ACTIVE = 1.3;

type MacroTone = 'protein' | 'carbs' | 'fat' | 'calories';

interface MacroPillData {
  tone: MacroTone;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number;
  unit: string;
}

export interface RecipeCardProps {
  recipe: PulseAiRecipe;
  isFavorited: boolean;
  onFavorite: () => void;
  onStartBlend: () => void;
  isFromCache?: boolean;
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
      <Ionicons name={icon} size={10} color={colors.text.primary} />
      <Text style={styles.macroValue}>{formatMacroValue(value)}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

export function RecipeCard({
  recipe,
  isFavorited,
  onFavorite,
  onStartBlend,
  isFromCache = false,
}: RecipeCardProps) {
  const { t } = useAppTranslation();
  const favoriteScale = useRef(new Animated.Value(HEART_SCALE_DEFAULT)).current;

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

  const substitutesText = recipe.tip?.trim();

  const handleFavoritePress = () => {
    Animated.sequence([
      Animated.spring(favoriteScale, {
        toValue: HEART_SCALE_ACTIVE,
        stiffness: 360,
        damping: 18,
        mass: 0.35,
        useNativeDriver: true,
      }),
      Animated.spring(favoriteScale, {
        toValue: HEART_SCALE_DEFAULT,
        stiffness: 320,
        damping: 20,
        mass: 0.4,
        useNativeDriver: true,
      }),
    ]).start();

    onFavorite();
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <View style={styles.badgePill}>
            <Text style={styles.badgeLabel}>{t('navigation.pulseAI')}</Text>
            {isFromCache ? (
              <View style={styles.cacheBadge}>
                <Ionicons name="flash" size={11} color={colors.brand.pulse} />
                <Text style={styles.cacheLabel}>{t('pulseAi.fromCache')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.save')}
          onPress={handleFavoritePress}
          hitSlop={8}
          style={styles.favoriteButton}
        >
          <Animated.View style={{ transform: [{ scale: favoriteScale }] }}>
            <Ionicons
              name={isFavorited ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorited ? colors.feedback.error : colors.text.secondary}
            />
          </Animated.View>
        </Pressable>
      </View>

      <Text style={styles.title}>{recipe.title}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.macroScrollContent}
      >
        {macroPills.map((macro) => (
          <MacroPill key={macro.tone} {...macro} />
        ))}
      </ScrollView>

      <View style={styles.separator} />

      <Text style={styles.sectionTitle}>{t('pulseAi.ingredients')}</Text>

      <View style={styles.ingredientsList}>
        {recipe.ingredients.map((ingredient) => (
          <View key={`${ingredient.name}-${ingredient.amount}`} style={styles.ingredientRow}>
            <View style={styles.ingredientDot} />
            <Text style={styles.ingredientText}>{`${ingredient.amount} ${ingredient.name}`}</Text>
          </View>
        ))}
      </View>

      <View style={styles.separator} />

      <Text style={styles.sectionTitle}>{t('pulseAi.howToBlend')}</Text>
      <Text style={styles.blendInstruction}>{recipe.blendInstruction}</Text>

      {recipe.hasSubstitutes && substitutesText ? (
        <View style={styles.substitutesBox}>
          <Text style={styles.calloutTitle}>{t('pulseAi.smartSubstitutes')}</Text>
          <Text style={styles.calloutBody}>{substitutesText}</Text>
        </View>
      ) : null}

      {!recipe.hasSubstitutes && substitutesText ? (
        <View style={styles.tipBox}>
          <Text style={styles.calloutBody}>{substitutesText}</Text>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <AuthButton fullWidth={false} onPress={onStartBlend} style={styles.startBlendButton}>
          <Text style={styles.startBlendLabel}>{t('home.startBlend')}</Text>
        </AuthButton>

        <Pressable
          accessibilityRole="button"
          onPress={onFavorite}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonLabel}>{t('common.actions.save')}</Text>
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
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BADGE_BORDER,
    backgroundColor: BADGE_BACKGROUND,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeLabel: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.medium,
  },
  cacheBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cacheLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
  },
  favoriteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  title: {
    marginBottom: spacing.lg,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  macroScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
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
    opacity: UNIT_OPACITY,
  },
  separator: {
    height: 0.5,
    marginVertical: spacing.lg,
    backgroundColor: SEPARATOR_COLOR,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: SECTION_LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  ingredientsList: {
    gap: spacing.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  ingredientDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 7,
    backgroundColor: colors.brand.pulse,
  },
  ingredientText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 19,
  },
  blendInstruction: {
    color: BLEND_TEXT_COLOR,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  substitutesBox: {
    marginTop: spacing.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBSTITUTES_BORDER,
    backgroundColor: SUBSTITUTES_BACKGROUND,
    padding: spacing.lg,
  },
  tipBox: {
    marginTop: spacing.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TIP_BORDER,
    backgroundColor: TIP_BACKGROUND,
    padding: spacing.lg,
  },
  calloutTitle: {
    marginBottom: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  calloutBody: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 19,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  startBlendButton: {
    width: '60%',
    height: 42,
    borderRadius: 14,
  },
  startBlendLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  saveButton: {
    width: '38%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GHOST_BUTTON_BORDER,
  },
  saveButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
});