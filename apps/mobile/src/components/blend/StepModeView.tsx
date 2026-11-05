import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { PulseAiRecipe } from '@blendi/shared';

import {
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { AuthButton } from '../ui/AuthButton';

export type StepModeViewStep = NonNullable<PulseAiRecipe['steps']>[number];

export interface StepModeViewProps {
  steps: StepModeViewStep[];
  onComplete: () => void;
}

const NAV_BUTTON_DISABLED_OPACITY = 0.4;

export function StepModeView({ steps, onComplete }: StepModeViewProps) {
  const colors = useColors();
  const { t } = useAppTranslation();

  const [stepIndex, setStepIndex] = useState(0);
  const [pulseTaps, setPulseTaps] = useState(0);

  const currentStep = steps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  const handleBack = () => {
    if (isFirstStep) return;
    setPulseTaps(0);
    setStepIndex((prev) => prev - 1);
  };

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setPulseTaps(0);
    setStepIndex((prev) => prev + 1);
  };

  const handlePulseTap = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPulseTaps((prev) => prev + 1);
  };

  const NAV_BUTTON_BACKGROUND = colors.overlay.plum[8];
  const NAV_BUTTON_BORDER = colors.overlay.plum[12];
  const PULSE_BUTTON_BACKGROUND = colors.overlay.pulse[20];
  const PULSE_BUTTON_BORDER = colors.overlay.pulse[40];

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
    },
    counter: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      opacity: 0.6,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    stepText: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['2xl'],
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes['2xl'] * lineHeights.relaxed,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    pulseButton: {
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: PULSE_BUTTON_BORDER,
      backgroundColor: PULSE_BUTTON_BACKGROUND,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      minWidth: 160,
    },
    pulseButtonLabel: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
    },
    pulseCounter: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.regular,
      opacity: 0.7,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      width: '100%',
      paddingHorizontal: spacing.lg,
    },
    navButton: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: NAV_BUTTON_BORDER,
      backgroundColor: NAV_BUTTON_BACKGROUND,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
    },
    navButtonDisabled: {
      opacity: NAV_BUTTON_DISABLED_OPACITY,
    },
    navButtonLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
    },
    nextButton: {
      flex: 1,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>
        {t('blend.stepCounter', { current: stepIndex + 1, total: steps.length })}
      </Text>

      <Text style={styles.stepText}>{currentStep.text}</Text>

      {currentStep.pulseCount !== undefined && (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            void handlePulseTap();
          }}
          style={styles.pulseButton}
        >
          <Text style={styles.pulseButtonLabel}>{t('blend.pulseButton')}</Text>
          <Text style={styles.pulseCounter}>
            {t('blend.pulseCounter', { current: pulseTaps, target: currentStep.pulseCount })}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isFirstStep}
          onPress={handleBack}
          style={[styles.navButton, isFirstStep && styles.navButtonDisabled]}
        >
          <Text style={styles.navButtonLabel}>{t('blend.stepBack')}</Text>
        </TouchableOpacity>

        <AuthButton onPress={handleNext} style={styles.nextButton}>
          {t('blend.stepNext')}
        </AuthButton>
      </View>
    </View>
  );
}
