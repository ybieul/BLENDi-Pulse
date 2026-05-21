import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
} from 'react-native';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';

const PERIOD_OPTIONS = [7, 30, 90] as const;
const ANIMATION_DURATION = 200;
const CHIP_BACKGROUND_SELECTED = 'rgba(154,72,147,0.25)';
const CHIP_BACKGROUND_IDLE = 'rgba(255,255,255,0.06)';
const CHIP_BORDER_SELECTED = 'rgba(154,72,147,0.50)';
const CHIP_BORDER_IDLE = 'rgba(255,255,255,0.10)';
const CHIP_TEXT_IDLE = 'rgba(255,255,255,0.60)';

export type PeriodSelectorValue = (typeof PERIOD_OPTIONS)[number];

interface PeriodSelectorProps {
  selected: PeriodSelectorValue;
  onChange: (value: PeriodSelectorValue) => void;
}

interface PeriodChipProps {
  label: string;
  value: PeriodSelectorValue;
  selected: boolean;
  onPress: (value: PeriodSelectorValue) => void;
}

function PeriodChip({ label, value, selected, onPress }: PeriodChipProps) {
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, selected]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CHIP_BACKGROUND_IDLE, CHIP_BACKGROUND_SELECTED],
  });

  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CHIP_BORDER_IDLE, CHIP_BORDER_SELECTED],
  });

  const color = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CHIP_TEXT_IDLE, colors.brand.pulse],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onPress(value)}
      style={styles.pressable}
    >
      <Animated.View style={[styles.chip, { backgroundColor, borderColor }]}>
        <Animated.Text
          style={[
            styles.label,
            styles.labelBase,
            selected ? styles.labelSelected : styles.labelIdle,
            { color },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  const { t } = useAppTranslation();

  const labels: Record<PeriodSelectorValue, string> = {
    7: t('history.days7'),
    30: t('history.days30'),
    90: t('history.days90'),
  };

  return (
    <Animated.View style={styles.container}>
      {PERIOD_OPTIONS.map((value) => (
        <PeriodChip
          key={value}
          label={labels[value]}
          value={value}
          selected={selected === value}
          onPress={onChange}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressable: {
    alignSelf: 'flex-start',
  },
  chip: {
    height: 36,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBase: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  label: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  labelSelected: {
    fontWeight: fontWeights.medium,
  },
  labelIdle: {
    fontWeight: fontWeights.regular,
  },
});