import { z } from 'zod';

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
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(5, 'errors.validation.number_range')
    .max(300, 'errors.validation.number_range'),

  fromFavoriteId: z.string().trim().min(1, 'errors.validation.required').optional(),

  rating: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(1, 'errors.validation.number_range')
    .max(5, 'errors.validation.number_range')
    .optional(),
});

export type CreateBlendLogInput = z.infer<typeof createBlendLogSchema>;