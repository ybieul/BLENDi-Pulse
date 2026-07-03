// apps/mobile/src/screens/MeScreen.tsx
// Tela de perfil do usuário — aba Me no AppNavigator.
//
// ── Arquitetura de dados ──────────────────────────────────────────────────────
// React Query com QUERY_KEYS.userProfile reutiliza o cache preenchido pela HomeScreen.
// O store Zustand fornece os dados imediatamente enquanto a query atualiza em background.
// calculateUserBadges deriva as conquistas do usuário de forma síncrona.
//
// ── Estrutura de layout (ScrollView) ─────────────────────────────────────────
//   safeArea.top + 20  →  header (paddingHorizontal 24): foto/iniciais + badge de plano
//   24                 →  stats (paddingHorizontal 16): 3 × StatCard
//   24                 →  badges (paddingHorizontal 16): header + FlatList 4 colunas
//   24                 →  settings (paddingHorizontal 16): card glassmorphism + 8 SettingRow
//   24                 →  upgrade/pro (paddingHorizontal 16): upgrade card ou pro card
//   32                 →  footer (paddingHorizontal 24): sign out + versão + links

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import {
  SaveFormat,
  manipulateAsync,
} from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import {
  borderRadius,
  calculateLevel,
  colors,
  fontSizes,
  fonts,
  fontWeights,
} from "@blendi/shared";

import { api } from "../config/api";
import { CACHE_CONFIG, QUERY_KEYS } from "../config/cache.config";
import { PRICING_CONFIG } from "../config/pricing.config";
import { createAppStorage } from "../config/storage";
import { useAppTranslation } from "../hooks/useAppTranslation";
import { buildHistoryRange } from "../utils/historyRange.utils";
import { useUnits } from "../hooks/useUnits";
import { useAuthStore } from "../store/auth.store";
import { useGamificationStore } from "../store/gamification.store";
import type { SupportedLocale } from "../locales/i18n";
import type { AppTabScreenProps, RootNavigationProp } from "../navigation/types";

import { AuroraBackground } from "../components/ui/AuroraBackground";
import { AuthButton } from "../components/ui";
import { StatCard } from "../components/history/StatCard";
import { BadgeCard } from "../components/me/BadgeCard";
import { BadgeDetailSheet } from "../components/me/BadgeDetailSheet";
import { SettingRow } from "../components/me/SettingRow";
import {
  EditSettingSheet,
  type EditSettingType,
  type EditSettingValue,
} from "../components/me/EditSettingSheet";
import { calculateUserBadges, type UserBadge } from "../utils/badges.utils";
import {
  useNotificationPreferences,
  type NotificationPrefKey,
} from "../hooks/useNotificationPreferences";
import { usePulseProPurchase } from "../hooks/usePulseProPurchase";
import { DailyPulseTimeSheet } from "../components/me/DailyPulseTimeSheet";
import { formatUsdCurrency } from "../utils/pricing.utils";
import {
  cacheProfilePhoto,
  clearProfilePhotoCache,
  ProfilePhoto,
} from "../components/profile/ProfilePhoto";
import {
  WeeklyShareCard,
  type WeeklyShareCardHandle,
} from "../components/shareCards/WeeklyShareCard";
import { getBlendHistory, type BlendHistoryData } from "../services/blendLog.service";
import { getSupplementHistory, type SupplementHistoryData } from "../services/supplementLog.service";
import { generateAndShare } from "../utils/shareCard.utils";
import { showToast } from "../utils/toast.utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_BACKGROUND = "rgba(255,255,255,0.07)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const DIVIDER_COLOR = "rgba(255,255,255,0.06)";
const SWITCH_TRACK_FALSE = "rgba(154,72,147,0.30)";
const SWITCH_UNDERLAY = "rgba(255,255,255,0.04)";
const VALUE_COLOR = "rgba(255,255,255,0.55)";
const CHEVRON_COLOR = "rgba(255,255,255,0.30)";
const PLAN_BADGE_FREE_BG = "rgba(255,255,255,0.08)";
const PLAN_BADGE_FREE_BORDER = "rgba(255,255,255,0.12)";
const PLAN_BADGE_PRO_BG = "rgba(154,72,147,0.25)";
const PLAN_BADGE_PRO_BORDER = "rgba(154,72,147,0.40)";
const UPGRADE_CARD_BG = "rgba(154,72,147,0.12)";
const UPGRADE_CARD_BORDER = "rgba(154,72,147,0.35)";
const LONGEST_STREAK_COLOR = "rgba(245,158,11,0.90)";
const LEVEL_PROGRESS_TRACK_COLOR = "rgba(255,255,255,0.08)";
const LEVEL_NEXT_COPY_OPACITY = 0.6;
const LABEL_OPACITY = 0.55;
const VERSION_OPACITY = 0.35;
const PRICE_OPACITY = 0.60;
const TERMS_OPACITY = 0.45;
const PROFILE_PHOTO_SIZE = 80;
const PROFILE_PHOTO_CAMERA_BADGE_SIZE = 28;
const PROFILE_PHOTO_CAMERA_ICON_SIZE = 14;
const PROFILE_PHOTO_MAX_DIMENSION = 400;
const PROFILE_PHOTO_COMPRESSION = 0.7;
const PROFILE_PHOTO_MAX_FILE_BYTES = 300 * 1024;
const PROFILE_PHOTO_FILE_TYPE = "jpeg" as const;
const PROFILE_PHOTO_MIME_TYPE = "image/jpeg";
const HEADER_ACTION_BACKGROUND = "rgba(255,255,255,0.06)";
const HEADER_ACTION_BORDER = "rgba(255,255,255,0.12)";
const HEADER_ACTION_ICON_COLOR = "rgba(255,255,255,0.92)";
const PROFILE_PHOTO_LOADING_OVERLAY = "rgba(43,20,41,0.28)";
const WEEKLY_SHARE_DELAY = 240;

const ONBOARDING_KEY = "onboarding_completed";

// Namespace de storage compartilhado com auth.store — mesma instância MMKV.
const appStorage = createAppStorage("blendi-pulse");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDailyPulseTime(
  hour: number,
  minute: number,
  unitSystem: "metric" | "imperial",
): string {
  const mm = String(minute).padStart(2, "0");
  if (unitSystem === "metric") {
    return `${String(hour).padStart(2, "0")}:${mm}`;
  }
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${period}`;
}

// ─── SwitchRow ────────────────────────────────────────────────────────────────

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  return (
    <View style={switchRowStyles.row}>
      <View style={switchRowStyles.content}>
        <Text style={switchRowStyles.label}>{label}</Text>
        {description ? (
          <Text style={switchRowStyles.description}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: SWITCH_TRACK_FALSE, true: colors.brand.pulse }}
        thumbColor={colors.text.primary}
      />
    </View>
  );
}

const switchRowStyles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    lineHeight: 20,
  },
  description: {
    color: VALUE_COLOR,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type BlendiModel = "Lite" | "ProPlus" | "Steel";
type UserGoal = "Muscle" | "Wellness" | "Energy" | "Recovery";

interface UserProfileData {
  id: string;
  name: string;
  email: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  preferredLanguage: string;
  timezone: string;
  unitSystem: "metric" | "imperial";
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  dailyHydrationTarget: number;
  profilePhoto?: string;
  hasProfilePhoto?: boolean;
  profilePhotoUpdatedAt?: string | null;
  currentStreak: number;
  longestStreak: number;
  blendCount: number;
  totalXP: number;
  isPro: boolean;
  createdAt: string;
}

interface LocalImageSize {
  width: number;
  height: number;
}

interface ProfilePhotoMutationUser {
  id: string;
  email: string;
  name: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | null;
}

interface ProfilePhotoMutationResponse {
  success: true;
  data: {
    user: ProfilePhotoMutationUser;
  };
}

interface ProfilePhotoActionCopy {
  title: string;
  takePhoto: string;
  chooseFromGallery: string;
  removePhoto: string;
  removePhotoConfirm: string;
  uploadingPhoto: string;
  photoUpdated: string;
  photoRemoved: string;
  photoTooLarge: string;
  photoError: string;
  cameraPermissionDenied: string;
  galleryPermissionDenied: string;
}

interface UserProfileResponse {
  success: true;
  data: {
    user: UserProfileData;
  };
}

interface WeeklySharePayload {
  weekStart: string;
  weekEnd: string;
  totalBlends: number;
  averageDailyProtein: number;
  currentStreak: number;
  supplementAdherenceRate: number;
}

// ─── Translation key type ─────────────────────────────────────────────────────

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>["t"]>[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchUserProfile(): Promise<UserProfileResponse> {
  const response = await api.get<UserProfileResponse>("/users/me");
  return response.data;
}

function getModelKey(model: BlendiModel): TranslationKey {
  const keys: Record<BlendiModel, TranslationKey> = {
    Lite: "onboarding.model.lite.name",
    ProPlus: "onboarding.model.pro_plus.name",
    Steel: "onboarding.model.steel.name",
  };
  return keys[model];
}

function getGoalKey(goal: UserGoal): TranslationKey {
  const keys: Record<UserGoal, TranslationKey> = {
    Muscle: "onboarding.goalMuscle",
    Wellness: "onboarding.goalWellness",
    Energy: "onboarding.goalEnergy",
    Recovery: "onboarding.goalRecovery",
  };
  return keys[goal];
}

function getLanguageKey(language: string): TranslationKey {
  return language === "pt-BR"
    ? "profile.language.pt_BR"
    : "profile.language.en";
}

function formatMemberSince(createdAt: string, locale: string): string {
  return new Date(createdAt).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

function getLocalDateKey(value: Date | string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(value));
}

function getImageSize(uri: string): Promise<LocalImageSize> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function getResizeDimensions({ width, height }: LocalImageSize): LocalImageSize {
  const largestDimension = Math.max(width, height);

  if (largestDimension <= PROFILE_PHOTO_MAX_DIMENSION) {
    return { width, height };
  }

  const scale = PROFILE_PHOTO_MAX_DIMENSION / largestDimension;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function processProfilePhoto(uri: string): Promise<{
  previewUri: string;
  imageBase64: string;
}> {
  const imageSize = await getImageSize(uri);
  const targetSize = getResizeDimensions(imageSize);
  const manipulatedImage = await manipulateAsync(
    uri,
    [
      {
        resize: {
          width: targetSize.width,
          height: targetSize.height,
        },
      },
    ],
    {
      compress: PROFILE_PHOTO_COMPRESSION,
      format: SaveFormat.JPEG,
    },
  );

  const fileInfo = await FileSystem.getInfoAsync(manipulatedImage.uri, { size: true });

  if (fileInfo.exists && typeof fileInfo.size === "number" && fileInfo.size > PROFILE_PHOTO_MAX_FILE_BYTES) {
    throw new Error("PROFILE_PHOTO_TOO_LARGE");
  }

  const imageBase64 = (
    await FileSystem.readAsStringAsync(manipulatedImage.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  ).trim();

  if (!imageBase64) {
    throw new Error("PROFILE_PHOTO_EMPTY_BASE64");
  }

  return {
    previewUri: manipulatedImage.uri,
    imageBase64,
  };
}

function getProfilePhotoActionCopy(
  t: ReturnType<typeof useAppTranslation>["t"],
  locale: string,
): ProfilePhotoActionCopy {
  if (locale === "pt-BR") {
    return {
      title: t("me.profilePhotoTitle"),
      takePhoto: t("me.takePhoto"),
      chooseFromGallery: t("me.chooseFromGallery"),
      removePhoto: t("me.removePhoto"),
      removePhotoConfirm: t("me.removePhotoConfirm"),
      uploadingPhoto: t("me.uploadingPhoto"),
      photoUpdated: t("me.photoUpdated"),
      photoRemoved: t("me.photoRemoved"),
      photoTooLarge: t("me.photoTooLarge"),
      photoError: t("me.photoError"),
      cameraPermissionDenied: "Permita o acesso à câmera para tirar uma foto.",
      galleryPermissionDenied: "Permita o acesso à galeria para escolher uma foto.",
    };
  }

  return {
    title: t("me.profilePhotoTitle"),
    takePhoto: t("me.takePhoto"),
    chooseFromGallery: t("me.chooseFromGallery"),
    removePhoto: t("me.removePhoto"),
    removePhotoConfirm: t("me.removePhotoConfirm"),
    uploadingPhoto: t("me.uploadingPhoto"),
    photoUpdated: t("me.photoUpdated"),
    photoRemoved: t("me.photoRemoved"),
    photoTooLarge: t("me.photoTooLarge"),
    photoError: t("me.photoError"),
    cameraPermissionDenied: "Allow camera access to take a photo.",
    galleryPermissionDenied: "Allow photo library access to choose a photo.",
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MeScreen({ navigation }: AppTabScreenProps<"Me">) {
  const insets = useSafeAreaInsets();
  const { t, locale, changeLocale } = useAppTranslation();
  const authUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const queryClient = useQueryClient();
  const { displayVolume } = useUnits();
  const { isBusy: isPurchaseBusy, restoreProAccess } = usePulseProPurchase();
  const setGamificationTotalXP = useGamificationStore((state) => state.setTotalXP);
  const totalXP = useGamificationStore((state) => state.totalXP);
  const levelInfo = useMemo(() => calculateLevel(totalXP), [totalXP]);
  const nextLevelInfo = useMemo(
    () => calculateLevel(levelInfo.xpForNextLevel),
    [levelInfo.xpForNextLevel],
  );
  const levelProgressAnim = useRef(new Animated.Value(levelInfo.progress)).current;

  // ── Local state ──────────────────────────────────────────────────────────

  const [editingType, setEditingType] = useState<EditSettingType | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [profilePhotoPreviewUri, setProfilePhotoPreviewUri] = useState<string | null>(null);
  const [isProfilePhotoLoading, setIsProfilePhotoLoading] = useState(false);
  const [isWeeklyShareLoading, setIsWeeklyShareLoading] = useState(false);
  const [pendingWeeklyShare, setPendingWeeklyShare] = useState<WeeklySharePayload | null>(null);
  const weeklyShareCardRef = useRef<WeeklyShareCardHandle | null>(null);

  const { preferences, dailyPulseTime, togglePreference, updateDailyPulseTime } =
    useNotificationPreferences();

  const notificationPreferenceRows = useMemo(
    (): Array<{
      key: NotificationPrefKey;
      label: string;
      description: string;
      value: boolean;
    }> => [
      {
        key: "dailyPulse",
        label: t("me.notifications.dailyPulse"),
        description: t("me.notifications.dailyPulseDesc"),
        value: preferences.dailyPulse,
      },
      {
        key: "streakReminder",
        label: t("me.notifications.streakReminder"),
        description: t("me.notifications.streakReminderDesc"),
        value: preferences.streakReminder,
      },
      {
        key: "supplementReminder",
        label: t("me.notifications.supplementReminder"),
        description: t("me.notifications.supplementReminderDesc"),
        value: preferences.supplementReminder,
      },
      {
        key: "hydrationReminder",
        label: t("me.notifications.hydrationReminder"),
        description: t("me.notifications.hydrationReminderDesc"),
        value: preferences.hydrationReminder,
      },
    ],
    [preferences.dailyPulse, preferences.hydrationReminder, preferences.streakReminder, preferences.supplementReminder, t],
  );

  // ── Profile query ────────────────────────────────────────────────────────

  const { data: profileResponse } = useQuery<UserProfileResponse>({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: fetchUserProfile,
    staleTime: CACHE_CONFIG.USER_PROFILE_TTL,
  });

  useEffect(() => {
    const fetchedTotalXP = profileResponse?.data.user.totalXP;

    if (typeof fetchedTotalXP !== 'number') {
      return;
    }

    setGamificationTotalXP(fetchedTotalXP);
  }, [profileResponse?.data.user.totalXP, setGamificationTotalXP]);

  const profile = profileResponse?.data.user;

  // ── Derived data ─────────────────────────────────────────────────────────

  const profilePhotoActionCopy = useMemo(() => getProfilePhotoActionCopy(t, locale), [locale, t]);
  const displayUserId = authUser?.id ?? profile?.id ?? null;
  const displayName = profile?.name ?? authUser?.name ?? "";
  const displayEmail = profile?.email ?? authUser?.email ?? "";
  const displayModel: BlendiModel =
    (profile?.blendiModel ?? authUser?.blendiModel) ?? "Lite";
  const displayGoal: UserGoal =
    (profile?.goal ?? authUser?.goal) ?? "Muscle";
  const displayUnitSystem =
    (profile?.unitSystem ?? authUser?.unitSystem) ?? "metric";
  const displayLanguage =
    profile?.preferredLanguage ?? authUser?.locale ?? "en";
  const historyTimezone = profile?.timezone ?? authUser?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // isPro: campo direto da API (Part 2) ou derivado do modelo local
  const isPro: boolean =
    profile?.isPro ?? authUser?.isPro ?? false;

  const createdAt = profile?.createdAt ?? authUser?.createdAt ?? "";
  const displayHasProfilePhoto = authUser?.hasProfilePhoto ?? profile?.hasProfilePhoto ?? false;
  const displayProfilePhotoUpdatedAt =
    authUser?.profilePhotoUpdatedAt ?? profile?.profilePhotoUpdatedAt ?? null;

  const memberSinceStr = useMemo(() => {
    if (!createdAt) return "";
    return formatMemberSince(createdAt, locale);
  }, [createdAt, locale]);
  const weeklyHistoryRange = useMemo(() => buildHistoryRange(7, historyTimezone), [historyTimezone]);
  const canShareWeekly = useMemo(() => {
    if (!createdAt) {
      return false;
    }

    return getLocalDateKey(createdAt, historyTimezone) <= getLocalDateKey(weeklyHistoryRange.from, historyTimezone);
  }, [createdAt, historyTimezone, weeklyHistoryRange.from]);
  const weeklyBlendQueryKey = useMemo(
    () => [...QUERY_KEYS.blendHistory, historyTimezone, 7] as const,
    [historyTimezone],
  );
  const weeklySupplementQueryKey = useMemo(
    () => [...QUERY_KEYS.supplementHistory, historyTimezone, 7] as const,
    [historyTimezone],
  );

  const upgradePriceSummary = useMemo(() => {
    return t("me.upgrade.price", {
      monthlyPrice: formatUsdCurrency(locale, PRICING_CONFIG.PRO_MONTHLY_PRICE_USD),
      annualPrice: formatUsdCurrency(locale, PRICING_CONFIG.PRO_ANNUAL_PRICE_USD),
    });
  }, [locale, t]);

  const userBadges = useMemo(() => {
    return calculateUserBadges({
      blendCount: profile?.blendCount ?? 0,
      longestStreak: profile?.longestStreak ?? 0,
      blendiModel: displayModel,
    });
  }, [profile?.blendCount, profile?.longestStreak, displayModel]);

  useEffect(() => {
    const animation = Animated.timing(levelProgressAnim, {
      toValue: levelInfo.progress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [levelInfo.progress, levelProgressAnim]);

  useEffect(() => {
    if (!pendingWeeklyShare) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        await generateAndShare(weeklyShareCardRef);
        setPendingWeeklyShare(null);
        setIsWeeklyShareLoading(false);
      })();
    }, WEEKLY_SHARE_DELAY);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingWeeklyShare]);

  const languageDisplayName = t(getLanguageKey(displayLanguage));

  // ── Settings current values ───────────────────────────────────────────────

  function getCurrentEditValue(type: EditSettingType): EditSettingValue {
    switch (type) {
      case "model":
        return displayModel;
      case "goal":
        return displayGoal;
      case "protein":
        return profile?.dailyProteinTarget ?? authUser?.dailyProteinTarget ?? 120;
      case "carbs":
        return profile?.dailyCarbTarget ?? authUser?.dailyCarbTarget ?? 150;
      case "calories":
        return (
          profile?.dailyCalorieTarget ?? authUser?.dailyCalorieTarget ?? 2000
        );
      case "hydration":
        return profile?.dailyHydrationTarget ?? 2000;
      case "unitSystem":
        return displayUnitSystem;
      case "language":
        return displayLanguage;
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleConfirmEdit = useCallback(
    async (nextValue: EditSettingValue) => {
      if (!editingType) return;

      let body: Record<string, unknown>;
      switch (editingType) {
        case "model":
          body = { blendiModel: nextValue };
          break;
        case "goal":
          body = { goal: nextValue };
          break;
        case "protein":
          body = { dailyProteinTarget: Number(nextValue) };
          break;
        case "carbs":
          body = { dailyCarbTarget: Number(nextValue) };
          break;
        case "calories":
          body = { dailyCalorieTarget: Number(nextValue) };
          break;
        case "hydration":
          body = { dailyHydrationTarget: Number(nextValue) };
          break;
        case "unitSystem":
          body = { unitSystem: nextValue };
          break;
        case "language":
          body = { preferredLanguage: nextValue };
          break;
        default:
          return;
      }

      await api.patch("/users/me", body);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });

      switch (editingType) {
        case "model":
          updateUserProfile({ blendiModel: nextValue as BlendiModel });
          break;
        case "goal":
          updateUserProfile({ goal: nextValue as UserGoal });
          break;
        case "protein":
          updateUserProfile({ dailyProteinTarget: Number(nextValue) });
          break;
        case "carbs":
          updateUserProfile({ dailyCarbTarget: Number(nextValue) });
          break;
        case "calories":
          updateUserProfile({ dailyCalorieTarget: Number(nextValue) });
          break;
        case "unitSystem":
          updateUserProfile({ unitSystem: nextValue as "metric" | "imperial" });
          break;
        case "language":
          updateUserProfile({ locale: nextValue as SupportedLocale });
          await changeLocale(nextValue as SupportedLocale);
          break;
      }

      // Invalidate AI cache when model or goal change — old cached recipes
      // may no longer match the user hardware or nutritional target.
      if (editingType === "model" || editingType === "goal") {
        try {
          await api.delete("/pulse-ai/cache");
        } catch {
          // best effort
        }
      }

      setEditingType(null);
    },
    [editingType, queryClient, updateUserProfile, changeLocale],
  );

  const handleUploadProcessedProfilePhoto = useCallback(
    async (sourceUri: string) => {
      if (!displayUserId) {
        showToast(profilePhotoActionCopy.photoError);
        return;
      }

      let processedPhoto: {
        previewUri: string;
        imageBase64: string;
      };

      try {
        processedPhoto = await processProfilePhoto(sourceUri);
      } catch (error) {
        if (error instanceof Error && error.message === "PROFILE_PHOTO_TOO_LARGE") {
          showToast(profilePhotoActionCopy.photoTooLarge);
          return;
        }

        showToast(profilePhotoActionCopy.photoError);
        return;
      }

      showToast(profilePhotoActionCopy.uploadingPhoto);
      setProfilePhotoPreviewUri(processedPhoto.previewUri);
      setIsProfilePhotoLoading(true);

      try {
        const response = await api.post<ProfilePhotoMutationResponse>("/users/profile-photo", {
          imageBase64: processedPhoto.imageBase64,
          fileType: PROFILE_PHOTO_FILE_TYPE,
        });

        const nextUpdatedAt = response.data.data.user.profilePhotoUpdatedAt ?? new Date().toISOString();

        cacheProfilePhoto(displayUserId, {
          imageBase64: processedPhoto.imageBase64,
          mimeType: PROFILE_PHOTO_MIME_TYPE,
          profilePhotoUpdatedAt: nextUpdatedAt,
        });

        updateUserProfile({
          hasProfilePhoto: response.data.data.user.hasProfilePhoto,
          profilePhotoUpdatedAt: nextUpdatedAt,
          profilePhoto: undefined,
        });

        setProfilePhotoPreviewUri(null);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
        showToast(profilePhotoActionCopy.photoUpdated);
      } catch {
        setProfilePhotoPreviewUri(null);
        showToast(profilePhotoActionCopy.photoError);
      } finally {
        setIsProfilePhotoLoading(false);
      }
    },
    [displayUserId, profilePhotoActionCopy.photoError, profilePhotoActionCopy.photoTooLarge, profilePhotoActionCopy.photoUpdated, profilePhotoActionCopy.uploadingPhoto, queryClient, updateUserProfile],
  );

  const handleTakePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      showToast(profilePhotoActionCopy.cameraPermissionDenied);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      await handleUploadProcessedProfilePhoto(result.assets[0].uri);
    }
  }, [handleUploadProcessedProfilePhoto, profilePhotoActionCopy.cameraPermissionDenied]);

  const handleChooseFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showToast(profilePhotoActionCopy.galleryPermissionDenied);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      await handleUploadProcessedProfilePhoto(result.assets[0].uri);
    }
  }, [handleUploadProcessedProfilePhoto, profilePhotoActionCopy.galleryPermissionDenied]);

  const handleRemovePhoto = useCallback(() => {
    Alert.alert(
      profilePhotoActionCopy.removePhotoConfirm,
      undefined,
      [
        {
          text: t("common.actions.cancel"),
          style: "cancel",
        },
        {
          text: profilePhotoActionCopy.removePhoto,
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (!displayUserId) {
                showToast(profilePhotoActionCopy.photoError);
                return;
              }

              setProfilePhotoPreviewUri(null);
              setIsProfilePhotoLoading(true);

              try {
                const response = await api.delete<ProfilePhotoMutationResponse>("/users/profile-photo");
                clearProfilePhotoCache(displayUserId);
                updateUserProfile({
                  hasProfilePhoto: false,
                  profilePhotoUpdatedAt: response.data.data.user.profilePhotoUpdatedAt ?? null,
                  profilePhoto: undefined,
                });
                await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
                showToast(profilePhotoActionCopy.photoRemoved);
              } catch {
                showToast(profilePhotoActionCopy.photoError);
              } finally {
                setIsProfilePhotoLoading(false);
              }
            })();
          },
        },
      ],
    );
  }, [displayUserId, profilePhotoActionCopy.photoError, profilePhotoActionCopy.photoRemoved, profilePhotoActionCopy.removePhoto, profilePhotoActionCopy.removePhotoConfirm, queryClient, t, updateUserProfile]);

  const openProfilePhotoOptions = useCallback(() => {
    const options = [
      profilePhotoActionCopy.takePhoto,
      profilePhotoActionCopy.chooseFromGallery,
    ];

    if (displayHasProfilePhoto) {
      options.push(profilePhotoActionCopy.removePhoto);
    }

    options.push(t("common.actions.cancel"));

    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = displayHasProfilePhoto ? options.indexOf(profilePhotoActionCopy.removePhoto) : undefined;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: profilePhotoActionCopy.title,
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            void handleTakePhoto();
            return;
          }

          if (buttonIndex === 1) {
            void handleChooseFromGallery();
            return;
          }

          if (displayHasProfilePhoto && buttonIndex === destructiveButtonIndex) {
            handleRemovePhoto();
          }
        },
      );

      return;
    }

    Alert.alert(profilePhotoActionCopy.title, undefined, [
      {
        text: profilePhotoActionCopy.takePhoto,
        onPress: () => {
          void handleTakePhoto();
        },
      },
      {
        text: profilePhotoActionCopy.chooseFromGallery,
        onPress: () => {
          void handleChooseFromGallery();
        },
      },
      ...(displayHasProfilePhoto
        ? [
            {
              text: profilePhotoActionCopy.removePhoto,
              style: "destructive" as const,
              onPress: handleRemovePhoto,
            },
          ]
        : []),
      {
        text: t("common.actions.cancel"),
        style: "cancel",
      },
    ]);
  }, [displayHasProfilePhoto, handleChooseFromGallery, handleRemovePhoto, handleTakePhoto, profilePhotoActionCopy, t]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t("me.signOut.title"),
      t("me.signOut.message"),
      [
        {
          text: t("common.actions.cancel"),
          style: "cancel",
        },
        {
          text: t("me.signOut.confirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              appStorage.delete(ONBOARDING_KEY);
              queryClient.clear();
              await logout();
            })();
          },
        },
      ],
    );
  }, [t, logout, queryClient]);

  const handleShareWeekly = useCallback(async () => {
    if (!canShareWeekly || isWeeklyShareLoading) {
      return;
    }

    setIsWeeklyShareLoading(true);

    try {
      const [blendHistory, supplementHistory] = await Promise.all([
        queryClient.ensureQueryData<BlendHistoryData>({
          queryKey: weeklyBlendQueryKey,
          queryFn: () => getBlendHistory(weeklyHistoryRange.from, weeklyHistoryRange.to, 1, 7),
          staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
          retry: 1,
        }),
        queryClient.ensureQueryData<SupplementHistoryData>({
          queryKey: weeklySupplementQueryKey,
          queryFn: () => getSupplementHistory(weeklyHistoryRange.from, weeklyHistoryRange.to),
          staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL,
          retry: 1,
        }),
      ]);

      setPendingWeeklyShare({
        weekStart: weeklyHistoryRange.from,
        weekEnd: weeklyHistoryRange.to,
        totalBlends: blendHistory.summary.blendCount,
        averageDailyProtein: blendHistory.summary.averageDailyProtein,
        currentStreak: profile?.currentStreak ?? 0,
        supplementAdherenceRate: supplementHistory.summary.averageAdherence * 100,
      });
    } catch {
      setIsWeeklyShareLoading(false);
      showToast(t("me.weeklyShare.error"));
    }
  }, [
    canShareWeekly,
    isWeeklyShareLoading,
    profile?.currentStreak,
    queryClient,
    t,
    weeklyBlendQueryKey,
    weeklyHistoryRange.from,
    weeklyHistoryRange.to,
    weeklySupplementQueryKey,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />

      <ScrollView
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20 },
        ]}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerActionsRow}>
            <View style={styles.headerActionsLeft}>
              {navigation.canGoBack() ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    navigation.goBack();
                  }}
                  style={styles.headerActionButton}
                >
                  <Ionicons color={HEADER_ACTION_ICON_COLOR} name="chevron-back" size={20} />
                </Pressable>
              ) : null}

              {canShareWeekly ? (
                <Pressable
                  accessibilityLabel={t("share.shareWeek")}
                  accessibilityRole="button"
                  disabled={isWeeklyShareLoading}
                  onPress={() => {
                    void handleShareWeekly();
                  }}
                  style={({ pressed }) => [
                    styles.headerActionButton,
                    pressed ? styles.headerActionButtonPressed : null,
                    isWeeklyShareLoading ? styles.headerActionButtonDisabled : null,
                  ]}
                >
                  {isWeeklyShareLoading ? (
                    <ActivityIndicator color={HEADER_ACTION_ICON_COLOR} size="small" />
                  ) : (
                    <Ionicons color={HEADER_ACTION_ICON_COLOR} name="share-social-outline" size={18} />
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.photoWrapper}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.9}
              onPress={openProfilePhotoOptions}
              style={styles.photoTouchable}
            >
              <ProfilePhoto
                userId={displayUserId ?? undefined}
                fullName={displayName}
                hasProfilePhoto={displayHasProfilePhoto}
                profilePhotoUpdatedAt={displayProfilePhotoUpdatedAt}
                size={PROFILE_PHOTO_SIZE}
                previewImageUri={profilePhotoPreviewUri}
                imageStyle={styles.photo}
              />

              {isProfilePhotoLoading ? (
                <View style={styles.photoLoadingOverlay}>
                  <ActivityIndicator color={colors.text.primary} size="small" />
                </View>
              ) : null}

              <View style={styles.photoCameraBadge}>
                <Ionicons
                  color={colors.text.primary}
                  name="camera"
                  size={PROFILE_PHOTO_CAMERA_ICON_SIZE}
                />
              </View>
            </TouchableOpacity>

            <View
              style={[
                styles.planBadge,
                isPro ? styles.planBadgePro : styles.planBadgeFree,
              ]}
            >
              <Text style={styles.planBadgeText}>
                {isPro
                  ? t("home.proPlan")
                  : t("home.freePlan")}
              </Text>
            </View>
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.displayEmail}>{displayEmail}</Text>
          {memberSinceStr ? (
            <Text style={styles.memberSince}>
              {t("me.memberSince", { date: memberSinceStr })}
            </Text>
          ) : null}
        </View>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <View style={styles.statsSection}>
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <StatCard
                icon="flash-outline"
                iconColor={colors.brand.pulse}
                value={String(profile?.currentStreak ?? 0)}
                label={t("me.currentStreak")}
              />
              <StatCard
                icon="cafe-outline"
                iconColor={colors.text.primary}
                value={String(profile?.blendCount ?? 0)}
                label={t("me.totalBlends")}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="trophy-outline"
                iconColor={LONGEST_STREAK_COLOR}
                value={String(profile?.longestStreak ?? 0)}
                label={t("me.longestStreak")}
              />
              <StatCard
                icon="star"
                iconColor={LONGEST_STREAK_COLOR}
                value={String(levelInfo.level)}
                label={t("me.level")}
              />
            </View>
          </View>
        </View>

        {/* ── Level progress ──────────────────────────────────────────────── */}
        <View style={styles.levelSection}>
          <View style={styles.levelCard}>
            <Text style={styles.levelCardName}>
              {t(levelInfo.levelNameKey as TranslationKey, { level: levelInfo.level })}
            </Text>

            <View style={styles.levelProgressTrack}>
              <Animated.View
                style={[
                  styles.levelProgressFill,
                  {
                    width: levelProgressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={styles.levelNextCopy}>
              {t('gamification.xpToNextLevel', {
                xp: levelInfo.xpToNextLevel.toLocaleString(),
                levelName: t(nextLevelInfo.levelNameKey as TranslationKey, {
                  level: nextLevelInfo.level,
                }),
              })}
            </Text>
          </View>
        </View>

        {/* ── Badges ──────────────────────────────────────────────────────── */}
        <View style={styles.badgesSection}>
          <Text style={styles.sectionTitle}>
            {t("me.badges.title")}
          </Text>
          <Text style={styles.badgesSubtitle}>
            {t("me.badges.subtitle")}
          </Text>
          <FlatList
            data={userBadges}
            keyExtractor={(item) => item.id}
            numColumns={4}
            horizontal={false}
            scrollEnabled={false}
            columnWrapperStyle={styles.badgeColumnWrapper}
            renderItem={({ item }) => (
              <BadgeCard
                badge={item}
                onPress={() => {
                  setSelectedBadge(item);
                }}
              />
            )}
            style={styles.badgeList}
          />
        </View>

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <View style={styles.settingsSection}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>
              {t("me.settings")}
            </Text>

            <SettingRow
              label={t("profile.fields.model")}
              value={t(getModelKey(displayModel))}
              onPress={() => { setEditingType("model"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("profile.fields.goal")}
              value={t(getGoalKey(displayGoal))}
              onPress={() => { setEditingType("goal"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("profile.fields.protein_target")}
              value={String(profile?.dailyProteinTarget ?? authUser?.dailyProteinTarget ?? 0) + "g"}
              onPress={() => { setEditingType("protein"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("me.settingCarbs")}
              value={String(profile?.dailyCarbTarget ?? authUser?.dailyCarbTarget ?? 0) + "g"}
              onPress={() => { setEditingType("carbs"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("profile.fields.calories_target")}
              value={String(profile?.dailyCalorieTarget ?? authUser?.dailyCalorieTarget ?? 0) + " kcal"}
              onPress={() => { setEditingType("calories"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("track.hydration")}
              value={displayVolume(profile?.dailyHydrationTarget ?? 2000)}
              onPress={() => { setEditingType("hydration"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("profile.unitSystem")}
              value={t(
                displayUnitSystem === "metric"
                  ? "me.metric"
                  : "me.imperial",
              )}
              onPress={() => { setEditingType("unitSystem"); }}
            />
            <View style={styles.divider} />

            <SettingRow
              label={t("profile.language.label")}
              value={languageDisplayName}
              onPress={() => { setEditingType("language"); }}
            />
          </View>
        </View>

        {/* ── Notification Preferences ────────────────────────────────────── */}
        <View style={styles.notificationsSection}>
          <View style={styles.notificationsSectionHeader}>
            <Ionicons
              name="notifications-outline"
              size={16}
              color={colors.brand.pulse}
            />
            <Text style={styles.notificationsSectionTitle}>
              {t("me.notifications.title")}
            </Text>
          </View>

          <View style={styles.settingsCard}>
            {notificationPreferenceRows.map((row, index) => (
              <View key={row.key}>
                <SwitchRow
                  label={row.label}
                  description={row.description}
                  value={row.value}
                  onValueChange={(value) => { togglePreference(row.key, value); }}
                />
                {index < notificationPreferenceRows.length - 1 ? (
                  <View style={styles.divider} />
                ) : null}
              </View>
            ))}
            <View style={styles.divider} />

            <TouchableHighlight
              accessibilityRole="button"
              onPress={() => { setEditingTime(true); }}
              style={styles.timeRowTouchable}
              underlayColor={SWITCH_UNDERLAY}
            >
              <View style={styles.timeRow}>
                <Text style={styles.timeRowLabel}>
                  {t("me.notifications.dailyPulseTime")}
                </Text>
                <View style={styles.timeRowValue}>
                  <Text style={styles.timeRowValueText}>
                    {formatDailyPulseTime(
                      dailyPulseTime.hour,
                      dailyPulseTime.minute,
                      displayUnitSystem,
                    )}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={CHEVRON_COLOR}
                  />
                </View>
              </View>
            </TouchableHighlight>
          </View>
        </View>

        {/* ── Upgrade / Pro ───────────────────────────────────────────────── */}
        {isPro ? (
          <View style={styles.proSection}>
            <View style={styles.proCard}>
              <View style={styles.proRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.brand.pulse}
                />
                <View style={styles.proTextBlock}>
                  <Text style={styles.proTitle}>
                    {t("me.isPro")}
                  </Text>
                  <Text style={styles.proDescription}>
                    {t("me.isProDescription")}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.upgradeSection}>
            <View style={styles.upgradeCard}>
              <Text style={styles.upgradeTitle}>
                {t("me.upgrade.title")}
              </Text>

              {(["benefit1", "benefit2", "benefit3"] as const).map((key) => (
                <View key={key} style={styles.benefitRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.brand.pulse}
                  />
                  <Text style={styles.benefitText}>
                    {t(("me.upgrade." + key) as TranslationKey)}
                  </Text>
                </View>
              ))}

              <Text style={styles.upgradePrice}>
                {upgradePriceSummary}
              </Text>

              <AuthButton
                loading={false}
                onPress={() => {
                  navigation.getParent<RootNavigationProp<"Upgrade">>()?.navigate("Upgrade");
                }}
              >
                {t("me.upgrade.button")}
              </AuthButton>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={isPurchaseBusy}
                onPress={() => {
                  void restoreProAccess();
                }}
                style={styles.restoreButton}
              >
                <Text style={styles.restoreButtonText}>{t("common.actions.restore")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons
              name="log-out-outline"
              size={18}
              color={colors.brand.pulse}
            />
            <Text style={styles.signOutText}>
              {t("me.signOut.title")}
            </Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>
            {"v" + (Constants.expoConfig?.version ?? "1.0.0")}
          </Text>

          <View style={styles.legalRow}>
            <Text
              style={styles.legalLink}
              onPress={() => {
                void Linking.openURL("https://blendiblender.com/terms");
              }}
            >
              {t("auth.termsOfService")}
            </Text>
            <Text style={styles.legalSeparator}> · </Text>
            <Text
              style={styles.legalLink}
              onPress={() => {
                void Linking.openURL("https://blendiblender.com/privacy");
              }}
            >
              {t("auth.privacyPolicy")}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Sheets (fora do ScrollView para overlay correto) ────────────── */}
      <BadgeDetailSheet
        badge={selectedBadge}
        onClose={() => {
          setSelectedBadge(null);
        }}
      />

      <DailyPulseTimeSheet
        visible={editingTime}
        initialHour={dailyPulseTime.hour}
        initialMinute={dailyPulseTime.minute}
        onConfirm={updateDailyPulseTime}
        onClose={() => { setEditingTime(false); }}
      />

      {editingType !== null ? (
        <EditSettingSheet
          type={editingType}
          currentValue={getCurrentEditValue(editingType)}
          onConfirm={(val) => {
            void handleConfirmEdit(val);
          }}
          onClose={() => {
            setEditingType(null);
          }}
        />
      ) : null}

      {pendingWeeklyShare ? (
        <WeeklyShareCard
          ref={weeklyShareCardRef}
          weekStart={pendingWeeklyShare.weekStart}
          weekEnd={pendingWeeklyShare.weekEnd}
          totalBlends={pendingWeeklyShare.totalBlends}
          averageDailyProtein={pendingWeeklyShare.averageDailyProtein}
          currentStreak={pendingWeeklyShare.currentStreak}
          supplementAdherenceRate={pendingWeeklyShare.supplementAdherenceRate}
          user={{
            userId: displayUserId ?? undefined,
            name: displayName,
            hasProfilePhoto: displayHasProfilePhoto,
            profilePhotoUpdatedAt: displayProfilePhotoUpdatedAt,
          }}
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
  scrollContent: {
    paddingBottom: 48,
  },

  // ── Header
  header: {
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  headerActionsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 12,
  },
  headerActionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: HEADER_ACTION_BACKGROUND,
    borderWidth: 1,
    borderColor: HEADER_ACTION_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionButtonPressed: {
    opacity: 0.8,
  },
  headerActionButtonDisabled: {
    opacity: 0.72,
  },
  photoWrapper: {
    width: 116,
    height: 96,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  photoTouchable: {
    width: PROFILE_PHOTO_SIZE,
    height: PROFILE_PHOTO_SIZE,
  },
  photo: {
    width: PROFILE_PHOTO_SIZE,
    height: PROFILE_PHOTO_SIZE,
    borderRadius: PROFILE_PHOTO_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.brand.pulse,
  },
  photoLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: PROFILE_PHOTO_SIZE,
    height: PROFILE_PHOTO_SIZE,
    borderRadius: PROFILE_PHOTO_SIZE / 2,
    backgroundColor: PROFILE_PHOTO_LOADING_OVERLAY,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: PROFILE_PHOTO_CAMERA_BADGE_SIZE,
    height: PROFILE_PHOTO_CAMERA_BADGE_SIZE,
    borderRadius: PROFILE_PHOTO_CAMERA_BADGE_SIZE / 2,
    backgroundColor: colors.brand.pulse,
    alignItems: "center",
    justifyContent: "center",
  },
  planBadge: {
    position: "absolute",
    right: 0,
    bottom: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  planBadgeFree: {
    backgroundColor: PLAN_BADGE_FREE_BG,
    borderColor: PLAN_BADGE_FREE_BORDER,
  },
  planBadgePro: {
    backgroundColor: PLAN_BADGE_PRO_BG,
    borderColor: PLAN_BADGE_PRO_BORDER,
  },
  planBadgeText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.medium,
  },
  displayName: {
    marginTop: 12,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: "center",
  },
  displayEmail: {
    marginTop: 4,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    textAlign: "center",
  },
  memberSince: {
    marginTop: 4,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    textAlign: "center",
    opacity: LABEL_OPACITY,
  },

  // ── Stats
  statsSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  statsGrid: {
    gap: 10,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },

  // ── Level progress
  levelSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  levelCard: {
    backgroundColor: CARD_BACKGROUND,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 16,
  },
  levelCardName: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
  levelProgressTrack: {
    marginTop: 10,
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: LEVEL_PROGRESS_TRACK_COLOR,
    overflow: 'hidden',
  },
  levelProgressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.pulse,
  },
  levelNextCopy: {
    marginTop: 6,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    opacity: LEVEL_NEXT_COPY_OPACITY,
  },

  // ── Badges
  badgesSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  badgesSubtitle: {
    marginTop: 4,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    opacity: LABEL_OPACITY,
  },
  badgeList: {
    marginTop: 12,
  },
  badgeColumnWrapper: {
    gap: 10,
    marginBottom: 10,
  },

  // ── Notification preferences
  notificationsSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  notificationsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  notificationsSectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
  timeRowTouchable: {
    borderRadius: 12,
  },
  timeRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
  },
  timeRowLabel: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    lineHeight: 20,
  },
  timeRowValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "52%",
  },
  timeRowValueText: {
    color: VALUE_COLOR,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    textAlign: "right",
  },

  // ── Settings
  settingsSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  settingsCard: {
    backgroundColor: CARD_BACKGROUND,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  settingsTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  divider: {
    height: 0.5,
    backgroundColor: DIVIDER_COLOR,
    marginHorizontal: 16,
  },

  // ── Upgrade
  upgradeSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  upgradeCard: {
    backgroundColor: UPGRADE_CARD_BG,
    borderWidth: 1,
    borderColor: UPGRADE_CARD_BORDER,
    borderRadius: borderRadius.lg,
    padding: 20,
    gap: 12,
  },
  upgradeTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  benefitText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    flex: 1,
  },
  upgradePrice: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 13,
    opacity: PRICE_OPACITY,
  },
  restoreButton: {
    alignSelf: "center",
    paddingTop: 2,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  restoreButtonText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },

  // ── Pro card
  proSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  proCard: {
    backgroundColor: CARD_BACKGROUND,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: borderRadius.lg,
    padding: 16,
  },
  proRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  proTextBlock: {
    flex: 1,
  },
  proTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  proDescription: {
    marginTop: 2,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    opacity: LABEL_OPACITY,
  },

  // ── Footer
  footer: {
    marginTop: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  versionText: {
    marginTop: 24,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: VERSION_OPACITY,
  },
  legalRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  legalLink: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: TERMS_OPACITY,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    opacity: TERMS_OPACITY,
  },
});
