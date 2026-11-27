// CP-L1 — Números com casa decimal de unidade de medida seguem o idioma:
// vírgula em pt-BR, ponto em en (mesmo formato de antes, uma casa fixa).
import { evaluateBodyFields } from './bodyFields.utils';
import { formatFixedDecimal } from './formatNumbers';
import { formatGoalDisplayValue, formatGoalLimit } from './nutritionGoals.utils';
import { parseStrictDecimal } from './numericInput.utils';

describe('CP-L1 — formatFixedDecimal', () => {
  it.each([
    [8.4535, 'en', '8.5'],
    [8.4535, 'pt-BR', '8,5'],
    [80, 'en', '80.0'],
    [80, 'pt-BR', '80,0'],
    [1234.5, 'pt-BR', '1234,5'],
  ] as const)('%s em %s -> %s (sem separador de milhar)', (value, locale, text) => {
    expect(formatFixedDecimal(value, locale)).toBe(text);
  });

  it('o texto em pt-BR continua aceito pelos campos', () => {
    expect(parseStrictDecimal(formatFixedDecimal(178.6, 'pt-BR'), 1)).toBe(178.6);
  });
});

describe('CP-L1 — Minhas metas (hidratação em fl oz)', () => {
  it('valor inicial do campo e limites da mensagem com o separador do idioma', () => {
    expect(formatGoalDisplayValue('dailyHydrationTarget', 2500, 'imperial', 'pt-BR')).toBe('84,5');
    expect(formatGoalDisplayValue('dailyHydrationTarget', 2500, 'imperial', 'en')).toBe('84.5');
    expect(formatGoalDisplayValue('dailyHydrationTarget', 2500, 'imperial')).toBe('84.5');
    expect(formatGoalDisplayValue('dailyHydrationTarget', 2500, 'metric', 'pt-BR')).toBe('2500');
    expect(formatGoalLimit('dailyHydrationTarget', 17, 'imperial', 'pt-BR')).toBe('17,0');
    expect(formatGoalLimit('dailyHydrationTarget', 500, 'metric', 'pt-BR')).toBe(500);
  });
});

describe('CP-L1 — faixa de peso em lbs na mensagem de erro', () => {
  function weightError(locale: 'en' | 'pt-BR') {
    return evaluateBodyFields({
      unitSystem: 'imperial',
      weightText: '1',
      heightText: '',
      feetText: '',
      inchesText: '',
      untouchedSavedHeightCm: null,
      untouchedSavedWeightKg: null,
      weightUnit: 'lbs',
      metricHeightUnit: 'cm',
      locale,
    }).errors.weight as { min?: string; max?: string } | undefined;
  }

  it('pt-BR com vírgula, en com ponto', () => {
    expect(weightError('pt-BR')?.min).toMatch(/^\d+,\d lbs$/);
    expect(weightError('en')?.min).toMatch(/^\d+\.\d lbs$/);
  });
});
