import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import { useAddFavorite, useRemoveFavorite } from '../../hooks/useFavorites';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import { useAuthStore } from '../../store/auth.store';
import { useNetworkStore } from '../../store/network.store';
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
          showToast(t(error.translationKey as Parameters<typeof t>[0]));
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
        showToast(t(error.translationKey as Parameters<typeof t>[0]));
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