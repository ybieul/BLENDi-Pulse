import { z } from 'zod';

const favoriteIngredientSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
  amount: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
});

export const createFavoriteSchema = z.object({
  recipeName: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(100, 'errors.validation.too_long'),

  ingredients: z
    .array(favoriteIngredientSchema, {
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    })
    .min(1, 'errors.validation.required'),

  protein: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }).min(0, 'errors.validation.number_range'),

  carbs: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }).min(0, 'errors.validation.number_range'),

  fat: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }).min(0, 'errors.validation.number_range'),

  calories: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range'),

  prepTimeSeconds: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(1, 'errors.validation.number_range'),

  blendInstruction: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),

  tip: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .optional(),

  hasSubstitutes: z.boolean({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }).default(false),
});

export interface FavoriteItem {
  id: string;
  recipeName: string;
  ingredients: Array<{
    name: string;
    amount: string;
  }>;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  prepTimeSeconds: number;
  blendInstruction: string;
  tip?: string;
  hasSubstitutes: boolean;
  blendiModel: string;
  goal: string;
  createdAt: string;
}

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;