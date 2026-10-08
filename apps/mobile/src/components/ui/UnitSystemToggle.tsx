import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';

type UnitSystem = 'metric' | 'imperial';

interface UnitSystemToggleProps {
  value: UnitSystem;
  onChange: (nextValue: UnitSystem) => void;
  metricLabel: string;
  imperialLabel: string;
}

const TOGGLE_BACKGROUND = colors.overlay.plum[7];
const TOGGLE_BORDER = colors.overlay.plum[10];
const TOGGLE_HIGHLIGHT = colors.overlay.plum[4];
const TOGGLE_SELECTED_BACKGROUND = colors.overlay.pulse[22];
const TOGGLE_SELECTED_BORDER = colors.overlay.pulse[55];

export function UnitSystemToggle({
  value,
  onChange,
  metricLabel,
  imperialLabel,
}: UnitSystemToggleProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'metric' }}
        onPress={() => { onChange('metric'); }}
        style={[styles.button, value === 'metric' && styles.buttonSelected]}
      >
        <View style={styles.highlight} />
        <Text style={[styles.label, value === 'metric' && styles.labelSelected]}>{metricLabel}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'imperial' }}
        onPress={() => { onChange('imperial'); }}
        style={[styles.button, value === 'imperial' && styles.buttonSelected]}
      >
        <View style={styles.highlight} />
        <Text style={[styles.label, value === 'imperial' && styles.labelSelected]}>{imperialLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: TOGGLE_BORDER,
    backgroundColor: TOGGLE_BACKGROUND,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonSelected: {
    borderColor: TOGGLE_SELECTED_BORDER,
    backgroundColor: TOGGLE_SELECTED_BACKGROUND,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    height: '50%',
    backgroundColor: TOGGLE_HIGHLIGHT,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.text.primary,
    fontWeight: fontWeights.bold,
  },
});