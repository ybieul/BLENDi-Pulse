import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { ProfilePhoto } from '../profile/ProfilePhoto';
import { AuroraBackground } from '../ui/AuroraBackground';

const SHARE_CARD_BACKGROUND = '#2b1429';
const HERO_GLOW_TOP = ['rgba(245,158,11,0.18)', 'transparent'] as const;
const HERO_GLOW_BOTTOM = ['rgba(236,72,153,0.14)', 'transparent'] as const;
const ORB_PRIMARY_BACKGROUND = 'rgba(245,158,11,0.10)';
const ORB_SECONDARY_BACKGROUND = 'rgba(236,72,153,0.10)';
const UNLOCK_LABEL_COLOR = 'rgba(255,255,255,0.7)';
const CARD_DIMENSION = 1080;

export interface AchievementShareCardProfile {
  userId?: string;
  name: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | Date | null;
}

export interface AchievementShareCardProps {
  level: number;
  levelNameKey: string;
  user: AchievementShareCardProfile;
}

export type AchievementShareCardHandle = React.ElementRef<typeof ViewShot>;

export const AchievementShareCard = forwardRef<AchievementShareCardHandle, AchievementShareCardProps>(
  function AchievementShareCard({ level, levelNameKey, user }, ref) {
    const { t } = useAppTranslation();
    const userName = user.name.trim() || t('share.defaultUser');

    return (
      <View pointerEvents="none" style={styles.offscreenRoot}>
        <ViewShot ref={ref} style={styles.captureRoot}>
          <View style={styles.backgroundLayer} />
          <View style={styles.auroraLayer}>
            <AuroraBackground intensity="full" />
          </View>

          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            <LinearGradient colors={HERO_GLOW_TOP} style={styles.topGlow} />
            <LinearGradient colors={HERO_GLOW_BOTTOM} style={styles.bottomGlow} />
            <View style={styles.orbPrimary} />
            <View style={styles.orbSecondary} />
          </View>

          <View style={styles.content}>
            <View style={styles.centerContent}>
              <Text style={styles.levelNumber}>{level}</Text>
              <Text style={styles.levelName}>{t(levelNameKey, { level })}</Text>
              <Text style={styles.levelUnlockLabel}>{t('share.levelUnlocked')}</Text>
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
  }
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
    opacity: 0.78,
  },
  topGlow: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    height: 320,
  },
  bottomGlow: {
    position: 'absolute',
    left: -80,
    right: -40,
    bottom: -40,
    height: 360,
  },
  orbPrimary: {
    position: 'absolute',
    top: 136,
    right: 138,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: ORB_PRIMARY_BACKGROUND,
  },
  orbSecondary: {
    position: 'absolute',
    bottom: 224,
    left: 92,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: ORB_SECONDARY_BACKGROUND,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 84,
    paddingTop: 96,
    paddingBottom: 72,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
  },
  levelNumber: {
    color: colors.brand.pulse,
    fontFamily: fonts.display,
    fontSize: 120,
    fontWeight: fontWeights.bold,
    letterSpacing: -6,
    textAlign: 'center',
  },
  levelName: {
    marginTop: 56,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  levelUnlockLabel: {
    marginTop: 18,
    color: UNLOCK_LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
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