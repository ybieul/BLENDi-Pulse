import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useDateFormat } from '../../hooks/useDateFormat';
import { ProfilePhoto } from '../profile/ProfilePhoto';
import { AuroraBackground } from '../ui/AuroraBackground';

const SHARE_CARD_BACKGROUND = '#2b1429';
const CARD_DIMENSION = 1080;
const BLOCK_BACKGROUND = 'rgba(255,255,255,0.08)';
const BLOCK_BORDER = 'rgba(255,255,255,0.10)';
const LABEL_COLOR = 'rgba(255,255,255,0.7)';
const ICON_COLOR = 'rgba(255,255,255,0.72)';

export interface WeeklyShareCardProfile {
  userId?: string;
  name: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | Date | null;
}

export interface WeeklyShareCardProps {
  weekStart: string;
  weekEnd: string;
  totalBlends: number;
  averageDailyProtein: number;
  currentStreak: number;
  supplementAdherenceRate: number;
  user: WeeklyShareCardProfile;
}

export type WeeklyShareCardHandle = React.ElementRef<typeof ViewShot>;

interface WeeklyStatItem {
  key: 'blends' | 'protein' | 'streak' | 'adherence';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
}

function formatWeekRange(
  weekStart: string,
  weekEnd: string,
  locale: string,
  formatDate: (value: Date | number | string) => string,
): string {
  const startLabel = formatDate(weekStart);
  const endLabel = formatDate(weekEnd);

  if (locale === 'pt-BR') {
    const startMatch = startLabel.match(/^(\d{1,2}) de (.+?)(?: de \d{4})?$/i);
    const endMatch = endLabel.match(/^(\d{1,2}) de (.+?)(?: de \d{4})?$/i);

    if (startMatch && endMatch) {
      if (startMatch[2].toLowerCase() === endMatch[2].toLowerCase()) {
        return `${startMatch[1]} — ${endMatch[1]} de ${endMatch[2]}`;
      }

      return `${startMatch[1]} de ${startMatch[2]} — ${endMatch[1]} de ${endMatch[2]}`;
    }

    return `${startLabel} — ${endLabel}`;
  }

  const startMatch = startLabel.match(/^(.+?) (\d{1,2})(?:, \d{4})?$/i);
  const endMatch = endLabel.match(/^(.+?) (\d{1,2})(?:, \d{4})?$/i);

  if (startMatch && endMatch) {
    if (startMatch[1].toLowerCase() === endMatch[1].toLowerCase()) {
      return `${startMatch[1]} ${startMatch[2]} — ${endMatch[2]}`;
    }

    return `${startMatch[1]} ${startMatch[2]} — ${endMatch[1]} ${endMatch[2]}`;
  }

  return `${startLabel} — ${endLabel}`;
}

export const WeeklyShareCard = forwardRef<WeeklyShareCardHandle, WeeklyShareCardProps>(
  function WeeklyShareCard(
    {
      weekStart,
      weekEnd,
      totalBlends,
      averageDailyProtein,
      currentStreak,
      supplementAdherenceRate,
      user,
    },
    ref,
  ) {
    const { t, locale } = useAppTranslation();
    const { formatDate } = useDateFormat();
    const userName = user.name.trim() || t('share.defaultUser');
    const weekLabel = useMemo(
      () => formatWeekRange(weekStart, weekEnd, locale, formatDate),
      [formatDate, locale, weekEnd, weekStart],
    );
    const statItems = useMemo<WeeklyStatItem[]>(
      () => [
        {
          key: 'blends',
          icon: 'flash-outline',
          value: String(totalBlends),
          label: t('me.totalBlends'),
        },
        {
          key: 'protein',
          icon: 'barbell-outline',
          value: `${Math.round(averageDailyProtein)}g`,
          label: t('me.weeklyShare.averageDailyProtein'),
        },
        {
          key: 'streak',
          icon: 'flame-outline',
          value: String(currentStreak),
          label: t('me.currentStreak'),
        },
        {
          key: 'adherence',
          icon: 'checkmark-circle-outline',
          value: `${Math.round(supplementAdherenceRate)}%`,
          label: t('me.weeklyShare.supplementAdherence'),
        },
      ],
      [averageDailyProtein, currentStreak, supplementAdherenceRate, t, totalBlends],
    );

    return (
      <View pointerEvents="none" style={styles.offscreenRoot}>
        <ViewShot ref={ref} style={styles.captureRoot}>
          <View style={styles.backgroundLayer} />
          <View style={styles.auroraLayer}>
            <AuroraBackground intensity="reduced" />
          </View>

          <View style={styles.content}>
            <Text style={styles.weekLabel}>{weekLabel}</Text>

            <View style={styles.statsGrid}>
              {statItems.map((item) => (
                <View key={item.key} style={styles.statBlock}>
                  <Ionicons color={ICON_COLOR} name={item.icon} size={22} />
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.bottomRow}>
              <View style={styles.userRow}>
                <ProfilePhoto
                  userId={user.userId}
                  fullName={userName}
                  hasProfilePhoto={user.hasProfilePhoto}
                  profilePhotoUpdatedAt={user.profilePhotoUpdatedAt}
                  size={48}
                />
                <Text numberOfLines={1} style={styles.userName}>
                  {userName}
                </Text>
              </View>

              <Text style={styles.brandLabel}>{t('share.brandName')}</Text>
            </View>
          </View>
        </ViewShot>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  offscreenRoot: {
    position: 'absolute',
    left: -20000,
    top: 0,
  },
  captureRoot: {
    width: CARD_DIMENSION,
    height: CARD_DIMENSION,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: SHARE_CARD_BACKGROUND,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SHARE_CARD_BACKGROUND,
  },
  auroraLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.42,
  },
  content: {
    flex: 1,
    paddingHorizontal: 84,
    paddingTop: 84,
    paddingBottom: 72,
    justifyContent: 'space-between',
  },
  weekLabel: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24,
  },
  statBlock: {
    width: '48.2%',
    minHeight: 250,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BLOCK_BORDER,
    backgroundColor: BLOCK_BACKGROUND,
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  statValue: {
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 48,
    fontWeight: fontWeights.bold,
    lineHeight: 54,
    letterSpacing: -2,
  },
  statLabel: {
    color: LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 20,
  },
  userName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  brandLabel: {
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
});