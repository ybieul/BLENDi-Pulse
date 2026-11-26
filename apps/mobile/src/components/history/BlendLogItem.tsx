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
import { useColors } from '../../hooks/useColors';
import { MacroChips } from '../ui/MacroChips';
import type { BlendLogEntry as BlendLog } from '../../services/blendLog.service';

const STAR_FILLED_COLOR = colors.rating.starFilled;
const STAR_COUNT = 5;

interface BlendLogItemProps {
  item: BlendLog;
}

export function BlendLogItem({ item }: BlendLogItemProps) {
  const colors = useColors();
  const CARD_BACKGROUND = colors.overlay.plum[7];
  const CARD_BORDER = colors.overlay.plum[10];
  const META_COLOR = colors.overlay.plum[55];
  const STAR_IDLE_COLOR = colors.overlay.plum[24];

  const { t } = useAppTranslation();
  const { formatDate, formatTime } = useDateFormat();

  const recipeName = item.recipeName?.trim() || t('history.freeBlend');
  const rating = typeof item.rating === 'number' ? Math.max(0, Math.min(item.rating, STAR_COUNT)) : 0;

  const styles = StyleSheet.create({
    card: {
      minHeight: 82,
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
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
  });

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
        {/* Número + nome visível (antes só a cor diferenciava os macros). */}
        <MacroChips
          variant="compact"
          integer
          protein={item.protein}
          carbs={item.carbs}
          calories={item.calories}
        />

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