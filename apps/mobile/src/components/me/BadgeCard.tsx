import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, fontWeights } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { UserBadge } from '../../utils/badges.utils';

const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const LOCKED_ICON_COLOR = 'rgba(255,255,255,0.40)';
const STAGE_LABEL_COLOR = 'rgba(255,255,255,0.60)';
const BRONZE_BORDER_GLOW = 'rgba(205,127,50,0.40)';
const SILVER_BORDER_GLOW = 'rgba(192,192,192,0.40)';
const GOLD_BORDER_GLOW = 'rgba(255,215,0,0.40)';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

export interface BadgeCardProps {
  badge: UserBadge;
  onPress: () => void;
}

function getStageLabelKey(currentStage: UserBadge['currentStage']): TranslationKey {
  switch (currentStage) {
    case 'bronze':
      return 'me.badges.bronze';
    case 'silver':
      return 'me.badges.silver';
    case 'gold':
      return 'me.badges.gold';
    default:
      return 'me.badges.locked';
  }
}

export function BadgeCard({ badge, onPress }: BadgeCardProps) {
  const { t } = useAppTranslation();
  const isLocked = badge.currentStage === 'locked';
  const iconColor = isLocked ? LOCKED_ICON_COLOR : badge.iconColor;
  const cardStateStyle =
    badge.currentStage === 'bronze'
      ? styles.cardBronze
      : badge.currentStage === 'silver'
        ? styles.cardSilver
        : badge.currentStage === 'gold'
          ? styles.cardGold
          : styles.cardLocked;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, cardStateStyle]}
    >
      <Ionicons name={badge.icon as IoniconName} size={24} color={iconColor} style={styles.icon} />

      <Text numberOfLines={2} style={styles.title}>
        {t(badge.titleKey as TranslationKey)}
      </Text>

      <Text numberOfLines={1} style={styles.stageLabel}>
        {t(getStageLabelKey(badge.currentStage))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 88,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: CARD_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  cardBronze: {
    borderColor: BRONZE_BORDER_GLOW,
    shadowColor: BRONZE_BORDER_GLOW,
    opacity: 1,
  },
  cardSilver: {
    borderColor: SILVER_BORDER_GLOW,
    shadowColor: SILVER_BORDER_GLOW,
    opacity: 1,
  },
  cardGold: {
    borderColor: GOLD_BORDER_GLOW,
    shadowColor: GOLD_BORDER_GLOW,
    opacity: 1,
  },
  cardLocked: {
    borderColor: CARD_BORDER,
    shadowOpacity: 0,
    opacity: 0.35,
  },
  icon: {
    marginBottom: 10,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.medium,
    lineHeight: 14,
    textAlign: 'center',
    marginBottom: 6,
  },
  stageLabel: {
    color: STAGE_LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
    lineHeight: 12,
    textAlign: 'center',
  },
});