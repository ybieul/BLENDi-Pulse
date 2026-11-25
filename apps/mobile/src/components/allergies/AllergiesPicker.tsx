// apps/mobile/src/components/allergies/AllergiesPicker.tsx
// CP-B6 — cadastro de alergias: os 8 botões prontos (ALLERGY_CODE_VALUES),
// o campo livre (até 10 itens de até 40 caracteres, sem repetir pela
// normalização do shared) e o texto de honestidade, sempre visível. Fonte
// única: usado pela tela de dieta do onboarding e pela tela "Alergias" do
// perfil — quem usa decide o que fazer com a lista.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  ALLERGY_CODE_VALUES,
  ALLERGY_CUSTOM_ITEM_MAX_LENGTH,
  ALLERGY_CUSTOM_MAX_ITEMS,
  borderRadius,
  fontSizes,
  fonts,
  fontWeights,
  isSameAllergyItem,
  sanitizeSingleLineText,
  spacing,
  type AllergyCode,
  type UserAllergies,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { ALLERGY_TITLE_KEYS } from '../../utils/allergies.utils';

export interface AllergiesPickerProps {
  value: UserAllergies;
  onChange: (next: UserAllergies) => void;
  disabled?: boolean;
}

type CustomError = 'limit' | 'duplicate' | null;

export function AllergiesPicker({ value, onChange, disabled = false }: AllergiesPickerProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState('');
  const [customError, setCustomError] = useState<CustomError>(null);

  const toggleCode = (code: AllergyCode) => {
    const common = value.common.includes(code)
      ? value.common.filter(current => current !== code)
      : ALLERGY_CODE_VALUES.filter(current => current === code || value.common.includes(current));
    onChange({ ...value, common });
  };

  const addCustom = () => {
    const item = sanitizeSingleLineText(draft).slice(0, ALLERGY_CUSTOM_ITEM_MAX_LENGTH).trim();
    if (!item) return;

    if (value.custom.some(existing => isSameAllergyItem(existing, item))) {
      setCustomError('duplicate');
      return;
    }

    if (value.custom.length >= ALLERGY_CUSTOM_MAX_ITEMS) {
      setCustomError('limit');
      return;
    }

    setCustomError(null);
    setDraft('');
    onChange({ ...value, custom: [...value.custom, item] });
  };

  const removeCustom = (item: string) => {
    setCustomError(null);
    onChange({ ...value, custom: value.custom.filter(current => current !== item) });
  };

  const canAdd = !disabled && draft.trim().length > 0;
  const atLimit = value.custom.length >= ALLERGY_CUSTOM_MAX_ITEMS;

  const styles = StyleSheet.create({
    root: {
      gap: spacing.md,
    },
    label: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.overlay.plum[15],
      backgroundColor: colors.overlay.plum[6],
      paddingHorizontal: spacing.md,
    },
    chipSelected: {
      borderColor: colors.overlay.error[65],
      backgroundColor: colors.overlay.error[12],
    },
    chipLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    addRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      minHeight: 44,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.plum[16],
      backgroundColor: colors.overlay.plum[6],
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      paddingHorizontal: spacing.md,
    },
    addButton: {
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.plum[15],
      paddingHorizontal: spacing.md,
      opacity: canAdd ? 1 : 0.5,
    },
    addButtonLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
    },
    error: {
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
    },
    customItem: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.error[40],
      backgroundColor: colors.overlay.error[6],
      paddingLeft: spacing.md,
    },
    customItemLabel: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
    removeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    honesty: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.warning[42],
      backgroundColor: colors.overlay.warning[8],
      padding: spacing.md,
    },
    honestyText: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      lineHeight: 18,
    },
  });

  return (
    <View style={styles.root} testID="allergies-picker">
      <Text style={styles.label} accessibilityRole="header">{t('allergies.picker.commonLabel')}</Text>
      <View style={styles.chips}>
        {ALLERGY_CODE_VALUES.map(code => {
          const selected = value.common.includes(code);
          const label = t(ALLERGY_TITLE_KEYS[code]);
          return (
            <Pressable
              key={code}
              accessibilityRole="checkbox"
              accessibilityLabel={t('allergies.picker.optionA11y', { item: label })}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => { toggleCode(code); }}
              style={[styles.chip, selected ? styles.chipSelected : null]}
              testID={`allergy-option-${code}`}
            >
              {selected ? <Ionicons name="checkmark" size={14} color={colors.feedback.error} /> : null}
              <Text style={styles.chipLabel}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label} accessibilityRole="header">{t('allergies.picker.customLabel')}</Text>
      {value.custom.map(item => (
        <View key={item} style={styles.customItem} testID="allergy-custom-item">
          <Text style={styles.customItemLabel} numberOfLines={1}>{item}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('allergies.picker.customRemoveA11y', { item })}
            disabled={disabled}
            onPress={() => { removeCustom(item); }}
            style={styles.removeButton}
            testID={`allergy-custom-remove-${item}`}
          >
            <Ionicons name="close" size={18} color={colors.text.secondary} />
          </Pressable>
        </View>
      ))}

      {!atLimit ? (
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            accessibilityLabel={t('allergies.picker.customAddA11y')}
            placeholder={t('allergies.picker.customPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            value={draft}
            editable={!disabled}
            onChangeText={(text) => {
              setDraft(text);
              setCustomError(null);
            }}
            onSubmitEditing={addCustom}
            maxLength={ALLERGY_CUSTOM_ITEM_MAX_LENGTH}
            returnKeyType="done"
            testID="allergy-custom-input"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('allergies.picker.customAddA11y')}
            accessibilityState={{ disabled: !canAdd }}
            disabled={!canAdd}
            onPress={addCustom}
            style={styles.addButton}
            testID="allergy-custom-add"
          >
            <Text style={styles.addButtonLabel}>{t('allergies.picker.customAdd')}</Text>
          </Pressable>
        </View>
      ) : null}

      {customError === 'duplicate' ? (
        <Text style={styles.error} accessibilityRole="alert">{t('allergies.picker.customDuplicate')}</Text>
      ) : null}
      {customError === 'limit' || atLimit ? (
        <Text style={styles.error}>{t('allergies.picker.customLimit', { max: ALLERGY_CUSTOM_MAX_ITEMS })}</Text>
      ) : null}

      <View style={styles.honesty} accessible accessibilityLabel={t('allergies.picker.honesty')} testID="allergies-honesty">
        <Ionicons name="alert-circle-outline" size={18} color={colors.feedback.warning} />
        <Text style={styles.honestyText}>{t('allergies.picker.honesty')}</Text>
      </View>
    </View>
  );
}
