// apps/mobile/src/components/ui/RingArc.tsx
// Desenho do anel (trilho + arco de progresso) compartilhado pelo GoalRing
// (Home e relatório semanal) e pela tela "Montando seu plano" do onboarding.
// Só desenha: quem usa decide como o dashOffset anda (animação, valor fixo).

import { Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingGeometry {
  center: number;
  radius: number;
  circumference: number;
}

export function getRingGeometry(size: number, strokeWidth: number): RingGeometry {
  const radius = Math.max((size - strokeWidth) / 2, 0);
  return { center: size / 2, radius, circumference: 2 * Math.PI * radius };
}

export interface RingArcProps {
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  /** circumference = vazio; 0 = cheio. */
  dashOffset: Animated.Value | Animated.AnimatedInterpolation<number>;
}

export function RingArc({ size, strokeWidth, color, trackColor, dashOffset }: RingArcProps) {
  const { center, radius, circumference } = getRingGeometry(size, strokeWidth);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} originX={center} originY={center}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </G>
    </Svg>
  );
}
