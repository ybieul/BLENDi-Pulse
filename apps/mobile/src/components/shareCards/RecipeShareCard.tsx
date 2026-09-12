import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { PulseAiRecipe } from '@blendi/shared';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import { ProfilePhoto } from '../profile/ProfilePhoto';
import { AuroraBackground } from '../ui/AuroraBackground';

const SHARE_CARD_BACKGROUND = '#2b1429';
const PROTEIN_PILL_BACKGROUND = 'rgba(154,72,147,0.25)';
const CARBS_PILL_BACKGROUND = 'rgba(245,158,11,0.25)';
const FAT_PILL_BACKGROUND = 'rgba(107,114,128,0.25)';
const CALORIES_PILL_BACKGROUND = 'rgba(34,197,94,0.25)';
const MACRO_LABEL_COLOR = 'rgba(255,255,255,0.78)';

const SHARE_CARD_DIMENSIONS = {
  square: {
    width: 1080,
    height: 1080,
  },
  story: {
    width: 1080,
    height: 1920,
  },
} as const;

export type ShareCardFormat = 'square' | 'story';

export interface RecipeShareCardProfile {
  userId?: string;
  name: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | Date | null;
}

export interface RecipeShareCardProps {
  recipe: PulseAiRecipe;
  user: RecipeShareCardProfile;
  format: ShareCardFormat;
}

export type RecipeShareCardHandle = React.ElementRef<typeof ViewShot>;

type MacroKey = 'protein' | 'carbs' | 'fat' | 'calories';

interface MacroItem {
  key: MacroKey;
  label: string;
  value: string;
}

function getTitleFontSize(title: string, format: ShareCardFormat): number {
  const normalizedLength = title.trim().length;
  const maxFontSize = format === 'story' ? 108 : 96;
  const minFontSize = format === 'story' ? 62 : 58;
  const penalty = Math.max(0, normalizedLength - 16) * (format === 'story' ? 1.25 : 1.15);

  return Math.max(minFontSize, Math.min(maxFontSize, maxFontSize - penalty));
}

export const RecipeShareCard = forwardRef<RecipeShareCardHandle, RecipeShareCardProps>(
  function RecipeShareCard({ recipe, user, format }, ref) {
    const { t } = useAppTranslation();
    const { formatDecimal } = useFormatNumbers();
    const isStory = format === 'story';
    const macroLabelSize = isStory ? 24 : 22;
    const macroValueSize = isStory ? 34 : 30;
    const userName = user.name.trim() || t('share.defaultUser');

    // Estilos que dependem de format/isStory, pré-computados uma vez por
    // mudança de formato em vez de objetos literais inline no JSX (eslint
    // react-native/no-inline-styles).
    const cardMetrics = useMemo(() => {
      const dims = SHARE_CARD_DIMENSIONS[format];

      return {
        capture: {
          width: dims.width,
          height: dims.height,
          paddingHorizontal: isStory ? 92 : 84,
          paddingTop: isStory ? 160 : 120,
          paddingBottom: isStory ? 112 : 84,
        },
        macroGrid: {
          gap: isStory ? 24 : 20,
        },
        macroPill: {
          minHeight: isStory ? 138 : 124,
          paddingHorizontal: isStory ? 28 : 24,
          paddingVertical: isStory ? 22 : 18,
        },
      };
    }, [format, isStory]);

    const titleStyle = useMemo(() => {
      const fontSize = getTitleFontSize(recipe.title, format);

      return {
        fontSize,
        lineHeight: Math.round(fontSize * 1.04),
        maxWidth: isStory ? 840 : 900,
        marginBottom: isStory ? 72 : 56,
      };
    }, [format, isStory, recipe.title]);

    const macroItems = useMemo<MacroItem[]>(() => [
      {
        key: 'protein',
        label: t('common.macros.protein'),
        value: `${formatDecimal(recipe.macros.protein)}${t('common.units.grams')}`,
      },
      {
        key: 'carbs',
        label: t('common.macros.carbs'),
        value: `${formatDecimal(recipe.macros.carbs)}${t('common.units.grams')}`,
      },
      {
        key: 'fat',
        label: t('common.macros.fat'),
        value: `${formatDecimal(recipe.macros.fat)}${t('common.units.grams')}`,
      },
      {
        key: 'calories',
        label: t('common.macros.calories'),
        value: `${formatDecimal(recipe.macros.calories)} ${t('common.units.kilocalories')}`,
      },
    ], [recipe.macros, formatDecimal, t]);

    return (
      <View pointerEvents="none" style={styles.offscreenRoot}>
        <ViewShot
          ref={ref}
          style={[styles.captureRoot, cardMetrics.capture]}
        >
          <View style={styles.backgroundLayer} />
          <View style={styles.auroraLayer}>
            <AuroraBackground intensity="reduced" />
          </View>

          <View style={styles.content}>
            <View style={styles.topSection}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                numberOfLines={3}
                style={[styles.title, titleStyle]}
              >
                {recipe.title}
              </Text>

              <View style={[styles.macroGrid, cardMetrics.macroGrid]}>
                {macroItems.map((item) => (
                  <View
                    key={item.key}
                    style={[
                      styles.macroPill,
                      MACRO_PILL_BACKGROUND_STYLES[item.key],
                      cardMetrics.macroPill,
                    ]}
                  >
                    <Text style={[styles.macroLabel, { fontSize: macroLabelSize }]}>{item.label}</Text>
                    <Text style={[styles.macroValue, { fontSize: macroValueSize }]}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.bottomRow}>
              <View style={styles.userRow}>
                <ProfilePhoto
                  userId={user.userId}
                  fullName={userName}
                  hasProfilePhoto={user.hasProfilePhoto}
                  profilePhotoUpdatedAt={user.profilePhotoUpdatedAt}
                  size={48}
                />
                <Text numberOfLines={1} style={styles.userName}>
                  {userName}
                </Text>
              </View>

              <Text style={styles.brandLabel}>{t('share.brandName')}</Text>
            </View>
          </View>
        </ViewShot>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  offscreenRoot: {
    position: 'absolute',
    left: -20000,
    top: 0,
  },
  captureRoot: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: SHARE_CARD_BACKGROUND,
    justifyContent: 'space-between',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SHARE_CARD_BACKGROUND,
  },
  auroraLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  title: {
    alignSelf: 'center',
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
    letterSpacing: -1.4,
    textAlign: 'center',
  },
  macroGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  macroPill: {
    width: '48.4%',
    borderRadius: 999,
    justifyContent: 'center',
  },
  macroPillProtein: {
    backgroundColor: PROTEIN_PILL_BACKGROUND,
  },
  macroPillCarbs: {
    backgroundColor: CARBS_PILL_BACKGROUND,
  },
  macroPillFat: {
    backgroundColor: FAT_PILL_BACKGROUND,
  },
  macroPillCalories: {
    backgroundColor: CALORIES_PILL_BACKGROUND,
  },
  macroLabel: {
    color: MACRO_LABEL_COLOR,
    fontFamily: fonts.body,
    fontWeight: fontWeights.medium,
    marginBottom: 8,
  },
  macroValue: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontWeight: fontWeights.bold,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 20,
  },
  userName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  brandLabel: {
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
});

const MACRO_PILL_BACKGROUND_STYLES: Record<MacroKey, ViewStyle> = {
  protein: styles.macroPillProtein,
  carbs: styles.macroPillCarbs,
  fat: styles.macroPillFat,
  calories: styles.macroPillCalories,
};
