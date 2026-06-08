import { z } from 'zod';

import { pulseAiRecipeSchema, type PulseAiRecipe } from './pulseAi';

const PANTRY_IMAGE_BASE64_MIN_LENGTH = 100;
const PANTRY_IMAGE_BASE64_MAX_LENGTH = 2_800_000;

export const pantryScanSchema = z.object({
  imageBase64: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(PANTRY_IMAGE_BASE64_MIN_LENGTH, 'errors.validation.too_short')
    .max(PANTRY_IMAGE_BASE64_MAX_LENGTH, 'errors.validation.too_long'),
  mimeType: z.enum(['image/jpeg', 'image/png'], {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),
});

export const pantryConfidenceSchema = z.enum(['high', 'medium', 'low'], {
  required_error: 'errors.validation.required',
  message: 'errors.validation.invalid_option',
});

export const pantryIngredientSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
  estimatedQuantity: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .optional(),
  confidence: pantryConfidenceSchema,
});

export interface PantryIngredient extends z.infer<typeof pantryIngredientSchema> {}

export const pantryAnalysisResultSchema = z.object({
  ingredients: z.array(pantryIngredientSchema, {
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }),
  analysisNotes: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .optional(),
  noFoodDetected: z.boolean({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }),
  recipes: z.array(pulseAiRecipeSchema, {
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }),
  noUsableIngredients: z
    .boolean({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    })
    .optional(),
  scansUsed: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range')
    .optional(),
  scansLimit: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(1, 'errors.validation.number_range')
    .optional(),
  resetDate: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .datetime('errors.validation.invalid_option')
    .optional(),
});

export interface PantryAnalysisResult extends z.infer<typeof pantryAnalysisResultSchema> {
  recipes: PulseAiRecipe[];
}

export type PantryScanInput = z.infer<typeof pantryScanSchema>;