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
//   safe area top + 16  →  HomeGreetingHeader (px 24): saudação | nível + badge
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  calculateLevel,
  getDisplayFirstName,
  fonts,
  fontWeights,
} from '@blendi/shared';
import { api } from '../config/api';
import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { LevelDetailSheet } from '../components/gamification/LevelDetailSheet';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { useDateFormat } from '../hooks/useDateFormat';
import { useAuthStore } from '../store/auth.store';
import { useGamificationStore } from '../store/gamification.store';
import { usePulseAIStore } from '../store/pulseAi.store';
import { logWater, getHydrationToday } from '../services/hydration.service';
import { getTodayLogs, type BlendLogsTodayData } from '../services/blendLog.service';
import type { AppTabScreenProps } from '../navigation/types';
import type { DietaryPreference, PulseAiRecipe, UserAllergies, UserGoal } from '@blendi/shared';
import { readProfileAllergies } from '../utils/allergies.utils';

import { AuroraBackground } from '../components/ui/AuroraBackground';
import { ProfileSkeleton, RecipeCardSkeleton, SkeletonLoader } from '../components/ui';
import { GoalRingsSection } from '../components/home/GoalRingsSection';
import { QuickActionTrigger } from '../components/home/QuickActionTrigger';
import { StreakBadge } from '../components/home/StreakBadge';
import { QuickProtocolCards } from '../components/home/QuickProtocolCards';
import type { QuickProtocol } from '../components/home/QuickProtocolCards';
import { DailyRecipeCard } from '../components/home/DailyRecipeCard';
import { HomeGreetingHeader, LEVEL_PROGRESS_BAR_WIDTH } from '../components/home/HomeGreetingHeader';
import { MissionCard } from '../components/missions/MissionCard';
import { getDailyMissions } from '../services/dailyMission.service';
import { TutorialAnchor } from '../features/tutorial/TutorialAnchor';
import { useTutorialScrollRef } from '../features/tutorial/useTutorialScrollRef';

// ─── Constants ────────────────────────────────────────────────────────────────

const FADE_DURATION = 300;
/** Fallback de meta de hidratação diária, usado só se a API não retornar goalMl. Alinhado com DEFAULT_DAILY_HYDRATION_TARGET do backend. */
const HYDRATION_TARGET_ML = 2500;

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

type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';

interface UserProfileData {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  dietaryPreferences?: DietaryPreference[];
  /** CP-B6 */
  allergies?: UserAllergies;
  preferredLanguage: string;
  timezone: string;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  profilePhoto?: string;
  streakDays: number;
  totalBlends: number;
  totalXP: number;
  isPro: boolean;
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
  const colors = useColors();

  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { formatDate } = useDateFormat();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const setGamificationTotalXP = useGamificationStore((state) => state.setTotalXP);
  const totalXP = useGamificationStore((state) => state.totalXP);
  const setPendingProtocol = usePulseAIStore((state) => state.setPendingProtocol);
  // CP-C2: o tutorial rola até as âncoras fora da área visível.
  const tutorialScrollRef = useTutorialScrollRef('Home');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLevelDetail, setShowLevelDetail] = useState(false);
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
  const {
    data: hydrationResponse,
    isLoading: isLoadingHydration,
    refetch: refetchHydration,
  } = useQuery({
    queryKey: QUERY_KEYS.hydrationToday,
    queryFn: getHydrationToday,
    staleTime: CACHE_CONFIG.HYDRATION_TODAY_TTL,
    retry: 0,
  });

  const isLoading = isLoadingProfile || isLoadingLogs || isLoadingHydration;

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

  // Só o primeiro nome (firstName; sem ele, a primeira palavra do name —
  // contas antigas). O nome completo não cabe ao lado do nível e do badge.
  const displayFirstName = getDisplayFirstName(profile ?? authUser ?? {});
  const greeting = t(getGreetingKey(), { name: displayFirstName });
  const formattedDate = formatDate(new Date());

  // Pro se o modelo for ProPlus ou Steel; Free se for Lite ou indefinido
  const isPro = profile?.isPro ?? authUser?.isPro ?? false;

  // Filtro da receita do dia (CP-1.1.9). A tela de metas atualiza o usuário
  // local e invalida a query do perfil ao salvar a dieta: a Home re-renderiza
  // com a dieta nova sem reiniciar o app.
  const dietaryPreferences = profile?.dietaryPreferences ?? authUser?.dietaryPreferences ?? [];
  const blendiModel: BlendiModel = profile?.blendiModel ?? authUser?.blendiModel ?? 'Lite';
  // CP-B6: receita com alérgeno cadastrado não aparece (mesmo mecanismo da dieta).
  const allergies = readProfileAllergies(profile ?? authUser);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogWater = useCallback(async () => {
    await logWater();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationHistory }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile }),
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

  const handleStartBlend = useCallback((recipe: PulseAiRecipe) => {
    navigation.navigate('Blend', { recipe });
  }, [navigation]);

  // Nenhuma receita fixa compatível com a dieta: leva à Pulse AI com o pedido
  // já preenchido (mesmo caminho dos Quick Protocols).
  const handleAskPulseAiForRecipe = useCallback(
    (prompt: string) => {
      setPendingProtocol(prompt);
      navigation.navigate('PulseAI', { screen: 'PulseAIChat' });
    },
    [navigation, setPendingProtocol],
  );

  // ── Render ────────────────────────────────────────────────────────────────

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

  return (
    <View style={styles.root}>
      {/* Aurora cobre toda a tela via absoluteFillObject interno */}
      <AuroraBackground intensity="reduced" />

      <ScrollView
        ref={tutorialScrollRef}
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

            {/* ── Saudação (primeiro nome) + nível + badge de plano ────────── */}
            <TutorialAnchor id="home.header">
              <HomeGreetingHeader
                greeting={greeting}
                formattedDate={formattedDate}
                level={levelInfo.level}
                levelProgressWidth={levelProgressWidth}
                isPro={isPro}
                onLevelPress={() => {
                  setShowLevelDetail(true);
                }}
              />
            </TutorialAnchor>

            <View style={styles.spacer20} />

            {/* ── Quick Actions ──────────────────────────────────────────── */}
            <View style={styles.rowPad}>
              <QuickActionTrigger onLogWater={handleLogWater} />
            </View>

            <View style={styles.spacer24} />

            {/* ── Goal Rings ─────────────────────────────────────────────── */}
            <TutorialAnchor id="home.rings" style={styles.rowPad}>
              <GoalRingsSection
                proteinCurrent={logsData?.totalProtein ?? 0}
                proteinTarget={profile?.dailyProteinTarget ?? 0}
                carbsCurrent={logsData?.totalCarbs ?? 0}
                carbsTarget={profile?.dailyCarbTarget ?? 0}
                caloriesCurrent={logsData?.totalCalories ?? 0}
                calorieTarget={profile?.dailyCalorieTarget ?? 0}
                hydrationCurrent={hydrationData?.totalMl ?? 0}
                hydrationTarget={hydrationData?.goalMl ?? HYDRATION_TARGET_ML}
                dataUpdatedAt={blendLogsUpdatedAt}
              />
            </TutorialAnchor>

            <View style={styles.spacer24} />

            {/* ── Streak Badge ───────────────────────────────────────────── */}
            <TutorialAnchor id="home.streak" style={styles.rowPad}>
              <StreakBadge streakDays={profile?.streakDays ?? 0} />
            </TutorialAnchor>

            <View style={styles.spacer20} />

            {/* ── Daily Missions ──────────────────────────────────────────── */}
            <TutorialAnchor id="home.missions" style={styles.rowPad}>
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
            </TutorialAnchor>

            <View style={styles.spacer20} />

            {/* ── Título "Quick Start" ────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>{t('home.quickStart')}</Text>

            <View style={styles.spacer12} />

            {/* ── Protocol Cards (padding esquerdo, sangra à direita) ──────── */}
            <TutorialAnchor id="home.protocols" style={styles.protocolsWrapper}>
              <QuickProtocolCards onProtocolSelect={handleProtocolSelect} />
            </TutorialAnchor>

            <View style={styles.spacer24} />

            {/* ── Daily Recipe Card ──────────────────────────────────────── */}
            <TutorialAnchor id="home.dailyRecipe" style={styles.rowPad}>
              <DailyRecipeCard
                goal={profile?.goal ?? 'Wellness'}
                dietaryPreferences={dietaryPreferences}
                allergies={allergies}
                blendiModel={blendiModel}
                onStartBlend={handleStartBlend}
                onAskPulseAi={handleAskPulseAiForRecipe}
              />
            </TutorialAnchor>

            <View style={styles.spacer8} />

          </Animated.View>
        )}
      </ScrollView>

      <LevelDetailSheet visible={showLevelDetail} onClose={() => setShowLevelDetail(false)} />
    </View>
  );
}
