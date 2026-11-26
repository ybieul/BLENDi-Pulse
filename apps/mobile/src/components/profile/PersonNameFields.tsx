// apps/mobile/src/components/profile/PersonNameFields.tsx
// Campos Nome (obrigatório) e Sobrenome (opcional) — teste no build EAS
// 25-26/11. Usados na primeira etapa do onboarding (contas Apple/Google com
// "nome a confirmar") e na tela de edição do nome no perfil. Os limites de
// tamanho são os mesmos do backend (@blendi/shared).

import { useRef } from 'react';
import { StyleSheet, View, type TextInput as RNTextInput } from 'react-native';

import { FIRST_NAME_MAX_LENGTH, LAST_NAME_MAX_LENGTH, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { TranslationKey } from '../../locales/i18n';
import { AuthInput } from '../ui/AuthInput';

export interface PersonNameFieldsProps {
  firstName: string;
  lastName: string;
  onChangeFirstName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  firstNameLabel: string;
  lastNameLabel: string;
  firstNameError?: TranslationKey | null;
  lastNameError?: TranslationKey | null;
  editable?: boolean;
  /** Teclado "concluir" no sobrenome. */
  onSubmit?: () => void;
  testIDPrefix?: string;
}

export function PersonNameFields({
  firstName,
  lastName,
  onChangeFirstName,
  onChangeLastName,
  firstNameLabel,
  lastNameLabel,
  firstNameError,
  lastNameError,
  editable = true,
  onSubmit,
  testIDPrefix = 'person-name',
}: PersonNameFieldsProps) {
  const { t } = useAppTranslation();
  const lastNameRef = useRef<RNTextInput | null>(null);

  return (
    <View style={styles.container}>
      <AuthInput
        value={firstName}
        onChangeText={onChangeFirstName}
        placeholder={firstNameLabel}
        accessibilityLabel={firstNameLabel}
        error={firstNameError ? t(firstNameError, { max: FIRST_NAME_MAX_LENGTH }) : undefined}
        maxLength={FIRST_NAME_MAX_LENGTH}
        editable={editable}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        autoComplete="name-given"
        returnKeyType="next"
        onSubmitEditing={() => lastNameRef.current?.focus()}
        testID={`${testIDPrefix}-first`}
      />
      <AuthInput
        ref={lastNameRef}
        value={lastName}
        onChangeText={onChangeLastName}
        placeholder={lastNameLabel}
        accessibilityLabel={lastNameLabel}
        error={lastNameError ? t(lastNameError, { max: LAST_NAME_MAX_LENGTH }) : undefined}
        maxLength={LAST_NAME_MAX_LENGTH}
        editable={editable}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="familyName"
        autoComplete="name-family"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        testID={`${testIDPrefix}-last`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
});
