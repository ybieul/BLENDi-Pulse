import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DietaryPreference, HomeRecipeBlendiModel, PulseAiRecipe, UserGoal } from '@blendi/shared';

import {
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton } from '../ui/AuthButton';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { DAILY_RECIPE_BLEND_INSTRUCTION_KEY, DAILY_RECIPES } from './dailyRecipes.data';
import { selectDailyRecipe } from './dailyRecipeSelection';

// Reexportado: os dados moraram aqui até o CP-1.1.9 (ver dailyRecipes.data.ts).
export { DAILY_RECIPES };

export interface DailyRecipeCardProps {
  goal: UserGoal;
  /** Dieta da pessoa (CP-1.1.9): a receita do dia nunca a viola. */
  dietaryPreferences: readonly DietaryPreference[];
  /** Modelo do BLENDi (CP-1.1.9): nada com gelo no Lite. */
  blendiModel: HomeRecipeBlendiModel;
  onStartBlend: (recipe: PulseAiRecipe) => void;
  /** Atalho mostrado no lugar do card quando nenhuma receita fixa é compatível. */
  onAskPulseAi: (prompt: string) => void;
}

const MACRO_OPACITY = 0.7;
const META_OPACITY = 0.6;

const SECONDS_PER_MINUTE = 60;
const MS_PER_DAY = 86400000;

// Lê o fuso ATUAL do aparelho via Intl (nunca o fuso persistido no perfil do
// backend) — a rotação da Home precisa funcionar antes de qualquer
// sessão/hidratação e mudar imediatamente se o usuário trocar o fuso do
// aparelho, sem depender de rede nem de estado salvo. Extrair ano/mês/dia
// reais via Intl.DateTimeFormat (em vez de aritmética manual de offset)
// evita erro em fusos com offset não-inteiro (ex: Asia/Kolkata, UTC+5:30) e
// em transições de horário de verão — mesma técnica já usada em
// useDateFormat.ts (getLocalDateKey) e no equivalente de backend
// timezone.utils.ts.
//
// `timezone` é injetável só para teste determinístico: mutar
// `process.env.TZ` em runtime não é confiável neste setup de Jest
// (confirmado empiricamente — `Intl.DateTimeFormat().resolvedOptions()`
// continua devolvendo o fuso real da máquina mesmo depois da troca). Em
// produção, o parâmetro nunca é passado — o default já é o fuso real do
// aparelho, lido de novo em toda chamada.
export function getLocalDayIndex(
  date: Date,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  // Date.UTC sobre os componentes LOCAIS já extraídos acima só gera um
  // índice monotônico que avança exatamente 1 por virada de meia-noite
  // LOCAL — a aritmética UTC aqui nunca serve para calcular o fuso em si.
  return Math.floor(
    Date.UTC(getPart('year'), getPart('month') - 1, getPart('day')) / MS_PER_DAY
  );
}

export function DailyRecipeCard({
  goal,
  dietaryPreferences,
  blendiModel,
  onStartBlend,
  onAskPulseAi,
}: DailyRecipeCardProps) {
  const colors = useColors();
  const CARD_BACKGROUND = colors.overlay.plum[7];
  const CARD_BORDER = colors.overlay.plum[10];

  const { t } = useAppTranslation();
  // new Date(Date.now()), não new Date() sem argumentos: no runtime do RN
  // (e em testes com jest.spyOn(Date, 'now')), o construtor sem argumentos
  // lê o relógio por um caminho interno do motor que ignora um `Date.now`
  // sobrescrito — confirmado empiricamente ao escrever os testes deste
  // arquivo. Passar por `Date.now()` explicitamente garante que mockar
  // `Date.now` em teste continue controlando este cálculo.
  const daysSinceEpoch = getLocalDayIndex(new Date(Date.now()));
  // CP-1.1.9: filtro por dieta/modelo, fallback para os outros goals e
  // rotação (módulo não-negativo) sobre a lista filtrada —
  // dailyRecipeSelection.ts. null = nenhuma receita fixa compatível.
  const recipe = selectDailyRecipe({ goal, dietaryPreferences, blendiModel }, daysSinceEpoch);

  const handleStartBlendPress = useCallback(() => {
    if (!recipe) {
      return;
    }

    const pulseAiRecipe: PulseAiRecipe = {
      title: t(recipe.nameKey),
      ingredients: recipe.ingredients.map((ingredient) => ({
        name: t(ingredient.nameKey),
        amount: t(ingredient.amountKey),
      })),
      macros: {
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat,
        calories: recipe.calories,
      },
      prepTimeSeconds: recipe.durationMinutes * SECONDS_PER_MINUTE,
      blendInstruction: t(DAILY_RECIPE_BLEND_INSTRUCTION_KEY),
      tip: t('home.dailyRecipeTip'),
      hasSubstitutes: false,
      steps: recipe.steps.map((step) => ({
        text: t(step.textKey),
        pulseCount: step.pulseCount,
      })),
    };

    onStartBlend(pulseAiRecipe);
  }, [onStartBlend, recipe, t]);

  const handleAskPulseAiPress = useCallback(() => {
    onAskPulseAi(t('home.dailyRecipeAskPulseAiPrompt'));
  }, [onAskPulseAi, t]);

  const styles = StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: CARD_BORDER,
      backgroundColor: CARD_BACKGROUND,
      padding: spacing.xl,
      overflow: 'hidden',
    },
    badge: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.medium,
      marginBottom: spacing.md,
    },
    recipeName: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 18,
      fontWeight: fontWeights.bold,
      lineHeight: 24,
      marginBottom: spacing.md,
    },
    macrosRow: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: fontWeights.regular,
      opacity: MACRO_OPACITY,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    timeEstimate: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 12,
      fontWeight: fontWeights.regular,
      opacity: META_OPACITY,
      lineHeight: 18,
    },
    footer: {
      marginTop: spacing.lg,
      alignItems: 'flex-end',
    },
    ctaButton: {
      height: 36,
      paddingHorizontal: spacing.lg,
      minWidth: 132,
    },
    ctaLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
  });

  // Nenhuma receita fixa compatível com a dieta/modelo: no lugar do card da
  // receita, um atalho curto para pedir uma receita à Pulse AI.
  if (!recipe) {
    return (
      <View style={styles.card}>
        <Text style={styles.badge}>{t('home.todaysBlend')}</Text>
        <Text style={styles.macrosRow}>{t('home.dailyRecipeUnavailable')}</Text>
        <View style={styles.footer}>
          <AuthButton
            fullWidth={false}
            onPress={handleAskPulseAiPress}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaLabel}>{t('home.dailyRecipeAskPulseAi')}</Text>
          </AuthButton>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>{t('home.todaysBlend')}</Text>

      <Text style={styles.recipeName}>{t(recipe.nameKey)}</Text>

      <Text style={styles.macrosRow}>
        {t('home.recipeMacros', {
          protein: recipe.protein,
          carbs: recipe.carbs,
          calories: recipe.calories,
        })}
      </Text>

      <Text style={styles.timeEstimate}>
        {t('home.blendTime', { minutes: recipe.durationMinutes })}
      </Text>

      <View style={styles.footer}>
        <AuthButton
          fullWidth={false}
          onPress={handleStartBlendPress}
          style={styles.ctaButton}
        >
          <Text style={styles.ctaLabel}>{t('home.startBlend')}</Text>
        </AuthButton>
      </View>
    </View>
  );
}
