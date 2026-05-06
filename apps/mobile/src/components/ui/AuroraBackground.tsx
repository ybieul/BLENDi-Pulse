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

// Duração de um ciclo completo (0→1): 8s. O loop faz 0→1→0, totalizando 16s por ciclo.
const AURORA_DURATION = 8000;

/**
 * AuroraBackground — fundo animado das telas de autenticação.
 *
 * Renderiza três fontes de luz púrpura ligeiramente dessincronizadas que
 * se intensificam e diminuem em loop, criando o efeito de aurora boreal
 * sobre o Deep Plum base. pointerEvents="none" garante que não interfere
 * com nenhum toque do usuário.
 */
export function AuroraBackground() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: AURORA_DURATION,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: AURORA_DURATION,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [progress]);

  // Aurora 1: cresce de 0.3 a 1.0 na primeira metade, volta na segunda
  const aurora1Opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.0, 0.3],
  });

  // Aurora 2: ciclo inverso — começa em 1.0, cai a 0.2 em 60%, volta a 1.0
  const aurora2Opacity = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1.0, 0.2, 1.0],
  });

  // Aurora 3: mais sutil — 0.5 nas extremidades, pico 1.0 entre 30% e 70%
  const aurora3Opacity = progress.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0.5, 1.0, 1.0, 0.5],
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
