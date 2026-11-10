// AuthInput: teto de ampliação da fonte do sistema (rótulo, valor e erro),
// área de erro sem altura fixa e posição do rótulo flutuante com fonte ampliada.
import { render } from '@testing-library/react-native';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { ReactTestInstance, ReactTestRendererJSON } from 'react-test-renderer';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

import {
  AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER,
  AuthInput,
  getAuthInputLabelLayout,
} from './AuthInput';

// As animações do componente (Animated.timing/spring) não podem rodar depois do teste.
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

function textNode(utils: ReturnType<typeof render>, text: string): ReactTestInstance {
  return utils.UNSAFE_getAllByType(Text).find((node) => {
    const children: unknown = node.props.children;
    return children === text;
  }) as ReactTestInstance;
}

describe('AuthInput — teto de escala da fonte', () => {
  it('o teto padrão é 1,3x', () => {
    expect(AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER).toBe(1.3);
  });

  it('rótulo, valor e mensagem de erro usam o teto padrão', () => {
    const utils = render(<AuthInput error="Campo obrigatório" placeholder="E-mail" value="" />);

    expect(utils.UNSAFE_getByType(TextInput).props.maxFontSizeMultiplier).toBe(1.3);
    expect(textNode(utils, 'E-mail').props.maxFontSizeMultiplier).toBe(1.3);
    expect(textNode(utils, 'Campo obrigatório').props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('quem usa pode passar outro teto para o valor; rótulo e erro mantêm o padrão', () => {
    const utils = render(
      <AuthInput error="Erro" maxFontSizeMultiplier={1.1} placeholder="Peso" value="70" />,
    );

    expect(utils.UNSAFE_getByType(TextInput).props.maxFontSizeMultiplier).toBe(1.1);
    expect(textNode(utils, 'Peso').props.maxFontSizeMultiplier).toBe(1.3);
    expect(textNode(utils, 'Erro').props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('sem rótulo (placeholder) o valor também recebe o teto', () => {
    const utils = render(<AuthInput value="abc" />);
    expect(utils.UNSAFE_getByType(TextInput).props.maxFontSizeMultiplier).toBe(1.3);
  });
});

describe('AuthInput — área da mensagem de erro', () => {
  it('sem erro, nada é renderizado abaixo do campo (não reserva espaço)', () => {
    const withoutError = render(<AuthInput placeholder="E-mail" value="a@b.com" />);
    expect((withoutError.toJSON() as ReactTestRendererJSON).children).toHaveLength(1);

    const withError = render(<AuthInput error="Erro" placeholder="E-mail" value="a@b.com" />);
    expect((withError.toJSON() as ReactTestRendererJSON).children).toHaveLength(2);
  });

  it('com erro longo, o texto não tem altura fixa nem limite de linhas (cresce em vez de cortar)', () => {
    const longError = 'Mensagem de erro bem longa '.repeat(10);
    const utils = render(<AuthInput error={longError} placeholder="E-mail" value="" />);
    const errorText = textNode(utils, longError);

    expect(errorText.props.numberOfLines).toBeUndefined();
    const ownStyle = StyleSheet.flatten(errorText.props.style) as Record<string, unknown>;
    expect(ownStyle.height).toBeUndefined();
    expect(ownStyle.maxHeight).toBeUndefined();

    const container = errorText.parent as ReactTestInstance;
    const containerStyle = StyleSheet.flatten(container.props.style) as Record<string, unknown>;
    expect(containerStyle.height).toBeUndefined();
    expect(containerStyle.maxHeight).toBeUndefined();
  });
});

describe('AuthInput — rótulo flutuante com fonte ampliada (altura do campo fixa em 56)', () => {
  // Altura de linha da DM Sans: ~1,3x o tamanho da fonte.
  const LINE_HEIGHT_FACTOR = 1.3;
  const FIELD_HEIGHT = 56;
  const LABEL_FLOAT_FONT = 11;
  const VALUE_FONT = 15;

  it('com fonte normal (1x) o posicionamento é o de antes', () => {
    expect(getAuthInputLabelLayout(1)).toEqual({
      labelFloatTop: 10,
      labelIdleTranslateY: 12,
      inputPaddingTop: 24,
      inputPaddingBottom: 10,
    });
  });

  it('fonte do sistema menor que 1x ou inválida usa o posicionamento normal', () => {
    expect(getAuthInputLabelLayout(0.85)).toEqual(getAuthInputLabelLayout(1));
    expect(getAuthInputLabelLayout(Number.NaN)).toEqual(getAuthInputLabelLayout(1));
  });

  it('acima do teto (ex.: 3x) usa a posição do teto, como o texto', () => {
    expect(getAuthInputLabelLayout(3)).toEqual(getAuthInputLabelLayout(1.3));
  });

  it.each([1, 1.1, 1.2, 1.3, 2])(
    'escala %s: rótulo flutuante e valor não se encostam e o valor cabe no campo',
    (fontScale) => {
      const scale = Math.min(fontScale, AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER);
      const layout = getAuthInputLabelLayout(fontScale);

      const labelBottom = layout.labelFloatTop + LABEL_FLOAT_FONT * scale * LINE_HEIGHT_FACTOR;
      const valueLine = VALUE_FONT * scale * LINE_HEIGHT_FACTOR;
      const contentHeight = FIELD_HEIGHT - layout.inputPaddingTop - layout.inputPaddingBottom;
      // Valor centrado verticalmente na área de conteúdo (iOS e Android, uma linha).
      const valueTop = layout.inputPaddingTop + (contentHeight - valueLine) / 2;

      expect(layout.labelFloatTop).toBeGreaterThanOrEqual(2);
      expect(valueTop).toBeGreaterThanOrEqual(labelBottom);
      expect(valueTop + valueLine).toBeLessThanOrEqual(FIELD_HEIGHT - 1);
      // O rótulo em repouso fica sempre no mesmo lugar (top + translate = 22).
      expect(layout.labelFloatTop + layout.labelIdleTranslateY).toBe(22);
    },
  );

  it('o rótulo do componente usa essas posições (jest-expo simula fontScale 2 -> posição do teto)', () => {
    const utils = render(<AuthInput placeholder="E-mail" value="a@b.com" />);
    const label = textNode(utils, 'E-mail');
    const layout = getAuthInputLabelLayout(1.3);

    expect((StyleSheet.flatten(label.props.style) as { top?: number }).top).toBe(layout.labelFloatTop);
    const inputStyle = StyleSheet.flatten(utils.UNSAFE_getByType(TextInput).props.style) as Record<string, unknown>;
    expect(inputStyle.paddingTop).toBe(layout.inputPaddingTop);
    expect(inputStyle.paddingBottom).toBe(layout.inputPaddingBottom);
  });
});
