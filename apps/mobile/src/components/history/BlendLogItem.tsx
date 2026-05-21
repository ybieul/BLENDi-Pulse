import { Ionicons } from '@expo/vector-icons';
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

import { useDateFormat } from '../../hooks/useDateFormat';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { BlendLogEntry as BlendLog } from '../../services/blendLog.service';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const META_COLOR = 'rgba(255,255,255,0.55)';
const CARBS_COLOR = 'rgba(245,158,11,1)';
const CALORIES_COLOR = 'rgba(255,255,255,0.70)';
const STAR_FILLED_COLOR = '#facc15';
const STAR_IDLE_COLOR = 'rgba(255,255,255,0.24)';
const STAR_COUNT = 5;

interface BlendLogItemProps {
  item: BlendLog;
}

export function BlendLogItem({ item }: BlendLogItemProps) {
  const { t } = useAppTranslation();
  const { formatDate, formatTime } = useDateFormat();

  const recipeName = item.recipeName?.trim() || t('history.freeBlend');
  const gramsUnit = t('common.units.grams');
  const kilocaloriesUnit = t('common.units.kilocalories');
  const rating = typeof item.rating === 'number' ? Math.max(0, Math.min(item.rating, STAR_COUNT)) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.leftColumn}>
        <Text numberOfLines={1} style={styles.recipeName}>
          {recipeName}
        </Text>
        <Text numberOfLines={1} style={styles.dateTime}>
          {`${formatDate(item.createdAt)} • ${formatTime(item.createdAt)}`}
        </Text>
      </View>

      <View style={styles.rightColumn}>
        <View style={styles.macrosRow}>
          <Text style={[styles.macroText, styles.protein]}>{`${Math.round(item.protein)}${gramsUnit}`}</Text>
          <Text style={[styles.macroText, styles.carbs]}>{`${Math.round(item.carbs)}${gramsUnit}`}</Text>
          <Text style={[styles.macroText, styles.calories]}>{`${Math.round(item.calories)} ${kilocaloriesUnit}`}</Text>
        </View>

        {rating > 0 ? (
          <View style={styles.ratingRow}>
            {Array.from({ length: STAR_COUNT }, (_, index) => (
              <Ionicons
                key={`${item.id}-star-${index + 1}`}
                color={index < rating ? STAR_FILLED_COLOR : STAR_IDLE_COLOR}
                name="star"
                size={10}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 82,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  leftColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  recipeName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  dateTime: {
    color: META_COLOR,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
  },
  macrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  protein: {
    color: colors.brand.pulse,
  },
  carbs: {
    color: CARBS_COLOR,
  },
  calories: {
    color: CALORIES_COLOR,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});