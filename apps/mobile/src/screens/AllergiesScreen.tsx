// apps/mobile/src/screens/AllergiesScreen.tsx
// CP-B6 — tela "Alergias" do perfil, separada das preferências de dieta.
// Aberta pela linha "Alergias" do Me e pelo convite único ("Isso é
// alergia?"). Mesmo padrão da NutritionGoalsScreen: voltar no topo, "Salvar"
// fixo no rodapé, PATCH /users/me só com `allergies` (substitui o campo
// inteiro), duplo toque barrado (isSavingRef) e confirmação ao sair com
// alteração não salva (beforeRemove). Alergia é dado de saúde: nada aqui vai
// para log nem analytics.

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
  fontSizes,
  fonts,
  fontWeights,
  isSameAllergyItem,
  spacing,
  type UserAllergies,
} from '@blendi/shared';

import { api } from '../config/api';
import { QUERY_KEYS } from '../config/cache.config';
import { AllergiesPicker } from '../components/allergies/AllergiesPicker';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui/AuthButton';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/auth.store';
import { readProfileAllergies } from '../utils/allergies.utils';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';
import { showToast } from '../utils/toast.utils';

type AllergiesScreenProps = NativeStackScreenProps<RootStackParamList, 'Allergies'>;

const BACK_BUTTON_SIZE = 36;

function sameAllergies(a: UserAllergies, b: UserAllergies): boolean {
  return (
    a.common.length === b.common.length &&
    a.common.every(code => b.common.includes(code)) &&
    a.custom.length === b.custom.length &&
    a.custom.every(item => b.custom.some(other => isSameAllergyItem(item, other)))
  );
}

export function AllergiesScreen({ navigation }: AllergiesScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  const saved = useMemo(() => readProfileAllergies(authUser), [authUser]);
  const [draft, setDraft] = useState<UserAllergies>(saved);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const hasChanges = !sameAllergies(draft, saved);
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!hasChangesRef.current || allowLeaveRef.current) return;

      event.preventDefault();
      Alert.alert(t('allergies.profile.unsavedTitle'), t('allergies.profile.unsavedMessage'), [
        { text: t('allergies.profile.unsavedKeep'), style: 'cancel' },
        {
          text: t('allergies.profile.unsavedDiscard'),
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
    isSavingRef.current = true;
    setIsSaving(true);
    setFormError(null);

    try {
      await api.patch('/users/me', { allergies: draft });
      updateUserProfile({ allergies: draft });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      showToast(t('allergies.profile.saved'));
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
      <View style={styles.root} testID="allergies-screen">
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
              {t('allergies.profile.screenTitle')}
            </Text>
          </View>

          <Text style={styles.subtitle}>{t('allergies.picker.subtitle')}</Text>

          <AllergiesPicker value={draft} onChange={setDraft} disabled={isSaving} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          {formError ? <Text style={styles.error} accessibilityRole="alert">{formError}</Text> : null}
          <AuthButton
            onPress={() => { void handleSave(); }}
            disabled={!hasChanges || isSaving}
            loading={isSaving}
            testID="allergies-save"
          >
            {t('allergies.profile.save')}
          </AuthButton>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
