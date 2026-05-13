import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  borderRadius,
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { AuthButton } from '../ui/AuthButton';
import type { TimerCircleStatus } from './TimerCircle';

const ADJUST_BUTTON_SIZE = 44;
const ADJUST_BUTTON_BACKGROUND = 'rgba(255,255,255,0.08)';
const ADJUST_BUTTON_BORDER = 'rgba(255,255,255,0.12)';
const STOP_BUTTON_BACKGROUND = 'rgba(239,68,68,0.20)';
const STOP_BUTTON_BORDER = 'rgba(239,68,68,0.40)';

export interface TimerControlsProps {
  status: TimerCircleStatus;
  duration: number;
  onAdjust: (deltaSeconds: 5 | -5) => void;
  onStart: () => void;
  onStop: () => void;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TimerControls({
  status,
  duration,
  onAdjust,
  onStart,
  onStop,
}: TimerControlsProps) {
  const { t } = useAppTranslation();

  const handleAdjust = async (deltaSeconds: 5 | -5) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdjust(deltaSeconds);
  };

  if (status === 'completed') {
    return null;
  }

  if (status === 'running') {
    return (
      <View style={styles.container}>
        <AuthButton onPress={onStop} style={styles.stopButton}>
          <Text style={styles.stopButtonLabel}>{t('blend.stop')}</Text>
        </AuthButton>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.adjustRow}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            void handleAdjust(-5);
          }}
          style={styles.adjustButton}
        >
          <Ionicons color={colors.text.primary} name="remove" size={20} />
        </TouchableOpacity>

        <Text style={styles.durationLabel}>{formatDuration(duration)}</Text>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            void handleAdjust(5);
          }}
          style={styles.adjustButton}
        >
          <Ionicons color={colors.text.primary} name="add" size={20} />
        </TouchableOpacity>
      </View>

      <AuthButton onPress={onStart}>{t('blend.start')}</AuthButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.xl,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  adjustButton: {
    width: ADJUST_BUTTON_SIZE,
    height: ADJUST_BUTTON_SIZE,
    borderRadius: ADJUST_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADJUST_BUTTON_BACKGROUND,
    borderWidth: 1,
    borderColor: ADJUST_BUTTON_BORDER,
  },
  durationLabel: {
    minWidth: 88,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.6,
  },
  stopButton: {
    backgroundColor: STOP_BUTTON_BACKGROUND,
    borderWidth: 1,
    borderColor: STOP_BUTTON_BORDER,
    borderRadius: borderRadius.lg,
  },
  stopButtonLabel: {
    color: colors.feedback.error,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.5,
  },
});