import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  fontSizes,
  fonts,
  fontWeights,
  OTHER_BLENDER_MODEL_MAX_LENGTH,
  spacing,
  type Colors,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { AuthButton } from '../ui/AuthButton';
import { AuthInput } from '../ui/AuthInput';
import { SelectionCard } from '../ui/SelectionCard';
import type { TranslationKey } from '../../locales/i18n';
import { BLENDER_OPTIONS } from '../../utils/blenderOwnership.utils';

const SHEET_RADIUS = 24;
const SUBTITLE_OPACITY = 0.7;
const GOAL_ICON_SIZE = 22;

export type EditSettingType =
  | 'model'
  | 'goal'
  | 'fat'
  | 'unitSystem'
  | 'language'
  | 'theme';

export type EditSettingValue = string | number;

/** Dados extras do tipo 'model' — o texto livre de "outro modelo". */
export interface EditSettingDetails {
  otherBlenderModel: string;
}

interface ToggleOption {
  value: string;
  label: string;
}

interface EditSettingSheetProps {
  type: EditSettingType;
  /** Em 'model', é a chave da opção: 'Lite' | 'ProPlus' | 'Steel' | 'other' | 'none'. */
  currentValue: EditSettingValue;
  /** Só para 'model': marca/modelo já salvo, para pré-preencher o campo de "outro modelo". */
  currentOtherBlenderModel?: string | null;
  onConfirm: (nextValue: EditSettingValue, details?: EditSettingDetails) => void;
  onClose: () => void;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TITLE_KEYS: Record<EditSettingType, TranslationKey> = {
  model: 'me.edit.modelTitle',
  goal: 'me.edit.goalTitle',
  fat: 'me.edit.fatTitle',
  unitSystem: 'me.edit.unitSystemTitle',
  language: 'me.edit.languageTitle',
  theme: 'me.edit.themeTitle',
};

// Nomes de ícone apenas — o elemento <Ionicons> é construído em
// renderSelectionContent(), onde `colors` (reativo ao tema) está em escopo.
const GOAL_OPTIONS = [
  {
    value: 'Muscle',
    titleKey: 'onboarding.goalMuscle' as TranslationKey,
    descriptionKey: 'onboarding.goalMuscleDesc' as TranslationKey,
    iconName: 'barbell-outline' as IoniconName,
  },
  {
    value: 'Wellness',
    titleKey: 'onboarding.goalWellness' as TranslationKey,
    descriptionKey: 'onboarding.goalWellnessDesc' as TranslationKey,
    iconName: 'heart-outline' as IoniconName,
  },
  {
    value: 'Energy',
    titleKey: 'onboarding.goalEnergy' as TranslationKey,
    descriptionKey: 'onboarding.goalEnergyDesc' as TranslationKey,
    iconName: 'flash-outline' as IoniconName,
  },
  {
    value: 'Recovery',
    titleKey: 'onboarding.goalRecovery' as TranslationKey,
    descriptionKey: 'onboarding.goalRecoveryDesc' as TranslationKey,
    iconName: 'moon-outline' as IoniconName,
  },
] as const;

// Proteína, carboidratos, calorias e hidratação saíram daqui: são editadas na
// tela "Minhas metas" (NutritionGoalsScreen). Resta só a gordura, cuja linha
// está comentada no Me até o consumo de gordura ser rastreado.
function isNumericType(type: EditSettingType): boolean {
  return type === 'fat';
}

function ToggleButton({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: Colors;
}) {
  const toggleStyles = StyleSheet.create({
    toggleButton: {
      flex: 1,
      minHeight: 56,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.overlay.plum[7],
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    toggleButtonSelected: {
      borderColor: colors.overlay.pulse[55],
      backgroundColor: colors.overlay.pulse[22],
    },
    toggleHighlight: {
      ...StyleSheet.absoluteFillObject,
      height: '50%',
      backgroundColor: colors.overlay.plum[4],
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[toggleStyles.toggleButton, selected && toggleStyles.toggleButtonSelected]}
    >
      <View style={toggleStyles.toggleHighlight} />
      <Text style={[toggleStyles.toggleLabel, selected && toggleStyles.toggleLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function EditSettingSheet({
  type,
  currentValue,
  currentOtherBlenderModel,
  onConfirm,
  onClose,
}: EditSettingSheetProps) {
  const { t } = useAppTranslation();
  const colors = useColors();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const [selectedValue, setSelectedValue] = useState(String(currentValue));

  const [otherBlenderModelText, setOtherBlenderModelText] = useState(currentOtherBlenderModel ?? '');

  useEffect(() => {
    setSelectedValue(String(currentValue));
  }, [currentValue, type]);

  useEffect(() => {
    setOtherBlenderModelText(currentOtherBlenderModel ?? '');
  }, [currentOtherBlenderModel, type]);

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

  const themeOptions = useMemo<ToggleOption[]>(() => ([
    { value: 'light', label: t('me.theme.light') },
    { value: 'dark', label: t('me.theme.dark') },
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

    if (type === 'model') {
      onConfirm(confirmValue, { otherBlenderModel: otherBlenderModelText.trim() });
    } else {
      onConfirm(confirmValue);
    }
    closeSheet();
  };

  const renderSelectionContent = () => {
    if (type === 'model') {
      return (
        <View style={styles.cardList}>
          {BLENDER_OPTIONS.map(option => (
            <SelectionCard
              key={option.key}
              badge={option.badge}
              onPress={() => { setSelectedValue(option.key); }}
              selected={selectedValue === option.key}
              subtitle={t(option.descKey)}
              title={t(option.titleKey)}
            />
          ))}
          {selectedValue === 'other' ? (
            <AuthInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={OTHER_BLENDER_MODEL_MAX_LENGTH}
              onChangeText={setOtherBlenderModelText}
              placeholder={t('onboarding.otherModelPlaceholder')}
              returnKeyType="done"
              value={otherBlenderModelText}
            />
          ) : null}
        </View>
      );
    }

    if (type === 'goal') {
      return (
        <View style={styles.cardList}>
          {GOAL_OPTIONS.map(option => (
            <SelectionCard
              key={option.value}
              icon={<Ionicons name={option.iconName} size={GOAL_ICON_SIZE} color={colors.text.primary} />}
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
          colors={colors}
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

    if (type === 'theme') {
      return renderToggleContent(themeOptions);
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

  const styles = StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[30],
    },
    kvContainer: {
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      borderTopWidth: 1,
      borderColor: colors.overlay.plum[10],
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
      backgroundColor: colors.overlay.plum[22],
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
  });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={closeSheet} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kvContainer}
        >
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
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
