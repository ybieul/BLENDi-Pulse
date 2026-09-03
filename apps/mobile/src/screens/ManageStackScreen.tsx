// apps/mobile/src/screens/ManageStackScreen.tsx
// CP1.8 — Tela de gerenciamento do stack de suplementos.
// Pode ser usada diretamente como screen do navigator; os callbacks de
// persistência serão conectados na TrackScreen nas próximas partes.

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthInput } from '../components/ui/AuthInput';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useNetworkStore } from '../store/network.store';
import type { SupplementStackItem } from '../services/supplementStack.service';
import type { TrackStackParamList } from '../navigation/types';
import { showToast } from '../utils/toast.utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimingValue = SupplementStackItem['timing'];

export interface NewSupplementFormData {
  name: string;
  dosage: string;
  dailyTargetCount: number;
  timing: TimingValue;
}

export interface ManageStackScreenProps {
  supplements?: SupplementStackItem[];
  onAdd?: (data: NewSupplementFormData) => void;
  onDelete?: (supplementId: string) => void;
  onToggleActive?: (supplementId: string, isActive: boolean) => void;
  /** `isPending` da mutation de adicionar suplemento — controla quando a sheet pode fechar. */
  isSaving?: boolean;
  /** `isError` da mesma mutation — se true, a sheet permanece aberta com o toast de erro visível. */
  isSaveError?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMING_ORDER: TimingValue[] = [
  'morning',
  'preWorkout',
  'postWorkout',
  'evening',
  'withMeal',
];

const TIMING_TRANSLATION_KEYS = {
  morning: 'track.timingMorning',
  preWorkout: 'track.timingPreWorkout',
  postWorkout: 'track.timingPostWorkout',
  evening: 'track.timingEvening',
  withMeal: 'track.timingWithMeal',
} as const;

const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.45)';
const CARD_BACKGROUND = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const DELETE_COLOR = 'rgba(239,68,68,0.70)';
const GHOST_BORDER = 'rgba(154,72,147,0.40)';
const CHIP_BORDER_IDLE = 'rgba(255,255,255,0.12)';
const CHIP_BG_IDLE = 'rgba(255,255,255,0.05)';
const CHIP_BG_SELECTED = 'rgba(154,72,147,0.15)';
const EMPTY_SUPPLEMENTS: SupplementStackItem[] = [];
const DEFAULT_DAILY_TARGET_COUNT = '1';
const MAX_DAILY_TARGET_COUNT = 20;

// ─── SupplementManageItem (inline) ──────────────────────────────────────────

interface SupplementManageItemProps {
  item: SupplementStackItem;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  deleteTitle: string;
  deleteMessage: string;
  deleteConfirm: string;
  deleteCancel: string;
}

function SupplementManageItem({
  item,
  onToggleActive,
  onDelete,
  deleteTitle,
  deleteMessage,
  deleteConfirm,
  deleteCancel,
}: SupplementManageItemProps) {
  const { t } = useAppTranslation();

  function handleDeletePress() {
    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      const didConfirm = globalThis.confirm(`${deleteTitle}\n\n${deleteMessage}`);

      if (didConfirm) {
        onDelete(item.supplementId);
      }

      return;
    }

    Alert.alert(deleteTitle, deleteMessage, [
      { text: deleteCancel, style: 'cancel' },
      {
        text: deleteConfirm,
        style: 'destructive',
        onPress: () => onDelete(item.supplementId),
      },
    ]);
  }

  const timingLabel = t(TIMING_TRANSLATION_KEYS[item.timing]);
  const rawDailyTargetCount = (item as { dailyTargetCount?: unknown }).dailyTargetCount;
  const dailyTargetCount =
    typeof rawDailyTargetCount === 'number'
    && Number.isSafeInteger(rawDailyTargetCount)
    && rawDailyTargetCount >= 1
      ? rawDailyTargetCount
      : 1;
  const dailyTargetLabel = t('track.dailyTargetSummary', {
    count: dailyTargetCount,
  });
  const subText = item.dosage
    ? `${item.dosage} · ${dailyTargetLabel} · ${timingLabel}`
    : `${dailyTargetLabel} · ${timingLabel}`;

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {subText}
        </Text>
      </View>

      <View style={styles.itemActions}>
        <Switch
          value={item.isActive}
          onValueChange={(val) => onToggleActive(item.supplementId, val)}
          trackColor={{
            false: 'rgba(255,255,255,0.15)',
            true: `${colors.brand.pulse}55`,
          }}
          thumbColor={item.isActive ? colors.brand.pulse : 'rgba(255,255,255,0.50)'}
          ios_backgroundColor="rgba(255,255,255,0.15)"
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleDeletePress}
          style={styles.deleteButton}
        >
          <Ionicons color={DELETE_COLOR} name="trash-outline" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── ManageStackScreen ───────────────────────────────────────────────────────

export function ManageStackScreen({
  supplements = EMPTY_SUPPLEMENTS,
  onAdd = () => {},
  onDelete = () => {},
  onToggleActive = () => {},
  isSaving = false,
  isSaveError = false,
}: ManageStackScreenProps) {
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<TrackStackParamList>>();
  const isConnected = useNetworkStore((state) => state.isConnected);

  // ── Bottom sheet visibility ─────────────────────────────────────────────
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);
  // Setado em handleSave, consultado quando isSaving vira false — evita
  // fechar a sheet antes da mutation de adicionar suplemento resolver.
  const awaitingSaveRef = useRef(false);

  // ── Form state ──────────────────────────────────────────────────────────
  const [formName, setFormName] = useState('');
  const [formDosage, setFormDosage] = useState('');
  const [formDailyTargetCount, setFormDailyTargetCount] = useState(DEFAULT_DAILY_TARGET_COUNT);
  const [formTiming, setFormTiming] = useState<TimingValue>('morning');
  const [nameError, setNameError] = useState<string | undefined>();
  const [dailyTargetError, setDailyTargetError] = useState<string | undefined>();
  const dosageRef = useRef<TextInput>(null);
  const dailyTargetRef = useRef<TextInput>(null);

  // ── Bottom sheet animation (same pattern as RatingBottomSheet) ──────────
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (sheetVisible) {
      setSheetMounted(true);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 220,
          damping: 26,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();

      return undefined;
    }

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setSheetMounted(false);
        resetForm();
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, sheetVisible, translateY]);

  // ── Fecha a sheet só depois que a mutation de adicionar resolver ────────
  useEffect(() => {
    if (!awaitingSaveRef.current || isSaving) {
      return;
    }

    awaitingSaveRef.current = false;

    if (!isSaveError) {
      setSheetVisible(false);
    }
  }, [isSaving, isSaveError]);

  // ── Form helpers ────────────────────────────────────────────────────────

  function resetForm() {
    setFormName('');
    setFormDosage('');
    setFormDailyTargetCount(DEFAULT_DAILY_TARGET_COUNT);
    setFormTiming('morning');
    setNameError(undefined);
    setDailyTargetError(undefined);
  }

  function openSheet() {
    setSheetVisible(true);
  }

  function closeSheet() {
    setSheetVisible(false);
  }

  function handleSave() {
    const trimmedName = formName.trim();
    const normalizedDailyTargetCount = formDailyTargetCount.trim();
    const parsedDailyTargetCount = Number(normalizedDailyTargetCount);

    if (!trimmedName) {
      setNameError(t('track.supplementNameRequired'));
      return;
    }

    if (!normalizedDailyTargetCount) {
      setDailyTargetError(t('track.dailyTargetRequired'));
      return;
    }

    if (
      !Number.isSafeInteger(parsedDailyTargetCount)
      || parsedDailyTargetCount < 1
      || parsedDailyTargetCount > MAX_DAILY_TARGET_COUNT
    ) {
      setDailyTargetError(t('track.dailyTargetInvalid'));
      return;
    }

    if (!isConnected) {
      showToast(t('common.actionRequiresConnection'));
      return;
    }

    awaitingSaveRef.current = true;
    onAdd({
      name: trimmedName,
      dosage: formDosage.trim(),
      dailyTargetCount: parsedDailyTargetCount,
      timing: formTiming,
    });
    // A sheet só fecha quando isSaving voltar a false com sucesso — ver o
    // useEffect acima. Em caso de erro, ela permanece aberta com o toast.
  }

  function handleDelete(supplementId: string) {
    if (!isConnected) {
      showToast(t('common.actionRequiresConnection'));
      return;
    }

    onDelete(supplementId);
  }

  function handleToggleActive(supplementId: string, isActive: boolean) {
    if (!isConnected) {
      showToast(t('common.actionRequiresConnection'));
      return;
    }

    onToggleActive(supplementId, isActive);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <AuroraBackground intensity="reduced" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons color={colors.text.primary} name="arrow-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('track.manageStack')}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Supplement list + footer */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {supplements.map((item) => (
          <SupplementManageItem
            key={item.supplementId}
            item={item}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
            deleteTitle={t('track.deleteConfirmTitle')}
            deleteMessage={t('track.deleteConfirmMessage')}
            deleteConfirm={t('track.delete')}
            deleteCancel={t('common.actions.cancel')}
          />
        ))}

        {/* Ghost add button */}
        <Pressable
          accessibilityRole="button"
          onPress={openSheet}
          style={styles.addButton}
        >
          <Ionicons color={colors.brand.pulse} name="add" size={18} />
          <Text style={styles.addButtonLabel}>{t('track.addSupplement')}</Text>
        </Pressable>
      </ScrollView>

      {/* Form bottom sheet */}
      {sheetMounted && (
        <Modal
          transparent
          visible={sheetMounted}
          animationType="none"
          statusBarTranslucent
          onRequestClose={closeSheet}
        >
          <View style={styles.modalRoot}>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
              <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={closeSheet} />
            </Animated.View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.kvContainer}
            >
              <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
                {/* Handle */}
                <View style={styles.handle} />

                <Text style={styles.sheetTitle}>{t('track.addSupplement')}</Text>

                {/* Name */}
                <View style={styles.inputSpacing}>
                  <AuthInput
                    placeholder={t('track.supplementName')}
                    value={formName}
                    onChangeText={(text) => {
                      setFormName(text);
                      if (nameError) setNameError(undefined);
                    }}
                    error={nameError}
                    returnKeyType="next"
                    onSubmitEditing={() => dosageRef.current?.focus()}
                  />
                </View>

                {/* Dosage */}
                <View style={styles.inputSpacing}>
                  <AuthInput
                    ref={dosageRef}
                    placeholder={t('track.dosage')}
                    value={formDosage}
                    onChangeText={setFormDosage}
                    returnKeyType="next"
                    onSubmitEditing={() => dailyTargetRef.current?.focus()}
                  />
                </View>

                {/* Daily target */}
                <View style={styles.inputSpacing}>
                  <AuthInput
                    ref={dailyTargetRef}
                    placeholder={t('track.dailyTarget')}
                    value={formDailyTargetCount}
                    onChangeText={(text) => {
                      setFormDailyTargetCount(text.replace(/[^\d]/g, ''));
                      if (dailyTargetError) setDailyTargetError(undefined);
                    }}
                    error={dailyTargetError}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="done"
                  />
                </View>

                {/* Timing chips */}
                <Text style={styles.timingLabel}>{t('track.timing')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {TIMING_ORDER.map((timing) => {
                    const isSelected = formTiming === timing;
                    return (
                      <Pressable
                        key={timing}
                        accessibilityRole="button"
                        onPress={() => setFormTiming(timing)}
                        style={[
                          styles.chip,
                          {
                            borderColor: isSelected ? colors.brand.pulse : CHIP_BORDER_IDLE,
                            backgroundColor: isSelected ? CHIP_BG_SELECTED : CHIP_BG_IDLE,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? colors.brand.pulse : colors.text.primary,
                            },
                          ]}
                        >
                          {t(TIMING_TRANSLATION_KEYS[timing])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Save */}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSave}
                  style={styles.saveButton}
                >
                  <Text style={styles.saveButtonLabel}>{t('track.save')}</Text>
                </Pressable>
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },
  headerRight: {
    width: 40,
  },

  // List
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm + 1, // 14pt
    fontWeight: fontWeights.medium,
  },
  itemSub: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm - 1, // 12pt
    fontWeight: fontWeights.regular,
    opacity: 0.7,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteButton: {
    padding: spacing.xs,
  },

  // Ghost add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: GHOST_BORDER,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  addButtonLabel: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },

  // Bottom sheet modal
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  kvContainer: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: SHEET_BORDER_COLOR,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing['3xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.lg,
  },

  // Form
  inputSpacing: {
    marginBottom: spacing.lg,
  },
  timingLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    opacity: 0.7,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },

  // Save button
  saveButton: {
    height: 52,
    backgroundColor: colors.brand.pulse,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
  saveButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
