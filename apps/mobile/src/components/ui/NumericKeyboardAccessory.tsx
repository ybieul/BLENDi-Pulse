// apps/mobile/src/components/ui/NumericKeyboardAccessory.tsx
// Barra "Próximo/Concluir" acima do teclado numérico do iOS.
//
// Os teclados number-pad e decimal-pad do iPhone não têm tecla de retorno,
// então returnKeyType/onSubmitEditing não fazem nada lá. Esta barra
// (InputAccessoryView) faz esse papel: "Próximo" chama `onNext` (a tela foca o
// campo seguinte) e, no último campo, "Concluir" fecha o teclado. No Android
// não renderiza nada: lá quem faz isso é a tecla de ação do próprio teclado
// (returnKeyType + onSubmitEditing).
//
// Cada campo se liga à barra com `inputAccessoryViewID={keyboardAccessoryId(id)}`
// (undefined fora do iOS). Extraída da NutritionGoalsScreen (CP-1.1.1b).

import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';

const ACCESSORY_BAR_HEIGHT = 44;

/** Valor de `inputAccessoryViewID` do campo: o id no iOS, undefined no Android. */
export function keyboardAccessoryId(nativeID: string): string | undefined {
  return Platform.OS === 'ios' ? nativeID : undefined;
}

export interface NumericKeyboardAccessoryProps {
  /** Mesmo valor passado em `inputAccessoryViewID` nos campos. */
  nativeID: string;
  /** O campo em foco é o último: mostra "Concluir", que fecha o teclado. */
  isLastField: boolean;
  /** "Próximo": a tela foca o campo seguinte. */
  onNext: () => void;
}

export function NumericKeyboardAccessory({ nativeID, isLastField, onNext }: NumericKeyboardAccessoryProps) {
  const colors = useColors();
  const { t } = useAppTranslation();

  if (Platform.OS !== 'ios') {
    return null;
  }

  const styles = StyleSheet.create({
    bar: {
      height: ACCESSORY_BAR_HEIGHT,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.background.secondary,
      borderTopWidth: 1,
      borderTopColor: colors.overlay.plum[10],
    },
    button: {
      minHeight: ACCESSORY_BAR_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    buttonText: {
      color: colors.brand.pulse,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
    },
  });

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (isLastField) {
              Keyboard.dismiss();
              return;
            }
            onNext();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {isLastField ? t('nutritionGoals.done') : t('nutritionGoals.next')}
          </Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
