// Regras dos campos de peso e altura (onboarding e completar perfil):
// leitura estrita, conversão para kg/cm e mensagens (formato > faixa).
import {
  type BodyFieldsInput,
  evaluateBodyFields,
  getBodyNumericFields,
  heightCmToFeetInchesTexts,
} from './bodyFields.utils';

const DECIMAL = { key: 'errors.validation.decimal_one_place' };
const INTEGER = { key: 'errors.validation.integer' };
const range = (min: string, max: string) => ({ key: 'errors.validation.number_range', min, max });

const KG_RANGE = range('20 kg', '300 kg');
const CM_RANGE = range('100 cm', '250 cm');
const LBS_RANGE = range('44.1 lbs', '661.5 lbs');
const FT_IN_RANGE = range('3\'4"', '8\'2"');
const INCHES_RANGE = range('0', '11');

function metric(overrides: Partial<BodyFieldsInput> = {}) {
  return evaluateBodyFields({
    unitSystem: 'metric',
    weightText: '',
    heightText: '',
    feetText: '',
    inchesText: '',
    untouchedSavedHeightCm: null,
    untouchedSavedWeightKg: null,
    weightUnit: 'kg',
    metricHeightUnit: 'cm',
    ...overrides,
  });
}

function imperial(overrides: Partial<BodyFieldsInput> = {}) {
  return evaluateBodyFields({
    unitSystem: 'imperial',
    weightText: '',
    heightText: '',
    feetText: '',
    inchesText: '',
    untouchedSavedHeightCm: null,
    untouchedSavedWeightKg: null,
    weightUnit: 'lbs',
    metricHeightUnit: 'in',
    ...overrides,
  });
}

describe('campos vazios', () => {
  it('sem mensagem e inválidos, nos dois sistemas', () => {
    for (const result of [metric(), imperial()]) {
      expect(result.errors).toEqual({});
      expect(result.weightValid).toBe(false);
      expect(result.heightValid).toBe(false);
    }
  });
});

describe('métrico', () => {
  it.each([
    ['20', true],
    ['300', true],
    ['19.9', false],
    ['300.1', false],
    ['0', false],
  ])('peso "%s" -> válido %s', (text, valid) => {
    const result = metric({ weightText: text });
    expect(result.weightValid).toBe(valid);
    expect(result.errors.weight).toEqual(valid ? undefined : KG_RANGE);
  });

  it.each([
    ['100', true],
    ['250', true],
    ['99.9', false],
    ['250.1', false],
  ])('altura "%s" -> válida %s', (text, valid) => {
    const result = metric({ heightText: text });
    expect(result.heightValid).toBe(valid);
    expect(result.heightCm).toBe(Number(text));
    expect(result.errors.height).toEqual(valid ? undefined : CM_RANGE);
  });

  it('erro de formato tem prioridade sobre a faixa', () => {
    expect(metric({ weightText: '1000abc' }).errors.weight).toEqual(DECIMAL);
    expect(metric({ heightText: '-300' }).errors.height).toEqual(DECIMAL);
    expect(metric({ heightText: '99.95' }).errors.height).toEqual(DECIMAL);
  });

  it('pés/polegadas não participam no métrico', () => {
    expect(metric({ heightText: '178', feetText: 'x', inchesText: '99' }).errors).toEqual({});
  });
});

describe('imperial — peso em lbs', () => {
  it.each([
    ['44.1', true],
    ['661.5', true],
    ['44', false],
    ['44.0', false],
    ['661.6', false],
  ])('"%s" -> válido %s', (text, valid) => {
    const result = imperial({ weightText: text });
    expect(result.weightValid).toBe(valid);
    expect(result.errors.weight).toEqual(valid ? undefined : LBS_RANGE);
  });

  it('envia em kg', () => {
    expect(imperial({ weightText: '154.4' }).weightKg).toBeCloseTo(70.0227, 4);
  });

  it('formato antes da faixa', () => {
    expect(imperial({ weightText: '10,55' }).errors.weight).toEqual(DECIMAL);
  });
});

describe('imperial — altura em pés e polegadas', () => {
  it('5 e 10 -> 177.8 cm', () => {
    const result = imperial({ feetText: '5', inchesText: '10' });
    expect(result.heightCm).toBe(177.8);
    expect(result.heightValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('polegadas vazias valem 0 (6 -> 6\'0")', () => {
    expect(imperial({ feetText: '6' }).heightCm).toBe(182.9);
  });

  it('só polegadas, sem pés: incompleta, sem mensagem', () => {
    const result = imperial({ inchesText: '10' });
    expect(result.heightCm).toBeNull();
    expect(result.heightValid).toBe(false);
    expect(result.errors).toEqual({});
  });

  it.each([
    ['3', '4', true],
    ['8', '2', true],
    ['3', '3', false],
    ['8', '3', false],
    ['0', '0', false],
  ])('%s\'%s" -> válida %s; fora da faixa mostra a faixa no campo de pés', (feet, inches, valid) => {
    const result = imperial({ feetText: feet, inchesText: inches });
    expect(result.heightValid).toBe(valid);
    expect(result.errors.heightFeet).toEqual(valid ? undefined : FT_IN_RANGE);
    expect(result.errors.heightInches).toBeUndefined();
  });

  it.each(['12', '13', '99'])('polegadas "%s" recusadas (0 a 11)', (inches) => {
    const result = imperial({ feetText: '5', inchesText: inches });
    expect(result.heightValid).toBe(false);
    expect(result.heightCm).toBeNull();
    expect(result.errors).toEqual({ heightInches: INCHES_RANGE });
  });

  it.each(['-1', 'abc', '5.5', '5,', '1e1', '５'])('lixo "%s" recusado nos dois campos, com erro de formato', (text) => {
    expect(imperial({ feetText: text, inchesText: '0' }).errors).toEqual({ heightFeet: INTEGER });
    expect(imperial({ feetText: '5', inchesText: text }).errors).toEqual({ heightInches: INTEGER });
  });

  it('erro de formato tem prioridade: com polegadas inválidas não aparece a faixa', () => {
    expect(imperial({ feetText: '9', inchesText: 'x' }).errors).toEqual({ heightInches: INTEGER });
    expect(imperial({ feetText: 'x', inchesText: '0' }).errors).toEqual({ heightFeet: INTEGER });
  });

  it('sem mexer, usa a altura salva original (178, não 177.8)', () => {
    const { feetText, inchesText } = heightCmToFeetInchesTexts(178);
    expect([feetText, inchesText]).toEqual(['5', '10']);

    const result = imperial({ feetText, inchesText, untouchedSavedHeightCm: 178 });
    expect(result.heightCm).toBe(178);
    expect(result.heightValid).toBe(true);
  });

  it('pré-preenchimento com 12 polegadas vira mais um pé', () => {
    expect(heightCmToFeetInchesTexts(182.8)).toEqual({ feetText: '6', inchesText: '0' });
  });
});

describe('ordem dos campos do teclado', () => {
  it('métrico: peso → altura → data; imperial: peso → pés → polegadas → data', () => {
    expect(getBodyNumericFields('metric')).toEqual(['weight', 'height', 'birthDate']);
    expect(getBodyNumericFields('imperial')).toEqual(['weight', 'heightFeet', 'heightInches', 'birthDate']);
  });
});

describe('peso salvo, sem mexer (nos dois sistemas)', () => {
  it('imperial: 81 kg aparece como 178.6 lbs e continua 81 (não 80.997)', () => {
    const result = imperial({ weightText: '178.6', untouchedSavedWeightKg: 81 });
    expect(result.weightKg).toBe(81);
    expect(result.weightValid).toBe(true);
    expect(result.errors.weight).toBeUndefined();
  });

  it('métrico: 70.0227 kg aparece como 70.0 e continua 70.0227', () => {
    const result = metric({ weightText: '70.0', untouchedSavedWeightKg: 70.0227 });
    expect(result.weightKg).toBe(70.0227);
    expect(result.weightValid).toBe(true);
  });

  it('sem peso salvo (null), vale o texto, como antes', () => {
    expect(imperial({ weightText: '178.6' }).weightKg).toBeCloseTo(80.9977, 4);
    expect(metric({ weightText: '70.0' }).weightKg).toBe(70);
  });

  it('peso salvo fora da faixa: inválido, com a faixa na unidade do usuário', () => {
    expect(metric({ weightText: '19.0', untouchedSavedWeightKg: 19 }).errors.weight).toEqual(KG_RANGE);
    expect(imperial({ weightText: '41.9', untouchedSavedWeightKg: 19 }).errors.weight).toEqual(LBS_RANGE);
    expect(metric({ weightText: '19.0', untouchedSavedWeightKg: 19 }).weightValid).toBe(false);
  });

  it('o peso salvo não afeta a altura', () => {
    const result = imperial({ weightText: '178.6', untouchedSavedWeightKg: 81, feetText: '5', inchesText: '10' });
    expect(result.heightCm).toBe(177.8);
  });
});

describe('heightOutOfRange (esconde o "ok" das polegadas)', () => {
  it('imperial: verdadeiro só com altura completa, no formato certo e fora da faixa', () => {
    expect(imperial({ feetText: '8', inchesText: '3' }).heightOutOfRange).toBe(true);
    expect(imperial({ feetText: '3', inchesText: '3' }).heightOutOfRange).toBe(true);
    expect(imperial({ feetText: '8', inchesText: '2' }).heightOutOfRange).toBe(false);
    expect(imperial({ feetText: '5', inchesText: '12' }).heightOutOfRange).toBe(false);
    expect(imperial({ feetText: 'x', inchesText: '0' }).heightOutOfRange).toBe(false);
    expect(imperial({ inchesText: '3' }).heightOutOfRange).toBe(false);
    expect(imperial().heightOutOfRange).toBe(false);
  });

  it('imperial: altura salva fora da faixa também conta', () => {
    expect(imperial({ feetText: '3', inchesText: '3', untouchedSavedHeightCm: 99 }).heightOutOfRange).toBe(true);
    expect(imperial({ feetText: '5', inchesText: '10', untouchedSavedHeightCm: 178 }).heightOutOfRange).toBe(false);
  });

  it('métrico: sempre falso (a mensagem fica no próprio campo de altura)', () => {
    expect(metric({ heightText: '250.1' }).heightOutOfRange).toBe(false);
    expect(metric({ heightText: '178' }).heightOutOfRange).toBe(false);
  });
});
