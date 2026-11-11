// apps/mobile/src/hooks/useNumericFieldChain.ts
// Encadeia o foco de uma sequência de campos numéricos, na ordem visual:
// "Próximo" foca o campo seguinte e o último fecha o teclado. Alimenta as duas
// formas de avançar:
//   • iOS: a barra NumericKeyboardAccessory (o teclado numérico não tem retorno);
//   • Android: a tecla de ação do teclado (returnKeyType + onSubmitEditing).
// `fieldProps(field)` devolve tudo o que o AuthInput precisa para isso.

import { useCallback, useRef, useState } from 'react';
import { Keyboard, type TextInput } from 'react-native';

import { keyboardAccessoryId } from '../components/ui/NumericKeyboardAccessory';

export interface NumericFieldChainProps {
  ref: (node: TextInput | null) => void;
  inputAccessoryViewID: string | undefined;
  returnKeyType: 'next' | 'done';
  submitBehavior: 'submit';
  onSubmitEditing: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface NumericFieldChain<F extends string> {
  fieldProps: (field: F) => NumericFieldChainProps;
  /** Props da NumericKeyboardAccessory (fora o nativeID). */
  accessoryProps: { isLastField: boolean; onNext: () => void };
}

export function useNumericFieldChain<F extends string>(
  fields: readonly F[],
  accessoryNativeID: string,
): NumericFieldChain<F> {
  const inputRefs = useRef<Partial<Record<F, TextInput | null>>>({});
  const [focusedField, setFocusedField] = useState<F | null>(null);

  const advanceFrom = useCallback(
    (field: F) => {
      const nextField = fields[fields.indexOf(field) + 1];
      if (nextField) {
        inputRefs.current[nextField]?.focus();
        return;
      }
      Keyboard.dismiss();
    },
    [fields],
  );

  const lastField = fields[fields.length - 1];

  const fieldProps = (field: F): NumericFieldChainProps => ({
    ref: (node) => {
      inputRefs.current[field] = node;
    },
    inputAccessoryViewID: keyboardAccessoryId(accessoryNativeID),
    returnKeyType: field === lastField ? 'done' : 'next',
    // Mantém o teclado aberto no "Próximo"; o último campo fecha em advanceFrom.
    submitBehavior: 'submit',
    onSubmitEditing: () => {
      advanceFrom(field);
    },
    onFocus: () => {
      setFocusedField(field);
    },
    onBlur: () => {
      setFocusedField((current) => (current === field ? null : current));
    },
  });

  return {
    fieldProps,
    accessoryProps: {
      isLastField: focusedField !== null && focusedField === lastField,
      onNext: () => {
        if (focusedField) {
          advanceFrom(focusedField);
        } else {
          Keyboard.dismiss();
        }
      },
    },
  };
}
