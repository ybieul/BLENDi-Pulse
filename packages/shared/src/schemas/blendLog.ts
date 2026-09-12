import { z } from 'zod';

import { rangeErrorMessage } from '../utils/validationRange.utils';

const blendiModelValues = ['Lite', 'ProPlus', 'Steel'] as const;

export const createBlendLogSchema = z.object({
  recipeName: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(100, 'errors.validation.too_long')
    .optional(),

  protein: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .min(0, 'errors.validation.number_range')
    .default(0),

  carbs: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .min(0, 'errors.validation.number_range')
    .default(0),

  fat: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .min(0, 'errors.validation.number_range')
    .default(0),

  calories: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range')
    .default(0),

  blendiModel: z.enum(blendiModelValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  durationSeconds: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(5, 300),
    })
    .int('errors.validation.integer')
    .min(5, rangeErrorMessage(5, 300))
    .max(300, rangeErrorMessage(5, 300)),

  fromFavoriteId: z.string().trim().min(1, 'errors.validation.required').optional(),

  rating: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(1, 5),
    })
    .int('errors.validation.integer')
    .min(1, rangeErrorMessage(1, 5))
    .max(5, rangeErrorMessage(1, 5))
    .optional(),
});

export type CreateBlendLogInput = z.infer<typeof createBlendLogSchema>;