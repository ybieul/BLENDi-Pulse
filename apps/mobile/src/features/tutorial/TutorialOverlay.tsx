// CP-C2 — Overlay do tutorial: escurece a tela com um recorte em volta do
// elemento (react-native-svg) e mostra o balão. Enquanto o tour roda, o
// overlay pega todos os toques: só os botões do balão respondem.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { borderRadius, fontSizes, fontWeights, fonts, shadows, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useReduceMotion } from './useReduceMotion';
import { useThemeStore } from '../../store/theme.store';
import { SPOTLIGHT_RADIUS, computeBalloonLayout, computeSpotlightRect } from './balloonLayout';
import type { TutorialViewState } from './tutorial.types';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const TRANSITION_MS = 260;
const FADE_MS = 180;
const DEFAULT_BALLOON_HEIGHT = 200;
const MIN_TOUCH_SIZE = 44;

export interface TutorialOverlayProps {
  state: TutorialViewState;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/** Retângulo arredondado como caminho SVG. */
function buildRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  'worklet';
  if (width <= 0 || height <= 0) {
    return '';
  }
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  return (
    `M${x + r} ${y}H${right - r}A${r} ${r} 0 0 1 ${right} ${y + r}` +
    `V${bottom - r}A${r} ${r} 0 0 1 ${right - r} ${bottom}H${x + r}` +
    `A${r} ${r} 0 0 1 ${x} ${bottom - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** Tela inteira menos o recorte (fillRule evenodd). */
function buildSpotlightPath(
  screenWidth: number,
  screenHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {
  'worklet';
  return `M0 0H${screenWidth}V${screenHeight}H0Z${buildRoundedRectPath(x, y, width, height, radius)}`;
}

export function TutorialOverlay({ state, onNext, onBack, onSkip }: TutorialOverlayProps) {
  const colors = useColors();
  const themeMode = useThemeStore((store) => store.mode);
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  // Tamanho real do overlay (cobre a tela toda, inclusive a barra de navegação
  // do Android em edge-to-edge, que useWindowDimensions pode não contar).
  const [layoutSize, setLayoutSize] = useState<{ width: number; height: number } | null>(null);
  const window = useMemo(
    () => layoutSize ?? { width: windowDimensions.width, height: windowDimensions.height },
    [layoutSize, windowDimensions.height, windowDimensions.width]
  );
  const reduceMotion = useReduceMotion();
  const textGroupRef = useRef<View>(null);
  const [balloonHeight, setBalloonHeight] = useState(DEFAULT_BALLOON_HEIGHT);

  const isShowing = state.isRunning && state.phase === 'showing' && state.step !== null;
  // Pausado (folha/paywall/celebração por cima): o overlay some e não pega toques.
  const isBlocking = state.isRunning && state.phase !== 'paused';

  const spot = useMemo(
    () => (isShowing && state.targetRect ? computeSpotlightRect(state.targetRect, window) : null),
    [isShowing, state.targetRect, window]
  );

  const holeX = useSharedValue(0);
  const holeY = useSharedValue(0);
  const holeW = useSharedValue(0);
  const holeH = useSharedValue(0);
  const balloonOpacity = useSharedValue(0);
  const screenW = useSharedValue(window.width);
  const screenH = useSharedValue(window.height);

  useEffect(() => {
    screenW.value = window.width;
    screenH.value = window.height;
  }, [screenH, screenW, window.height, window.width]);

  useEffect(() => {
    const next = spot ?? { x: window.width / 2, y: window.height / 2, width: 0, height: 0 };
    if (reduceMotion) {
      holeX.value = next.x;
      holeY.value = next.y;
      holeW.value = next.width;
      holeH.value = next.height;
      return;
    }
    const config = { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) };
    holeX.value = withTiming(next.x, config);
    holeY.value = withTiming(next.y, config);
    holeW.value = withTiming(next.width, config);
    holeH.value = withTiming(next.height, config);
  }, [holeH, holeW, holeX, holeY, reduceMotion, spot, window.height, window.width]);

  useEffect(() => {
    if (!isShowing) {
      balloonOpacity.value = 0;
      return;
    }
    balloonOpacity.value = 0;
    balloonOpacity.value = reduceMotion ? 1 : withTiming(1, { duration: FADE_MS });
  }, [balloonOpacity, isShowing, reduceMotion, state.step?.id]);

  // Leitor de tela: foco no texto do balão a cada etapa.
  useEffect(() => {
    if (!isShowing) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(textGroupRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 250);
    return () => clearTimeout(timer);
  }, [isShowing, state.step?.id]);

  const dimProps = useAnimatedProps(() => ({
    d: buildSpotlightPath(screenW.value, screenH.value, holeX.value, holeY.value, holeW.value, holeH.value, SPOTLIGHT_RADIUS),
  }));
  const ringProps = useAnimatedProps(() => ({
    d: buildRoundedRectPath(holeX.value, holeY.value, holeW.value, holeH.value, SPOTLIGHT_RADIUS),
  }));
  const balloonStyle = useAnimatedStyle(() => ({ opacity: balloonOpacity.value }));

  if (!state.isRunning) {
    return null;
  }

  const layout = computeBalloonLayout({
    target: spot ? state.targetRect : null,
    balloonHeight,
    window,
    insets,
    placement: state.step?.placement ?? 'auto',
  });

  const isFirst = state.index === 0;
  const isLast = state.index >= state.total - 1;
  const current = state.index + 1;
  const counter = t('tutorial.stepCounter', { current, total: state.total });
  const counterA11y = t('tutorial.stepA11y', { current, total: state.total });
  const nextLabel = isLast ? t('tutorial.done') : t('tutorial.next');
  const backLabel = t('tutorial.back');
  const skipLabel = t('tutorial.skip');
  const dimColor = themeMode === 'dark' ? colors.overlay.black[82] : colors.overlay.black[55];

  const handleRootLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== layoutSize?.width || height !== layoutSize?.height)) {
      setLayoutSize({ width, height });
    }
  };

  const handleBalloonLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0 && Math.abs(height - balloonHeight) > 1) {
      setBalloonHeight(height);
    }
  };

  const styles = StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
      elevation: 1000,
    },
    balloon: {
      position: 'absolute',
      top: layout.top,
      left: layout.left,
      width: layout.width,
      maxHeight: layout.maxHeight,
      padding: spacing.xl,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.overlay.plum[12],
      ...shadows.medium,
    },
    bodyScroll: {
      flexGrow: 0,
    },
    title: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      marginBottom: spacing.md,
    },
    body: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 21,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      gap: spacing.md,
    },
    counter: {
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    textButton: {
      minHeight: MIN_TOUCH_SIZE,
      minWidth: MIN_TOUCH_SIZE,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textButtonLabel: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
    },
    disabled: {
      opacity: 0.35,
    },
    primaryButton: {
      minHeight: MIN_TOUCH_SIZE,
      minWidth: MIN_TOUCH_SIZE,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.full,
      backgroundColor: colors.brand.pulse,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonLabel: {
      color: colors.text.inverse,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
    },
  });

  return (
    <View
      style={styles.root}
      pointerEvents={isBlocking ? 'auto' : 'none'}
      // Toque fora dos botões do balão não chega ao app.
      onStartShouldSetResponder={() => isBlocking}
      accessibilityViewIsModal={isBlocking}
      importantForAccessibility={isBlocking ? 'yes' : 'no-hide-descendants'}
      testID="tutorial-overlay"
      onLayout={handleRootLayout}
    >
      {isBlocking ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={window.width} height={window.height}>
            <AnimatedPath animatedProps={dimProps} fill={dimColor} fillRule="evenodd" />
            <AnimatedPath animatedProps={ringProps} fill="none" stroke={colors.brand.pulse} strokeWidth={2} />
          </Svg>
        </View>
      ) : null}

      {isShowing && state.step ? (
        <Animated.View style={[styles.balloon, balloonStyle]} onLayout={handleBalloonLayout} testID="tutorial-balloon">
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.bodyScroll}>
            <View
              ref={textGroupRef}
              accessible
              accessibilityLabel={`${state.step.title}. ${state.step.body} ${counterA11y}`}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.title}>{state.step.title}</Text>
              <Text style={styles.body}>{state.step.body}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.counter} importantForAccessibility="no" accessibilityElementsHidden>
              {counter}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={onSkip}
                accessibilityRole="button"
                accessibilityLabel={skipLabel}
                accessibilityHint={t('tutorial.skipA11yHint')}
                style={styles.textButton}
                testID="tutorial-skip"
              >
                <Text style={styles.textButtonLabel}>{skipLabel}</Text>
              </Pressable>
              <Pressable
                onPress={onBack}
                disabled={isFirst}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                accessibilityState={{ disabled: isFirst }}
                style={[styles.textButton, isFirst && styles.disabled]}
                testID="tutorial-back"
              >
                <Text style={styles.textButtonLabel}>{backLabel}</Text>
              </Pressable>
              <Pressable
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel={nextLabel}
                style={styles.primaryButton}
                testID="tutorial-next"
              >
                <Text style={styles.primaryButtonLabel}>{nextLabel}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
