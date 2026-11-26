// Teste no build EAS (25-26/11): números de macros com o NOME visível
// (Proteína, Carbo, Gordura, kcal, Álcool), leitura completa no leitor de
// tela ("51 gramas de proteína") e layout que quebra de linha em tela pequena.
import { render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import ptBR from '../../locales/pt-BR.json';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

// t real sobre o pt-BR (interpolação de {{value}}) e locale pt-BR (vírgula).
jest.mock('../../hooks/useAppTranslation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const messages = require('../../locales/pt-BR.json');
  const lookup = (key: string): string => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
    return typeof value === 'string' ? value : key;
  };
  return {
    useAppTranslation: () => ({
      locale: 'pt-BR',
      t: (key: string, vars?: Record<string, unknown>) =>
        lookup(key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
          const value = vars?.[name];
          return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        }),
    }),
  };
});

import { MACRO_CHIP_MIN_WIDTH, MacroChips } from './MacroChips';

type StyledNode = { props: { [propName: string]: unknown } };
const styleOf = (node: StyledNode): ViewStyle => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

describe('MacroChips', () => {
  it('cada número tem o nome visível embaixo (pt-BR)', () => {
    const { getByText } = render(<MacroChips protein={51} carbs={38} fat={4} calories={388} />);

    expect(getByText('51 g')).toBeTruthy();
    expect(getByText(ptBR.common.macroChips.protein)).toBeTruthy();
    expect(getByText('38 g')).toBeTruthy();
    expect(getByText('Carbo')).toBeTruthy();
    expect(getByText('4 g')).toBeTruthy();
    expect(getByText('Gordura')).toBeTruthy();
    expect(getByText('388')).toBeTruthy();
    expect(getByText('kcal')).toBeTruthy();
  });

  it('rótulo de acessibilidade completo por chip ("51 gramas de proteína")', () => {
    const { getByTestId } = render(<MacroChips protein={51} carbs={38.5} fat={4} calories={388} />);

    expect(getByTestId('macro-pill-protein').props.accessibilityLabel).toBe('51 gramas de proteína');
    expect(getByTestId('macro-pill-carbs').props.accessibilityLabel).toBe('38,5 gramas de carboidrato');
    expect(getByTestId('macro-pill-fat').props.accessibilityLabel).toBe('4 gramas de gordura');
    expect(getByTestId('macro-pill-calories').props.accessibilityLabel).toBe('388 quilocalorias');
    expect(getByTestId('macro-pill-protein').props.accessible).toBe(true);
  });

  it('álcool só aparece quando > 0, também com rótulo', () => {
    const withAlcohol = render(<MacroChips protein={1} carbs={1} fat={1} calories={100} alcoholGrams={14} />);
    expect(withAlcohol.getByText('Álcool')).toBeTruthy();
    expect(withAlcohol.getByTestId('macro-pill-alcohol').props.accessibilityLabel).toBe('14 gramas de álcool');

    const zero = render(<MacroChips protein={1} carbs={1} fat={1} calories={100} alcoholGrams={0} />);
    expect(zero.queryByTestId('macro-pill-alcohol')).toBeNull();
  });

  it('mostra só os macros informados (histórico: sem gordura)', () => {
    const { queryByTestId } = render(<MacroChips variant="compact" integer protein={20.6} carbs={30} calories={250} />);

    expect(queryByTestId('macro-pill-fat')).toBeNull();
    expect(queryByTestId('macro-pill-protein')?.props.accessibilityLabel).toBe('21 gramas de proteína');
  });

  it('iPhone SE: chips com largura mínima e quebra de linha, nome que reduz a fonte em vez de cortar', () => {
    const { getByTestId, getByText } = render(
      <MacroChips testID="chips" protein={51} carbs={38} fat={4} calories={388} alcoholGrams={14} />,
    );

    const row = styleOf(getByTestId('chips'));
    expect(row.flexWrap).toBe('wrap');
    expect(row.flexDirection).toBe('row');

    const chip = styleOf(getByTestId('macro-pill-protein'));
    expect(chip.minWidth).toBe(MACRO_CHIP_MIN_WIDTH);
    // 4 chips + 3 vãos de 6 cabem na área útil de um card no SE (320 − 64 = 256).
    expect(4 * MACRO_CHIP_MIN_WIDTH + 3 * 6).toBeLessThanOrEqual(256);

    const label = getByText('Proteína');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
  });
});
