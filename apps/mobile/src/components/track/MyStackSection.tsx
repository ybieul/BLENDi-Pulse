import { useEffect, useRef } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { SupplementStackItem } from '../../services/supplementStack.service';
import { SupplementCheckItem } from './SupplementCheckItem';

const CARD_BACKGROUND = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const EMPTY_TEXT_OPACITY = 0.6;
const PROGRESS_OPACITY = 0.6;
const COMPLETION_SCALE = 1.15;

function triggerSuccessHaptic() {
  if (Platform.OS === 'web') {
    return;
  }

  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

export interface MyStackSectionProps {
  supplements: SupplementStackItem[];
  onIncrement: (supplement: SupplementStackItem) => void;
  onDecrement: (supplement: SupplementStackItem) => void;
  onManage: () => void;
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export function MyStackSection({
  supplements,
  onIncrement,
  onDecrement,
  onManage,
}: MyStackSectionProps) {
  const { t } = useAppTranslation();
  const progressScale = useRef(new Animated.Value(1)).current;
  const wasCompleteRef = useRef(false);

  const totalCount = supplements.length;
  const checkedCount = supplements.filter((item) => item.checkedToday).length;
  const isComplete = totalCount > 0 && checkedCount === totalCount;

  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      triggerSuccessHaptic();

      Animated.sequence([
        Animated.spring(progressScale, {
          toValue: COMPLETION_SCALE,
          stiffness: 320,
          damping: 16,
          mass: 0.45,
          useNativeDriver: true,
        }),
        Animated.spring(progressScale, {
          toValue: 1,
          stiffness: 280,
          damping: 18,
          mass: 0.4,
          useNativeDriver: true,
        }),
      ]).start();
    }

    wasCompleteRef.current = isComplete;

    return () => {
      progressScale.stopAnimation();
    };
  }, [isComplete, progressScale]);

  const progressLabel = isComplete
    ? `${checkedCount} / ${totalCount} ✓`
    : `${checkedCount} / ${totalCount}`;

  const renderItem: ListRenderItem<SupplementStackItem> = ({ item }) => (
    <SupplementCheckItem
      supplement={item}
      onIncrement={() => onIncrement(item)}
      onDecrement={() => onDecrement(item)}
    />
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('track.myStack')}</Text>
          {totalCount > 0 ? (
            <Animated.Text
              style={[
                styles.progressText,
                isComplete && styles.progressTextComplete,
                { transform: [{ scale: progressScale }] },
              ]}
            >
              {progressLabel}
            </Animated.Text>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={onManage}>
          <Text style={styles.manageButton}>{t('track.manageStack')}</Text>
        </Pressable>
      </View>

      {totalCount === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('track.noSupplements')}</Text>
          <Pressable accessibilityRole="button" onPress={onManage}>
            <Text style={styles.addLink}>{t('track.addSupplement')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={supplements}
          scrollEnabled={false}
          keyExtractor={(item) => item.supplementId}
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  progressText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    opacity: PROGRESS_OPACITY,
  },
  progressTextComplete: {
    color: colors.feedback.success,
    opacity: 1,
  },
  manageButton: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  emptyText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    opacity: EMPTY_TEXT_OPACITY,
  },
  addLink: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  separator: {
    height: spacing.md,
  },
});