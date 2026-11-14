// apps/mobile/src/screens/onboarding/OnboardingBuildingPlanScreen.tsx
// "Montando seu plano": tela de ~6 segundos depois do "Finish setup" (PATCH
// /users/me já salvo pela OnboardingMacrosScreen). Anel de progresso com a
// porcentagem, passos personalizados que vão sendo marcados e um card com
// fatos do BLENDi trocando a cada ~2 segundos.
//
// Ao fim, concluirOnboarding() chama completeOnboarding() + resetOnboarding();
// o RootNavigator reage ao isNewUser: false e abre o AppFlow (Home), sem
// navegação manual.
//
// Os dados exibidos vêm dos parâmetros da rota (o que foi salvo), não do
// onboarding store, que o resetOnboarding() limpa.
//
// Se o app for fechado durante a animação, o PATCH já foi salvo mas o
// onboarding_completed continua 'false' no MMKV: na próxima abertura a pessoa
// refaz o onboarding (store em memória, recomeça do zero) e o novo PATCH
// sobrescreve o anterior.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { borderRadius, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';
import { AuroraBackground } from '../../components/ui/AuroraBackground';
import { AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER } from '../../components/ui/AuthInput';
import { DIET_OPTIONS } from '../../components/ui/DietaryPreferencesPicker';
import { getRingGeometry, RingArc } from '../../components/ui/RingArc';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import type { TranslationKey } from '../../locales/i18n';
import type { OnboardingScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../store/auth.store';
import { useOnboardingStore } from '../../store/onboarding.store';
import { BLENDER_OPTIONS } from '../../utils/blenderOwnership.utils';

// ─── Constantes ────────────────────────────────────────────────────────────────

/** Duração total da tela, do início do anel até abrir a Home. */
export const BUILDING_PLAN_DURATION_MS = 6000;
/** No fim, o anel fica parado em 100% com "Seu plano está pronto" marcado. */
const READY_HOLD_MS = 600;
const FILL_DURATION_MS = BUILDING_PLAN_DURATION_MS - READY_HOLD_MS;
/** De quanto em quanto tempo a porcentagem e os passos são atualizados. */
const TICK_MS = 100;

/** Intervalo entre um fato e o próximo. */
export const FACT_ROTATION_MS = 2000;
/** Duração de cada metade do fade (some → troca → aparece). */
export const FACT_FADE_MS = 250;

/**
 * Fatos do BLENDi, na ordem em que aparecem. Fonte:
 * blendiblender.com/pages/our-story. Só estes: não acrescentar números ou
 * fatos que não estejam na página.
 */
export const BLENDI_FACT_KEYS = [
  'onboarding.buildingPlan.facts.dormRoom',
  'onboarding.buildingPlan.facts.featuredOnTv',
  'onboarding.buildingPlan.facts.firstPrototype',
  'onboarding.buildingPlan.facts.umassEngineers',
  'onboarding.buildingPlan.facts.firstBatchSoldOut',
] as const satisfies readonly TranslationKey[];

/** Mesmo teto de fonte grande do sistema usado nos campos do app (AuthInput). */
const MAX_FONT_SCALE = AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER;

const RING_MIN_SIZE = 120;
const RING_MAX_SIZE = 180;
const RING_STROKE_WIDTH = 10;
const STEP_ICON_SIZE = 20;
const FACT_CARD_MIN_HEIGHT = 96;

type Step = { id: string; text: string };

// ─── Tela ──────────────────────────────────────────────────────────────────────

export function OnboardingBuildingPlanScreen({ route }: OnboardingScreenProps<'OnboardingBuildingPlan'>) {
  const {
    blendiModel,
    blendiOwnership,
    goal,
    dailyProteinTarget,
    dailyCalorieTarget,
    dailyCarbTarget,
    dietaryPreferences,
  } = route.params;

  const colors = useColors();
  const { t, locale } = useAppTranslation();
  const { formatCount } = useFormatNumbers();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // null enquanto o sistema não respondeu; os timers só começam depois.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [factIndex, setFactIndex] = useState(0);

  const ringProgress = useRef(new Animated.Value(0)).current;
  const factOpacity = useRef(new Animated.Value(1)).current;
  const hasFinished = useRef(false);
  const hasPlayedHaptic = useRef(false);

  // ── Passos personalizados ────────────────────────────────────────────────────

  const steps = useMemo<Step[]>(() => {
    const modelTitleKey = BLENDER_OPTIONS.find((option) => option.key === blendiModel)?.titleKey;
    const modelText = blendiOwnership === 'blendi' && modelTitleKey
      ? t('onboarding.buildingPlan.stepModel', { model: t(modelTitleKey) })
      : t('onboarding.buildingPlan.stepModelNeutral');

    const dietLabels = DIET_OPTIONS
      .filter((option) => dietaryPreferences.includes(option.key))
      .map((option) => t(option.titleKey).toLocaleLowerCase(locale));

    return [
      { id: 'model', text: modelText },
      { id: 'goal', text: t('onboarding.buildingPlan.stepGoal', { goal: t(`onboarding.goal${goal}`) }) },
      {
        id: 'targets',
        text: t('onboarding.buildingPlan.stepTargets', {
          protein: formatCount(dailyProteinTarget),
          calories: formatCount(dailyCalorieTarget),
          carbs: formatCount(dailyCarbTarget),
        }),
      },
      ...(dietLabels.length > 0
        ? [{ id: 'diet', text: t('onboarding.buildingPlan.stepDiet', { diets: dietLabels.join(', ') }) }]
        : []),
      { id: 'ready', text: t('onboarding.buildingPlan.stepReady') },
    ];
  }, [
    blendiModel,
    blendiOwnership,
    dailyCalorieTarget,
    dailyCarbTarget,
    dailyProteinTarget,
    dietaryPreferences,
    formatCount,
    goal,
    locale,
    t,
  ]);

  // ── Progresso ────────────────────────────────────────────────────────────────

  const rawProgress = Math.min(elapsedMs / FILL_DURATION_MS, 1);
  // Com "reduzir movimento", o anel anda em saltos (um por passo), sem
  // animação contínua.
  const progress = reduceMotion
    ? Math.floor(rawProgress * steps.length) / steps.length
    : rawProgress;
  const percent = Math.round(progress * 100);
  const completedSteps = Math.floor(progress * steps.length + Number.EPSILON);
  const isComplete = percent >= 100;

  // ── Saída única da tela ──────────────────────────────────────────────────────

  const concluirOnboarding = useCallback(async () => {
    if (hasFinished.current) return;
    hasFinished.current = true;

    // CP-1.1.3 (Free Trial): o paywall do fim do onboarding entra AQUI, antes
    // de concluir. Hoje a tela vai direto para a Home.
    await useAuthStore.getState().completeOnboarding();
    useOnboardingStore.getState().resetOnboarding();
    // RootNavigator reage ao isNewUser: false — sem navegação manual.
  }, []);

  // ── Efeitos ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (isMounted) setReduceMotion(enabled); })
      .catch(() => { if (isMounted) setReduceMotion(false); });
    return () => { isMounted = false; };
  }, []);

  // Botão voltar do Android bloqueado (o gesto do iOS sai pelo
  // gestureEnabled: false no OnboardingNavigator).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => { subscription.remove(); };
  }, []);

  // Relógio da tela: porcentagem, passos e a saída no tempo total.
  useEffect(() => {
    if (reduceMotion === null) return undefined;

    const startedAt = Date.now();
    const tickId = setInterval(() => {
      const next = Math.min(Date.now() - startedAt, FILL_DURATION_MS);
      setElapsedMs(next);
      if (next >= FILL_DURATION_MS) clearInterval(tickId);
    }, TICK_MS);

    const finishId = setTimeout(() => { void concluirOnboarding(); }, BUILDING_PLAN_DURATION_MS);

    let ringAnimation: Animated.CompositeAnimation | null = null;
    if (!reduceMotion) {
      ringAnimation = Animated.timing(ringProgress, {
        toValue: 1,
        duration: FILL_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      ringAnimation.start();
    }

    return () => {
      clearInterval(tickId);
      clearTimeout(finishId);
      ringAnimation?.stop();
      ringProgress.stopAnimation();
    };
  }, [concluirOnboarding, reduceMotion, ringProgress]);

  // Com "reduzir movimento", o anel só pula para o valor do passo atual.
  useEffect(() => {
    if (reduceMotion) ringProgress.setValue(progress);
  }, [progress, reduceMotion, ringProgress]);

  // Haptic leve ao chegar em 100% (mesmo padrão dos checks do Track).
  useEffect(() => {
    if (!isComplete || hasPlayedHaptic.current) return;
    hasPlayedHaptic.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [isComplete]);

  // Fatos: troca a cada FACT_ROTATION_MS, com fade (sem fade se reduzir movimento).
  useEffect(() => {
    if (reduceMotion === null) return undefined;

    const advance = () => { setFactIndex((index) => (index + 1) % BLENDI_FACT_KEYS.length); };
    const pending: Array<ReturnType<typeof setTimeout>> = [];
    let fade: Animated.CompositeAnimation | null = null;

    const rotationId = setInterval(() => {
      if (reduceMotion) {
        advance();
        return;
      }

      fade = Animated.timing(factOpacity, {
        toValue: 0,
        duration: FACT_FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      fade.start();
      pending.push(setTimeout(() => {
        advance();
        fade = Animated.timing(factOpacity, {
          toValue: 1,
          duration: FACT_FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        });
        fade.start();
      }, FACT_FADE_MS));
    }, FACT_ROTATION_MS);

    return () => {
      clearInterval(rotationId);
      pending.forEach(clearTimeout);
      fade?.stop();
      factOpacity.stopAnimation();
    };
  }, [factOpacity, reduceMotion]);

  // ── Layout ───────────────────────────────────────────────────────────────────

  const ringSize = Math.round(
    Math.min(Math.max(Math.min(width * 0.45, height * 0.22), RING_MIN_SIZE), RING_MAX_SIZE),
  );
  const { circumference } = getRingGeometry(ringSize, RING_STROKE_WIDTH);
  const dashOffset = useMemo(
    () => ringProgress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] }),
    [circumference, ringProgress],
  );

  const factKey = BLENDI_FACT_KEYS[factIndex] ?? BLENDI_FACT_KEYS[0];
  const factLabel = t('onboarding.buildingPlan.factLabel');
  const factText = t(factKey);

  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'space-between',
      gap: spacing['3xl'],
      paddingHorizontal: spacing['3xl'],
    },
    header: {
      gap: spacing.md,
    },
    title: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['3xl'],
      lineHeight: 40,
    },
    subtitle: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 24,
    },
    ringWrapper: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    percent: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontWeight: fontWeights.bold,
      fontSize: Math.round(ringSize * 0.2),
    },
    steps: {
      gap: spacing.lg,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
    },
    stepText: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 22,
    },
    factCard: {
      minHeight: FACT_CARD_MIN_HEIGHT,
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.overlay.plum[7],
    },
    factLabel: {
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.medium,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    factText: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 22,
    },
  });

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFillObject}>
        <AuroraBackground />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing['4xl'],
            paddingBottom: insets.bottom + spacing['3xl'],
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {t('onboarding.buildingPlan.title')}
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {t('onboarding.buildingPlan.subtitle')}
          </Text>
        </View>

        <View
          testID="building-plan-ring"
          style={[styles.ringWrapper, { width: ringSize, height: ringSize }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('onboarding.buildingPlan.progressLabel')}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <RingArc
            size={ringSize}
            strokeWidth={RING_STROKE_WIDTH}
            color={isComplete ? colors.feedback.success : colors.brand.pulse}
            trackColor={colors.overlay.plum[8]}
            dashOffset={dashOffset}
          />
          <View pointerEvents="none" style={styles.ringContent}>
            <Text style={styles.percent} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {`${percent}%`}
            </Text>
          </View>
        </View>

        <View style={styles.steps}>
          {steps.map((step, index) => {
            const done = index < completedSteps;
            return (
              <View
                key={step.id}
                testID={`building-plan-step-${step.id}`}
                style={styles.stepRow}
                accessible
                accessibilityLabel={`${step.text}, ${t(done ? 'onboarding.buildingPlan.stepDone' : 'onboarding.buildingPlan.stepPending')}`}
                accessibilityState={{ checked: done }}
              >
                <Ionicons
                  testID={done ? `building-plan-step-${step.id}-done` : undefined}
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={STEP_ICON_SIZE}
                  color={done ? colors.brand.pulse : colors.text.tertiary}
                />
                <Text
                  style={[styles.stepText, { color: done ? colors.text.primary : colors.text.secondary }]}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                >
                  {step.text}
                </Text>
              </View>
            );
          })}
        </View>

        <View
          testID="building-plan-fact"
          style={styles.factCard}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${factLabel} ${factText}`}
        >
          <Text style={styles.factLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {factLabel}
          </Text>
          <Animated.Text
            style={[styles.factText, { opacity: factOpacity }]}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {factText}
          </Animated.Text>
        </View>
      </ScrollView>
    </View>
  );
}
