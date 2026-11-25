// apps/mobile/src/components/pantryScanner/PantryHowToUseSheet.tsx
// CP-B6 — "Como usar" do Pantry Scanner, na mesma moldura do Pulse AI
// (HowToUseSheetFrame): foto, marcar/desmarcar, "Outros itens na foto",
// adicionados à mão (obrigatórios), "Algum pedido?" com exemplos que
// PREENCHEM o campo (não geram), líquido, bebida alcoólica, alergias e que
// gerar conta 1 scan. Os exemplos não citam alérgeno nem álcool.

import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import type { TranslationKey } from '../../locales/i18n';
import { HowToUseSheetFrame, useHowToUseContentStyles } from '../ui/HowToUseSheetFrame';

export const PANTRY_HOW_TO_USE_EXAMPLE_KEYS = [
  'pantryScanner.howToUse.exampleProtein',
  'pantryScanner.howToUse.exampleFlavor',
  'pantryScanner.howToUse.exampleLight',
] as const satisfies readonly TranslationKey[];

const BEFORE_EXAMPLES: readonly TranslationKey[] = [
  'pantryScanner.howToUse.photo',
  'pantryScanner.howToUse.mark',
  'pantryScanner.howToUse.otherItems',
  'pantryScanner.howToUse.added',
];

const AFTER_EXAMPLES: ReadonlyArray<{ key: TranslationKey; icon: 'water-outline' | 'wine-outline' | 'warning-outline' | 'scan-outline' }> = [
  { key: 'pantryScanner.howToUse.liquid', icon: 'water-outline' },
  { key: 'pantryScanner.howToUse.alcohol', icon: 'wine-outline' },
  { key: 'pantryScanner.howToUse.allergies', icon: 'warning-outline' },
  { key: 'pantryScanner.howToUse.scan', icon: 'scan-outline' },
];

export interface PantryHowToUseSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Recebe o texto do exemplo; a tela preenche o "Algum pedido?" sem gerar. */
  onExamplePress: (text: string) => void;
}

export function PantryHowToUseSheet({ visible, onClose, onExamplePress }: PantryHowToUseSheetProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const styles = useHowToUseContentStyles();

  return (
    <HowToUseSheetFrame
      visible={visible}
      onClose={onClose}
      title={t('pantryScanner.howToUse.title')}
      closeLabel={t('pantryScanner.howToUse.close')}
      testIDPrefix="pantry-how-to-use"
    >
      {BEFORE_EXAMPLES.map((key) => (
        <Text key={key} style={styles.paragraph}>{t(key)}</Text>
      ))}

      <Text style={styles.examplesTitle}>{t('pantryScanner.howToUse.request')}</Text>
      <View style={styles.exampleList}>
        {PANTRY_HOW_TO_USE_EXAMPLE_KEYS.map((key) => {
          const text = t(key);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={text}
              accessibilityHint={t('pantryScanner.howToUse.exampleA11yHint')}
              onPress={() => onExamplePress(text)}
              style={styles.exampleChip}
              testID={`pantry-how-to-use-example-${key.split('.').pop() ?? key}`}
            >
              <Text style={styles.exampleText}>{text}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.brand.pulse} />
            </Pressable>
          );
        })}
      </View>

      {AFTER_EXAMPLES.map(({ key, icon }) => (
        <View key={key} style={styles.infoRow}>
          <Ionicons name={icon} size={18} color={colors.text.secondary} />
          <Text style={styles.infoText}>{t(key)}</Text>
        </View>
      ))}
    </HowToUseSheetFrame>
  );
}
