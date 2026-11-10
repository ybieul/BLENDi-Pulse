// apps/mobile/src/screens/NutritionGoalsScreen.tsx
// CP-1.1.1b — tela "Minhas metas": proteína, carboidratos, calorias, hidratação
// e dieta. Aberta pela linha "Minhas metas" do Me (root stack, por cima das
// abas, com botão de voltar — mesmo esquema do CompleteProfile).
//
// ── O que a tela faz ──────────────────────────────────────────────────────────
// • Quatro campos numéricos validados com os limites de @blendi/shared (nada de
//   número fixo aqui — ver GOAL_LIMITS em nutritionGoals.utils.ts), com erro
//   inline por campo só depois que a pessoa digitou algo.
// • Dieta em múltipla escolha, com os mesmos cards/textos/alerta de alergia do
//   onboarding (DietaryPreferencesPicker).
// • "Salvar" envia no PATCH /users/me SÓ o que mudou. Em sucesso invalida o
//   perfil (e hydrationToday se a hidratação mudou), mostra o toast e volta ao
//   Me — a menos que o backend devolva avisos de meta (data.user.warnings):
//   nesse caso a pessoa fica na tela e cada aviso aparece junto do campo.
// • Sair com alteração não salva pede confirmação (beforeRemove).
// • Proteções contra corrida (achados do pentest, ver
//   docs/fixes/cp-1.1.1b-testes-pentest.md): duplo toque em "Salvar" envia um só
//   PATCH (isSavingRef); durante o envio os campos ficam bloqueados; se a pessoa sair
//   da tela com o envio em voo, o resultado ainda sincroniza o app mas não dá goBack;
//   uma resposta 2xx fora do formato conta como salva, sem "erro de rede" falso.
//
// ── Teclado e responsividade ──────────────────────────────────────────────────
// Segue o padrão do AuthScreenLayout/OnboardingLayout (KeyboardAvoidingView
// 'padding' no iOS e 'height' no Android + ScrollView com
// keyboardShouldPersistTaps="handled" + insets de área segura), mais:
// • rolagem explícita até o campo em foco (nos 4, inclusive o último) — não
//   depende de o sistema rolar sozinho, que difere entre iOS e Android;
// • "Salvar" FIXO no rodapé, fora do ScrollView: a tela é longa (4 campos + 4
//   cards de dieta), então o botão no fim do conteúdo exigiria rolar tudo com o
//   teclado aberto. Fora do scroll ele sobe junto com o teclado nas duas
//   plataformas e o toque nele nunca é engolido pelo ScrollView;
// • teclado numérico: o do iOS não tem tecla de retorno, então uma barra
//   "Próximo/Concluir" (InputAccessoryView) faz esse papel; no Android a ação
//   do próprio teclado (returnKeyType) faz.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';

import {
  fontSizes,
  fonts,
  fontWeights,
  spacing,
  type DietaryPreference,
} from '@blendi/shared';

import { api } from '../config/api';
import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { AuthInput } from '../components/ui/AuthInput';
import { DietaryPreferencesPicker } from '../components/ui/DietaryPreferencesPicker';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import type { TranslationKey } from '../locales/i18n';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';
import {
  GOAL_FIELDS,
  GOAL_LIMITS,
  areGoalDraftsValid,
  buildGoalsPatch,
  hasUnsavedGoalChanges,
  isGoalTextValid,
  parsePatchResponseWarnings,
  toggleDietPreference,
  type GoalField,
  type GoalWarnings,
  type GoalsTextDraft,
  type GoalsValues,
} from '../utils/nutritionGoals.utils';
import { showToast } from '../utils/toast.utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type NutritionGoalsScreenProps = NativeStackScreenProps<RootStackParamList, 'NutritionGoals'>;

interface GoalsProfile {
  dailyProteinTarget?: number;
  dailyCarbTarget?: number;
  dailyCalorieTarget?: number;
  dailyHydrationTarget?: number;
  dietaryPreferences?: DietaryPreference[];
}

interface GoalsProfileResponse {
  success: true;
  data: { user: GoalsProfile };
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const GOAL_FIELD_LABELS: Readonly<Record<GoalField, TranslationKey>> = {
  dailyProteinTarget: 'onboarding.proteinPlaceholder',
  dailyCarbTarget: 'onboarding.carbTarget',
  dailyCalorieTarget: 'onboarding.caloriesPlaceholder',
  dailyHydrationTarget: 'nutritionGoals.hydrationLabel',
};

// Mesmo padrão do Me (`?? 2500`) e o default do backend: só vale se nem o
// perfil nem o usuário local trouxerem a meta de hidratação (campo opcional).
// A hidratação é editada em ml, como no EditSettingSheet do Me — por isso o
// rótulo da tela diz "(ml)".
const FALLBACK_HYDRATION_TARGET_ML = 2500;

const KEYBOARD_ACCESSORY_ID = 'nutritionGoalsKeyboardAccessory';
const FOCUS_SCROLL_MARGIN = spacing['3xl'];
const SCREEN_HORIZONTAL_PADDING = spacing.xl;
const BACK_BUTTON_SIZE = 36;
const ICON_SIZE = 16;
const WARNING_ICON_SIZE = 18;
// Os campos têm altura fixa (AuthInput); com a fonte do sistema muito ampliada
// o valor digitado passaria da altura. O teto mantém o texto inteiro visível.
const INPUT_MAX_FONT_SCALE = 1.3;
const ACCESSORY_BAR_HEIGHT = 44;

async function fetchGoalsProfile(): Promise<GoalsProfileResponse> {
  const response = await api.get<GoalsProfileResponse>('/users/me');
  return response.data;
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export function NutritionGoalsScreen({ navigation }: NutritionGoalsScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  // ── Valores salvos (baseline) ──────────────────────────────────────────────

  const { data: profileResponse } = useQuery<GoalsProfileResponse>({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: fetchGoalsProfile,
    staleTime: CACHE_CONFIG.USER_PROFILE_TTL,
  });
  const profile = profileResponse?.data.user;

  // O que acabou de ser salvo nesta tela. Vale até o perfil refeito chegar,
  // para a tela não voltar ao valor antigo nem tratar o salvo como alteração.
  const [savedValues, setSavedValues] = useState<Partial<GoalsValues>>({});

  const baseline = useMemo((): GoalsValues | null => {
    const protein = savedValues.dailyProteinTarget ?? profile?.dailyProteinTarget ?? authUser?.dailyProteinTarget;
    const carb = savedValues.dailyCarbTarget ?? profile?.dailyCarbTarget ?? authUser?.dailyCarbTarget;
    const calorie = savedValues.dailyCalorieTarget ?? profile?.dailyCalorieTarget ?? authUser?.dailyCalorieTarget;

    if (protein === undefined || carb === undefined || calorie === undefined) {
      return null;
    }

    return {
      dailyProteinTarget: protein,
      dailyCarbTarget: carb,
      dailyCalorieTarget: calorie,
      dailyHydrationTarget:
        savedValues.dailyHydrationTarget ??
        profile?.dailyHydrationTarget ??
        authUser?.dailyHydrationTarget ??
        FALLBACK_HYDRATION_TARGET_ML,
      dietaryPreferences:
        savedValues.dietaryPreferences ?? profile?.dietaryPreferences ?? authUser?.dietaryPreferences ?? [],
    };
  }, [savedValues, profile, authUser]);

  // ── Edição ─────────────────────────────────────────────────────────────────

  const [textDraft, setTextDraft] = useState<GoalsTextDraft>({});
  const [dietDraft, setDietDraft] = useState<DietaryPreference[] | null>(null);
  const [warnings, setWarnings] = useState<GoalWarnings>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // O estado `isSaving` só chega ao próximo render; o ref barra o segundo toque
  // que cai antes disso (duplo toque) e é lido depois dos `await`.
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const patch = useMemo(
    () => (baseline ? buildGoalsPatch(baseline, textDraft, dietDraft) : {}),
    [baseline, textDraft, dietDraft],
  );
  const hasUnsavedChanges = baseline ? hasUnsavedGoalChanges(baseline, textDraft, dietDraft) : false;
  const canSave = !isSaving && Object.keys(patch).length > 0 && areGoalDraftsValid(textDraft);

  // ── Teclado e rolagem ──────────────────────────────────────────────────────

  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Partial<Record<GoalField, TextInput | null>>>({});
  const fieldsTopRef = useRef(0);
  const fieldOffsetsRef = useRef<Partial<Record<GoalField, number>>>({});
  const focusedFieldRef = useRef<GoalField | null>(null);
  const [focusedField, setFocusedField] = useState<GoalField | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const scrollToField = useCallback((field: GoalField) => {
    const offset = fieldsTopRef.current + (fieldOffsetsRef.current[field] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - FOCUS_SCROLL_MARGIN), animated: true });
  }, []);

  useEffect(() => {
    const isIos = Platform.OS === 'ios';
    const subscriptions = [
      Keyboard.addListener(isIos ? 'keyboardWillShow' : 'keyboardDidShow', () => {
        setIsKeyboardVisible(true);
      }),
      Keyboard.addListener(isIos ? 'keyboardWillHide' : 'keyboardDidHide', () => {
        setIsKeyboardVisible(false);
      }),
      // Com o teclado já aberto a área rolável encolheu: reforça a rolagem para
      // o campo em foco (cobre o último campo em telas altas, onde o primeiro
      // scrollTo ainda ocorre contra a área antiga e pode ser limitado).
      Keyboard.addListener('keyboardDidShow', () => {
        if (focusedFieldRef.current) {
          scrollToField(focusedFieldRef.current);
        }
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => { subscription.remove(); });
    };
  }, [scrollToField]);

  const handleFieldFocus = (field: GoalField) => {
    focusedFieldRef.current = field;
    setFocusedField(field);
    scrollToField(field);
  };

  const handleFieldBlur = (field: GoalField) => {
    if (focusedFieldRef.current === field) {
      focusedFieldRef.current = null;
      setFocusedField(null);
    }
  };

  // "Próximo" leva ao campo seguinte; no último, "Concluir" fecha o teclado.
  const advanceFromField = (field: GoalField) => {
    const nextField = GOAL_FIELDS[GOAL_FIELDS.indexOf(field) + 1];
    if (nextField) {
      inputRefs.current[nextField]?.focus();
      return;
    }
    Keyboard.dismiss();
  };

  const isLastFieldFocused = focusedField === GOAL_FIELDS[GOAL_FIELDS.length - 1];

  // ── Sair com alteração não salva ───────────────────────────────────────────

  const hasUnsavedChangesRef = useRef(false);
  const allowLeaveRef = useRef(false);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!hasUnsavedChangesRef.current || allowLeaveRef.current) {
        return;
      }

      event.preventDefault();
      Alert.alert(t('nutritionGoals.discard.title'), t('nutritionGoals.discard.message'), [
        { text: t('nutritionGoals.discard.keepEditing'), style: 'cancel' },
        {
          text: t('nutritionGoals.discard.confirm'),
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
  }, [navigation, t]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleChangeText = (field: GoalField, text: string) => {
    setTextDraft((previous) => ({ ...previous, [field]: text }));
    // O aviso é sobre o valor que foi salvo; editar o campo o descarta.
    setWarnings((previous) => {
      if (!previous[field]) {
        return previous;
      }
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const handleToggleDiet = (preference: DietaryPreference) => {
    if (!baseline || isSavingRef.current) {
      return;
    }
    setDietDraft((previous) => toggleDietPreference(previous ?? baseline.dietaryPreferences, preference));
    setFormError(null);
  };

  const handleSave = async () => {
    if (!canSave || isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    Keyboard.dismiss();
    setFormError(null);
    setIsSaving(true);

    try {
      const response = await api.patch<unknown>('/users/me', patch);
      const incomingWarnings = parsePatchResponseWarnings(response.data);

      // WeeklyReport e History leem as metas direto do usuário local (Zustand),
      // sem passar pela query — o Me fazia o mesmo ao salvar uma meta.
      updateUserProfile(patch);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile }),
        // hydrationToday (GET /hydration-logs/today) é a fonte da meta que a
        // Home e o Track mostram; sem isso as duas ficam com a meta antiga.
        ...(patch.dailyHydrationTarget !== undefined
          ? [queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hydrationToday })]
          : []),
      ]);

      // A pessoa pode ter saído da tela (descartando) com o envio em voo: o
      // servidor salvou e o resto do app já foi avisado acima, mas não há mais
      // tela para atualizar nem para fechar (um goBack aqui desempilharia outra).
      if (!isMountedRef.current) {
        showToast(t('nutritionGoals.saved'));
        return;
      }

      setSavedValues((previous) => ({ ...previous, ...patch }));
      setTextDraft({});
      setDietDraft(null);
      // Campos enviados agora têm o aviso (ou a ausência dele) desta resposta;
      // os demais não foram reavaliados e seguem como estavam.
      setWarnings((previous) => {
        const next = { ...previous };
        for (const field of GOAL_FIELDS) {
          if (patch[field] !== undefined) {
            delete next[field];
          }
        }
        return { ...next, ...incomingWarnings };
      });

      showToast(t('nutritionGoals.saved'));

      if (Object.keys(incomingWarnings).length === 0) {
        allowLeaveRef.current = true;
        navigation.goBack();
      }
    } catch (error) {
      if (isMountedRef.current) {
        const translationKey = axios.isAxiosError(error)
          ? getAxiosErrorTranslationKey(error)
          : 'errors.network_internal_server_error';
        setFormError(t(translationKey));
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // ── Estilos ────────────────────────────────────────────────────────────────

  const styles = StyleSheet.create({
    flex: {
      flex: 1,
    },
    root: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    scrollContent: {
      paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
      paddingBottom: spacing['4xl'],
      gap: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    backButton: {
      width: BACK_BUTTON_SIZE,
      height: BACK_BUTTON_SIZE,
      borderRadius: 10,
      backgroundColor: colors.overlay.plum[6],
      borderWidth: 1,
      borderColor: colors.overlay.plum[12],
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontWeight: fontWeights.bold,
      fontSize: fontSizes.lg,
    },
    subtitle: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 22,
    },
    fields: {
      gap: spacing.md,
    },
    fieldGroup: {
      gap: spacing.md,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.overlay.warning[34],
      backgroundColor: colors.overlay.warning[12],
    },
    warningText: {
      flex: 1,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    noticeText: {
      flex: 1,
      color: colors.text.tertiary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      lineHeight: 18,
    },
    dietSection: {
      gap: spacing.md,
      marginTop: spacing.md,
    },
    sectionTitle: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontWeight: fontWeights.bold,
      fontSize: fontSizes.lg,
    },
    footer: {
      paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
      paddingTop: spacing.lg,
      gap: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.overlay.plum[10],
    },
    errorText: {
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      textAlign: 'center',
    },
    accessoryBar: {
      height: ACCESSORY_BAR_HEIGHT,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.background.secondary,
      borderTopWidth: 1,
      borderTopColor: colors.overlay.plum[10],
    },
    accessoryButton: {
      minHeight: ACCESSORY_BAR_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    accessoryButtonText: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
    },
  });

  // Sem nenhum dado de meta (nem perfil nem usuário local) não há o que editar.
  if (!baseline) {
    return <View style={styles.root} />;
  }

  const currentDiet = dietDraft ?? baseline.dietaryPreferences;

  const renderField = (field: GoalField) => {
    const draftText = textDraft[field];
    const { min, max } = GOAL_LIMITS[field];
    const value = draftText ?? String(baseline[field]);
    // Só depois que a pessoa digitou algo (mesmo critério do onboarding).
    const error =
      draftText !== undefined && draftText.length > 0 && !isGoalTextValid(field, draftText)
        ? t('errors.validation.number_range', { min, max })
        : undefined;
    const fieldWarnings = warnings[field] ?? [];
    const isLast = field === GOAL_FIELDS[GOAL_FIELDS.length - 1];

    return (
      <View
        key={field}
        onLayout={(event: LayoutChangeEvent) => {
          fieldOffsetsRef.current[field] = event.nativeEvent.layout.y;
        }}
        style={styles.fieldGroup}
        testID={`goal-field-${field}`}
      >
        <AuthInput
          ref={(node) => {
            inputRefs.current[field] = node;
          }}
          accessibilityLabel={t(GOAL_FIELD_LABELS[field])}
          editable={!isSaving}
          error={error}
          inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
          keyboardType="number-pad"
          maxFontSizeMultiplier={INPUT_MAX_FONT_SCALE}
          onBlur={() => { handleFieldBlur(field); }}
          onChangeText={(text) => { handleChangeText(field, text); }}
          onFocus={() => { handleFieldFocus(field); }}
          onSubmitEditing={() => { advanceFromField(field); }}
          placeholder={t(GOAL_FIELD_LABELS[field])}
          returnKeyType={isLast ? 'done' : 'next'}
          submitBehavior="submit"
          value={value}
        />

        {!error
          ? fieldWarnings.map((warningKey) => (
              <View key={warningKey} accessible accessibilityRole="alert" style={styles.warningBox}>
                <Ionicons
                  color={colors.feedback.warning}
                  name="alert-circle-outline"
                  size={WARNING_ICON_SIZE}
                />
                <Text style={styles.warningText}>{t(warningKey)}</Text>
              </View>
            ))
          : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <View style={styles.root}>
        <AuroraBackground intensity="reduced" />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.lg }]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={t('common.actions.back')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => { navigation.goBack(); }}
              style={styles.backButton}
            >
              <Ionicons color={colors.text.primary} name="arrow-back" size={18} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              {t('nutritionGoals.title')}
            </Text>
          </View>

          <Text style={styles.subtitle}>{t('nutritionGoals.subtitle')}</Text>

          <View
            onLayout={(event: LayoutChangeEvent) => {
              fieldsTopRef.current = event.nativeEvent.layout.y;
            }}
            style={styles.fields}
            testID="goal-fields"
          >
            {GOAL_FIELDS.map(renderField)}
          </View>

          <View style={styles.notice}>
            <Ionicons color={colors.text.tertiary} name="information-circle-outline" size={ICON_SIZE} />
            <Text style={styles.noticeText}>{t('nutritionGoals.recalcNotice')}</Text>
          </View>

          <View style={styles.dietSection}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {t('nutritionGoals.dietTitle')}
            </Text>
            <Text style={styles.subtitle}>{t('onboarding.diet.subtitle')}</Text>
            <DietaryPreferencesPicker onToggle={handleToggleDiet} selected={currentDiet} />
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            // Com o teclado aberto ele cobre a área da barra inferior do sistema.
            { paddingBottom: isKeyboardVisible ? spacing.lg : insets.bottom + spacing.xl },
          ]}
          testID="goal-footer"
        >
          {formError ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {formError}
            </Text>
          ) : null}

          <AuthButton disabled={!canSave} loading={isSaving} onPress={() => { void handleSave(); }}>
            {t('common.actions.save')}
          </AuthButton>
        </View>
      </View>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (focusedField) {
                  advanceFromField(focusedField);
                } else {
                  Keyboard.dismiss();
                }
              }}
              style={styles.accessoryButton}
            >
              <Text style={styles.accessoryButtonText}>
                {isLastFieldFocused ? t('nutritionGoals.done') : t('nutritionGoals.next')}
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}
