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
import type {
  PulseAiRecipe,
  PulseAiRecipePreview,
  RecipeTargetSuggestion,
  RecipeUnmetTarget,
} from '@blendi/shared';

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
import { countAllergens, formatAllergenList } from '../../utils/allergies.utils';

const BADGE_BACKGROUND = colors.overlay.pulse[20];
const BADGE_BORDER = colors.overlay.pulse[35];
const PROTEIN_PILL_BACKGROUND = colors.overlay.pulse[25];
const CARBS_PILL_BACKGROUND = colors.overlay.warning[25];
const FAT_PILL_BACKGROUND = colors.overlay.neutralGray[25];
const CALORIES_PILL_BACKGROUND = colors.overlay.success[25];
// CP-B5: álcool junto dos macros só quando > 0 (cor neutra, sem destaque).
const ALCOHOL_PILL_BACKGROUND = colors.overlay.neutralGray[25];
const SUBSTITUTES_BACKGROUND = colors.overlay.warning[8];
const SUBSTITUTES_BORDER = colors.overlay.warning[15];
// CP-B2: alerta de pedido ajustado ao copo (capacityNotice) — mesmo âmbar de
// aviso das substituições, um pouco mais forte para se destacar no topo.
const CAPACITY_NOTICE_BACKGROUND = colors.overlay.warning[12];
const CAPACITY_NOTICE_BORDER = colors.overlay.warning[42];
// CP-B5: avisos de pedido (fora da dieta, versão sem álcool) — azul
// informativo, mais discreto que o âmbar do capacityNotice.
const REQUEST_NOTICE_BACKGROUND = colors.overlay.info[8];
const REQUEST_NOTICE_BORDER = colors.overlay.info[15];
const TIP_BACKGROUND = colors.overlay.info[8];
const TIP_BORDER = colors.overlay.info[15];
const CART_BUTTON_BACKGROUND = colors.overlay.pulse[10];
const CART_BUTTON_BORDER = colors.overlay.pulse[20];
const UNIT_OPACITY = 0.7;
const HEART_SCALE_DEFAULT = 1;
const HEART_SCALE_ACTIVE = 1.3;

type MacroTone = 'protein' | 'carbs' | 'fat' | 'calories' | 'alcohol';

interface MacroPillData {
  tone: MacroTone;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number;
  unit: string;
}

// CP-B7: sugestão do Pantry (código do backend) → chave de tradução.
const UNMET_TARGET_SUGGESTION_KEYS: Record<RecipeTargetSuggestion, TranslationKey> = {
  whey_or_protein_powder: 'pulseAi.unmetTargetSuggestionItem.wheyOrProteinPowder',
  plant_protein_powder: 'pulseAi.unmetTargetSuggestionItem.plantProteinPowder',
  oats_or_banana: 'pulseAi.unmetTargetSuggestionItem.oatsOrBanana',
  peanut_butter: 'pulseAi.unmetTargetSuggestionItem.peanutButter',
  avocado_or_chia: 'pulseAi.unmetTargetSuggestionItem.avocadoOrChia',
  oats_or_peanut_butter: 'pulseAi.unmetTargetSuggestionItem.oatsOrPeanutButter',
};

/**
 * CP-B7: texto do valor pedido que a receita não atingiu — "Chegamos a 19,8 g
 * de proteína (você pediu 30 g)." e, no Pantry, "Adicionar whey ou proteína
 * em pó ajudaria." Os números vêm do backend; só a frase é do app.
 */
function useUnmetTargetText() {
  const { t } = useAppTranslation();
  const { formatDecimal } = useFormatNumbers();

  return (target: RecipeUnmetTarget): string => {
    const unit = t(target.nutrient === 'calories' ? 'common.units.kilocalories' : 'common.units.grams');
    const withUnit = (value: number) => `${formatDecimal(value)} ${unit}`;
    const asked = target.kind === 'range'
      ? t('pulseAi.unmetTargetAsked.range', {
          min: withUnit(target.requested),
          max: withUnit(target.requestedMax ?? target.requested),
        })
      : t(`pulseAi.unmetTargetAsked.${target.kind}`, { value: withUnit(target.requested) });
    const sentence = t(`pulseAi.unmetTarget.${target.nutrient}`, { delivered: withUnit(target.delivered), asked });
    const suggestionKey = target.suggestion ? UNMET_TARGET_SUGGESTION_KEYS[target.suggestion] : undefined;

    return suggestionKey
      ? `${sentence} ${t('pulseAi.unmetTargetSuggestion', { item: t(suggestionKey) })}`
      : sentence;
  };
}

export interface RecipeCardProps {
  recipe: PulseAiRecipe;
  isFavorited: boolean;
  favoriteId?: string;
  onStartBlend: () => void;
  isFromCache?: boolean;
  /**
   * CP-B6: "Quer com X?" — pede a receita de novo nomeando o alérgeno (cai
   * na confirmação). Ausente: a sugestão aparece sem o botão.
   */
  onAllergySuggestionPress?: (recipe: PulseAiRecipe) => void;
}

function useMacroPills(macros: PulseAiRecipe['macros'], alcoholGrams?: number): MacroPillData[] {
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
    ...(typeof alcoholGrams === 'number' && alcoholGrams > 0
      ? [{
          tone: 'alcohol' as const,
          icon: 'beaker-outline' as const,
          value: alcoholGrams,
          unit: t('pulseAi.alcoholUnit'),
        }]
      : []),
  ], [alcoholGrams, macros, t]);
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
          : tone === 'alcohol'
            ? ALCOHOL_PILL_BACKGROUND
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
    <View style={[pillStyles.macroPill, { backgroundColor }]} testID={`macro-pill-${tone}`}>
      <Ionicons name={icon} size={10} color={colors.text.primary} />
      <Text style={pillStyles.macroValue}>{formatDecimal(value)}</Text>
      <Text style={pillStyles.macroUnit}>{unit}</Text>
    </View>
  );
}

/**
 * CP-B2: o pedido da pessoa não coube no copo e a IA entregou a receita mais
 * próxima. Alerta explícito no topo do card, lido de uma vez pelo leitor de
 * tela (título + texto).
 */
export function RecipeCapacityNotice({ notice }: { notice: string }) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const title = t('pulseAi.capacityNoticeTitle');

  const noticeStyles = StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: CAPACITY_NOTICE_BORDER,
      backgroundColor: CAPACITY_NOTICE_BACKGROUND,
      padding: spacing.md,
    },
    textColumn: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
    body: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.regular,
      lineHeight: 19,
    },
  });

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${notice}`}
      style={noticeStyles.box}
      testID="recipe-capacity-notice"
    >
      <Ionicons name="warning-outline" size={18} color={colors.feedback.warning} />
      <View style={noticeStyles.textColumn}>
        <Text style={noticeStyles.title}>{title}</Text>
        <Text style={noticeStyles.body}>{notice}</Text>
      </View>
    </View>
  );
}

/**
 * CP-B5: aviso curto marcado pelo backend — ingrediente fora da dieta que a
 * pessoa pediu, ou versão sem álcool. Lido de uma vez pelo leitor de tela.
 */
export function RecipeRequestNotice({ text, testID }: { text: string; testID: string }) {
  const colors = useColors();

  const noticeStyles = StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: REQUEST_NOTICE_BORDER,
      backgroundColor: REQUEST_NOTICE_BACKGROUND,
      padding: spacing.md,
    },
    body: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.regular,
      lineHeight: 19,
    },
  });

  return (
    <View accessible accessibilityLabel={text} style={noticeStyles.box} testID={testID}>
      <Ionicons name="information-circle-outline" size={18} color={colors.feedback.info} />
      <Text style={noticeStyles.body}>{text}</Text>
    </View>
  );
}

/**
 * CP-B6: avisos de alergia marcados pelo backend. Mais forte que os outros
 * (vermelho, lido como alerta): "⚠️ Contém X, que você cadastrou como
 * alergia"; a sugestão do prato feito sem o alérgeno (com o botão "Quero
 * com X"); e "Use aveia certificada sem glúten".
 */
export function RecipeAllergyNotices({
  recipe,
  onSuggestionPress,
}: {
  recipe: PulseAiRecipe;
  onSuggestionPress?: (recipe: PulseAiRecipe) => void;
}) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const overrideCount = countAllergens(recipe.allergyOverride);
  const suggestion = recipe.allergySuggestion;
  const suggestionItems = suggestion ? formatAllergenList({ common: suggestion.allergens, custom: [] }, t) : '';

  const noticeStyles = StyleSheet.create({
    strong: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.md,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.feedback.error,
      backgroundColor: colors.overlay.error[12],
      padding: spacing.md,
    },
    strongText: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: fontWeights.bold,
      lineHeight: 20,
    },
    box: {
      marginBottom: spacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.overlay.warning[42],
      backgroundColor: colors.overlay.warning[8],
      padding: spacing.md,
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    text: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
    },
    button: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.overlay.warning[42],
      paddingHorizontal: spacing.md,
    },
    buttonLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
  });

  return (
    <>
      {overrideCount > 0 ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={t('allergies.card.override', { count: overrideCount, items: formatAllergenList(recipe.allergyOverride, t) })}
          style={noticeStyles.strong}
          testID="recipe-allergy-override-notice"
        >
          <Ionicons name="warning" size={20} color={colors.feedback.error} />
          <Text style={noticeStyles.strongText}>
            {t('allergies.card.override', { count: overrideCount, items: formatAllergenList(recipe.allergyOverride, t) })}
          </Text>
        </View>
      ) : null}

      {suggestion ? (
        <View style={noticeStyles.box} testID="recipe-allergy-suggestion">
          <View style={noticeStyles.row} accessible accessibilityRole="alert">
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.feedback.warning} />
            <Text style={noticeStyles.text}>
              {t('allergies.card.suggestion', { dish: suggestion.dish, items: suggestionItems })}
            </Text>
          </View>
          {onSuggestionPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t('allergies.card.suggestionButtonA11yHint', { items: suggestionItems })}
              onPress={() => { onSuggestionPress(recipe); }}
              style={noticeStyles.button}
              testID="recipe-allergy-suggestion-button"
            >
              <Text style={noticeStyles.buttonLabel}>{t('allergies.card.suggestionButton', { items: suggestionItems })}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {recipe.glutenFreeOatsNotice ? (
        <RecipeRequestNotice testID="recipe-gluten-free-oats-notice" text={t('allergies.card.oats')} />
      ) : null}
    </>
  );
}

/** "Proteína whey isolada" → "proteína whey isolada" no meio da frase; siglas ficam. */
function toMidSentence(name: string): string {
  const trimmed = name.trim();
  const [first, second] = [trimmed.charAt(0), trimmed.charAt(1)];
  return second && second === second.toLowerCase() ? `${first.toLowerCase()}${trimmed.slice(1)}` : trimmed;
}

export function RecipeCard({
  recipe,
  isFavorited,
  favoriteId,
  onStartBlend,
  isFromCache = false,
  onAllergySuggestionPress,
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

  const macroPills = useMacroPills(recipe.macros, recipe.alcoholGrams);

  const substitutesText = recipe.tip?.trim();
  const capacityNotice = recipe.capacityNotice?.trim();
  const dietOverrideItems = (recipe.dietOverrideIngredients ?? [])
    .map(toMidSentence)
    .filter(Boolean);
  // CP-B7a: item pedido que a receita não conseguiu incluir (só o backend preenche).
  const missingRequestedItems = (recipe.missingRequestedIngredients ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  // CP-B7: valor pedido não atingido (só o backend preenche).
  const unmetTargetText = useUnmetTargetText();
  const unmetTargets = recipe.unmetTargets ?? [];
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
    waterNoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    waterNoteText: {
      flex: 1,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: fontWeights.regular,
      lineHeight: 17,
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
      <RecipeAllergyNotices recipe={recipe} onSuggestionPress={onAllergySuggestionPress} />

      {capacityNotice ? <RecipeCapacityNotice notice={capacityNotice} /> : null}

      {dietOverrideItems.length > 0 ? (
        <RecipeRequestNotice
          testID="recipe-diet-override-notice"
          text={t('pulseAi.dietOverrideNotice', { items: dietOverrideItems.join(', ') })}
        />
      ) : null}

      {missingRequestedItems.length > 0 ? (
        <RecipeRequestNotice
          testID="recipe-missing-request-notice"
          text={t('pulseAi.missingRequestedNotice', { items: missingRequestedItems.join(', ') })}
        />
      ) : null}

      {unmetTargets.map((target) => (
        <RecipeRequestNotice
          key={`unmet-${target.nutrient}`}
          testID={`recipe-unmet-target-notice-${target.nutrient}`}
          text={unmetTargetText(target)}
        />
      ))}

      {recipe.alcoholFreeVersion ? (
        <RecipeRequestNotice testID="recipe-alcohol-free-notice" text={t('pulseAi.alcoholFreeNotice')} />
      ) : null}

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

      {/* CP-B2 (Pantry): a receita usa água que não estava na foto. */}
      {recipe.usesWaterNotInPhoto ? (
        <View style={styles.waterNoteRow} testID="recipe-water-not-in-photo">
          <Ionicons name="water-outline" size={14} color={colors.text.secondary} />
          <Text style={styles.waterNoteText}>{t('pulseAi.waterNotInPhoto')}</Text>
        </View>
      ) : null}

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
