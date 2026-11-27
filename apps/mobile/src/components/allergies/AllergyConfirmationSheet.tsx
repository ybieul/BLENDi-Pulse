// apps/mobile/src/components/allergies/AllergyConfirmationSheet.tsx
// CP-B6 — confirmação NA HORA de um alérgeno cadastrado: "Você cadastrou
// alergia a X. Essa receita vai levar X. Continuar?" ("Sim, incluir" /
// "Não, fazer sem"). Mesmo padrão da folha de idade (AgeConfirmationSheet).
// Usada pelo Pulse AI (428 do backend) e pelo Pantry (marcar/adicionar item
// alergênico e pedido de texto). A resposta NUNCA é gravada: vale só para
// aquele pedido. Fechar sem responder não faz nada.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, fontSizes, fontWeights, spacing, type AllergenSelection } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { formatAllergenList } from '../../utils/allergies.utils';
import { useTutorialBlockingSurface } from '../../features/tutorial/useTutorialBlockingSurface';

export interface AllergyConfirmationSheetProps {
  /** Alérgenos citados; null = folha fechada. */
  allergens: AllergenSelection | null;
  /** "Sim, incluir". */
  onConfirm: () => void;
  /** "Não, fazer sem". */
  onDecline: () => void;
  /** Fechar sem responder (voltar do Android). */
  onDismiss: () => void;
}

export function AllergyConfirmationSheet({ allergens, onConfirm, onDecline, onDismiss }: AllergyConfirmationSheetProps) {
  // CP-C2: com esta folha aberta, o tutorial guiado espera.
  useTutorialBlockingSurface(allergens !== null);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const items = formatAllergenList(allergens, t);
  const body = t('allergies.confirm.body', { items });

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[32],
    },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: colors.overlay.error[40],
      backgroundColor: colors.background.primary,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      gap: spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: fontWeights.bold,
    },
    body: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 22,
      marginBottom: spacing.sm,
    },
    button: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.overlay.plum[15],
      paddingHorizontal: spacing.md,
    },
    buttonLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
      textAlign: 'center',
    },
  });

  return (
    <Modal
      animationType="slide"
      statusBarTranslucent
      transparent
      visible={allergens !== null}
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />

        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          accessibilityViewIsModal
          testID="allergy-confirmation-sheet"
        >
          <View style={styles.titleRow}>
            <Ionicons name="warning" size={22} color={colors.feedback.error} />
            <Text style={styles.title} accessibilityRole="header">
              {t('allergies.confirm.title')}
            </Text>
          </View>
          <Text style={styles.body} accessibilityRole="alert" testID="allergy-confirmation-body">
            {body}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('allergies.confirm.confirm')}
            onPress={onConfirm}
            style={styles.button}
            testID="allergy-confirmation-confirm"
          >
            <Text style={styles.buttonLabel}>{t('allergies.confirm.confirm')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('allergies.confirm.decline')}
            onPress={onDecline}
            style={styles.button}
            testID="allergy-confirmation-decline"
          >
            <Text style={styles.buttonLabel}>{t('allergies.confirm.decline')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
