// apps/mobile/src/screens/PantryScannerScreen.tsx
// Tela Pantry Scanner — CP1.12.
// Fluxo de 5 passos: permission → capture → analyzing → ingredients → recipes.

import { type ElementRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
} from '@blendi/shared';

import { useAuthStore } from '../store/auth.store';
import { useFavorites } from '../hooks/useFavorites';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { IngredientCheckItem } from '../components/pantryScanner/IngredientCheckItem';
import { RecipeCard } from '../components/pulseAi/RecipeCard';
import { imagePlaceholderStyles } from '../assets';
import {
  analyzePantry,
  compressAndEncodeImage,
  PantryScannerServiceError,
} from '../services/pantryScanner.service';
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

const ANALYZING_STEP_KEYS = [
  'pantryScanner.analyzingStep1',
  'pantryScanner.analyzingStep2',
  'pantryScanner.analyzingStep3',
] as const;
const ANALYZING_STEP_INTERVAL_MS = 6000;
const ANALYZING_FADE_DURATION_MS = 200;

const TOP_BAR_BG = 'rgba(0,0,0,0.45)';
const BOTTOM_BAR_BG = 'rgba(0,0,0,0.55)';
const CAPTURE_BUTTON_BG = 'rgba(255,255,255,0.20)';
const CAPTURE_BUTTON_BORDER = 'rgba(255,255,255,0.40)';
const GALLERY_BUTTON_BG = 'rgba(0,0,0,0.45)';
const SCANS_PILL_BG = 'rgba(0,0,0,0.55)';
const SCANS_PILL_BORDER = 'rgba(255,255,255,0.15)';
const RENEWS_COLOR = 'rgba(255,255,255,0.55)';
const INPUT_BG = 'rgba(255,255,255,0.06)';
const INPUT_BORDER = 'rgba(255,255,255,0.10)';
const GHOST_BORDER = 'rgba(255,255,255,0.15)';
const SUBTITLE_COLOR = 'rgba(255,255,255,0.60)';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 'permission' | 'capture' | 'analyzing' | 'ingredients' | 'recipes';

interface CheckedIngredient extends PantryIngredient {
  checked: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysUntilReset(resetDateStr?: string): number {
  if (!resetDateStr) return 0;
  const ms = new Date(resetDateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ─── PantryScannerScreen ──────────────────────────────────────────────────────

export function PantryScannerScreen({ navigation }: PulseAIStackScreenProps<'PantryScanner'>) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const { favorites } = useFavorites();
  const isPro = useAuthStore((state) => state.user?.isPro ?? false);
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

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef<ElementRef<typeof CameraView>>(null);
  const analyzingTextOpacity = useRef(new Animated.Value(1)).current;

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
            ? t(err.translationKey as Parameters<typeof t>[0])
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
  }, [handleUpgradePress, queryClient, step, capturedBase64, t]);

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
        showToast(t(result.error.translationKey as Parameters<typeof t>[0]));
        return;
      }
      setCapturedUri(uri);
      setCapturedBase64(result.imageBase64);
      setStep('analyzing');
    },
    [t],
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
    setNewIngredientText('');
    setError(null);
    setStep('capture');
  }, []);

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
              <Ionicons name="close" size={CLOSE_ICON_SIZE} color={colors.text.primary} />
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

          {/* Center spacer — camera viewfinder */}
          <View style={styles.cameraCenter} />

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
              <Ionicons name="images-outline" size={28} color={colors.text.primary} />
            </Pressable>

            {/* Capture */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void handleCapture();
              }}
              style={styles.captureButton}
            >
              <Ionicons name="camera" size={32} color={colors.text.primary} />
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
          <View style={[styles.logoPlaceholder, imagePlaceholderStyles.blendiLogo]} />
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
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
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
                placeholderTextColor={colors.text.tertiary}
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
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('pantryScanner.recipesGenerated')}</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.recipesScrollContent}
        >
          <Text style={styles.recipeSubtitle}>{recipeSubtitle}</Text>

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
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
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  permissionDescription: {
    color: colors.text.secondary,
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

  // ── Capture ───────────────────────────────────────────────────────────────
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
    color: colors.text.primary,
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
    color: colors.text.primary,
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
    color: colors.text.primary,
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
    color: colors.text.secondary,
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
    color: colors.text.primary,
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
  ghostButton: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: GHOST_BORDER,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ghostButtonLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
