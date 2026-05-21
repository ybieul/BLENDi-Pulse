import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { SkeletonLoader } from '../ui/SkeletonLoader';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const LABEL_COLOR = 'rgba(255,255,255,0.55)';
const DEFAULT_ICON_COLOR = colors.brand.pulse;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface StatCardProps {
  value: string;
  label: string;
  icon?: IoniconName;
  iconColor?: string;
  flex?: number;
  isLoading?: boolean;
}

export function StatCard({
  value,
  label,
  icon,
  iconColor = DEFAULT_ICON_COLOR,
  flex = 1,
  isLoading = false,
}: StatCardProps) {
  return (
    <View style={[styles.card, { flex }]}> 
      {icon ? <Ionicons name={icon} size={16} color={iconColor} style={styles.icon} /> : null}

      {isLoading ? (
        <SkeletonLoader variant="line" width={64} height={22} style={styles.valueSkeleton} />
      ) : (
        <Text numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      )}

      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER_COLOR,
    backgroundColor: CARD_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginBottom: 8,
  },
  valueSkeleton: {
    marginBottom: 6,
  },
  value: {
    marginBottom: 6,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  label: {
    color: LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
  },
});