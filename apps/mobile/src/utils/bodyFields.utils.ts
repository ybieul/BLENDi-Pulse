// apps/mobile/src/utils/bodyFields.utils.ts
// Regras puras dos campos de peso e altura do OnboardingBodyScreen e do
// CompleteProfileScreen: leitura do que foi digitado, conversão para a unidade
// de armazenamento (kg e cm) e mensagem de erro de cada campo.
//
// • Métrico: peso em kg e altura em cm, até uma casa decimal.
// • Imperial: peso em lbs (uma casa) e altura em DOIS campos inteiros, pés e
//   polegadas (0 a 11). Polegadas vazias valem 0 (6 e vazio = 6'0").
//
// Mensagens, só depois que a pessoa digitou algo:
//   1. erro de formato (texto que não é número válido) — sempre tem prioridade;
//   2. fora da faixa: a faixa aceita, na unidade do usuário. No imperial, a
//      faixa da altura aparece no campo de pés.

import {
  BODY_HEIGHT_MAX_CM,
  BODY_HEIGHT_MIN_CM,
  BODY_WEIGHT_MAX_KG,
  BODY_WEIGHT_MIN_KG,
} from '@blendi/shared';

import type { useAppTranslation } from '../hooks/useAppTranslation';
import {
  BODY_HEIGHT_FEET_INCHES_LIMITS,
  BODY_WEIGHT_POUNDS_LIMITS,
  INCHES_PER_FOOT,
  cmToFeetInches,
  feetInchesToCm,
  formatFeetInches,
  isBodyHeightInRange,
  isBodyWeightInRange,
  poundsToKg,
} from './bodyUnits';
import { parseStrictDecimal, parseStrictInteger } from './numericInput.utils';

export type BodyUnitSystem = 'metric' | 'imperial';

// Peso e altura métrica: até uma casa decimal, com ponto ou vírgula (mesma
// precisão que o app exibe e pré-preenche).
const BODY_FRACTION_DIGITS = 1;

/** Pés: um dígito basta (a faixa aceita vai de 3 a 8). */
export const HEIGHT_FEET_MAX_LENGTH = 1;
/** Polegadas: 0 a 11. */
export const HEIGHT_INCHES_MAX_LENGTH = 2;
const MAX_INCHES = INCHES_PER_FOOT - 1;

/** Campos numéricos das duas telas. */
export type BodyNumericField = 'weight' | 'height' | 'heightFeet' | 'heightInches' | 'birthDate';

// Ordem visual dos campos (é a ordem do "Próximo" e da tecla de ação).
const METRIC_BODY_NUMERIC_FIELDS: readonly BodyNumericField[] = ['weight', 'height', 'birthDate'];
const IMPERIAL_BODY_NUMERIC_FIELDS: readonly BodyNumericField[] = [
  'weight',
  'heightFeet',
  'heightInches',
  'birthDate',
];

export function getBodyNumericFields(unitSystem: BodyUnitSystem): readonly BodyNumericField[] {
  return unitSystem === 'imperial' ? IMPERIAL_BODY_NUMERIC_FIELDS : METRIC_BODY_NUMERIC_FIELDS;
}

/** Erro de um campo, ainda sem tradução. */
export type BodyFieldError =
  | { key: 'errors.validation.decimal_one_place' }
  | { key: 'errors.validation.integer' }
  | { key: 'errors.validation.number_range'; min: string; max: string };

export interface BodyFieldsInput {
  unitSystem: BodyUnitSystem;
  weightText: string;
  /** Altura em cm (só métrico). */
  heightText: string;
  /** Altura em pés e polegadas (só imperial). */
  feetText: string;
  inchesText: string;
  /**
   * Altura salva (cm) enquanto a pessoa não mexeu em pés nem polegadas: é ela
   * que vai para o backend, não a ida e volta (178 cm aparece como 5'10" e
   * continua 178, não 177.8). null = não há valor salvo ou a pessoa já mexeu.
   * Só vale no imperial.
   */
  untouchedSavedHeightCm: number | null;
  /**
   * Peso salvo (kg) enquanto a pessoa não mexeu no campo de peso: é ele que
   * vai para o backend, não a ida e volta pelo texto de uma casa (81 kg
   * aparece como 178.6 lbs e continua 81, não 80.997; 70.0227 kg aparece como
   * 70.0 kg e continua 70.0227). null = não há valor salvo ou a pessoa já
   * mexeu. Vale nos dois sistemas.
   */
  untouchedSavedWeightKg: number | null;
  /** Unidades exibidas (useUnits): 'kg' | 'lbs' e 'cm'. */
  weightUnit: string;
  metricHeightUnit: string;
}

export interface BodyFieldsEvaluation {
  /** Peso convertido para kg; null se o texto não é um número válido. */
  weightKg: number | null;
  /** Altura convertida para cm; null se incompleta ou inválida. */
  heightCm: number | null;
  weightValid: boolean;
  heightValid: boolean;
  /**
   * Altura imperial completa e válida no formato, mas fora da faixa. A
   * mensagem fica no campo de pés; o campo de polegadas usa isto para não
   * mostrar o ícone de "ok" (AuthInput `invalid`). Sempre false no métrico.
   */
  heightOutOfRange: boolean;
  errors: Partial<Record<'weight' | 'height' | 'heightFeet' | 'heightInches', BodyFieldError>>;
}

const DECIMAL_FORMAT_ERROR: BodyFieldError = { key: 'errors.validation.decimal_one_place' };
const INTEGER_FORMAT_ERROR: BodyFieldError = { key: 'errors.validation.integer' };

function rangeError(min: string, max: string): BodyFieldError {
  return { key: 'errors.validation.number_range', min, max };
}

function hasText(text: string): boolean {
  return text.trim().length > 0;
}

function weightRangeError(unitSystem: BodyUnitSystem, weightUnit: string): BodyFieldError {
  if (unitSystem === 'imperial') {
    return rangeError(
      `${BODY_WEIGHT_POUNDS_LIMITS.min.toFixed(1)} ${weightUnit}`,
      `${BODY_WEIGHT_POUNDS_LIMITS.max.toFixed(1)} ${weightUnit}`,
    );
  }
  return rangeError(`${BODY_WEIGHT_MIN_KG} ${weightUnit}`, `${BODY_WEIGHT_MAX_KG} ${weightUnit}`);
}

function evaluateWeight(input: BodyFieldsInput): Pick<BodyFieldsEvaluation, 'weightKg' | 'weightValid'> & {
  error?: BodyFieldError;
} {
  const { unitSystem, weightText, weightUnit, untouchedSavedWeightKg } = input;

  if (untouchedSavedWeightKg !== null) {
    const savedValid = isBodyWeightInRange(untouchedSavedWeightKg);
    return {
      weightKg: untouchedSavedWeightKg,
      weightValid: savedValid,
      error: savedValid ? undefined : weightRangeError(unitSystem, weightUnit),
    };
  }

  const parsed = parseStrictDecimal(weightText, BODY_FRACTION_DIGITS);
  if (parsed === null) {
    return { weightKg: null, weightValid: false, error: hasText(weightText) ? DECIMAL_FORMAT_ERROR : undefined };
  }

  const weightKg = unitSystem === 'imperial' ? poundsToKg(parsed) : parsed;
  const weightValid = isBodyWeightInRange(weightKg);
  return { weightKg, weightValid, error: weightValid ? undefined : weightRangeError(unitSystem, weightUnit) };
}

type HeightEvaluation = Pick<BodyFieldsEvaluation, 'heightCm' | 'heightValid' | 'heightOutOfRange' | 'errors'>;

function evaluateMetricHeight(input: BodyFieldsInput): HeightEvaluation {
  const { heightText, metricHeightUnit } = input;
  const parsed = parseStrictDecimal(heightText, BODY_FRACTION_DIGITS);
  if (parsed === null) {
    return {
      heightCm: null,
      heightValid: false,
      heightOutOfRange: false,
      errors: hasText(heightText) ? { height: DECIMAL_FORMAT_ERROR } : {},
    };
  }

  const heightValid = isBodyHeightInRange(parsed);
  return {
    heightCm: parsed,
    heightValid,
    heightOutOfRange: false,
    errors: heightValid
      ? {}
      : {
          height: rangeError(
            `${BODY_HEIGHT_MIN_CM} ${metricHeightUnit}`,
            `${BODY_HEIGHT_MAX_CM} ${metricHeightUnit}`,
          ),
        },
  };
}

const IMPERIAL_HEIGHT_RANGE_ERROR = rangeError(
  formatFeetInches(BODY_HEIGHT_FEET_INCHES_LIMITS.min),
  formatFeetInches(BODY_HEIGHT_FEET_INCHES_LIMITS.max),
);
const INCHES_RANGE_ERROR = rangeError('0', String(MAX_INCHES));

function evaluateImperialHeight(input: BodyFieldsInput): HeightEvaluation {
  const { feetText, inchesText, untouchedSavedHeightCm } = input;

  if (untouchedSavedHeightCm !== null) {
    const heightValid = isBodyHeightInRange(untouchedSavedHeightCm);
    return {
      heightCm: untouchedSavedHeightCm,
      heightValid,
      heightOutOfRange: !heightValid,
      errors: heightValid ? {} : { heightFeet: IMPERIAL_HEIGHT_RANGE_ERROR },
    };
  }

  const errors: BodyFieldsEvaluation['errors'] = {};

  const feet = parseStrictInteger(feetText);
  if (feet === null && hasText(feetText)) {
    errors.heightFeet = INTEGER_FORMAT_ERROR;
  }

  const inches = hasText(inchesText) ? parseStrictInteger(inchesText) : 0;
  if (inches === null) {
    errors.heightInches = INTEGER_FORMAT_ERROR;
  } else if (inches > MAX_INCHES) {
    errors.heightInches = INCHES_RANGE_ERROR;
  }

  if (feet === null || inches === null || errors.heightInches) {
    return { heightCm: null, heightValid: false, heightOutOfRange: false, errors };
  }

  const heightCm = feetInchesToCm(feet, inches);
  const heightValid = isBodyHeightInRange(heightCm);
  if (!heightValid) {
    errors.heightFeet = IMPERIAL_HEIGHT_RANGE_ERROR;
  }
  return { heightCm, heightValid, heightOutOfRange: !heightValid, errors };
}

export function evaluateBodyFields(input: BodyFieldsInput): BodyFieldsEvaluation {
  const weight = evaluateWeight(input);
  const height = input.unitSystem === 'imperial' ? evaluateImperialHeight(input) : evaluateMetricHeight(input);

  return {
    weightKg: weight.weightKg,
    weightValid: weight.weightValid,
    heightCm: height.heightCm,
    heightValid: height.heightValid,
    heightOutOfRange: height.heightOutOfRange,
    errors: { ...(weight.error ? { weight: weight.error } : {}), ...height.errors },
  };
}

/** Textos de pés e polegadas para pré-preencher a partir da altura salva (cm). */
export function heightCmToFeetInchesTexts(valueInCm: number): { feetText: string; inchesText: string } {
  const { feet, inches } = cmToFeetInches(valueInCm);
  return { feetText: String(feet), inchesText: String(inches) };
}

export function translateBodyFieldError(
  t: ReturnType<typeof useAppTranslation>['t'],
  error: BodyFieldError | undefined,
): string | undefined {
  if (!error) {
    return undefined;
  }
  if (error.key === 'errors.validation.number_range') {
    return t(error.key, { min: error.min, max: error.max });
  }
  return t(error.key);
}
