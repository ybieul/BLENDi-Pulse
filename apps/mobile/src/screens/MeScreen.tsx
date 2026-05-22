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

import { useMemo, useState, useCallback } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
} from "@blendi/shared";

import { api } from "../config/api";
import { CACHE_CONFIG, QUERY_KEYS } from "../config/cache.config";
import { createAppStorage } from "../config/storage";
import { useAppTranslation } from "../hooks/useAppTranslation";
import { useUnits } from "../hooks/useUnits";
import { useAuthStore } from "../store/auth.store";
import type { SupportedLocale } from "../locales/i18n";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_BACKGROUND = "rgba(255,255,255,0.07)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const DIVIDER_COLOR = "rgba(255,255,255,0.06)";
const PLAN_BADGE_FREE_BG = "rgba(255,255,255,0.08)";
const PLAN_BADGE_FREE_BORDER = "rgba(255,255,255,0.12)";
const PLAN_BADGE_PRO_BG = "rgba(154,72,147,0.25)";
const PLAN_BADGE_PRO_BORDER = "rgba(154,72,147,0.40)";
const INITIALS_BG = "rgba(154,72,147,0.30)";
const UPGRADE_CARD_BG = "rgba(154,72,147,0.12)";
const UPGRADE_CARD_BORDER = "rgba(154,72,147,0.35)";
const LONGEST_STREAK_COLOR = "rgba(245,158,11,0.90)";
const LABEL_OPACITY = 0.55;
const VERSION_OPACITY = 0.35;
const PRICE_OPACITY = 0.60;
const TERMS_OPACITY = 0.45;

const ONBOARDING_KEY = "onboarding_completed";

// Namespace de storage compartilhado com auth.store — mesma instância MMKV.
const appStorage = createAppStorage("blendi-pulse");

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
  currentStreak: number;
  longestStreak: number;
  blendCount: number;
  isPro: boolean;
  createdAt: string;
}

interface UserProfileResponse {
  success: true;
  data: {
    user: UserProfileData;
  };
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MeScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale, changeLocale } = useAppTranslation();
  const authUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const queryClient = useQueryClient();
  const { displayVolume } = useUnits();

  // ── Local state ──────────────────────────────────────────────────────────

  const [editingType, setEditingType] = useState<EditSettingType | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);

  // ── Profile query ────────────────────────────────────────────────────────

  const { data: profileResponse } = useQuery<UserProfileResponse>({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: fetchUserProfile,
    staleTime: CACHE_CONFIG.USER_PROFILE_TTL,
  });

  const profile = profileResponse?.data.user;

  // ── Derived data ─────────────────────────────────────────────────────────

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

  // isPro: campo direto da API (Part 2) ou derivado do modelo local
  const isPro: boolean =
    profile?.isPro ?? authUser?.blendiModel !== "Lite";

  const createdAt = profile?.createdAt ?? authUser?.createdAt ?? "";

  const memberSinceStr = useMemo(() => {
    if (!createdAt) return "";
    return formatMemberSince(createdAt, locale);
  }, [createdAt, locale]);

  const initials = useMemo(() => {
    return displayName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("");
  }, [displayName]);

  const userBadges = useMemo(() => {
    return calculateUserBadges({
      blendCount: profile?.blendCount ?? 0,
      longestStreak: profile?.longestStreak ?? 0,
      blendiModel: displayModel,
    });
  }, [profile?.blendCount, profile?.longestStreak, displayModel]);

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
          <View style={styles.photoWrapper}>
            {profile?.profilePhoto ? (
              <Image
                source={{ uri: profile.profilePhoto }}
                style={styles.photo}
              />
            ) : (
              <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{initials}</Text>
              </View>
            )}
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
            <StatCard
              icon="trophy-outline"
              iconColor={LONGEST_STREAK_COLOR}
              value={String(profile?.longestStreak ?? 0)}
              label={t("me.longestStreak")}
            />
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
                {t("me.upgrade.price")}
              </Text>

              <AuthButton
                onPress={() => {
                  Alert.alert(
                    t("me.upgrade.soonTitle"),
                    t("me.upgrade.soonMessage"),
                  );
                }}
              >
                {t("me.upgrade.button")}
              </AuthButton>
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
    alignItems: "center",
  },
  photoWrapper: {
    width: 80,
    height: 80,
    alignSelf: "center",
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.brand.pulse,
  },
  initialsCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: INITIALS_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
  },
  planBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
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
  statsRow: {
    flexDirection: "row",
    gap: 8,
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
