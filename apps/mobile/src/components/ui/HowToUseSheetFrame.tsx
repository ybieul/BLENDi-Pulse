// apps/mobile/src/components/ui/HowToUseSheetFrame.tsx
// CP-B6 — moldura única das folhas "Como usar" (Pulse AI, CP-B5, e Pantry
// Scanner, CP-B6): modal de baixo para cima, alça, título, fechar (botão e
// fundo) e o conteúdo rolável. Quem usa só entrega o conteúdo.

import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, fontWeights, spacing } from '@blendi/shared';
import { useColors } from '../../hooks/useColors';
import { useTutorialBlockingSurface } from '../../features/tutorial/useTutorialBlockingSurface';

export interface HowToUseSheetFrameProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  /** Prefixo dos testIDs: `${testIDPrefix}-sheet` e `${testIDPrefix}-backdrop`. */
  testIDPrefix: string;
  children: ReactNode;
}

export function HowToUseSheetFrame({ visible, onClose, title, closeLabel, testIDPrefix, children }: HowToUseSheetFrameProps) {
  // CP-C2: com esta folha aberta, o tutorial guiado espera.
  useTutorialBlockingSurface(visible);
  const colors = useColors();
  const insets = useSafeAreaInsets();

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
      maxHeight: '85%',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.background.primary,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.overlay.plum[16],
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: fontWeights.bold,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

  return (
    <Modal animationType="slide" statusBarTranslucent transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={styles.backdrop}
          testID={`${testIDPrefix}-backdrop`}
        />

        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          accessibilityViewIsModal
          testID={`${testIDPrefix}-sheet`}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Estilos compartilhados do conteúdo das folhas "Como usar" (exemplos
 * tocáveis e linhas de informação). Objeto simples (sem StyleSheet.create)
 * porque é usado por outros arquivos.
 */
export function useHowToUseContentStyles() {
  const colors = useColors();
  const rule: TextStyle = {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.medium,
    lineHeight: 22,
    marginBottom: spacing.lg,
  };
  const sectionTitle: TextStyle = {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: fontWeights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  };
  const paragraph: TextStyle = {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  };
  const examplesTitle: TextStyle = {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.md,
  };
  const exampleList: ViewStyle = { gap: spacing.sm };
  const exampleChip: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.overlay.plum[10],
    backgroundColor: colors.overlay.plum[6],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  };
  const exampleText: TextStyle = {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  };
  const infoRow: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md };
  const infoText: TextStyle = {
    flex: 1,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  };
  return { rule, sectionTitle, paragraph, examplesTitle, exampleList, exampleChip, exampleText, infoRow, infoText };
}
