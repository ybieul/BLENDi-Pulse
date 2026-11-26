// apps/mobile/src/screens/ProfileNameScreen.tsx
// Tela "Seu nome" do perfil — teste no build EAS 25-26/11: contas Apple
// nasciam com o começo do e-mail como nome e não havia onde corrigir.
// Mesmo padrão da AllergiesScreen/NutritionGoalsScreen: voltar no topo,
// "Salvar" fixo no rodapé, PATCH /users/me só com firstName/lastName (o
// backend monta o nome completo e tira a marca de "nome a confirmar"),
// duplo toque barrado (isSavingRef) e confirmação ao sair com alteração não
// salva (beforeRemove). Nome é dado pessoal: nada aqui vai para log.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';

import {
  composeFullName,
  fontSizes,
  fonts,
  fontWeights,
  resolvePersonNameParts,
  spacing,
} from '@blendi/shared';

import { api } from '../config/api';
import { QUERY_KEYS } from '../config/cache.config';
import { PersonNameFields } from '../components/profile/PersonNameFields';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';
import { validatePersonName } from '../utils/personName.utils';
import { showToast } from '../utils/toast.utils';

type ProfileNameScreenProps = NativeStackScreenProps<RootStackParamList, 'ProfileName'>;

const BACK_BUTTON_SIZE = 36;

export function ProfileNameScreen({ navigation }: ProfileNameScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  // Conta "a confirmar": o nome salvo é só o começo do e-mail — os campos
  // abrem vazios (com o sobrenome real, se houver) e um aviso explica.
  const needsConfirmation = authUser?.nameNeedsConfirmation === true;
  const saved = useMemo(() => resolvePersonNameParts(authUser ?? {}), [authUser]);
  const [firstName, setFirstName] = useState(needsConfirmation ? '' : saved.firstName);
  const [lastName, setLastName] = useState(saved.lastName);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const allowLeaveRef = useRef(false);

  const validation = validatePersonName(firstName, lastName);
  const hasChanges =
    needsConfirmation ||
    validation.firstName !== saved.firstName ||
    validation.lastName !== saved.lastName;
  const isDirty = firstName !== (needsConfirmation ? '' : saved.firstName) || lastName !== saved.lastName;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!isDirtyRef.current || allowLeaveRef.current) return;

      event.preventDefault();
      Alert.alert(t('me.name.unsavedTitle'), t('me.name.unsavedMessage'), [
        { text: t('me.name.unsavedKeep'), style: 'cancel' },
        {
          text: t('me.name.unsavedDiscard'),
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
  }, [navigation, t]);

  const handleSave = async () => {
    if (isSavingRef.current || !hasChanges) return;

    if (!validation.isValid) {
      setShowErrors(true);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setFormError(null);

    try {
      await api.patch('/users/me', { firstName: validation.firstName, lastName: validation.lastName });
      updateUserProfile({
        firstName: validation.firstName,
        lastName: validation.lastName,
        name: composeFullName(validation.firstName, validation.lastName),
        nameNeedsConfirmation: false,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      showToast(t('me.name.saved'));
      allowLeaveRef.current = true;
      navigation.goBack();
    } catch (error) {
      setFormError(
        t(axios.isAxiosError(error) ? getAxiosErrorTranslationKey(error) : 'errors.network_internal_server_error'),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const styles = StyleSheet.create({
    flex: { flex: 1 },
    root: { flex: 1, backgroundColor: colors.background.primary },
    scrollContent: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing['4xl'],
      gap: spacing.lg,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
    hint: {
      color: colors.feedback.warning,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    error: {
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <View style={styles.root} testID="profile-name-screen">
        <AuroraBackground intensity="reduced" />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.lg }]}
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
              {t('me.name.screenTitle')}
            </Text>
          </View>

          <Text style={styles.subtitle}>{t('me.name.subtitle')}</Text>
          {needsConfirmation ? (
            <Text style={styles.hint} testID="profile-name-confirm-hint">
              {t('me.name.confirmHint')}
            </Text>
          ) : null}

          <PersonNameFields
            firstName={firstName}
            lastName={lastName}
            onChangeFirstName={(value) => {
              setFirstName(value);
              setFormError(null);
            }}
            onChangeLastName={(value) => {
              setLastName(value);
              setFormError(null);
            }}
            firstNameLabel={t('me.name.firstNameLabel')}
            lastNameLabel={t('me.name.lastNameLabel')}
            firstNameError={showErrors ? validation.firstNameError : null}
            lastNameError={showErrors ? validation.lastNameError : null}
            editable={!isSaving}
            onSubmit={() => { void handleSave(); }}
            testIDPrefix="profile-name"
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          {formError ? <Text style={styles.error} accessibilityRole="alert">{formError}</Text> : null}
          <AuthButton
            onPress={() => { void handleSave(); }}
            disabled={!hasChanges || isSaving}
            loading={isSaving}
            testID="profile-name-save"
          >
            {t('me.name.save')}
          </AuthButton>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
