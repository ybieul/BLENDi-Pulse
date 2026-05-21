import { StyleSheet, Text } from 'react-native';

import { fontSizes, fonts } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';

const STALE_TEXT_COLOR = 'rgba(255,255,255,0.40)';
const STALE_WARNING_COLOR = 'rgba(245,158,11,0.60)';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_HOURS = 24;

export interface StaleDataIndicatorProps {
  dataUpdatedAt: number;
}

export function StaleDataIndicator({ dataUpdatedAt }: StaleDataIndicatorProps) {
  const { t } = useAppTranslation();

  if (!Number.isFinite(dataUpdatedAt) || dataUpdatedAt <= 0) {
    return null;
  }

  const hoursSinceUpdate = Math.floor((Date.now() - dataUpdatedAt) / ONE_HOUR_MS);

  if (hoursSinceUpdate < 1) {
    return null;
  }

  return (
    <Text
      pointerEvents="none"
      style={[
        styles.label,
        hoursSinceUpdate >= ONE_DAY_HOURS ? styles.labelWarning : null,
      ]}
    >
      {hoursSinceUpdate >= ONE_DAY_HOURS && hoursSinceUpdate < ONE_DAY_HOURS * 2
        ? t('common.lastUpdatedYesterday')
        : t('common.lastUpdated', { hours: hoursSinceUpdate })}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    color: STALE_TEXT_COLOR,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs - 1,
    lineHeight: 12,
  },
  labelWarning: {
    color: STALE_WARNING_COLOR,
  },
});