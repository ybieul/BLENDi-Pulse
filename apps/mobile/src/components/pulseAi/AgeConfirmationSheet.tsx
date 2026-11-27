// apps/mobile/src/components/pulseAi/AgeConfirmationSheet.tsx
// CP-B5 — confirmação única de idade. Só aparece quando o backend responde
// pulseai/age-confirmation-required (o pedido tem bebida alcoólica e a conta
// não tem data de nascimento real nem resposta gravada). Texto neutro: diz
// por que pergunta, sem incentivo. Fechar sem responder não grava nada.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useTutorialBlockingSurface } from '../../features/tutorial/useTutorialBlockingSurface';

export interface AgeConfirmationSheetProps {
  visible: boolean;
  /** true = "Tenho 21 anos ou mais"; false = "Não". */
  onAnswer: (isAdult: boolean) => void;
  /** Fechar sem responder (voltar do Android): nada é gravado. */
  onDismiss: () => void;
}

export function AgeConfirmationSheet({ visible, onAnswer, onDismiss }: AgeConfirmationSheetProps) {
  // CP-C2: com esta folha aberta, o tutorial guiado espera.
  useTutorialBlockingSurface(visible);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();

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
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.background.primary,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      gap: spacing.md,
    },
    title: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 20,
      fontWeight: fontWeights.bold,
    },
    body: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    button: {
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.overlay.plum[15],
    },
    buttonLabel: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
    },
  });

  return (
    <Modal
      animationType="slide"
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />

        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          accessibilityViewIsModal
          testID="age-confirmation-sheet"
        >
          <Text style={styles.title} accessibilityRole="header">
            {t('pulseAi.ageConfirmation.title')}
          </Text>
          <Text style={styles.body}>{t('pulseAi.ageConfirmation.body')}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pulseAi.ageConfirmation.confirm')}
            onPress={() => onAnswer(true)}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>{t('pulseAi.ageConfirmation.confirm')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pulseAi.ageConfirmation.decline')}
            onPress={() => onAnswer(false)}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>{t('pulseAi.ageConfirmation.decline')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
