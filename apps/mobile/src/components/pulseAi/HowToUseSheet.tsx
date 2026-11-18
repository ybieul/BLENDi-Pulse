// apps/mobile/src/components/pulseAi/HowToUseSheet.tsx
// CP-B5 — "Como usar" do Pulse AI: a regra em uma frase (o que for pedido de
// forma explícita, a receita traz), exemplos tocáveis que PREENCHEM o campo
// de mensagem (não enviam) e o limite do copo em uma frase. Sem exemplo de
// bebida alcoólica (o app não sugere álcool) e sem marca de terceiros.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { borderRadius, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';

export const HOW_TO_USE_EXAMPLE_KEYS = [
  'pulseAi.howToUse.exampleIngredient',
  'pulseAi.howToUse.exampleAmount',
  'pulseAi.howToUse.exampleMacro',
  'pulseAi.howToUse.exampleFlavor',
  'pulseAi.howToUse.exampleCalories',
  'pulseAi.howToUse.exampleOffDiet',
] as const;

export interface HowToUseSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Recebe o texto do exemplo; a tela preenche o campo sem enviar. */
  onExamplePress: (text: string) => void;
}

export function HowToUseSheet({ visible, onClose, onExamplePress }: HowToUseSheetProps) {
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
    rule: {
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
      lineHeight: 22,
      marginBottom: spacing.lg,
    },
    examplesTitle: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      marginBottom: spacing.md,
    },
    exampleList: {
      gap: spacing.sm,
    },
    exampleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.overlay.plum[6],
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    exampleText: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    limitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    limitText: {
      flex: 1,
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
  });

  return (
    <Modal
      animationType="slide"
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pulseAi.howToUse.close')}
          onPress={onClose}
          style={styles.backdrop}
          testID="how-to-use-backdrop"
        />

        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          accessibilityViewIsModal
          testID="how-to-use-sheet"
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">
              {t('pulseAi.howToUse.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pulseAi.howToUse.close')}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.rule}>{t('pulseAi.howToUse.rule')}</Text>
            <Text style={styles.examplesTitle}>{t('pulseAi.howToUse.examplesTitle')}</Text>

            <View style={styles.exampleList}>
              {HOW_TO_USE_EXAMPLE_KEYS.map((key) => {
                const text = t(key);

                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                    accessibilityHint={t('pulseAi.howToUse.exampleA11yHint')}
                    onPress={() => onExamplePress(text)}
                    style={styles.exampleChip}
                  >
                    <Text style={styles.exampleText}>{text}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.brand.pulse} />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.limitRow}>
              <Ionicons name="information-circle-outline" size={18} color={colors.text.secondary} />
              <Text style={styles.limitText}>{t('pulseAi.howToUse.limit')}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
