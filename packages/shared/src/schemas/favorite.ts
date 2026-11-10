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

const favoriteStepSchema = z.object({
  text: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
  pulseCount: z
    .number({ invalid_type_error: 'errors.validation.number_range' })
    .int('errors.validation.integer')
    .min(1, 'errors.validation.number_range')
    .optional(),
});

// Tetos das listas do favorito (CP-1.1.1d). O favorito é sempre uma receita
// do Pulse AI ou do Pantry Scanner, que hoje trazem 3–8 ingredientes e 3–5
// passos (ver promptBuilder.service.ts). Os tetos dão folga de ~4x sobre isso
// e cortam um array gigante antes de validar item a item.
export const FAVORITE_INGREDIENTS_MAX_ITEMS = 30;
export const FAVORITE_STEPS_MAX_ITEMS = 20;

export const createFavoriteSchema = z.object({
  recipeName: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(100, 'errors.validation.too_long'),

  // Teto checado antes dos itens: .pipe só valida cada ingrediente se o
  // tamanho passou (mesmo padrão de dietaryPreferences em user.ts) — sem
  // isso, um array de milhares de itens inválidos gerava um issue por item.
  ingredients: z
    .array(z.unknown(), {
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    })
    .min(1, 'errors.validation.required')
    .max(FAVORITE_INGREDIENTS_MAX_ITEMS, 'errors.validation.too_long')
    .pipe(z.array(favoriteIngredientSchema)),

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

  steps: z
    .array(z.unknown(), { invalid_type_error: 'errors.validation.invalid_option' })
    .max(FAVORITE_STEPS_MAX_ITEMS, 'errors.validation.too_long')
    .pipe(z.array(favoriteStepSchema))
    .optional(),
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
  steps?: Array<{
    text: string;
    pulseCount?: number;
  }>;
}

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;