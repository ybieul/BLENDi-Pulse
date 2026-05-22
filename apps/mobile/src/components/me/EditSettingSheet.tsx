import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { AuthButton } from '../ui/AuthButton';
import { AuthInput } from '../ui/AuthInput';
import { SelectionCard } from '../ui/SelectionCard';

const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.3)';
const SUBTITLE_OPACITY = 0.7;
const TOGGLE_BACKGROUND = 'rgba(255,255,255,0.07)';
const TOGGLE_BORDER = 'rgba(255,255,255,0.10)';
const TOGGLE_HIGHLIGHT = 'rgba(255,255,255,0.04)';
const TOGGLE_SELECTED_BACKGROUND = 'rgba(154,72,147,0.22)';
const TOGGLE_SELECTED_BORDER = 'rgba(154,72,147,0.55)';
const GOAL_ICON_SIZE = 22;

export type EditSettingType =
  | 'model'
  | 'goal'
  | 'protein'
  | 'carbs'
  | 'calories'
  | 'hydration'
  | 'unitSystem'
  | 'language';

export type EditSettingValue = string | number;

interface ToggleOption {
  value: string;
  label: string;
}

interface EditSettingSheetProps {
  type: EditSettingType;
  currentValue: EditSettingValue;
  onConfirm: (nextValue: EditSettingValue) => void;
  onClose: () => void;
}

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

const TITLE_KEYS: Record<EditSettingType, TranslationKey> = {
  model: 'me.edit.modelTitle',
  goal: 'me.edit.goalTitle',
  protein: 'me.edit.proteinTitle',
  carbs: 'me.edit.carbsTitle',
  calories: 'me.edit.caloriesTitle',
  hydration: 'me.edit.hydrationTitle',
  unitSystem: 'me.edit.unitSystemTitle',
  language: 'me.edit.languageTitle',
};

const MODEL_OPTIONS = [
  {
    value: 'Lite',
    titleKey: 'onboarding.model.lite.name' as TranslationKey,
    descriptionKey: 'onboarding.modelLiteDesc' as TranslationKey,
  },
  {
    value: 'ProPlus',
    titleKey: 'onboarding.model.pro_plus.name' as TranslationKey,
    descriptionKey: 'onboarding.modelProDesc' as TranslationKey,
  },
  {
    value: 'Steel',
    titleKey: 'onboarding.model.steel.name' as TranslationKey,
    descriptionKey: 'onboarding.modelSteelDesc' as TranslationKey,
  },
] as const;

const GOAL_OPTIONS = [
  {
    value: 'Muscle',
    titleKey: 'onboarding.goalMuscle' as TranslationKey,
    descriptionKey: 'onboarding.goalMuscleDesc' as TranslationKey,
    icon: <Ionicons name="barbell-outline" size={GOAL_ICON_SIZE} color={colors.text.primary} />,
  },
  {
    value: 'Wellness',
    titleKey: 'onboarding.goalWellness' as TranslationKey,
    descriptionKey: 'onboarding.goalWellnessDesc' as TranslationKey,
    icon: <Ionicons name="heart-outline" size={GOAL_ICON_SIZE} color={colors.text.primary} />,
  },
  {
    value: 'Energy',
    titleKey: 'onboarding.goalEnergy' as TranslationKey,
    descriptionKey: 'onboarding.goalEnergyDesc' as TranslationKey,
    icon: <Ionicons name="flash-outline" size={GOAL_ICON_SIZE} color={colors.text.primary} />,
  },
  {
    value: 'Recovery',
    titleKey: 'onboarding.goalRecovery' as TranslationKey,
    descriptionKey: 'onboarding.goalRecoveryDesc' as TranslationKey,
    icon: <Ionicons name="moon-outline" size={GOAL_ICON_SIZE} color={colors.text.primary} />,
  },
] as const;

function isNumericType(type: EditSettingType): boolean {
  return type === 'protein' || type === 'carbs' || type === 'calories' || type === 'hydration';
}

function ToggleButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.toggleButton, selected && styles.toggleButtonSelected]}
    >
      <View style={styles.toggleHighlight} />
      <Text style={[styles.toggleLabel, selected && styles.toggleLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function EditSettingSheet({
  type,
  currentValue,
  onConfirm,
  onClose,
}: EditSettingSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const [selectedValue, setSelectedValue] = useState(String(currentValue));

  useEffect(() => {
    setSelectedValue(String(currentValue));
  }, [currentValue, type]);

  useEffect(() => {
    translateY.setValue(height);

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
  }, [backdropOpacity, height, translateY]);

  const closeSheet = () => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;

    Animated.parallel([
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
    ]).start(({ finished }) => {
      isClosingRef.current = false;

      if (finished) {
        onClose();
      }
    });
  };

  const unitSystemOptions = useMemo<ToggleOption[]>(() => ([
    { value: 'metric', label: t('me.metric') },
    { value: 'imperial', label: t('me.imperial') },
  ]), [t]);

  const languageOptions = useMemo<ToggleOption[]>(() => ([
    { value: 'en', label: t('profile.language.en') },
    { value: 'pt-BR', label: t('profile.language.pt_BR') },
  ]), [t]);

  const normalizedNumericValue = useMemo(() => {
    if (!isNumericType(type)) {
      return null;
    }

    const parsedValue = Number(selectedValue.trim());

    if (!Number.isFinite(parsedValue)) {
      return null;
    }

    return Math.round(parsedValue);
  }, [selectedValue, type]);

  const confirmValue: EditSettingValue | null = isNumericType(type)
    ? normalizedNumericValue
    : selectedValue.trim().length > 0
      ? selectedValue
      : null;

  const handleConfirm = () => {
    if (confirmValue === null) {
      return;
    }

    onConfirm(confirmValue);
    closeSheet();
  };

  const renderSelectionContent = () => {
    if (type === 'model') {
      return (
        <View style={styles.cardList}>
          {MODEL_OPTIONS.map(option => (
            <SelectionCard
              key={option.value}
              onPress={() => { setSelectedValue(option.value); }}
              selected={selectedValue === option.value}
              subtitle={t(option.descriptionKey)}
              title={t(option.titleKey)}
            />
          ))}
        </View>
      );
    }

    if (type === 'goal') {
      return (
        <View style={styles.cardList}>
          {GOAL_OPTIONS.map(option => (
            <SelectionCard
              key={option.value}
              icon={option.icon}
              onPress={() => { setSelectedValue(option.value); }}
              selected={selectedValue === option.value}
              subtitle={t(option.descriptionKey)}
              title={t(option.titleKey)}
            />
          ))}
        </View>
      );
    }

    return null;
  };

  const renderToggleContent = (options: ToggleOption[]) => (
    <View style={styles.toggleRow}>
      {options.map(option => (
        <ToggleButton
          key={option.value}
          label={option.label}
          onPress={() => { setSelectedValue(option.value); }}
          selected={selectedValue === option.value}
        />
      ))}
    </View>
  );

  const renderBody = () => {
    if (type === 'model' || type === 'goal') {
      return renderSelectionContent();
    }

    if (type === 'unitSystem') {
      return renderToggleContent(unitSystemOptions);
    }

    if (type === 'language') {
      return renderToggleContent(languageOptions);
    }

    return (
      <AuthInput
        keyboardType="numeric"
        onChangeText={setSelectedValue}
        placeholder={t(TITLE_KEYS[type])}
        value={selectedValue}
      />
    );
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={closeSheet} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              maxHeight: height * 0.86,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>{t(TITLE_KEYS[type])}</Text>
          <Text style={styles.subtitle}>{t('me.edit.confirm')}</Text>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
          >
            {renderBody()}
          </ScrollView>

          <AuthButton disabled={confirmValue === null} onPress={handleConfirm}>
            {t('me.edit.confirm')}
          </AuthButton>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheetContainer: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
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
  },
  title: {
    marginTop: spacing.lg,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    opacity: SUBTITLE_OPACITY,
    textAlign: 'center',
  },
  scrollView: {
    marginTop: spacing['3xl'],
    marginBottom: spacing['3xl'],
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  cardList: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: TOGGLE_BORDER,
    backgroundColor: TOGGLE_BACKGROUND,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleButtonSelected: {
    borderColor: TOGGLE_SELECTED_BORDER,
    backgroundColor: TOGGLE_SELECTED_BACKGROUND,
  },
  toggleHighlight: {
    ...StyleSheet.absoluteFillObject,
    height: '50%',
    backgroundColor: TOGGLE_HIGHLIGHT,
  },
  toggleLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  toggleLabelSelected: {
    color: colors.text.primary,
    fontWeight: fontWeights.bold,
  },
});