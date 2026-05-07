import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@blendi/shared';

// Cor de base mais escura para o meio do gradiente vertical
const AURORA_BASE_MID = '#1a0d1a';

// Cores das auroras (usadas em JSX props — fora de StyleSheet.create)
const AURORA_1_COLORS = ['rgba(154,72,147,0.18)', 'transparent', 'transparent'] as const;
const AURORA_2_COLORS = ['transparent', 'rgba(120,40,120,0.12)', 'transparent'] as const;
const AURORA_3_COLORS = ['transparent', 'transparent', 'rgba(80,20,90,0.15)'] as const;

const FULL_AURORA_DURATION = 8000;
const REDUCED_AURORA_DURATION = 14000;
const REDUCED_OPACITY_MULTIPLIER = 0.6;

type AuroraIntensity = 'full' | 'reduced';

export interface AuroraBackgroundProps {
  intensity?: AuroraIntensity;
}

/**
 * AuroraBackground — fundo animado das telas de autenticação e Home.
 *
 * Renderiza três fontes de luz púrpura ligeiramente dessincronizadas que
 * se intensificam e diminuem em loop, criando o efeito de aurora boreal
 * sobre o Deep Plum base. pointerEvents="none" garante que não interfere
 * com nenhum toque do usuário.
 */
export function AuroraBackground({ intensity = 'full' }: AuroraBackgroundProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const animationDuration = intensity === 'reduced'
    ? REDUCED_AURORA_DURATION
    : FULL_AURORA_DURATION;
  const opacityMultiplier = intensity === 'reduced' ? REDUCED_OPACITY_MULTIPLIER : 1;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: animationDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: animationDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [animationDuration, progress]);

  // Aurora 1: cresce de 0.3 a 1.0 na primeira metade, volta na segunda
  const aurora1Opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.0, 0.3].map(value => value * opacityMultiplier),
  });

  // Aurora 2: ciclo inverso — começa em 1.0, cai a 0.2 em 60%, volta a 1.0
  const aurora2Opacity = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1.0, 0.2, 1.0].map(value => value * opacityMultiplier),
  });

  // Aurora 3: mais sutil — 0.5 nas extremidades, pico 1.0 entre 30% e 70%
  const aurora3Opacity = progress.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0.5, 1.0, 1.0, 0.5].map(value => value * opacityMultiplier),
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {/* Camada base — gradiente vertical estático em Deep Plum */}
      <LinearGradient
        colors={[colors.background.primary, AURORA_BASE_MID, colors.background.primary]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Aurora 1 — canto superior esquerdo, diagonal */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: aurora1Opacity }]}>
        <LinearGradient
          colors={AURORA_1_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Aurora 2 — canto superior direito, diagonal inversa */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: aurora2Opacity }]}>
        <LinearGradient
          colors={AURORA_2_COLORS}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Aurora 3 — profundidade inferior, vertical */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: aurora3Opacity }]}>
        <LinearGradient
          colors={AURORA_3_COLORS}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}
