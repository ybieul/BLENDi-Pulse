import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { PulseAiRecipe, PulseAiRecipePreview } from '@blendi/shared';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAddFavorite, useRemoveFavorite } from '../../hooks/useFavorites';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import { useAuthStore } from '../../store/auth.store';
import { useNetworkStore } from '../../store/network.store';
import { useThemeStore } from '../../store/theme.store';
import { generateAndShare } from '../../utils/shareCard.utils';
import { showToast } from '../../utils/toast.utils';
import {
  RecipeShareCard,
  type RecipeShareCardHandle,
  type ShareCardFormat,
} from '../shareCards/RecipeShareCard';
import { ShareFormatSheet } from '../shareCards/ShareFormatSheet';
import { AddToListSheet } from '../shoppingList/AddToListSheet';
import { AuthButton } from '../ui/AuthButton';
import type { TranslationKey } from '../../locales/i18n';

const BADGE_BACKGROUND = colors.overlay.pulse[20];
const BADGE_BORDER = colors.overlay.pulse[35];
const PROTEIN_PILL_BACKGROUND = colors.overlay.pulse[25];
const CARBS_PILL_BACKGROUND = colors.overlay.warning[25];
const FAT_PILL_BACKGROUND = colors.overlay.neutralGray[25];
const CALORIES_PILL_BACKGROUND = colors.overlay.success[25];
const SUBSTITUTES_BACKGROUND = colors.overlay.warning[8];
const SUBSTITUTES_BORDER = colors.overlay.warning[15];
const TIP_BACKGROUND = colors.overlay.info[8];
const TIP_BORDER = colors.overlay.info[15];
const CART_BUTTON_BACKGROUND = colors.overlay.pulse[10];
const CART_BUTTON_BORDER = colors.overlay.pulse[20];
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
  favoriteId?: string;
  onStartBlend: () => void;
  isFromCache?: boolean;
}

function useMacroPills(macros: PulseAiRecipe['macros']): MacroPillData[] {
  const { t } = useAppTranslation();

  return useMemo<MacroPillData[]>(() => [
    {
      tone: 'protein',
      icon: 'barbell-outline',
      value: macros.protein,
      unit: t('common.units.grams'),
    },
    {
      tone: 'carbs',
      icon: 'leaf-outline',
      value: macros.carbs,
      unit: t('common.units.grams'),
    },
    {
      tone: 'fat',
      icon: 'water-outline',
      value: macros.fat,
      unit: t('common.units.grams'),
    },
    {
      tone: 'calories',
      icon: 'flame-outline',
      value: macros.calories,
      unit: t('common.units.kilocalories'),
    },
  ], [macros, t]);
}

function MacroPill({ icon, value, unit, tone }: MacroPillData) {
  const colors = useColors();
  const { formatDecimal } = useFormatNumbers();
  const backgroundColor =
    tone === 'protein'
      ? PROTEIN_PILL_BACKGROUND
      : tone === 'carbs'
        ? CARBS_PILL_BACKGROUND
        : tone === 'fat'
          ? FAT_PILL_BACKGROUND
          : CALORIES_PILL_BACKGROUND;

  const pillStyles = StyleSheet.create({
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
  });

  return (
    <View style={[pillStyles.macroPill, { backgroundColor }]}>
      <Ionicons name={icon} size={10} color={colors.text.primary} />
      <Text style={pillStyles.macroValue}>{formatDecimal(value)}</Text>
      <Text style={pillStyles.macroUnit}>{unit}</Text>
    </View>
  );
}

export function RecipeCard({
  recipe,
  isFavorited,
  favoriteId,
  onStartBlend,
  isFromCache = false,
}: RecipeCardProps) {
  const colors = useColors();
  const CARD_BACKGROUND = colors.overlay.plum[7];
  const CARD_BORDER = colors.overlay.plum[10];
  const SEPARATOR_COLOR = colors.overlay.plum[8];
  const SECTION_LABEL_COLOR = colors.overlay.plum[70];
  const BLEND_TEXT_COLOR = colors.overlay.plum[80];
  const GHOST_BUTTON_BORDER = colors.overlay.plum[15];
  const GHOST_BUTTON_BACKGROUND = colors.overlay.plum[5];

  const { t } = useAppTranslation();
  const authUser = useAuthStore((state) => state.user);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const favoriteScale = useRef(new Animated.Value(HEART_SCALE_DEFAULT)).current;
  const shareCardRef = useRef<RecipeShareCardHandle | null>(null);
  const addFavoriteMutation = useAddFavorite();
  const removeFavoriteMutation = useRemoveFavorite();
  const [optimisticIsFavorited, setOptimisticIsFavorited] = useState(isFavorited);
  const [optimisticFavoriteId, setOptimisticFavoriteId] = useState(favoriteId);
  const [isAddToListVisible, setIsAddToListVisible] = useState(false);
  const [isShareFormatVisible, setIsShareFormatVisible] = useState(false);
  const [pendingShareFormat, setPendingShareFormat] = useState<ShareCardFormat | null>(null);

  useEffect(() => {
    setOptimisticIsFavorited(isFavorited);
  }, [isFavorited]);

  useEffect(() => {
    setOptimisticFavoriteId(favoriteId);
  }, [favoriteId]);

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

  const macroPills = useMacroPills(recipe.macros);

  const substitutesText = recipe.tip?.trim();
  const isFavoriteMutationPending = addFavoriteMutation.isPending || removeFavoriteMutation.isPending;
  const shoppingListIngredients = useMemo(
    () => recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.amount,
    })),
    [recipe.ingredients],
  );

  const handleFavoritePress = () => {
    if (isFavoriteMutationPending) {
      return;
    }

    if (!isConnected) {
      showToast(t('common.actionRequiresConnection'));
      return;
    }

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

    if (!optimisticIsFavorited) {
      setOptimisticIsFavorited(true);

      addFavoriteMutation.mutate(recipe, {
        onSuccess: ({ favorite }) => {
          setOptimisticIsFavorited(true);
          setOptimisticFavoriteId(favorite.id);
        },
        onError: (error) => {
          setOptimisticIsFavorited(false);
          setOptimisticFavoriteId(undefined);
          showToast(t(error.translationKey));
        },
      });

      return;
    }

    const nextFavoriteId = optimisticFavoriteId ?? favoriteId;

    if (!nextFavoriteId) {
      showToast(t('recipes.favorites.toggle_error'));
      return;
    }

    setOptimisticIsFavorited(false);

    removeFavoriteMutation.mutate(nextFavoriteId, {
      onSuccess: () => {
        setOptimisticFavoriteId(undefined);
      },
      onError: (error) => {
        setOptimisticIsFavorited(true);
        setOptimisticFavoriteId(nextFavoriteId);
        showToast(t(error.translationKey));
      },
    });
  };

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
      flex: 1,
      height: 42,
      borderRadius: 14,
      minWidth: 0,
    },
    startBlendLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
    cartButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: CART_BUTTON_BORDER,
      backgroundColor: CART_BUTTON_BACKGROUND,
    },
    shareButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: GHOST_BUTTON_BORDER,
      backgroundColor: GHOST_BUTTON_BACKGROUND,
    },
    saveButton: {
      width: 92,
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

  return (
    <View style={styles.cardContainer}>
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
              name={optimisticIsFavorited ? 'heart' : 'heart-outline'}
              size={20}
              color={optimisticIsFavorited ? colors.feedback.error : colors.text.secondary}
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
          accessibilityLabel={t('shoppingList.addToShoppingList')}
          accessibilityRole="button"
          onPress={() => setIsAddToListVisible(true)}
          style={styles.cartButton}
        >
          <Ionicons color={colors.brand.pulse} name="cart-outline" size={18} />
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

        <Pressable
          accessibilityRole="button"
          onPress={handleFavoritePress}
          disabled={isFavoriteMutationPending}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonLabel}>{t('common.actions.save')}</Text>
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
          recipe={recipe}
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

// ─── Variante bloqueada (CP-1.1.4a — "Wow Moment Paywall") ───────────────────
// Prévia do usuário grátis depois do limite: 3 mensagens do dia no Pulse AI,
// 3 scans do ciclo no Pantry Scanner (CP-1.1.4b). O app só recebe os
// macros — nem o nome: a IA pode ser induzida a pôr a receita no título, então
// o card mostra um título genérico. No lugar de ingredientes e modo de preparo
// vão linhas falsas (sem texto nenhum) sob o desfoque. O card inteiro é um
// botão que abre os planos.

// Larguras das linhas falsas: placeholder genérico, nunca derivado da receita.
const LOCKED_PLACEHOLDER_SECTIONS = [
  ['92%', '78%', '85%', '64%'],
  ['96%', '88%', '52%'],
] as const;
const LOCKED_PLACEHOLDER_LINE_HEIGHT = 10;
const LOCKED_BLUR_INTENSITY = 18;

/** Recurso de origem da prévia; decide só os textos do card. */
export type LockedRecipeSource = 'pulse_ai' | 'pantry_scanner';

interface LockedRecipeTextKeys {
  badge: TranslationKey;
  genericTitle: TranslationKey;
  unlockCta: TranslationKey;
  a11yLabel: TranslationKey;
  expired: TranslationKey;
  expiredA11yLabel: TranslationKey;
}

const LOCKED_RECIPE_TEXT_KEYS = {
  pulse_ai: {
    badge: 'navigation.pulseAI',
    genericTitle: 'pulseAi.lockedPreview.genericTitle',
    unlockCta: 'pulseAi.lockedPreview.unlockCta',
    a11yLabel: 'pulseAi.lockedPreview.a11yLabel',
    expired: 'pulseAi.lockedPreview.expired',
    expiredA11yLabel: 'pulseAi.lockedPreview.expiredA11yLabel',
  },
  pantry_scanner: {
    badge: 'pantryScanner.lockedPreview.badge',
    genericTitle: 'pantryScanner.lockedPreview.genericTitle',
    unlockCta: 'pantryScanner.lockedPreview.unlockCta',
    a11yLabel: 'pantryScanner.lockedPreview.a11yLabel',
    expired: 'pantryScanner.lockedPreview.expired',
    expiredA11yLabel: 'pantryScanner.lockedPreview.expiredA11yLabel',
  },
} as const satisfies Record<LockedRecipeSource, LockedRecipeTextKeys>;

export interface LockedRecipeCardProps {
  preview: PulseAiRecipePreview;
  /** Prévia expirou antes do desbloqueio: card informativo, sem ação. */
  expired?: boolean;
  onPress: () => void;
  /** Padrão 'pulse_ai' (CP-1.1.4a). O Pantry Scanner passa 'pantry_scanner'. */
  source?: LockedRecipeSource;
}

export function LockedRecipeCard({
  preview,
  expired = false,
  onPress,
  source = 'pulse_ai',
}: LockedRecipeCardProps) {
  const colors = useColors();
  const themeMode = useThemeStore((state) => state.mode);
  const { t } = useAppTranslation();
  const macroPills = useMacroPills(preview.macros);
  const textKeys = LOCKED_RECIPE_TEXT_KEYS[source];

  const styles = StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.overlay.plum[7],
      padding: 16,
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    badgePill: {
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
    title: {
      marginBottom: spacing.lg,
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: fontWeights.bold,
      letterSpacing: -0.5,
      lineHeight: 26,
    },
    macroRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    separator: {
      height: 0.5,
      marginVertical: spacing.lg,
      backgroundColor: colors.overlay.plum[8],
    },
    lockedArea: {
      position: 'relative',
      borderRadius: 12,
      overflow: 'hidden',
    },
    placeholderSection: {
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    placeholderSectionGap: {
      marginTop: spacing.lg,
    },
    placeholderLine: {
      height: LOCKED_PLACEHOLDER_LINE_HEIGHT,
      borderRadius: LOCKED_PLACEHOLDER_LINE_HEIGHT / 2,
      backgroundColor: colors.overlay.plum[12],
    },
    // Android: véu semitransparente no lugar do BlurView (ver comentário no JSX).
    androidVeil: {
      backgroundColor: colors.overlay.white[80],
    },
    lockOverlay: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    lockIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: BADGE_BACKGROUND,
      borderWidth: 1,
      borderColor: BADGE_BORDER,
    },
    ctaText: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
      textAlign: 'center',
    },
  });

  const accessibilityLabel = expired
    ? t(textKeys.expiredA11yLabel)
    : t(textKeys.a11yLabel);

  return (
    <Pressable
      testID="locked-recipe-card"
      accessible
      accessibilityRole={expired ? 'text' : 'button'}
      accessibilityLabel={accessibilityLabel}
      disabled={expired}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.badgePill}>
          <Text style={styles.badgeLabel}>{t(textKeys.badge)}</Text>
        </View>
        <Ionicons name="lock-closed" size={16} color={colors.brand.pulse} />
      </View>

      <Text style={styles.title}>{t(textKeys.genericTitle)}</Text>

      <View style={styles.macroRow}>
        {macroPills.map((macro) => (
          <MacroPill key={macro.tone} {...macro} />
        ))}
      </View>

      <View style={styles.separator} />

      <View style={styles.lockedArea}>
        {/* Linhas falsas: só Views, sem texto, escondidas do leitor de tela. */}
        <View
          testID="locked-recipe-placeholder"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {LOCKED_PLACEHOLDER_SECTIONS.map((lines, sectionIndex) => (
            <View
              key={sectionIndex}
              style={[
                styles.placeholderSection,
                sectionIndex > 0 ? styles.placeholderSectionGap : null,
              ]}
            >
              {lines.map((width, lineIndex) => (
                <View key={lineIndex} style={[styles.placeholderLine, { width }]} />
              ))}
            </View>
          ))}
        </View>

        {/* iOS: desfoque real. Android: o BlurView do expo-blur sem o método
            experimental só aplica uma tinta (não desfoca), e o método
            experimental pesa dentro de FlatList — então um véu com token do
            tema cumpre o mesmo papel. */}
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={LOCKED_BLUR_INTENSITY}
            tint={themeMode === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidVeil]} />
        )}

        <View style={[StyleSheet.absoluteFill, styles.lockOverlay]}>
          <View style={styles.lockIconCircle}>
            <Ionicons
              name={expired ? 'time-outline' : 'lock-closed'}
              size={18}
              color={colors.brand.pulse}
            />
          </View>
          <Text style={styles.ctaText}>
            {expired ? t(textKeys.expired) : t(textKeys.unlockCta)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
