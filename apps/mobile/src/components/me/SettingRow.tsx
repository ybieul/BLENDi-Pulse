import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableHighlight, View } from 'react-native';

import { colors, fonts, fontWeights, spacing } from '@blendi/shared';

const UNDERLAY_COLOR = 'rgba(255,255,255,0.04)';
const VALUE_COLOR = 'rgba(255,255,255,0.55)';
const CHEVRON_COLOR = 'rgba(255,255,255,0.30)';

export interface SettingRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

export function SettingRow({ label, value, onPress }: SettingRowProps) {
  return (
    <TouchableHighlight
      accessibilityRole="button"
      onPress={onPress}
      style={styles.touchable}
      underlayColor={UNDERLAY_COLOR}
    >
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>

        <View style={styles.valueGroup}>
          <Text numberOfLines={1} style={styles.value}>
            {value}
          </Text>

          <Ionicons color={CHEVRON_COLOR} name="chevron-forward" size={16} />
        </View>
      </View>
    </TouchableHighlight>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: 12,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  label: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    lineHeight: 20,
  },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '52%',
  },
  value: {
    color: VALUE_COLOR,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    textAlign: 'right',
  },
});