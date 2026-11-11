// Leitura estrita dos campos numéricos (onboarding, completar perfil e metas).
import { parseStrictDecimal, parseStrictInteger } from './numericInput.utils';

describe('parseStrictInteger', () => {
  it.each([
    ['150', 150],
    ['0', 0],
    ['007', 7],
    ['  150  ', 150],
    ['\t2000\n', 2000],
  ])('aceita %j -> %p', (text, expected) => {
    expect(parseStrictInteger(text)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['12abc'],
    ['abc12'],
    ['150,5'],
    ['150.5'],
    ['1.2.3'],
    ['-3'],
    ['+3'],
    ['1e2'],
    ['1 000'],
    ['١٢٣'], // dígitos arábico-índicos
    ['１２'], // dígitos de largura total
    ['१२'], // dígitos devanágari
    ['Infinity'],
    ['NaN'],
    ['0x10'],
    ['99999999999999999999'], // além do inteiro seguro
  ])('recusa %j', (text) => {
    expect(parseStrictInteger(text)).toBeNull();
  });
});

describe('parseStrictDecimal (1 casa, peso e altura)', () => {
  it.each([
    ['70', 70],
    ['70.5', 70.5],
    ['70,5', 70.5],
    [' 70,5 ', 70.5],
    ['70.', 70], // no meio da digitação
    ['70,', 70],
    ['0', 0],
    ['175.0', 175],
  ])('aceita %j -> %p', (text, expected) => {
    expect(parseStrictDecimal(text, 1)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['70abc'],
    ['12abc'],
    ['1.2.3'],
    ['1,2,3'],
    ['1.2,3'],
    ['70.55'], // mais casas do que a tela usa
    ['.5'],
    [','],
    ['-3'],
    ['-70.5'],
    ['+70'],
    ['1e2'],
    ['7 0'],
    ['٧٠'],
    ['７０'],
    ['Infinity'],
  ])('recusa %j', (text) => {
    expect(parseStrictDecimal(text, 1)).toBeNull();
  });

  it('respeita o número de casas pedido', () => {
    expect(parseStrictDecimal('70.55', 2)).toBe(70.55);
    expect(parseStrictDecimal('70.5', 0)).toBeNull();
    expect(parseStrictDecimal('70', 0)).toBe(70);
  });
});
