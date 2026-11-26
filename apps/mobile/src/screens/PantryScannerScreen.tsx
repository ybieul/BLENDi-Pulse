// apps/mobile/src/screens/PantryScannerScreen.tsx
// Tela Pantry Scanner — CP1.12.
// Fluxo: permission → capture → reading (lê a foto, não conta scan) →
// ingredients (confirmação com efeito real) → generating (conta o scan) →
// recipes. CP-1.1.4b: depois dos scans grátis do ciclo, 1 prévia bloqueada
// por ciclo — o mesmo fluxo, com cards bloqueados (só macros) nas receitas.
// CP-B7: marcar/desmarcar, adicionar à mão (obrigatório em todas as
// receitas), líquido quando a foto não mostra, pedido opcional e álcool só
// para 21+ (mesma folha de idade do Pulse AI).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import * as ImagePicker from 'expo-image-picker';
import { deleteAsync } from 'expo-file-system/legacy';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
  PANTRY_ADDED_ITEMS_MAX,
  PANTRY_ADDED_ITEM_MAX_LENGTH,
  PANTRY_REQUEST_MAX_LENGTH,
  hasAllergies,
  type AllergenSelection,
  type PantryAlcoholAge,
  type PantryAnalysisResult,
  type PantryIngredient,
  type PantryLiquidChoice,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from '@blendi/shared';

import { useAuthStore } from '../store/auth.store';
import { resolveBlenderTextKey } from '../utils/blenderText.utils';
import { useFavorites } from '../hooks/useFavorites';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { IngredientCheckItem } from '../components/pantryScanner/IngredientCheckItem';
import { LockedRecipeCard, RecipeCard } from '../components/pulseAi/RecipeCard';
import { AgeConfirmationSheet } from '../components/pulseAi/AgeConfirmationSheet';
import { AllergyConfirmationSheet } from '../components/allergies/AllergyConfirmationSheet';
import { PantryHowToUseSheet } from '../components/pantryScanner/PantryHowToUseSheet';
import { PantryCamera, type PantryCameraHandle } from '../components/pantryScanner/PantryCamera';
import { getVisionCamera } from '../components/pantryScanner/visionCamera.loader';
import { addToSelection, EMPTY_ALLERGEN_SELECTION } from '../utils/allergies.utils';
import { images } from '../assets';
import {
  checkPantryAllergy,
  compressAndEncodeImage,
  generatePantryRecipes,
  PANTRY_ALLERGY_CONFIRMATION_CODE,
  isPantryLockedPreview,
  PANTRY_AGE_CONFIRMATION_REQUIRED_CODE,
  PANTRY_MONTHLY_LIMIT_REACHED_CODE,
  PANTRY_PREVIEW_NOT_FOUND_CODE,
  PANTRY_READ_EXPIRED_CODE,
  PANTRY_READ_LIMIT_REACHED_CODE,
  PantryScannerServiceError,
  readPantryPhoto,
  unlockPantryPreview,
} from '../services/pantryScanner.service';
import { confirmAlcoholAge } from '../services/pulseAi.service';
import type { TranslationKey } from '../locales/i18n';
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

// CP-B7: as opções do líquido quando a foto não mostra nenhum.
const LIQUID_OPTIONS = [
  { value: 'water', labelKey: 'pantryScanner.liquidWater' },
  { value: 'milk', labelKey: 'pantryScanner.liquidMilk' },
  { value: 'plant_milk', labelKey: 'pantryScanner.liquidPlantMilk' },
  { value: 'none', labelKey: 'pantryScanner.liquidNone' },
] as const satisfies ReadonlyArray<{ value: PantryLiquidChoice; labelKey: TranslationKey }>;

// Overlay da câmera ao vivo — fica sempre com visual escuro fixo, não reage
// ao tema claro/escuro do app (ver exceção documentada no plano de dark mode).
// Teste no build EAS (25-26/11): ícones e textos usavam colors.text.primary
// do tema claro (Deep Plum, escuro) e sumiam sobre a faixa preta. Agora são
// branco fixo (text.inverse, igual nos dois temas). Pior caso, cena branca:
// ícones sobre a faixa de 45% ≈ 3.4:1 (mínimo de 3:1 para ícones); texto das
// pílulas (pílula 55% sobre a faixa) ≈ 10:1; o texto solto "Renova em…"
// ganha sombra escura para não depender da cena.
const TOP_BAR_BG = colors.overlay.black[45];
const BOTTOM_BAR_BG = colors.overlay.black[55];
const CAPTURE_BUTTON_BG = colors.overlay.white[20];
const CAPTURE_BUTTON_BORDER = colors.overlay.white[40];
const GALLERY_BUTTON_BG = colors.overlay.black[45];
const SCANS_PILL_BG = colors.overlay.black[55];
const SCANS_PILL_BORDER = colors.overlay.white[15];
const RENEWS_COLOR = colors.overlay.white[80];
const CAMERA_ICON_COLOR = colors.text.inverse;
const CAMERA_PILL_TEXT_COLOR = colors.text.inverse;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 'permission' | 'capture' | 'reading' | 'ingredients' | 'generating' | 'recipes';

// CP-C3: sem módulo nativo da câmera (Expo Go) vai direto à captura, que
// mostra o aviso com a galeria; com permissão concedida, também.
// CP-C3a: "acesso à câmera" = permissão concedida, ou sem módulo nativo (aí a
// captura só mostra o aviso e nunca abre a câmera).
function readCameraAccess(): boolean {
  const visionCamera = getVisionCamera();
  if (!visionCamera) return true;
  try {
    return visionCamera.Camera.getCameraPermissionStatus() === 'granted';
  } catch {
    return false;
  }
}

function getInitialStep(): Step {
  return readCameraAccess() ? 'capture' : 'permission';
}

// CP-C3a: a foto da câmera é um arquivo temporário do app (3-5 MB). Depois da
// compressão ela não serve mais: apaga sem esperar, sem erro se já não existir
// e sem log (nada de caminho de arquivo nos logs). Nunca é chamada para a
// foto da galeria.
function discardCameraPhoto(uri: string): void {
  try {
    deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  } catch {
    // Sem módulo nativo: nada a apagar.
  }
}

interface CheckedIngredient extends PantryIngredient {
  checked: boolean;
  /** CP-B7: da lista do validador (backend). Começa desmarcado. */
  isAlcoholic: boolean;
  /**
   * CP-B7: serve para shake/smoothie. false = grupo "Outros itens na foto",
   * recolhido e desmarcado (a pessoa pode marcar).
   */
  blendSuitable: boolean;
  /** CP-B6: bate com alergia cadastrada (backend). Começa desmarcado. */
  isAllergen?: boolean;
  allergens?: AllergenSelection;
}

/** CP-B6: o que a folha de alergia faz depois da resposta. */
type AllergySheetAction =
  | { kind: 'check'; index: number }
  | { kind: 'add'; name: string }
  | { kind: 'generate' };

interface AllergySheetState {
  allergens: AllergenSelection;
  action: AllergySheetAction;
}

/** CP-B6: a seleção já está toda confirmada nesta geração. */
function isCovered(selection: AllergenSelection | undefined, confirmed: AllergenSelection): boolean {
  return (
    (selection?.common ?? []).every((code) => confirmed.common.includes(code)) &&
    (selection?.custom ?? []).every((item) => confirmed.custom.includes(item))
  );
}

/** CP-B7: o que a folha de idade faz depois da resposta. */
interface AgeSheetState {
  /** Item alcoólico que a pessoa tentou marcar. */
  pendingIndex: number | null;
  /** O backend pediu a idade na geração: reenviar depois da resposta. */
  resendGenerate: boolean;
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
  // CP-B6: sem alergia cadastrada, adicionar não consulta o backend.
  const userHasAllergies = useAuthStore((state) => hasAllergies(state.user?.allergies));
  const blendiOwnership = useAuthStore((state) => state.user?.blendiOwnership);
  // CP-B4: quem não tem BLENDi lê os textos neutros (blenderText.utils). O ref
  // deixa os handlers de erro lerem o valor atual sem entrar nas dependências.
  const blendiOwnershipRef = useRef(blendiOwnership);
  blendiOwnershipRef.current = blendiOwnership;
  const isFreeTier = !isPro;

  // ── State ──────────────────────────────────────────────────────────────────
  // CP-C3: permissão já concedida abre direto na câmera (sem piscar a tela de
  // permissão). Sem módulo nativo (Expo Go) também: a etapa de captura mostra
  // o aviso e a galeria.
  const [step, setStep] = useState<Step>(getInitialStep);
  const [, setCapturedUri] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<CheckedIngredient[]>([]);
  const [recipes, setRecipes] = useState<PulseAiRecipe[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [scansLimit, setScansLimit] = useState(0);
  const [resetDate, setResetDate] = useState<string | undefined>(undefined);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // CP-C3a: a galeria funciona sem a câmera. Se o usuário veio pela galeria e
  // a leitura volta para a captura, sem permissão a tela de permissão aparece
  // no lugar da câmera.
  const [hasCameraAccess, setHasCameraAccess] = useState(readCameraAccess);
  const [newIngredientText, setNewIngredientText] = useState('');
  // CP-B7: leitura confirmada na tela.
  const [readId, setReadId] = useState<string | null>(null);
  const [readExpiresAt, setReadExpiresAt] = useState<string | null>(null);
  const [hasLiquid, setHasLiquid] = useState(true);
  const [liquid, setLiquid] = useState<PantryLiquidChoice | null>(null);
  const [addedItems, setAddedItems] = useState<string[]>([]);
  const [requestText, setRequestText] = useState('');
  const [alcoholAge, setAlcoholAge] = useState<PantryAlcoholAge>('unknown');
  const [nextIsPreview, setNextIsPreview] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [ageSheet, setAgeSheet] = useState<AgeSheetState | null>(null);
  // CP-B6: alérgenos confirmados/recusados NESTA leitura (nunca gravados) e a
  // folha de confirmação na hora.
  const [confirmedAllergens, setConfirmedAllergens] = useState<AllergenSelection>(EMPTY_ALLERGEN_SELECTION);
  const [declinedAllergens, setDeclinedAllergens] = useState<AllergenSelection>(EMPTY_ALLERGEN_SELECTION);
  const [allergySheet, setAllergySheet] = useState<AllergySheetState | null>(null);
  const [isHowToUseVisible, setIsHowToUseVisible] = useState(false);
  // CP-B7: grupo "Outros itens na foto" começa recolhido.
  const [otherItemsExpanded, setOtherItemsExpanded] = useState(false);
  // CP-1.1.4b: prévia bloqueada (só macros) e a última prévia guardada.
  const [lockedPreview, setLockedPreview] = useState<LockedPreviewState | null>(null);
  const [previewRecipes, setPreviewRecipes] = useState<PulseAiRecipePreview[]>([]);
  const [unlockedPreviewId, setUnlockedPreviewId] = useState<string | null>(null);
  const [lastPreview, setLastPreview] = useState<PantryLastPreview | null>(null);
  const [isOpeningLastPreview, setIsOpeningLastPreview] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const cameraRef = useRef<PantryCameraHandle>(null);
  const isCapturingRef = useRef(false);
  const unlockingPreviewIdRef = useRef<string | null>(null);
  const shownPreviewIdsRef = useRef(new Set<string>());

  // ── CP-C3: câmera pausa sem foco (outra aba/tela por cima) ou no fundo ─────
  const [isScreenFocused, setIsScreenFocused] = useState(() => navigation.isFocused());
  const [isAppInBackground, setIsAppInBackground] = useState(() => AppState.currentState === 'background');

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => setIsScreenFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setIsScreenFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppInBackground(state === 'background');
    });
    return () => subscription.remove();
  }, []);

  // CP-C3a: de volta dos Ajustes (ou de qualquer saída do app) sem a câmera
  // liberada, relê a permissão. Concedida: vai para a câmera sem sair da tela.
  // (No iOS, mudar a permissão nos Ajustes costuma reiniciar o app; aí vale a
  // etapa inicial. No Android o app continua vivo e cai aqui.)
  useEffect(() => {
    if (hasCameraAccess) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !readCameraAccess()) return;
      setHasCameraAccess(true);
      setPermissionDenied(false);
      setStep((current) => (current === 'permission' ? 'capture' : current));
    });
    return () => subscription.remove();
  }, [hasCameraAccess]);

  const isCameraActive = isScreenFocused && !isAppInBackground;

  const handleUpgradePress = useCallback(() => {
    navigation
      .getParent()
      ?.getParent<NavigationProp<RootStackParamList>>()
      ?.navigate('Upgrade');
  }, [navigation]);

  const updateScanStatus = useCallback(
    (status: { scansUsed?: number; scansLimit?: number; resetDate?: string }) => {
      const nextScansUsed = status.scansUsed ?? 0;
      const nextScansLimit = status.scansLimit ?? PANTRY_SCAN_LIMIT_FREE;

      if (status.resetDate) {
        setResetDate(status.resetDate);
      }

      queryClient.setQueryData<Pick<PantryAnalysisResult, 'scansUsed' | 'scansLimit' | 'resetDate'>>(
        QUERY_KEYS.pantryScans,
        { scansUsed: nextScansUsed, scansLimit: nextScansLimit, resetDate: status.resetDate },
      );

      setScansUsed(nextScansUsed);
      setScansLimit(nextScansLimit);
    },
    [queryClient],
  );

  const errorMessage = useCallback(
    (err: unknown) =>
      err instanceof PantryScannerServiceError
        ? t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current))
        : t('errors.network_internal_server_error'),
    [t],
  );

  // ── Reading: lê a foto quando a etapa vira 'reading' (CP-B7) ────────────
  useEffect(() => {
    if (step !== 'reading' || !capturedBase64) return;

    let cancelled = false;

    readPantryPhoto(capturedBase64, 'image/jpeg')
      .then((result) => {
        if (cancelled) return;

        updateScanStatus(result);
        setAlcoholAge(result.alcoholAge);
        setNextIsPreview(result.nextGenerationIsPreview);
        setPreviewRecipes([]);
        setLockedPreview(null);
        setUnlockedPreviewId(null);
        setRecipes([]);

        if (result.noFoodDetected || result.noUsableIngredients || !result.readId) {
          setIngredients([]);
          setStep('capture');
          showToast(t(result.noFoodDetected ? 'pantryScanner.noFoodDetected' : 'pantryScanner.noUsableIngredients'));
          return;
        }

        // Bebida alcoólica começa desmarcada (só 21+ marca). CP-B7: o que não
        // serve para shake vai para "Outros itens na foto", desmarcado.
        // CP-B6: item com alergia cadastrada também começa desmarcado.
        setIngredients(result.ingredients.map((i) => {
          const blendSuitable = i.blendSuitable !== false;
          return { ...i, blendSuitable, checked: blendSuitable && !i.isAlcoholic && i.isAllergen !== true };
        }));
        setConfirmedAllergens(EMPTY_ALLERGEN_SELECTION);
        setDeclinedAllergens(EMPTY_ALLERGEN_SELECTION);
        setOtherItemsExpanded(false);
        setReadId(result.readId);
        setReadExpiresAt(result.readExpiresAt ?? null);
        setHasLiquid(result.hasLiquid);
        setLiquid(null);
        setAddedItems([]);
        setRequestText('');
        setNewIngredientText('');
        setHasGenerated(false);
        setStep('ingredients');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStep('capture');
        showToast(errorMessage(err));

        // Free sem leituras no ciclo: o mesmo caminho do limite de scans.
        if (
          isFreeTier
          && err instanceof PantryScannerServiceError
          && err.apiCode === PANTRY_READ_LIMIT_REACHED_CODE
        ) {
          handleUpgradePress();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [capturedBase64, errorMessage, handleUpgradePress, isFreeTier, step, t, updateScanStatus]);

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
          showToast(t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current)));
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
      setIngredients(unlocked.ingredients.map((i) => ({ ...i, checked: true, isAlcoholic: false, blendSuitable: true })));
      setReadId(null);
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
          ? t(resolveBlenderTextKey(err.translationKey, blendiOwnershipRef.current))
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
  const otherItemsCount = ingredients.filter((i) => !i.blendSuitable).length;
  const recipeIngredientNames = useMemo(
    () => [...confirmedIngredients.map((i) => i.name), ...addedItems],
    [addedItems, confirmedIngredients],
  );
  const needsLiquidChoice = !hasLiquid && liquid === null;
  const canGenerate = readId !== null && recipeIngredientNames.length > 0 && !needsLiquidChoice;
  const daysUntilReset = getDaysUntilReset(resetDate);
  const remainingScansCount = Math.max(0, scansLimit - scansUsed);

  const recipeSubtitle = useMemo(() => {
    const names = recipeIngredientNames;
    const extras = names.length - 3;
    const base = names.slice(0, 3).join(', ');
    const suffix = extras > 0
      ? ` ${t('pantryScanner.additionalIngredients', { count: extras })}`
      : '';

    return t('pantryScanner.basedOnIngredients', { ingredients: `${base}${suffix}`.trim() });
  }, [recipeIngredientNames, t]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRequestPermission = useCallback(async () => {
    const visionCamera = getVisionCamera();
    if (!visionCamera) {
      setStep('capture');
      return;
    }
    const status = await visionCamera.Camera.requestCameraPermission().catch(() => 'denied' as const);
    if (status === 'granted') {
      setHasCameraAccess(true);
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
      setStep('reading');
    },
    [t, userId],
  );

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    // CP-C3: dois toques rápidos no disparo não tiram duas fotos.
    if (!camera || isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      const photoUri = await camera.takePhoto();
      if (photoUri) {
        try {
          await handleAnalyze(photoUri);
        } finally {
          // CP-C3a: a compressão terminou (com sucesso ou erro).
          discardCameraPhoto(photoUri);
        }
      }
    } catch {
      showToast(t('errors.network_internal_server_error'));
    } finally {
      isCapturingRef.current = false;
    }
  }, [handleAnalyze, t]);

  const handleGallery = useCallback(async () => {
    // CP-C3b: falha ao abrir o seletor vira aviso (como no disparo da câmera),
    // não promessa rejeitada sem tratamento.
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });
    } catch {
      showToast(t('errors.network_internal_server_error'));
      return;
    }
    if (!result.canceled && result.assets[0]) {
      await handleAnalyze(result.assets[0].uri);
    }
  }, [handleAnalyze, t]);

  // CP-C3a: permissão negada → Ajustes do app (no iOS o pedido não volta).
  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  const checkIngredient = useCallback((index: number, checked: boolean) => {
    setIngredients((prev) => prev.map((item, i) => (i === index ? { ...item, checked } : item)));
  }, []);

  // CP-B7: bebida alcoólica só para 21+. Menor/"Não": desativado. Sem
  // idade: marcar abre a folha de idade (a mesma do Pulse AI).
  const handleToggleIngredient = useCallback((index: number) => {
    const item = ingredients[index];
    if (!item) return;

    if (item.isAlcoholic && !item.checked) {
      if (alcoholAge === 'under-age') return;
      if (alcoholAge === 'unknown') {
        setAgeSheet({ pendingIndex: index, resendGenerate: false });
        return;
      }
    }

    // CP-B6: marcar item com alergia cadastrada pede a confirmação NA HORA.
    if (item.isAllergen && !item.checked && item.allergens && !isCovered(item.allergens, confirmedAllergens)) {
      setAllergySheet({ allergens: item.allergens, action: { kind: 'check', index } });
      return;
    }

    checkIngredient(index, !item.checked);
  }, [alcoholAge, checkIngredient, confirmedAllergens, ingredients]);

  // Adicionado à mão = pedido explícito (obrigatório em todas as receitas).
  // Se for um item da leitura, só marca (não vira "você adicionou").
  const handleAddIngredient = useCallback(() => {
    const name = newIngredientText.trim().slice(0, PANTRY_ADDED_ITEM_MAX_LENGTH);
    if (!name) return;
    const key = name.toLowerCase();
    const readIndex = ingredients.findIndex((i) => i.name.trim().toLowerCase() === key);

    setNewIngredientText('');

    if (readIndex >= 0) {
      if (!ingredients[readIndex].checked) handleToggleIngredient(readIndex);
      // CP-B7: item de "Outros itens" fica visível ao ser marcado.
      if (!ingredients[readIndex].blendSuitable) setOtherItemsExpanded(true);
      return;
    }

    const addItem = () => {
      setAddedItems((prev) => (
        prev.length >= PANTRY_ADDED_ITEMS_MAX || prev.some((item) => item.toLowerCase() === key)
          ? prev
          : [...prev, name]
      ));
    };

    // CP-B6: item adicionado que bate com alergia cadastrada pede a
    // confirmação na hora (as famílias são do backend). Sem resposta da
    // conferência (rede), adiciona: a geração confere de novo e pergunta.
    if (!userHasAllergies) {
      addItem();
      return;
    }

    checkPantryAllergy(name)
      .then((check) => {
        if (check.isAllergen && !isCovered(check.allergens, confirmedAllergens)) {
          setAllergySheet({ allergens: check.allergens, action: { kind: 'add', name } });
          return;
        }
        addItem();
      })
      .catch(() => {
        addItem();
      });
  }, [confirmedAllergens, handleToggleIngredient, ingredients, newIngredientText, userHasAllergies]);

  const handleRemoveAdded = useCallback((name: string) => {
    setAddedItems((prev) => prev.filter((item) => item !== name));
  }, []);

  const handleScanAgain = useCallback(() => {
    setCapturedUri(null);
    setCapturedBase64(null);
    setIngredients([]);
    setRecipes([]);
    setPreviewRecipes([]);
    setLockedPreview(null);
    setUnlockedPreviewId(null);
    setNewIngredientText('');
    setReadId(null);
    setReadExpiresAt(null);
    setAddedItems([]);
    setRequestText('');
    setLiquid(null);
    setHasGenerated(false);
    setConfirmedAllergens(EMPTY_ALLERGEN_SELECTION);
    setDeclinedAllergens(EMPTY_ALLERGEN_SELECTION);
    setStep('capture');
  }, []);

  const handleGenerateRecipes = useCallback(async (
    allergyChoice: { override?: AllergenSelection; declined?: AllergenSelection; afterAnswer?: boolean } = {},
  ) => {
    if (!readId || !canGenerate) return;
    const override = allergyChoice.override ?? confirmedAllergens;
    const declined = allergyChoice.declined ?? declinedAllergens;
    const hasOverride = override.common.length > 0 || override.custom.length > 0;
    const hasDeclined = declined.common.length > 0 || declined.custom.length > 0;

    // Leitura vencida: pede nova foto sem gastar a chamada.
    if (readExpiresAt && Date.parse(readExpiresAt) <= Date.now()) {
      showToast(t('errors.scanner_read_expired'));
      handleScanAgain();
      return;
    }

    const trimmedRequest = requestText.trim();
    setStep('generating');

    try {
      const result = await generatePantryRecipes({
        readId,
        selected: confirmedIngredients.map((i) => i.name),
        added: addedItems,
        ...(!hasLiquid && liquid ? { liquid } : {}),
        ...(trimmedRequest ? { request: trimmedRequest.slice(0, PANTRY_REQUEST_MAX_LENGTH) } : {}),
        // CP-B6: confirmações/recusas desta leitura (o backend só aceita as
        // que vieram dos itens marcados, adicionados ou do pedido).
        ...(hasOverride ? { allergyOverride: override } : {}),
        ...(hasDeclined ? { allergyDeclined: declined } : {}),
      });

      updateScanStatus(result);

      if (isPantryLockedPreview(result)) {
        // Prévia: ingredientes e só os macros. O id fica no aparelho para
        // quem virar Pro dentro da validade. A leitura foi usada.
        if (userId) {
          saveLastPantryPreview(userId, { previewId: result.previewId, expiresAt: result.previewExpiresAt });
        }
        setRecipes([]);
        setPreviewRecipes(result.recipes);
        setLockedPreview({ previewId: result.previewId, status: 'locked' });
        setUnlockedPreviewId(null);
        setReadId(null);
        setNextIsPreview(false);
        setStep('recipes');
        return;
      }

      setPreviewRecipes([]);
      setLockedPreview(null);
      setUnlockedPreviewId(null);
      setRecipes(result.recipes);
      // Id novo para editar e gerar de novo sem nova foto.
      setReadId(result.readId ?? null);
      setReadExpiresAt(result.readExpiresAt ?? readExpiresAt);
      setNextIsPreview(!isPro && (result.scansUsed ?? 0) >= (result.scansLimit ?? PANTRY_SCAN_LIMIT_FREE));
      setHasGenerated(result.recipes.length > 0);
      setStep('recipes');
    } catch (err) {
      const apiCode = err instanceof PantryScannerServiceError ? err.apiCode : undefined;

      if (apiCode === PANTRY_AGE_CONFIRMATION_REQUIRED_CODE) {
        setStep('ingredients');
        setAgeSheet({ pendingIndex: null, resendGenerate: true });
        return;
      }

      // CP-B6: alérgeno no pedido (ou item sem confirmação). Nada foi
      // gasto; a folha pergunta e a geração vai de novo com a resposta. Se
      // ainda pedir depois de responder, mostra o erro (sem laço).
      if (
        apiCode === PANTRY_ALLERGY_CONFIRMATION_CODE &&
        err instanceof PantryScannerServiceError &&
        err.allergens &&
        !allergyChoice.afterAnswer
      ) {
        setStep('ingredients');
        setAllergySheet({ allergens: err.allergens, action: { kind: 'generate' } });
        return;
      }

      if (apiCode === PANTRY_READ_EXPIRED_CODE) {
        showToast(errorMessage(err));
        handleScanAgain();
        return;
      }

      setStep('ingredients');

      if (apiCode === PANTRY_MONTHLY_LIMIT_REACHED_CODE) {
        handleUpgradePress();
        return;
      }

      showToast(errorMessage(err));
    }
  }, [
    addedItems,
    canGenerate,
    confirmedAllergens,
    confirmedIngredients,
    declinedAllergens,
    errorMessage,
    handleScanAgain,
    handleUpgradePress,
    hasLiquid,
    isPro,
    liquid,
    readExpiresAt,
    readId,
    requestText,
    t,
    updateScanStatus,
    userId,
  ]);

  // Resposta da folha de idade: grava uma vez (POST /pulse-ai/age-confirmation)
  // e segue com o que a pessoa estava fazendo.
  const handleAgeAnswer = useCallback(async (isAdult: boolean) => {
    const pending = ageSheet;
    setAgeSheet(null);

    try {
      const confirmed = await confirmAlcoholAge(isAdult);
      setAlcoholAge(confirmed ? 'of-age' : 'under-age');

      if (confirmed && pending?.pendingIndex !== null && pending?.pendingIndex !== undefined) {
        checkIngredient(pending.pendingIndex, true);
      }

      if (pending?.resendGenerate) {
        await handleGenerateRecipes();
      }
    } catch (err) {
      showToast(
        err instanceof Error && 'translationKey' in err
          ? t((err as { translationKey: TranslationKey }).translationKey)
          : t('errors.network_internal_server_error'),
      );
    }
  }, [ageSheet, checkIngredient, handleGenerateRecipes, t]);

  // CP-B6: resposta da folha de alergia (vale só para esta leitura).
  const handleAllergyAnswer = useCallback(async (include: boolean) => {
    const pending = allergySheet;
    setAllergySheet(null);
    if (!pending) return;
    const { action, allergens } = pending;

    if (include) {
      const nextConfirmed = addToSelection(confirmedAllergens, allergens);
      setConfirmedAllergens(nextConfirmed);
      if (action.kind === 'check') checkIngredient(action.index, true);
      if (action.kind === 'add') {
        setAddedItems((prev) => (
          prev.length >= PANTRY_ADDED_ITEMS_MAX || prev.some((item) => item.toLowerCase() === action.name.toLowerCase())
            ? prev
            : [...prev, action.name]
        ));
      }
      if (action.kind === 'generate') {
        await handleGenerateRecipes({ override: nextConfirmed, afterAnswer: true });
      }
      return;
    }

    // "Não, fazer sem": o item fica desmarcado / não é adicionado; o
    // alérgeno do pedido vai como recusado (receita sem ele, sem sugestão).
    if (action.kind === 'generate') {
      const nextDeclined = addToSelection(declinedAllergens, allergens);
      setDeclinedAllergens(nextDeclined);
      await handleGenerateRecipes({ declined: nextDeclined, afterAnswer: true });
    }
  }, [allergySheet, checkIngredient, confirmedAllergens, declinedAllergens, handleGenerateRecipes]);

  const handleHowToUseExample = useCallback((text: string) => {
    setIsHowToUseVisible(false);
    setRequestText(text.slice(0, PANTRY_REQUEST_MAX_LENGTH));
  }, []);

  const handleStartBlend = useCallback(
    (recipe: PulseAiRecipe) => {
      navigation
        .getParent<BottomTabNavigationProp<AppTabParamList>>()
        ?.navigate('Blend', { recipe });
    },
    [navigation],
  );


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
    permissionTopBar: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
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
    permissionDeniedActions: {
      alignSelf: 'stretch',
      gap: spacing.md,
    },
    permissionGalleryButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.brand.pulse,
    },
    permissionGalleryText: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.semibold,
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
      textShadowColor: colors.overlay.black[82],
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
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
      gap: spacing.sm,
    },
    scanNotice: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      textAlign: 'center',
    },
    regenerateNotice: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
      borderRadius: borderRadius.md,
      backgroundColor: INPUT_BG,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    otherItemsGroup: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    otherItemsHeader: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: INPUT_BG,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    otherItemsTitle: {
      flex: 1,
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
    otherItemsHint: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      lineHeight: 18,
    },
    addedRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.brand.pulse,
      backgroundColor: INPUT_BG,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    addedTextColumn: {
      flex: 1,
      minWidth: 0,
    },
    addedName: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
    addedLabel: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
    },
    addedRemove: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    addButton: {
      minHeight: 48,
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: GHOST_BORDER,
      paddingHorizontal: spacing.lg,
    },
    addButtonLabel: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
    liquidSection: {
      marginTop: spacing.lg,
      gap: spacing.xs,
    },
    fieldLabel: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.bold,
    },
    fieldHint: {
      color: themeColors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      marginBottom: spacing.sm,
    },
    liquidOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    liquidOption: {
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      paddingHorizontal: spacing.lg,
    },
    liquidOptionSelected: {
      borderColor: colors.brand.pulse,
      backgroundColor: colors.brand.pulse,
    },
    liquidOptionLabel: {
      color: themeColors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    liquidOptionLabelSelected: {
      color: colors.text.primary,
      fontWeight: fontWeights.medium,
    },
    requestLabel: {
      marginTop: spacing.lg,
    },
    requestInput: {
      marginTop: spacing.xs,
      minHeight: 72,
      textAlignVertical: 'top',
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
  // CP-C3a: também no lugar da captura enquanto a câmera não estiver liberada
  // (ex.: voltou da leitura de uma foto da galeria).
  if (step === 'permission' || (step === 'capture' && !hasCameraAccess)) {
    // CP-C3b: o app de sistema é "Ajustes" no iOS e "Configurações" no Android.
    const isAndroid = Platform.OS === 'android';
    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="reduced" />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* CP-C3b: saída da tela de permissão, igual ao "fechar" da captura. */}
          <View style={styles.permissionTopBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.close')}
              onPress={() => navigation.goBack()}
              style={styles.cameraIconButton}
            >
              <Ionicons name="close" size={CLOSE_ICON_SIZE} color={themeColors.text.primary} />
            </Pressable>
          </View>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera" size={CAMERA_PERMISSION_ICON_SIZE} color={colors.brand.pulse} />
            <Text style={styles.permissionTitle}>{t('pantryScanner.permissionTitle')}</Text>
            <Text style={styles.permissionDescription}>
              {t('pantryScanner.permissionDescription')}
            </Text>
            {permissionDenied ? (
              <>
                <Text style={styles.permissionDeniedText}>
                  {isAndroid
                    ? t('pantryScanner.permissionDenied.android')
                    : t('pantryScanner.permissionDenied.ios')}
                </Text>
                <View style={styles.permissionDeniedActions}>
                  <AuthButton
                    accessibilityLabel={
                      isAndroid
                        ? t('pantryScanner.openSettingsA11yLabel.android')
                        : t('pantryScanner.openSettingsA11yLabel.ios')
                    }
                    onPress={handleOpenSettings}
                  >
                    {isAndroid
                      ? t('pantryScanner.openSettings.android')
                      : t('pantryScanner.openSettings.ios')}
                  </AuthButton>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('pantryScanner.galleryA11yLabel')}
                    onPress={() => {
                      void handleGallery();
                    }}
                    style={styles.permissionGalleryButton}
                  >
                    <Ionicons name="images-outline" size={20} color={themeColors.text.primary} />
                    <Text style={styles.permissionGalleryText}>
                      {t('pantryScanner.chooseFromGallery')}
                    </Text>
                  </Pressable>
                </View>
              </>
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
        <PantryCamera
          ref={cameraRef}
          isActive={isCameraActive}
          renderOverlay={(cameraControls) => (
            // CP-C3: box-none deixa o toque e a pinça nas áreas vazias chegarem à
            // prévia; barras e botões continuam recebendo o toque.
            <SafeAreaView
              pointerEvents="box-none"
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
              <View style={styles.cameraCenter} pointerEvents="box-none">
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
    
              {/* CP-C3: botões de lente ou aviso de câmera indisponível. */}
              {cameraControls}
    
              {/* Bottom bar */}
              <View style={styles.cameraBottomBar}>
                {/* Gallery */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pantryScanner.galleryA11yLabel')}
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
                  accessibilityLabel={t('pantryScanner.captureA11yLabel')}
                  onPress={() => {
                    void handleCapture();
                  }}
                  style={styles.captureButton}
                >
                  <Ionicons name="camera" size={32} color={CAMERA_ICON_COLOR} />
                </Pressable>
    
                {/* Mirror of gallery button to keep capture centered */}
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.galleryButton}
                />
              </View>
            </SafeAreaView>
          )}
        />
      </View>
    );
  }

  // ─── Steps: reading / generating ─────────────────────────────────────────
  if (step === 'reading' || step === 'generating') {
    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="full" />
        <View style={styles.analyzingContainer} accessible accessibilityLiveRegion="polite">
          <Image source={images.blendiLogo} resizeMode="contain" style={styles.logoPlaceholder} />
          <Text style={styles.analyzingText}>
            {t(step === 'reading' ? 'pantryScanner.readingPhoto' : 'pantryScanner.generatingRecipes')}
          </Text>
          <ActivityIndicator color={colors.brand.pulse} size="large" />
        </View>
      </View>
    );
  }

  // ─── Step: ingredients (confirmação — CP-B7) ────────────────────────────
  if (step === 'ingredients') {
    const scanNotice = isFreeTier
      ? nextIsPreview
        ? t('pantryScanner.usesPreview')
        : t('pantryScanner.usesScan', { count: remainingScansCount })
      : null;

    return (
      <View style={styles.screen}>
        <AuroraBackground intensity="reduced" />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.back')}
              onPress={() => setStep(hasGenerated ? 'recipes' : 'capture')}
              style={styles.headerBackButton}
            >
              <Ionicons name="arrow-back" size={24} color={themeColors.text.primary} />
            </Pressable>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {t('pantryScanner.ingredientsFound')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pantryScanner.howToUse.a11yLabel')}
              onPress={() => setIsHowToUseVisible(true)}
              style={styles.headerBackButton}
              testID="pantry-how-to-use-button"
            >
              <Ionicons name="help-circle-outline" size={24} color={themeColors.text.primary} />
            </Pressable>
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
              {hasGenerated ? (
                <Text style={styles.regenerateNotice} testID="pantry-regenerate-notice">
                  {t(isFreeTier ? 'pantryScanner.regenerateNotice' : 'pantryScanner.regenerateNoticePro')}
                </Text>
              ) : null}

              <Text style={styles.sectionSubtitle}>{t('pantryScanner.confirmIngredients')}</Text>

              {ingredients.map((item, index) => {
                if (!item.blendSuitable) return null;
                const alcoholDisabled = item.isAlcoholic && alcoholAge === 'under-age';
                return (
                  <IngredientCheckItem
                    key={`${item.name}-${index}`}
                    ingredient={item}
                    checked={item.checked}
                    disabled={alcoholDisabled}
                    label={
                      item.isAlcoholic
                        ? t(alcoholDisabled ? 'pantryScanner.alcoholicUnavailable' : 'pantryScanner.alcoholicLabel')
                        : undefined
                    }
                    allergyLabel={item.isAllergen ? t('allergies.pantryLabel') : undefined}
                    allergyA11yLabel={item.isAllergen ? t('allergies.pantryA11y', { name: item.name }) : undefined}
                    onToggle={() => handleToggleIngredient(index)}
                    testID={`pantry-ingredient-${index}`}
                  />
                );
              })}

              {otherItemsCount > 0 ? (
                <View style={styles.otherItemsGroup} testID="pantry-other-items">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('pantryScanner.otherItemsTitle', { count: otherItemsCount })}
                    accessibilityHint={t('pantryScanner.otherItemsA11yHint')}
                    accessibilityState={{ expanded: otherItemsExpanded }}
                    onPress={() => setOtherItemsExpanded((expanded) => !expanded)}
                    style={styles.otherItemsHeader}
                    testID="pantry-other-items-toggle"
                  >
                    <Text style={styles.otherItemsTitle}>
                      {t('pantryScanner.otherItemsTitle', { count: otherItemsCount })}
                    </Text>
                    <Ionicons
                      name={otherItemsExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={themeColors.text.secondary}
                    />
                  </Pressable>

                  {otherItemsExpanded ? (
                    <>
                      <Text style={styles.otherItemsHint}>{t('pantryScanner.otherItemsHint')}</Text>
                      {ingredients.map((item, index) => (
                        item.blendSuitable ? null : (
                          <IngredientCheckItem
                            key={`${item.name}-${index}`}
                            ingredient={item}
                            checked={item.checked}
                            allergyLabel={item.isAllergen ? t('allergies.pantryLabel') : undefined}
                            allergyA11yLabel={item.isAllergen ? t('allergies.pantryA11y', { name: item.name }) : undefined}
                            onToggle={() => handleToggleIngredient(index)}
                            testID={`pantry-ingredient-${index}`}
                          />
                        )
                      ))}
                    </>
                  ) : null}
                </View>
              ) : null}

              {addedItems.map((name) => (
                <View key={`added-${name}`} style={styles.addedRow} testID="pantry-added-item">
                  <Ionicons name="add-circle" size={22} color={colors.brand.pulse} />
                  <View style={styles.addedTextColumn}>
                    <Text numberOfLines={1} style={styles.addedName}>{name}</Text>
                    <Text style={styles.addedLabel}>{t('pantryScanner.addedLabel')}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('pantryScanner.removeAdded', { name })}
                    hitSlop={8}
                    onPress={() => handleRemoveAdded(name)}
                    style={styles.addedRemove}
                  >
                    <Ionicons name="close" size={18} color={themeColors.text.secondary} />
                  </Pressable>
                </View>
              ))}

              {addedItems.length < PANTRY_ADDED_ITEMS_MAX ? (
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.addIngredientInput, styles.flex]}
                    accessibilityLabel={t('pantryScanner.addIngredient')}
                    placeholder={t('pantryScanner.addIngredient')}
                    placeholderTextColor={themeColors.text.tertiary}
                    value={newIngredientText}
                    onChangeText={setNewIngredientText}
                    onSubmitEditing={handleAddIngredient}
                    maxLength={PANTRY_ADDED_ITEM_MAX_LENGTH}
                    returnKeyType="done"
                    testID="pantry-add-input"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('pantryScanner.addButton')}
                    accessibilityState={{ disabled: !newIngredientText.trim() }}
                    disabled={!newIngredientText.trim()}
                    onPress={handleAddIngredient}
                    style={styles.addButton}
                    testID="pantry-add-button"
                  >
                    <Text style={styles.addButtonLabel}>{t('pantryScanner.addButton')}</Text>
                  </Pressable>
                </View>
              ) : null}

              {!hasLiquid ? (
                <View style={styles.liquidSection} testID="pantry-liquid-question">
                  <Text style={styles.fieldLabel} accessibilityRole="header">
                    {t('pantryScanner.liquidQuestion')}
                  </Text>
                  <Text style={styles.fieldHint}>{t('pantryScanner.liquidHint')}</Text>
                  <View style={styles.liquidOptions} accessibilityRole="radiogroup">
                    {LIQUID_OPTIONS.map((option) => {
                      const selected = liquid === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={t(option.labelKey)}
                          onPress={() => setLiquid(option.value)}
                          style={[styles.liquidOption, selected ? styles.liquidOptionSelected : null]}
                          testID={`pantry-liquid-${option.value}`}
                        >
                          <Text style={[styles.liquidOptionLabel, selected ? styles.liquidOptionLabelSelected : null]}>
                            {t(option.labelKey)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <Text style={[styles.fieldLabel, styles.requestLabel]}>{t('pantryScanner.requestLabel')}</Text>
              <TextInput
                style={[styles.addIngredientInput, styles.requestInput]}
                accessibilityLabel={t('pantryScanner.requestLabel')}
                placeholder={t('pantryScanner.requestPlaceholder')}
                placeholderTextColor={themeColors.text.tertiary}
                value={requestText}
                onChangeText={setRequestText}
                maxLength={PANTRY_REQUEST_MAX_LENGTH}
                multiline
                testID="pantry-request-input"
              />
            </ScrollView>

            <View style={styles.footerContainer}>
              <AuthButton
                onPress={() => {
                  void handleGenerateRecipes();
                }}
                disabled={!canGenerate}
                testID="pantry-generate-button"
              >
                {t('pantryScanner.generateRecipes')}
              </AuthButton>
              {scanNotice ? (
                <Text style={styles.scanNotice} testID="pantry-scan-notice">{scanNotice}</Text>
              ) : null}
            </View>
          </KeyboardAvoidingView>

          <AgeConfirmationSheet
            visible={ageSheet !== null}
            onAnswer={(isAdult) => {
              void handleAgeAnswer(isAdult);
            }}
            onDismiss={() => setAgeSheet(null)}
          />

          <AllergyConfirmationSheet
            allergens={allergySheet?.allergens ?? null}
            onConfirm={() => {
              void handleAllergyAnswer(true);
            }}
            onDecline={() => {
              void handleAllergyAnswer(false);
            }}
            onDismiss={() => setAllergySheet(null)}
          />

          <PantryHowToUseSheet
            visible={isHowToUseVisible}
            onClose={() => setIsHowToUseVisible(false)}
            onExamplePress={handleHowToUseExample}
          />
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

          {readId && recipes.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('ingredients')}
              style={styles.ghostButton}
              testID="pantry-edit-ingredients"
            >
              <Text style={styles.ghostButtonLabel}>{t('pantryScanner.editIngredients')}</Text>
            </Pressable>
          ) : null}

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
