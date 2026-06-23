// apps/mobile/src/screens/HomeScreen.tsx
// Tela principal do BLENDi Pulse — exibida após onboarding.
//
// ── Arquitetura de dados ──────────────────────────────────────────────────────
// Duas queries paralelas gerenciam o estado da tela:
//   1. userProfile → GET /users/me       (staleTime: USER_PROFILE_TTL = 15 min)
//   2. blendLogsToday → GET /blend-logs/today  (staleTime: HYDRATION_TODAY_TTL = 1h)
//   3. hydrationToday → GET /hydration-logs/today (staleTime: 1h, retry: 0)
//
// Durante o carregamento, skeletons substituem saudação e cards de conteúdo.
// Quando os dados chegam, um fade de 300 ms substitui os skeletons.
//
// ── Estrutura de layout (ScrollView) ─────────────────────────────────────────
//   safe area top + 16  →  greetingContainer (px 24) + badge absoluto
//   20                  →  QuickActionTrigger (px 24)
//   24                  →  GoalRingsSection (px 24)
//   24                  →  StreakBadge (px 24)
//   20                  →  título "Quick Start" (px 24)
//   12                  →  QuickProtocolCards (pl 24, sangra à direita)
//   24                  →  DailyRecipeCard (px 24)
//   8

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  calculateLevel,
  colors,
  fonts,
  fontSizes,
  fontWeights,
} from '@blendi/shared';
import { api } from '../config/api';
import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { LevelDetailSheet } from '../components/gamification/LevelDetailSheet';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useDateFormat } from '../hooks/useDateFormat';
import { useAuthStore } from '../store/auth.store';
import { useGamificationStore } from '../store/gamification.store';
import { usePulseAIStore } from '../store/pulseAi.store';
import { logWater, getHydrationToday } from '../services/hydration.service';
import { getTodayLogs, type BlendLogsTodayData } from '../services/blendLog.service';
import type { AppTabScreenProps } from '../navigation/types';

import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ProfileSkeleton, RecipeCardSkeleton, SkeletonLoader } from '../components/ui';
import { GoalRingsSection } from '../components/home/GoalRingsSection';
import { QuickActionTrigger } from '../components/home/QuickActionTrigger';
import { StreakBadge } from '../components/home/StreakBadge';
import { QuickProtocolCards } from '../components/home/QuickProtocolCards';
import type { QuickProtocol } from '../components/home/QuickProtocolCards';
import { DailyRecipeCard } from '../components/home/DailyRecipeCard';
import { MissionCard } from '../components/missions/MissionCard';
import { MissionCompletionToast } from '../components/missions/MissionCompletionToast';
import { getDailyMissions } from '../services/dailyMission.service';
import type { DailyMissionItem } from '../services/dailyMission.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const FADE_DURATION = 300;
/** Meta padrão de hidratação diária enquanto o endpoint não retorna meta personalizada. */
const HYDRATION_TARGET_ML = 2000;
const BADGE_HEIGHT = 24;
const BADGE_PADDING_H = 10;
const BADGE_FREE_BACKGROUND = 'rgba(255,255,255,0.08)';
const BADGE_FREE_BORDER = 'rgba(255,255,255,0.12)';
const BADGE_PRO_BACKGROUND = 'rgba(154,72,147,0.25)';
const BADGE_PRO_BORDER = 'rgba(154,72,147,0.40)';
const LEVEL_PROGRESS_TRACK_COLOR = 'rgba(255,255,255,0.10)';
const LEVEL_PROGRESS_BAR_WIDTH = 40;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const MISSION_ICON_MAP: Record<string, IoniconName> = {
  makeBlend: 'nutrition-outline',
  makeBlendFromFavorite: 'heart-outline',
  favoriteRecipe: 'heart-outline',
  hitProteinGoal: 'barbell-outline',
  hitCalorieGoal: 'flame-outline',
  hitHydrationGoal: 'water-outline',
  completeSuppStack: 'checkmark-circle-outline',
};
const DEFAULT_MISSION_ICON: IoniconName = 'trophy-outline';

// ─── Response types ───────────────────────────────────────────────────────────

type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';

interface UserProfileData {
  id: string;
  name: string;
  email: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  preferredLanguage: string;
  timezone: string;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  profilePhoto?: string;
  streakDays: number;
  totalBlends: number;
  totalXP: number;
}

interface UserProfileResponse {
  success: true;
  data: {
    user: UserProfileData;
  };
}

async function fetchUserProfile(): Promise<UserProfileResponse> {
  const response = await api.get<UserProfileResponse>('/users/me');
  return response.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determina a chave de saudação baseada na hora local do dispositivo.
 * Usa new Date().getHours() que retorna horas no timezone do dispositivo —
 * consistente com o timezone lido por useDateFormat via Intl.
 */
function getGreetingKey(): 'home.greeting_morning' | 'home.greeting_afternoon' | 'home.greeting_evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greeting_morning';
  if (hour < 18) return 'home.greeting_afternoon';
  return 'home.greeting_evening';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function HomeScreen({ navigation }: AppTabScreenProps<'Home'>) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { formatDate } = useDateFormat();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const setGamificationTotalXP = useGamificationStore((state) => state.setTotalXP);
  const totalXP = useGamificationStore((state) => state.totalXP);
  const setPendingProtocol = usePulseAIStore((state) => state.setPendingProtocol);
  const triggerLevelUp = useGamificationStore((state) => state.triggerLevelUp);
  const pendingLevelUp = useGamificationStore((state) => state.pendingLevelUp);
  const clearPendingLevelUp = useGamificationStore((state) => state.clearPendingLevelUp);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLevelDetail, setShowLevelDetail] = useState(false);
  const [pendingMissionXP, setPendingMissionXP] = useState<number | null>(null);
  const [showMissionToast, setShowMissionToast] = useState(false);
  const prevMissionsRef = useRef<DailyMissionItem[] | null>(null);
  const levelInfo = useMemo(() => calculateLevel(totalXP), [totalXP]);
  const initialLevelProgressWidth = useRef(levelInfo.progress * LEVEL_PROGRESS_BAR_WIDTH).current;
  const levelProgressWidth = useRef(new Animated.Value(initialLevelProgressWidth)).current;

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: missionsData, isLoading: isLoadingMissions } = useQuery({
    queryKey: QUERY_KEYS.dailyMissions,
    queryFn: getDailyMissions,
    staleTime: CACHE_CONFIG.DAILY_MISSIONS_TTL,
  });

  const { data: profileResponse, isLoading: isLoadingProfile, refetch: refetchProfile } =
    useQuery<UserProfileResponse, Error, UserProfileResponse, typeof QUERY_KEYS.userProfile>({
      queryKey: QUERY_KEYS.userProfile,
      queryFn: fetchUserProfile,
      staleTime: CACHE_CONFIG.USER_PROFILE_TTL,
    });

  const {
    data: logsResponse,
    isLoading: isLoadingLogs,
    dataUpdatedAt: blendLogsUpdatedAt,
    refetch: refetchBlendLogs,
  } =
    useQuery<BlendLogsTodayData>({
      queryKey: QUERY_KEYS.blendLogsToday,
      queryFn: getTodayLogs,
      staleTime: CACHE_CONFIG.HYDRATION_TODAY_TTL,
    });

  // hydrationToday — retry: 0 porque o endpoint será implementado em uma parte futura
  const { data: hydrationResponse, refetch: refetchHydration } = useQuery({
    queryKey: QUERY_KEYS.hydrationToday,
    queryFn: getHydrationToday,
    staleTime: CACHE_CONFIG.HYDRATION_TODAY_TTL,
    retry: 0,
  });

  const isLoading = isLoadingProfile || isLoadingLogs;

  // ── Fade in quando dados chegam ───────────────────────────────────────────

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, fadeAnim]);

  useEffect(() => {
    const animation = Animated.timing(levelProgressWidth, {
      toValue: levelInfo.progress * LEVEL_PROGRESS_BAR_WIDTH,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [levelInfo.progress, levelProgressWidth]);

  useEffect(() => {
    if (pendingLevelUp === null || showMissionToast) {
      return;
    }

    triggerLevelUp(pendingLevelUp);
    clearPendingLevelUp();
  }, [clearPendingLevelUp, pendingLevelUp, showMissionToast, triggerLevelUp]);

  useEffect(() => {
    const missions = missionsData?.missions;

    if (!missions) {
      prevMissionsRef.current = null;
      return;
    }

    const prev = prevMissionsRef.current;
    prevMissionsRef.current = missions;

    if (!prev) {
      return;
    }

    const newlyCompleted = missions.filter((m) => {
      const prevMission = prev.find((p) => p.missionId === m.missionId);
      return prevMission !== undefined && !prevMission.completed && m.completed;
    });

    if (newlyCompleted.length === 0) {
      return;
    }

    const totalXP = newlyCompleted.reduce((sum, m) => sum + m.xpReward, 0);
    setPendingMissionXP(totalXP);
    setShowMissionToast(true);
  }, [missionsData?.missions]);

  useEffect(() => {
    const fetchedTotalXP = profileResponse?.data.user.totalXP;

    if (typeof fetchedTotalXP !== 'number') {
      return;
    }

    setGamificationTotalXP(fetchedTotalXP);
  }, [profileResponse?.data.user.totalXP, setGamificationTotalXP]);

  // ── Dados derivados ───────────────────────────────────────────────────────

  const profile = profileResponse?.data.user;
  const logsData = logsResponse;
  const hydrationData = hydrationResponse?.data;

  const displayName = profile?.name ?? authUser?.name ?? '';
  const greeting = t(getGreetingKey(), { name: displayName });
  const formattedDate = formatDate(new Date());

  // Pro se o modelo for ProPlus ou Steel; Free se for Lite ou indefinido
  const isPro = (profile?.blendiModel ?? authUser?.blendiModel) !== 'Lite';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogWater = useCallback(async () => {
    await logWater();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationHistory }),
    ]);
  }, [queryClient]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await Promise.allSettled([
        refetchProfile(),
        refetchBlendLogs(),
        refetchHydration(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetchBlendLogs, refetchHydration, refetchProfile]);

  const handleProtocolSelect = useCallback(
    (protocol: QuickProtocol) => {
      setPendingProtocol(protocol.prompt);
      navigation.navigate('PulseAI', { screen: 'PulseAIChat' });
    },
    [navigation, setPendingProtocol],
  );

  const handleStartBlend = useCallback(() => {
    navigation.navigate('Blend');
  }, [navigation]);

  const handleMissionToastDismiss = useCallback(() => {
    setShowMissionToast(false);
    setPendingMissionXP(null);

    if (pendingLevelUp !== null) {
      const levelUpToTrigger = pendingLevelUp;
      clearPendingLevelUp();
      setTimeout(() => {
        triggerLevelUp(levelUpToTrigger);
      }, 500);
    }
  }, [clearPendingLevelUp, pendingLevelUp, triggerLevelUp]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Aurora cobre toda a tela via absoluteFillObject interno */}
      <AuroraBackground intensity="reduced" />

      <ScrollView
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={colors.brand.pulse}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16 },
        ]}
      >
        {isLoading ? (
          // ── Estado de carregamento ──────────────────────────────────────
          <View style={styles.skeletonContainer}>
            <View style={styles.skeletonHeader}>
              <ProfileSkeleton />
            </View>
            <RecipeCardSkeleton />
            <View style={styles.skeletonSpacer} />
            <RecipeCardSkeleton />
          </View>
        ) : (
          // ── Estado de conteúdo com fade in 300 ms ──────────────────────
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ── Saudação + badge de plano ───────────────────────────────── */}
            <View style={styles.greetingContainer}>
              <Text style={styles.greetingText}>{greeting}</Text>
              <Text style={styles.greetingDate}>{formattedDate}</Text>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  onPress={() => {
                    setShowLevelDetail(true);
                  }}
                  style={styles.levelIndicatorButton}
                >
                  <View style={styles.levelIndicatorContent}>
                    <Text style={styles.levelIndicatorText}>
                      {`${t('gamification.levelPrefix')} ${levelInfo.level}`}
                    </Text>
                    <View style={styles.levelIndicatorTrack}>
                      <Animated.View
                        style={[styles.levelIndicatorFill, { width: levelProgressWidth }]}
                      />
                    </View>
                  </View>
                </TouchableOpacity>

                <View
                  style={[
                    styles.badge,
                    isPro ? styles.badgePro : styles.badgeFree,
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {isPro ? t('home.proPlan') : t('home.freePlan')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.spacer20} />

            {/* ── Quick Actions ──────────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <QuickActionTrigger onLogWater={handleLogWater} />
            </View>

            <View style={styles.spacer24} />

            {/* ── Goal Rings ─────────────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <GoalRingsSection
                proteinCurrent={logsData?.totalProtein ?? 0}
                proteinTarget={profile?.dailyProteinTarget ?? 0}
                carbsCurrent={logsData?.totalCarbs ?? 0}
                carbsTarget={profile?.dailyCarbTarget ?? 0}
                caloriesCurrent={logsData?.totalCalories ?? 0}
                calorieTarget={profile?.dailyCalorieTarget ?? 0}
                hydrationCurrent={hydrationData?.totalMl ?? 0}
                hydrationTarget={HYDRATION_TARGET_ML}
                dataUpdatedAt={blendLogsUpdatedAt}
              />
            </View>

            <View style={styles.spacer24} />

            {/* ── Streak Badge ───────────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <StreakBadge streakDays={profile?.streakDays ?? 0} />
            </View>

            <View style={styles.spacer20} />

            {/* ── Daily Missions ──────────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <View style={styles.missionsHeader}>
                <Ionicons name="trophy-outline" size={18} color={colors.brand.pulse} />
                <Text style={styles.missionsHeaderTitle}>{t('home.dailyMissions')}</Text>
                {missionsData ? (
                  <Text style={styles.missionsHeaderBadge}>
                    {missionsData.completedCount > 0
                      ? `${missionsData.completedCount}/3`
                      : t('home.xpAvailable', { xp: missionsData.xpAvailable })}
                  </Text>
                ) : null}
              </View>

              {isLoadingMissions ? (
                <View style={styles.missionsRow}>
                  <SkeletonLoader variant="card" style={styles.missionCardSkeleton} />
                  <SkeletonLoader variant="card" style={styles.missionCardSkeleton} />
                  <SkeletonLoader variant="card" style={styles.missionCardSkeleton} />
                </View>
              ) : missionsData ? (
                <View style={styles.missionsRow}>
                  {missionsData.missions.map((mission) => (
                    <MissionCard
                      key={mission.missionId}
                      mission={mission}
                      icon={MISSION_ICON_MAP[mission.type] ?? DEFAULT_MISSION_ICON}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.spacer20} />

            {/* ── Título "Quick Start" ────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>{t('home.quickStart')}</Text>

            <View style={styles.spacer12} />

            {/* ── Protocol Cards (padding esquerdo, sangra à direita) ──────── */}
            <View style={styles.protocolsWrapper}>
              <QuickProtocolCards onProtocolSelect={handleProtocolSelect} />
            </View>

            <View style={styles.spacer24} />

            {/* ── Daily Recipe Card ──────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <DailyRecipeCard
                goal={profile?.goal ?? 'Wellness'}
                onStartBlend={handleStartBlend}
              />
            </View>

            <View style={styles.spacer8} />

          </Animated.View>
        )}
      </ScrollView>

      <LevelDetailSheet visible={showLevelDetail} onClose={() => setShowLevelDetail(false)} />
      {showMissionToast && pendingMissionXP !== null ? (
        <MissionCompletionToast
          xpAmount={pendingMissionXP}
          visible={showMissionToast}
          onDismiss={handleMissionToastDismiss}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingBottom: 24,
  },

  // ── Skeleton ────────────────────────────────────────────────────────────────
  skeletonContainer: {
    paddingHorizontal: 24,
  },
  skeletonHeader: {
    marginBottom: 20,
  },
  skeletonSpacer: {
    height: 20,
  },

  // ── Greeting ────────────────────────────────────────────────────────────────
  greetingContainer: {
    paddingHorizontal: 24,
  },
  headerActions: {
    position: 'absolute',
    top: 0,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  greetingDate: {
    marginTop: 4,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  levelIndicatorButton: {
    marginRight: 8,
  },
  levelIndicatorContent: {
    alignItems: 'center',
  },
  levelIndicatorText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  levelIndicatorTrack: {
    marginTop: 3,
    width: LEVEL_PROGRESS_BAR_WIDTH,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: LEVEL_PROGRESS_TRACK_COLOR,
    overflow: 'hidden',
  },
  levelIndicatorFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.brand.pulse,
  },

  // ── Badge Free / Pro ─────────────────────────────────────────────────────────
  badge: {
    height: BADGE_HEIGHT,
    paddingHorizontal: BADGE_PADDING_H,
    borderRadius: BADGE_HEIGHT / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFree: {
    backgroundColor: BADGE_FREE_BACKGROUND,
    borderColor: BADGE_FREE_BORDER,
  },
  badgePro: {
    backgroundColor: BADGE_PRO_BACKGROUND,
    borderColor: BADGE_PRO_BORDER,
  },
  badgeText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },

  // ── Section title ────────────────────────────────────────────────────────────
  sectionTitle: {
    paddingHorizontal: 24,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },

  // ── Layout helpers ──────────────────────────────────────────────────────────
  rowPad: {
    paddingHorizontal: 24,
  },
  protocolsWrapper: {
    paddingLeft: 24,
  },

  // ── Spacers ──────────────────────────────────────────────────────────────────
  spacer8: { height: 8 },
  spacer12: { height: 12 },
  spacer20: { height: 20 },
  spacer24: { height: 24 },

  // ── Missions ─────────────────────────────────────────────────────────────────
  missionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  missionsHeaderTitle: {
    flex: 1,
    marginLeft: 8,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  missionsHeaderBadge: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  missionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  missionCardSkeleton: {
    flex: 1,
    height: 80,
  },
});
