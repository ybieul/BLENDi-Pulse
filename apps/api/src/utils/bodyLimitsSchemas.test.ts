// CP-1.1.1f: os limites de peso (20-300 kg) e altura (100-250 cm) dos schemas
// do shared passaram a vir de constantes (BODY_WEIGHT_MIN_KG etc.). Este teste
// fixa, com os números escritos por extenso, que os schemas aceitam e recusam
// exatamente os mesmos valores, com as mesmas mensagens de antes.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BODY_HEIGHT_MAX_CM,
  BODY_HEIGHT_MIN_CM,
  BODY_WEIGHT_MAX_KG,
  BODY_WEIGHT_MIN_KG,
  calculateMacrosSchema,
  updateUserSchema,
} from '@blendi/shared';
import type { ZodTypeAny } from 'zod';

const WEIGHT_RANGE_MESSAGE = JSON.stringify({ key: 'errors.validation.number_range', min: 20, max: 300 });
const HEIGHT_RANGE_MESSAGE = JSON.stringify({ key: 'errors.validation.number_range', min: 100, max: 250 });

interface FieldCase {
  name: string;
  schema: ZodTypeAny;
  min: number;
  max: number;
  rangeMessage: string;
  /** Mensagem quando o valor não é número (string, por exemplo). */
  typeMessage: string;
}

const FIELDS: FieldCase[] = [
  {
    name: 'updateUserSchema.weight',
    schema: updateUserSchema.shape.weight,
    min: 20,
    max: 300,
    rangeMessage: WEIGHT_RANGE_MESSAGE,
    typeMessage: WEIGHT_RANGE_MESSAGE,
  },
  {
    name: 'updateUserSchema.height',
    schema: updateUserSchema.shape.height,
    min: 100,
    max: 250,
    rangeMessage: HEIGHT_RANGE_MESSAGE,
    typeMessage: HEIGHT_RANGE_MESSAGE,
  },
  {
    name: 'updateUserSchema.targetWeight',
    schema: updateUserSchema.shape.targetWeight,
    min: 20,
    max: 300,
    rangeMessage: WEIGHT_RANGE_MESSAGE,
    typeMessage: WEIGHT_RANGE_MESSAGE,
  },
  {
    name: 'calculateMacrosSchema.weight',
    schema: calculateMacrosSchema.shape.weight,
    min: 20,
    max: 300,
    rangeMessage: WEIGHT_RANGE_MESSAGE,
    typeMessage: 'errors.validation.number_range',
  },
  {
    name: 'calculateMacrosSchema.height',
    schema: calculateMacrosSchema.shape.height,
    min: 100,
    max: 250,
    rangeMessage: HEIGHT_RANGE_MESSAGE,
    typeMessage: 'errors.validation.number_range',
  },
  {
    name: 'calculateMacrosSchema.targetWeight',
    schema: calculateMacrosSchema.shape.targetWeight,
    min: 20,
    max: 300,
    rangeMessage: WEIGHT_RANGE_MESSAGE,
    typeMessage: WEIGHT_RANGE_MESSAGE,
  },
];

function firstMessage(schema: ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('limites de peso e altura (constantes do shared)', () => {
  it('as constantes têm os valores de sempre', () => {
    assert.equal(BODY_WEIGHT_MIN_KG, 20);
    assert.equal(BODY_WEIGHT_MAX_KG, 300);
    assert.equal(BODY_HEIGHT_MIN_CM, 100);
    assert.equal(BODY_HEIGHT_MAX_CM, 250);
  });

  for (const field of FIELDS) {
    describe(field.name, () => {
      it('aceita os extremos e valores do meio, inclusive com casas decimais', () => {
        for (const value of [field.min, field.min + 0.1, (field.min + field.max) / 2, field.max - 0.1, field.max]) {
          assert.equal(firstMessage(field.schema, value), null, `deveria aceitar ${value}`);
        }
      });

      it('recusa logo abaixo do mínimo e logo acima do máximo, com a mesma mensagem de faixa', () => {
        for (const value of [field.min - 0.01, field.min - 1, 0, -1, field.max + 0.01, field.max + 1]) {
          assert.equal(firstMessage(field.schema, value), field.rangeMessage, `deveria recusar ${value}`);
        }
      });

      it('recusa o que não é número, com a mesma mensagem de tipo', () => {
        assert.equal(firstMessage(field.schema, String(field.min)), field.typeMessage);
        assert.equal(firstMessage(field.schema, Number.NaN), field.typeMessage);
      });
    });
  }

  it('updateUserSchema continua aceitando o PATCH sem peso/altura (campos opcionais)', () => {
    assert.equal(updateUserSchema.safeParse({}).success, true);
  });

  it('calculateMacrosSchema continua aceitando targetWeight ausente', () => {
    assert.equal(calculateMacrosSchema.shape.targetWeight.safeParse(undefined).success, true);
  });
});
