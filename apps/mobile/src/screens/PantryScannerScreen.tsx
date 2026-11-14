// apps/mobile/src/screens/PantryScannerScreen.tsx
// Tela Pantry Scanner — CP1.12.
// Fluxo de 5 passos: permission → capture → analyzing → ingredients → recipes.
// CP-1.1.4b: depois dos scans grátis do ciclo, 1 prévia bloqueada por ciclo —
// o mesmo fluxo, com cards bloqueados (só macros) na etapa das receitas.

import { type ElementRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CameraView, PermissionStatus } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from '@blendi/shared';

import { useAuthStore } from '../store/auth.store';
import { useFavorites } from '../hooks/useFavorites';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { IngredientCheckItem } from '../components/pantryScanner/IngredientCheckItem';
import { LockedRecipeCard, RecipeCard } from '../components/pulseAi/RecipeCard';
import { images } from '../assets';
import {
  analyzePantry,
  compressAndEncodeImage,
  isPantryLockedPreview,
  PANTRY_PREVIEW_NOT_FOUND_CODE,
  PantryScannerServiceError,
  unlockPantryPreview,
} from '../services/pantryScanner.service';
import { trackEvent } from '../services/analytics.service';
import {
  clearLastPantryPreview,
  clearLastPantryPreviewIfSeen,
  markLastPantryPreviewSeen,
  readLastPantryPreview,
  saveLastPantryPreview,
  type PantryLastPreview,
} from '../utils/pantryLastPreview.utils';
import { PANTRY_SCAN_LIMIT_FREE, QUERY_KEYS } from '../config/cache.config';
import { getRecipeFavoriteKey } from '../services/favorites.service';
import { showToast } from '../utils/toast.events';
import type {
  AppTabParamList,
  PulseAIStackScreenProps,
  RootStackParamList,
} from '../navigation/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CLOSE_ICON_SIZE = 24;
const CAMERA_PERMISSION_ICON_SIZE = 64;
const CAPTURE_BUTTON_SIZE = 72;
const LOGO_SIZE = 64;
const NO_RECIPES_ICON_SIZE = 40;
// CP-1.1.4b: origem da prévia bloqueada nos eventos e no card.
const PAYWALL_PREVIEW_SOURCE = 'pantry_scanner';

const ANALYZING_STEP_KEYS = [
  'pantryScanner.analyzingStep1',
  'pantryScanner.analyzingStep2',
  'pantryScanner.analyzingStep3',
] as const;
const ANALYZING_STEP_INTERVAL_MS = 6000;
const ANALYZING_FADE_DURATION_MS = 200;

// Overlay da câmera ao vivo — fica sempre com visual escuro fixo, não reage
// ao tema claro/escuro do app (ver exceção documentada no plano de dark mode).
const TOP_BAR_BG = colors.overlay.black[45];
const BOTTOM_BAR_BG = colors.overlay.black[55];
const CAPTURE_BUTTON_BG = colors.overlay.white[20];
const CAPTURE_BUTTON_BORDER = colors.overlay.white[40];
const GALLERY_BUTTON_BG = colors.overlay.black[45];
const SCANS_PILL_BG = colors.overlay.black[55];
const SCANS_PILL_BORDER = colors.overlay.white[15];
const RENEWS_COLOR = colors.overlay.white[55];
const CAMERA_ICON_COLOR = colors.text.primary;
const CAMERA_PILL_TEXT_COLOR = colors.text.primary;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 'permission' | 'capture' | 'analyzing' | 'ingredients' | 'recipes';

interface CheckedIngredient extends PantryIngredient {
  checked: boolean;
}

interface LockedPreviewState {
  previewId: string;
  /** 'expired': o desbloqueio respondeu 404. */
  status: 'locked' | 'expired';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysUntilReset(resetDateStr?: string): number {
  if (!resetDateStr) return 0;
  const ms = new Date(resetDateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ─── PantryScannerScreen ──────────────────────────────────────────────────────

export function PantryScannerScreen({ navigation }: PulseAIStackScreenProps<'PantryScanner'>) {
  const themeColors = useColors();
  const INPUT_BG = themeColors.overlay.plum[6];
  const INPUT_BORDER = themeColors.overlay.plum[16];
  const GHOST_BORDER = themeColors.overlay.plum[15];
  const SUBTITLE_COLOR = themeColors.overlay.plum[60];

  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const { favorites } = useFavorites();
  const isPro = useAuthStore((state) => state.user?.isPro ?? false);
  const userId = useAuthStore((state) => state.user?.id);
  const isFreeTier = !isPro;

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('permission');
  const [, setCapturedUri] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<CheckedIngredient[]>([]);
  const [recipes, setRecipes] = useState<PulseAiRecipe[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [scansLimit, setScansLimit] = useState(0);
  const [resetDate, setResetDate] = useState<string | undefined>(undefined);
  const [isGeneratingRecipes, setIsGeneratingRecipes] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [newIngredientText, setNewIngredientText] = useState('');
  const [analyzingStepIndex, setAnalyzingStepIndex] = useState(0);
  // CP-1.1.4b: prévia bloqueada (só macros) e a última prévia guardada.
  const [lockedPreview, setLockedPreview] = useState<LockedPreviewState | null>(null);
  const [previewRecipes, setPreviewRecipes] = useState<PulseAiRecipePreview[]>([]);
  const [unlockedPreviewId, setUnlockedPreviewId] = useState<string | null>(null);
  const [lastPreview, setLastPreview] = useState<PantryLastPreview | null>(null);
  const [isOpeningLastPreview, setIsOpeningLastPreview] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef<ElementRef<typeof CameraView>>(null);
  const analyzingTextOpacity = useRef(new Animated.Value(1)).current;
  const unlockingPreviewIdRef = useRef<string | null>(null);
  const shownPreviewIdsRef = useRef(new Set<string>());

  // ── Check permission on mount ──────────────────────────────────────────────
  useEffect(() => {
    void Camera.getCameraPermissionsAsync()
      .then(({ status }) => {
        if (status === PermissionStatus.GRANTED) {
          setStep('capture');
        }
      })
      .catch(() => undefined);
  }, []);

  // ── Analyzing: alterna as 3 mensagens de status a cada 6s ──────────────────
  useEffect(() => {
    if (step !== 'analyzing') {
      return;
    }

    setAnalyzingStepIndex(0);
    analyzingTextOpacity.setValue(1);

    const intervalId = setInterval(() => {
      setAnalyzingStepIndex((current) => {
        if (current >= ANALYZING_STEP_KEYS.length - 1) {
          return current;
        }

        Animated.sequence([
          Animated.timing(analyzingTextOpacity, {
            toValue: 0,
            duration: ANALYZING_FADE_DURATION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(analyzingTextOpacity, {
            toValue: 1,
            duration: ANALYZING_FADE_DURATION_MS,
            useNativeDriver: true,
          }),
        ]).start();

        return current + 1;
      });
    }, ANALYZING_STEP_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [step, analyzingTextOpacity]);

  const handleUpgradePress = useCallback(() => {
    navigation
      .getParent()
      ?.getParent<NavigationProp<RootStackParamList>>()
      ?.navigate('Upgrade');
  }, [navigation]);

  // ── Analyzing: call API when step transitions to 'analyzing' ───────────────
  useEffect(() => {
    if (step !== 'analyzing' || !capturedBase64) return;

    let cancelled = false;

    analyzePantry(capturedBase64, 'image/jpeg')
      .then((result) => {
        if (cancelled) return;

        const nextScansUsed = result.scansUsed ?? 0;
        const nextScansLimit = result.scansLimit ?? PANTRY_SCAN_LIMIT_FREE;

        if (result.resetDate) {
          setResetDate(result.resetDate);
        }

        queryClient.setQueryData<Pick<PantryAnalysisResult, 'scansUsed' | 'scansLimit' | 'resetDate'>>(
          QUERY_KEYS.pantryScans,
          {
            scansUsed: nextScansUsed,
            scansLimit: nextScansLimit,
            resetDate: result.resetDate,
          },
        );

        setScansUsed(nextScansUsed);
        setScansLimit(nextScansLimit);

        if (isPantryLockedPreview(result)) {
          // Prévia: ingredientes detectados e só os macros de cada receita.
          // O id fica no aparelho para quem virar Pro dentro da validade.
          if (userId) {
            saveLastPantryPreview(userId, {
              previewId: result.previewId,
              expiresAt: result.previewExpiresAt,
            });
          }
          setIngredients(result.ingredients.map((i) => ({ ...i, checked: true })));
          setRecipes([]);
          setPreviewRecipes(result.recipes);
          setLockedPreview({ previewId: result.previewId, status: 'locked' });
          setUnlockedPreviewId(null);
          setStep('ingredients');
          return;
        }

        setPreviewRecipes([]);
        setLockedPreview(null);
        setUnlockedPreviewId(null);

        if (result.noFoodDetected) {
          setIngredients([]);
          setRecipes([]);
          setStep('capture');
          showToast(t('pantryScanner.noFoodDetected'));
          return;
        }

        if (result.noUsableIngredients) {
          setIngredients([]);
          setRecipes([]);
          setStep('capture');
          showToast(t('pantryScanner.noUsableIngredients'));
          return;
        }

        const checkedIngredients: CheckedIngredient[] = result.ingredients
          .filter((i) => i.confidence === 'high' || i.confidence === 'medium')
          .map((i) => ({ ...i, checked: true }));

        setIngredients(checkedIngredients);
        setRecipes(result.recipes);
        setStep('ingredients');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof PantryScannerServiceError
            ? t(err.translationKey)
            : t('errors.network_internal_server_error');

        if (
          err instanceof PantryScannerServiceError
          && err.apiCode?.trim().toLowerCase() === 'scanner/monthly-limit-reached'
        ) {
          setStep('capture');
          handleUpgradePress();
          return;
        }

        setStep('capture');
        showToast(message);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUpgradePress, queryClient, step, capturedBase64, t, userId]);

  // ── Prévia bloqueada (CP-1.1.4b) ───────────────────────────────────────────
  const handleLockedPreviewPress = useCallback(() => {
    trackEvent('paywall_preview_tapped', { source: PAYWALL_PREVIEW_SOURCE });
    handleUpgradePress();
  }, [handleUpgradePress]);

  // paywall_preview_shown quando os cards bloqueados aparecem (uma vez por prévia).
  useEffect(() => {
    if (step !== 'recipes' || lockedPreview?.status !== 'locked') {
      return;
    }

    if (shownPreviewIdsRef.current.has(lockedPreview.previewId)) {
      return;
    }

    shownPreviewIdsRef.current.add(lockedPreview.previewId);
    trackEvent('paywall_preview_shown', { source: PAYWALL_PREVIEW_SOURCE });
  }, [lockedPreview, step]);

  // Virou Pro com a prévia na tela (a compra atualiza o auth store antes do
  // goBack da tela de planos): troca os cards bloqueados pelas receitas.
  // 404 = expirada; 403 ou rede: nada muda e a próxima mudança tenta de novo.
  useEffect(() => {
    if (!isPro || lockedPreview?.status !== 'locked') {
      return;
    }

    const { previewId } = lockedPreview;

    if (unlockingPreviewIdRef.current === previewId) {
      return;
    }

    unlockingPreviewIdRef.current = previewId;

    unlockPantryPreview(previewId)
      .then((unlocked) => {
        setRecipes(unlocked.recipes);
        setPreviewRecipes([]);
        setLockedPreview(null);
        setUnlockedPreviewId(previewId);
      })
      .catch((err: unknown) => {
        if (err instanceof PantryScannerServiceError && err.apiCode === PANTRY_PREVIEW_NOT_FOUND_CODE) {
          setLockedPreview({ previewId, status: 'expired' });
          if (userId) {
            clearLastPantryPreview(userId);
          }
          showToast(t(err.translationKey));
        }
      })
      .finally(() => {
        unlockingPreviewIdRef.current = null;
      });
  }, [isPro, lockedPreview, t, userId]);

  // Receitas desbloqueadas vistas: o próximo scan novo limpa a prévia guardada.
  useEffect(() => {
    if (step === 'recipes' && unlockedPreviewId && userId) {
      markLastPantryPreviewSeen(userId, unlockedPreviewId);
    }
  }, [step, unlockedPreviewId, userId]);

  // Aviso "Receitas do seu último scan": só para Pro, na captura, com a
  // prévia guardada e válida (a leitura já apaga a expirada).
  useEffect(() => {
    if (step !== 'capture' || !isPro || !userId) {
      setLastPreview(null);
      return;
    }

    setLastPreview(readLastPantryPreview(userId));
  }, [isPro, step, userId]);

  const handleOpenLastPreview = useCallback(async () => {
    if (!lastPreview || !userId || isOpeningLastPreview) {
      return;
    }

    setIsOpeningLastPreview(true);

    try {
      const unlocked = await unlockPantryPreview(lastPreview.previewId);
      setIngredients(unlocked.ingredients.map((i) => ({ ...i, checked: true })));
      setRecipes(unlocked.recipes);
      setPreviewRecipes([]);
      setLockedPreview(null);
      setUnlockedPreviewId(lastPreview.previewId);
      setStep('recipes');
    } catch (err) {
      if (err instanceof PantryScannerServiceError && err.apiCode === PANTRY_PREVIEW_NOT_FOUND_CODE) {
        clearLastPantryPreview(userId);
        setLastPreview(null);
      }

      showToast(
        err instanceof PantryScannerServiceError
          ? t(err.translationKey)
          : t('errors.network_internal_server_error'),
      );
    } finally {
      setIsOpeningLastPreview(false);
    }
  }, [isOpeningLastPreview, lastPreview, t, userId]);

  const handleDismissLastPreview = useCallback(() => {
    if (userId) {
      clearLastPantryPreview(userId);
    }
    setLastPreview(null);
  }, [userId]);

  // ── Dismiss isGeneratingRecipes when recipes step is active ───────────────
  useEffect(() => {
    if (step === 'recipes' && isGeneratingRecipes) {
      setIsGeneratingRecipes(false);
    }
  }, [step, isGeneratingRecipes]);

  // ── Favorite map for RecipeCard ────────────────────────────────────────────
  const favoriteIdsByRecipeKey = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    favorites.forEach((fav) => {
      const recipe: PulseAiRecipe = {
        title: fav.recipeName,
        ingredients: fav.ingredients,
        macros: {
          protein: fav.protein,
          carbs: fav.carbs,
          fat: fav.fat,
          calories: fav.calories,
        },
        prepTimeSeconds: fav.prepTimeSeconds,
        blendInstruction: fav.blendInstruction,
        tip: fav.tip,
        hasSubstitutes: fav.hasSubstitutes,
      };
      map[getRecipeFavoriteKey(recipe)] = fav.id;
    });
    return map;
  }, [favorites]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const confirmedIngredients = ingredients.filter((i) => i.checked);
  const daysUntilReset = getDaysUntilReset(resetDate);
  const remainingScansCount = Math.max(0, scansLimit - scansUsed);

  const recipeSubtitle = useMemo(() => {
    const names = confirmedIngredients.map((i) => i.name);
    const extras = names.length - 3;
    const base = names.slice(0, 3).join(', ');
    const suffix = extras > 0
      ? ` ${t('pantryScanner.additionalIngredients', { count: extras })}`
      : '';

    return t('pantryScanner.basedOnIngredients', { ingredients: `${base}${suffix}`.trim() });
  }, [confirmedIngredients, t]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRequestPermission = useCallback(async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === PermissionStatus.GRANTED) {
      setPermissionDenied(false);
      setStep('capture');
    } else {
      setPermissionDenied(true);
    }
  }, []);

  const handleAnalyze = useCallback(
    async (uri: string) => {
      const result = await compressAndEncodeImage(uri);
      if (!result.ok) {
        showToast(t(result.error.translationKey));
        return;
      }
      // Scan novo depois de ver as receitas desbloqueadas: a prévia guardada sai.
      if (userId) {
        clearLastPantryPreviewIfSeen(userId);
      }
      setCapturedUri(uri);
      setCapturedBase64(result.imageBase64);
      setStep('analyzing');
    },
    [t, userId],
  );

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo?.uri) {
        await handleAnalyze(photo.uri);
      }
    } catch {
      showToast(t('errors.network_internal_server_error'));
    }
  }, [handleAnalyze, t]);

  const handleGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await handleAnalyze(result.assets[0].uri);
    }
  }, [handleAnalyze]);

  const handleToggleIngredient = useCallback((index: number) => {
    setIngredients((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item)),
    );
  }, []);

  const handleAddIngredient = useCallback(() => {
    const name = newIngredientText.trim();
    if (!name) return;
    const newItem: CheckedIngredient = { name, confidence: 'high', checked: true };
    setIngredients((prev) => [...prev, newItem]);
    setNewIngredientText('');
  }, [newIngredientText]);

  const handleGenerateRecipes = useCallback(() => {
    setIsGeneratingRecipes(true);
    setStep('recipes');
  }, []);

  const handleStartBlend = useCallback(
    (recipe: PulseAiRecipe) => {
      navigation
        .getParent<BottomTabNavigationProp<AppTabParamList>>()
        ?.navigate('Blend', { recipe });
    },
    [navigation],
  );

  const handleScanAgain = useCallback(() => {
    setCapturedUri(null);
    setCapturedBase64(null);
    setIngredients([]);
    setRecipes([]);
    setPreviewRecipes([]);
    setLockedPreview(null);
    setUnlockedPreviewId(null);
    setNewIngredientText('');
    setError(null);
    setStep('capture');
  }, []);

  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: themeColors.background.primary,
    },
    safeArea: {
      flex: 1,
    },
    flex: {
      flex: 1,
    },

    // ── Permission ────────────────────────────────────────────────────────────
    permissionContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing['2xl'],
      gap: spacing.lg,
    },
    permissionTitle: {
      color: themeColors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['2xl'],
      fontWeight: fontWeights.bold,
      textAlign: 'center',
    },
    permissionDescription: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
      lineHeight: 22,
    },
    permissionDeniedText: {
      color: colors.feedback.warning,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: spacing.md,
    },
    permissionButton: {
      marginTop: spacing.md,
    },

    // ── Capture (overlay sempre escuro, não reage ao tema) ────────────────────
    cameraOverlay: {
      justifyContent: 'space-between',
    },
    cameraTopBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      backgroundColor: TOP_BAR_BG,
    },
    cameraIconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scansPillContainer: {
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    scansPill: {
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: SCANS_PILL_BORDER,
      backgroundColor: SCANS_PILL_BG,
      paddingHorizontal: spacing.xl,
      paddingVertical: 6,
    },
    scansPillText: {
      color: CAMERA_PILL_TEXT_COLOR,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
    renewsText: {
      color: RENEWS_COLOR,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      textAlign: 'right',
      paddingHorizontal: spacing.sm,
    },
    cameraCenter: {
      flex: 1,
    },
    lastPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      marginTop: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: SCANS_PILL_BORDER,
      backgroundColor: SCANS_PILL_BG,
    },
    lastPreviewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
      paddingVertical: spacing.sm,
    },
    lastPreviewText: {
      color: CAMERA_PILL_TEXT_COLOR,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: fontWeights.medium,
    },
    lastPreviewDismiss: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing['3xl'],
      paddingVertical: spacing.xl,
      backgroundColor: BOTTOM_BAR_BG,
    },
    galleryButton: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      backgroundColor: GALLERY_BUTTON_BG,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureButton: {
      width: CAPTURE_BUTTON_SIZE,
      height: CAPTURE_BUTTON_SIZE,
      borderRadius: CAPTURE_BUTTON_SIZE / 2,
      backgroundColor: CAPTURE_BUTTON_BG,
      borderWidth: 2,
      borderColor: CAPTURE_BUTTON_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Analyzing ─────────────────────────────────────────────────────────────
    analyzingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      paddingHorizontal: spacing['2xl'],
    },
    logoPlaceholder: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    },
    analyzingText: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: 16,
      fontWeight: fontWeights.regular,
      textAlign: 'center',
    },

    // ── Shared header (ingredients + recipes) ─────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
    },
    headerBackButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: themeColors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
      textAlign: 'center',
    },
    headerPlaceholder: {
      width: 44,
    },

    // ── Ingredients ───────────────────────────────────────────────────────────
    ingredientsScrollContent: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing['4xl'],
      gap: spacing.sm,
    },
    sectionSubtitle: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    addIngredientInput: {
      marginTop: spacing.md,
      backgroundColor: INPUT_BG,
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    footerContainer: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.lg,
      paddingTop: spacing.md,
    },

    // ── Recipes ───────────────────────────────────────────────────────────────
    recipesScrollContent: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing['5xl'],
      gap: spacing.xl,
    },
    recipeSubtitle: {
      color: SUBTITLE_COLOR,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    noRecipes: {
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing['3xl'],
      paddingHorizontal: spacing.lg,
    },
    noRecipesTitle: {
      color: themeColors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
      textAlign: 'center',
    },
    noRecipesMessage: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
      textAlign: 'center',
    },
    ghostButton: {
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: GHOST_BORDER,
      paddingVertical: spacing.xl,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    ghostButtonLabel: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
  });

  // ─── Step: permission ──────────────────────────────────────────────────────
  if (step === 'permission') {
    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="reduced" />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera" size={CAMERA_PERMISSION_ICON_SIZE} color={colors.brand.pulse} />
            <Text style={styles.permissionTitle}>{t('pantryScanner.permissionTitle')}</Text>
            <Text style={styles.permissionDescription}>
              {t('pantryScanner.permissionDescription')}
            </Text>
            {permissionDenied ? (
              <Text style={styles.permissionDeniedText}>
                {t('pantryScanner.permissionDenied')}
              </Text>
            ) : (
              <AuthButton
                onPress={() => {
                  void handleRequestPermission();
                }}
                style={styles.permissionButton}
              >
                {t('pantryScanner.grantPermission')}
              </AuthButton>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Step: capture ────────────────────────────────────────────────────────
  if (step === 'capture') {
    return (
      <View style={styles.screen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
        <SafeAreaView
          style={[StyleSheet.absoluteFillObject, styles.cameraOverlay]}
          edges={['top', 'bottom']}
        >
          {/* Top bar */}
          <View style={styles.cameraTopBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.close')}
              onPress={() => navigation.goBack()}
              style={styles.cameraIconButton}
            >
              <Ionicons name="close" size={CLOSE_ICON_SIZE} color={CAMERA_ICON_COLOR} />
            </Pressable>

            {isFreeTier && scansLimit > 0 ? (
              <View style={styles.scansPillContainer}>
                <View style={styles.scansPill}>
                  <Text style={styles.scansPillText}>
                    {t('pantryScanner.scansRemaining', {
                      count: remainingScansCount,
                    })}
                  </Text>
                </View>
                {daysUntilReset > 0 ? (
                  <Text style={styles.renewsText}>
                    {t('pantryScanner.renewsIn', { days: daysUntilReset })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Center spacer — camera viewfinder. CP-1.1.4b: aviso discreto da
              última prévia, só para Pro dentro da validade. */}
          <View style={styles.cameraCenter}>
            {lastPreview ? (
              <View style={styles.lastPreviewRow} testID="pantry-last-preview">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pantryScanner.lockedPreview.lastScanA11yLabel')}
                  accessibilityState={{ busy: isOpeningLastPreview }}
                  disabled={isOpeningLastPreview}
                  onPress={() => {
                    void handleOpenLastPreview();
                  }}
                  style={styles.lastPreviewButton}
                  testID="pantry-last-preview-open"
                >
                  <Ionicons name="restaurant-outline" size={16} color={CAMERA_ICON_COLOR} />
                  <Text style={styles.lastPreviewText}>
                    {t('pantryScanner.lockedPreview.lastScanTitle')}
                  </Text>
                  {isOpeningLastPreview ? (
                    <ActivityIndicator color={CAMERA_ICON_COLOR} size="small" />
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pantryScanner.lockedPreview.lastScanDismiss')}
                  onPress={handleDismissLastPreview}
                  style={styles.lastPreviewDismiss}
                  testID="pantry-last-preview-dismiss"
                >
                  <Ionicons name="close" size={16} color={CAMERA_ICON_COLOR} />
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Bottom bar */}
          <View style={styles.cameraBottomBar}>
            {/* Gallery */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void handleGallery();
              }}
              style={styles.galleryButton}
            >
              <Ionicons name="images-outline" size={28} color={CAMERA_ICON_COLOR} />
            </Pressable>

            {/* Capture */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void handleCapture();
              }}
              style={styles.captureButton}
            >
              <Ionicons name="camera" size={32} color={CAMERA_ICON_COLOR} />
            </Pressable>

            {/* Mirror of gallery button to keep capture centered */}
            <View style={styles.galleryButton} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Step: analyzing ──────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="full" />
        <View style={styles.analyzingContainer}>
          <Image source={images.blendiLogo} resizeMode="contain" style={styles.logoPlaceholder} />
          <Animated.Text style={[styles.analyzingText, { opacity: analyzingTextOpacity }]}>
            {t(ANALYZING_STEP_KEYS[analyzingStepIndex])}
          </Animated.Text>
          <ActivityIndicator color={colors.brand.pulse} size="large" />
        </View>
      </View>
    );
  }

  // ─── Step: ingredients ────────────────────────────────────────────────────
  if (step === 'ingredients') {
    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="reduced" />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.back')}
              onPress={() => setStep('capture')}
              style={styles.headerBackButton}
            >
              <Ionicons name="arrow-back" size={24} color={themeColors.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle}>{t('pantryScanner.ingredientsFound')}</Text>
            <View style={styles.headerPlaceholder} />
          </View>

          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.ingredientsScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sectionSubtitle}>{t('pantryScanner.confirmIngredients')}</Text>

              {ingredients.map((item, index) => (
                <IngredientCheckItem
                  key={`${item.name}-${index}`}
                  ingredient={item}
                  checked={item.checked}
                  onToggle={() => handleToggleIngredient(index)}
                />
              ))}

              <TextInput
                style={styles.addIngredientInput}
                placeholder={t('pantryScanner.addIngredient')}
                placeholderTextColor={themeColors.text.tertiary}
                value={newIngredientText}
                onChangeText={setNewIngredientText}
                onSubmitEditing={handleAddIngredient}
                returnKeyType="done"
              />
            </ScrollView>

            <View style={styles.footerContainer}>
              <AuthButton
                onPress={handleGenerateRecipes}
                disabled={confirmedIngredients.length === 0}
                loading={isGeneratingRecipes}
              >
                {t('pantryScanner.generateRecipes')}
              </AuthButton>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Step: recipes ────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <AuroraBackground intensity="reduced" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
            onPress={() => setStep('ingredients')}
            style={styles.headerBackButton}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('pantryScanner.recipesGenerated')}</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.recipesScrollContent}
        >
          {recipes.length === 0 && previewRecipes.length === 0 ? (
            // CP-1.1.1d: a IA não entregou receita (falha ou lista vazia). O
            // backend devolveu o scan (scansUsed já veio atualizado) e não deu
            // XP — explica isso em vez de mostrar a etapa sem nenhum card.
            <View accessible accessibilityRole="alert" style={styles.noRecipes} testID="pantry-no-recipes">
              <Ionicons color={themeColors.text.tertiary} name="restaurant-outline" size={NO_RECIPES_ICON_SIZE} />
              <Text style={styles.noRecipesTitle}>{t('pantryScanner.noRecipesTitle')}</Text>
              <Text style={styles.noRecipesMessage}>{t('pantryScanner.noRecipesMessage')}</Text>
            </View>
          ) : (
            <Text style={styles.recipeSubtitle}>{recipeSubtitle}</Text>
          )}

          {/* CP-1.1.4b: prévia bloqueada — só macros, título genérico,
              toque abre os planos. */}
          {lockedPreview
            ? previewRecipes.map((preview, index) => (
                <LockedRecipeCard
                  key={`${lockedPreview.previewId}-${index}`}
                  preview={preview}
                  expired={lockedPreview.status === 'expired'}
                  onPress={handleLockedPreviewPress}
                  source={PAYWALL_PREVIEW_SOURCE}
                />
              ))
            : null}

          {recipes.map((recipe, index) => {
            const key = getRecipeFavoriteKey(recipe);
            return (
              <RecipeCard
                key={`${recipe.title}-${index}`}
                recipe={recipe}
                isFavorited={Boolean(favoriteIdsByRecipeKey[key])}
                favoriteId={favoriteIdsByRecipeKey[key]}
                onStartBlend={() => handleStartBlend(recipe)}
              />
            );
          })}

          <Pressable
            accessibilityRole="button"
            onPress={handleScanAgain}
            style={styles.ghostButton}
          >
            <Text style={styles.ghostButtonLabel}>{t('pantryScanner.scanAgain')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
