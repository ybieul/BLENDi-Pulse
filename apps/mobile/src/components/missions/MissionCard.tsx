import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { DailyMissionItem } from '../../services/dailyMission.service';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

interface MissionCardProps {
  mission: DailyMissionItem;
  icon: IoniconName;
}

const CARD_BACKGROUND_IDLE = 'rgba(255,255,255,0.07)';
const CARD_BACKGROUND_COMPLETED = 'rgba(34,197,94,0.10)';
const CARD_BORDER_IDLE = 'rgba(255,255,255,0.10)';
const CARD_BORDER_COMPLETED = 'rgba(34,197,94,0.30)';
const TRACK_COLOR = 'rgba(255,255,255,0.08)';
const TITLE_MARGIN_TOP = 6;
const PROGRESS_MARGIN_TOP = 8;

export function MissionCard({ mission, icon }: MissionCardProps) {
  const { t } = useAppTranslation();
  const cardState = useRef(new Animated.Value(mission.completed ? 1 : 0)).current;
  const iconState = useRef(new Animated.Value(mission.completed ? 1 : 0)).current;
  const progressValue = useRef(
    new Animated.Value(
      mission.completed
        ? 1
        : Math.max(0, Math.min(mission.progress / Math.max(1, mission.requirement), 1))
    )
  ).current;

  const normalizedProgress = useMemo(
    () => (mission.completed
      ? 1
      : Math.max(0, Math.min(mission.progress / Math.max(1, mission.requirement), 1))),
    [mission.completed, mission.progress, mission.requirement],
  );

  useEffect(() => {
    Animated.timing(cardState, {
      toValue: mission.completed ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [cardState, mission.completed]);

  useEffect(() => {
    Animated.timing(iconState, {
      toValue: mission.completed ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [iconState, mission.completed]);

  useEffect(() => {
    Animated.timing(progressValue, {
      toValue: normalizedProgress,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [normalizedProgress, progressValue]);

  const backgroundColor = cardState.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_BACKGROUND_IDLE, CARD_BACKGROUND_COMPLETED],
  });

  const borderColor = cardState.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_BORDER_IDLE, CARD_BORDER_COMPLETED],
  });

  const fillColor = cardState.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.brand.pulse, colors.feedback.success],
  });

  const defaultIconOpacity = iconState.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const completedIconOpacity = iconState.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const progressWidth = progressValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.card, { backgroundColor, borderColor }]}> 
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Animated.View style={[styles.iconLayer, { opacity: defaultIconOpacity }]}> 
            <Ionicons name={icon} size={22} color={colors.brand.pulse} />
          </Animated.View>

          <Animated.View style={[styles.iconLayer, { opacity: completedIconOpacity }]}> 
            <Ionicons name="checkmark-circle" size={22} color={colors.feedback.success} />
          </Animated.View>
        </View>

        <Text numberOfLines={2} style={styles.title}>
          {t(mission.titleKey as TranslationKey)}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: fillColor }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 22,
    height: 22,
    position: 'relative',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: TITLE_MARGIN_TOP,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.medium,
    lineHeight: 14,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 1.5,
    marginTop: PROGRESS_MARGIN_TOP,
    backgroundColor: TRACK_COLOR,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
