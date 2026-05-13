import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DEFAULT_SIZE = 220;
const STROKE_WIDTH = 12;
const READY_RING_COLOR = 'rgba(255,255,255,0.20)';
const RUNNING_TRACK_COLOR = 'rgba(255,255,255,0.12)';
const SUBLABEL_READY_COLOR = 'rgba(255,255,255,0.50)';
const SUBLABEL_STOPPED_COLOR = 'rgba(255,255,255,0.50)';
const COMPLETION_ICON_SCALE_OVERSHOOT = 1.2;
const DASH_ANIMATION_DURATION_MS = 220;
const NUMBER_PULSE_DURATION_MS = 100;

export type TimerCircleStatus = 'ready' | 'running' | 'completed' | 'stopped';

export interface TimerCircleProps {
  duration: number;
  status: TimerCircleStatus;
  onComplete: () => void;
  size?: number;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TimerCircle({
  duration,
  status,
  onComplete,
  size = DEFAULT_SIZE,
}: TimerCircleProps) {
  const { t } = useAppTranslation();

  const [remainingSeconds, setRemainingSeconds] = useState(duration);

  const center = size / 2;
  const radius = Math.max((size - STROKE_WIDTH) / 2, 0);
  const circumference = 2 * Math.PI * radius;

  const totalDurationRef = useRef(duration);
  const remainingSecondsRef = useRef(duration);
  const previousStatusRef = useRef<TimerCircleStatus>(status);
  const completionTriggeredRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  const dashOffset = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const completionScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (status === 'running') {
      if (previousStatusRef.current !== 'running') {
        totalDurationRef.current = duration;
        remainingSecondsRef.current = duration;
        setRemainingSeconds(duration);
        completionTriggeredRef.current = false;
      }
    } else {
      remainingSecondsRef.current = duration;
      setRemainingSeconds(duration);

      if (status === 'ready') {
        totalDurationRef.current = duration;
        completionTriggeredRef.current = false;
      }
    }

    if (status !== 'completed') {
      completionScale.setValue(0);
    }

    previousStatusRef.current = status;
  }, [completionScale, duration, status]);

  useEffect(() => {
    if (status !== 'running') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.05,
          duration: NUMBER_PULSE_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: NUMBER_PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      const nextRemainingSeconds = Math.max(remainingSecondsRef.current - 1, 0);
      remainingSecondsRef.current = nextRemainingSeconds;
      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds === 0 && !completionTriggeredRef.current) {
        completionTriggeredRef.current = true;
        clearInterval(intervalId);
        onCompleteRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [pulseScale, status]);

  const progress = (() => {
    if (status === 'completed') {
      return 0;
    }

    if (status === 'running') {
      if (totalDurationRef.current <= 0) {
        return 0;
      }

      return Math.max(0, Math.min(remainingSeconds / totalDurationRef.current, 1));
    }

    return 1;
  })();

  const targetDashOffset = circumference * (1 - progress);

  useEffect(() => {
    const animation = Animated.timing(dashOffset, {
      toValue: targetDashOffset,
      duration: DASH_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [dashOffset, targetDashOffset]);

  useEffect(() => {
    if (status !== 'completed') {
      return undefined;
    }

    completionScale.setValue(0);

    const animation = Animated.sequence([
      Animated.spring(completionScale, {
        toValue: COMPLETION_ICON_SCALE_OVERSHOOT,
        stiffness: 260,
        damping: 14,
        mass: 0.65,
        useNativeDriver: true,
      }),
      Animated.spring(completionScale, {
        toValue: 1,
        stiffness: 320,
        damping: 18,
        mass: 0.6,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [completionScale, status]);

  const ringColor = status === 'running'
    ? colors.brand.pulse
    : status === 'completed'
      ? colors.feedback.success
      : READY_RING_COLOR;

  const trackColor = status === 'running' ? RUNNING_TRACK_COLOR : 'transparent';

  const statusLabel = status === 'completed'
    ? t('blend.done')
    : status === 'running'
      ? t('blend.blending')
      : t('blend.ready');

  const statusLabelColor = status === 'completed'
    ? colors.feedback.success
    : status === 'running'
      ? colors.brand.pulse
      : status === 'stopped'
        ? SUBLABEL_STOPPED_COLOR
        : SUBLABEL_READY_COLOR;

  const iconSize = Math.round(size * 0.28);

  return (
    <View style={[styles.container, { width: size, height: size }]}> 
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} originX={center} originY={center}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={trackColor}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </G>
      </Svg>

      <View pointerEvents="none" style={styles.content}>
        {status === 'completed' ? (
          <Animated.View style={{ transform: [{ scale: completionScale }] }}>
            <Ionicons name="checkmark" size={iconSize} color={colors.feedback.success} />
          </Animated.View>
        ) : (
          <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
            <Text style={styles.timerValue}>{formatDuration(remainingSeconds)}</Text>
          </Animated.View>
        )}

        <Text style={[styles.statusLabel, { color: statusLabelColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerValue: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: fontWeights.bold,
    letterSpacing: -2,
    lineHeight: 58,
  },
  statusLabel: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.2,
  },
});