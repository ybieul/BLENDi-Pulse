// apps/mobile/src/components/pulseAi/HowToUseSheet.tsx
// CP-B5 — "Como usar" do Pulse AI: a regra em uma frase (o que for pedido de
// forma explícita, a receita traz), exemplos tocáveis que PREENCHEM o campo
// de mensagem (não enviam) e o limite do copo em uma frase. Sem exemplo de
// bebida alcoólica (o app não sugere álcool) e sem marca de terceiros.
//
// CP-B6: seção "Alergias" (como cadastrar, como a proteção funciona, como
// pedir para outra pessoa — nomear + confirmar — e o texto de honestidade),
// sem exemplo tocável com alérgeno. Exemplo que cita uma alergia cadastrada
// da pessoa (ex.: pasta de amendoim) não aparece. A moldura é a mesma do
// "Como usar" do Pantry (HowToUseSheetFrame).

import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { namesMentionAllergyItem, type AllergyCode, type UserAllergies } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { HowToUseSheetFrame, useHowToUseContentStyles } from '../ui/HowToUseSheetFrame';

export const HOW_TO_USE_EXAMPLE_KEYS = [
  'pulseAi.howToUse.exampleIngredient',
  'pulseAi.howToUse.exampleAmount',
  'pulseAi.howToUse.exampleMacro',
  'pulseAi.howToUse.exampleFlavor',
  'pulseAi.howToUse.exampleCalories',
  'pulseAi.howToUse.exampleOffDiet',
] as const;

type HowToUseExampleKey = (typeof HOW_TO_USE_EXAMPLE_KEYS)[number];

/** CP-B6: alergias que cada exemplo cita (pasta de amendoim; whey). */
const EXAMPLE_ALLERGENS: Partial<Record<HowToUseExampleKey, readonly AllergyCode[]>> = {
  'pulseAi.howToUse.exampleIngredient': ['peanut'],
  'pulseAi.howToUse.exampleAmount': ['peanut'],
  'pulseAi.howToUse.exampleOffDiet': ['milk', 'lactose'],
};

export interface HowToUseSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Recebe o texto do exemplo; a tela preenche o campo sem enviar. */
  onExamplePress: (text: string) => void;
  /** CP-B6: alergias da pessoa (exemplos com o alérgeno saem). */
  allergies?: UserAllergies;
}

export function HowToUseSheet({ visible, onClose, onExamplePress, allergies }: HowToUseSheetProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const styles = useHowToUseContentStyles();

  const examples = HOW_TO_USE_EXAMPLE_KEYS.filter((key) => {
    const codes = EXAMPLE_ALLERGENS[key] ?? [];
    if (codes.some((code) => allergies?.common.includes(code))) return false;
    const text = t(key);
    return !(allergies?.custom ?? []).some((item) => namesMentionAllergyItem([text], item));
  });

  return (
    <HowToUseSheetFrame
      visible={visible}
      onClose={onClose}
      title={t('pulseAi.howToUse.title')}
      closeLabel={t('pulseAi.howToUse.close')}
      testIDPrefix="how-to-use"
    >
      <Text style={styles.rule}>{t('pulseAi.howToUse.rule')}</Text>
      <Text style={styles.examplesTitle}>{t('pulseAi.howToUse.examplesTitle')}</Text>

      <View style={styles.exampleList}>
        {examples.map((key) => {
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

      <View style={styles.infoRow}>
        <Ionicons name="information-circle-outline" size={18} color={colors.text.secondary} />
        <Text style={styles.infoText}>{t('pulseAi.howToUse.limit')}</Text>
      </View>

      <View testID="how-to-use-allergies">
        <Text style={styles.sectionTitle} accessibilityRole="header">{t('pulseAi.howToUse.allergiesTitle')}</Text>
        <Text style={styles.paragraph}>{t('pulseAi.howToUse.allergiesRegister')}</Text>
        <Text style={styles.paragraph}>{t('pulseAi.howToUse.allergiesOtherPerson')}</Text>
        <Text style={styles.paragraph}>{t('pulseAi.howToUse.allergiesDish')}</Text>
        <View style={styles.infoRow}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.feedback.warning} />
          <Text style={styles.infoText}>{t('allergies.picker.honesty')}</Text>
        </View>
      </View>
    </HowToUseSheetFrame>
  );
}
