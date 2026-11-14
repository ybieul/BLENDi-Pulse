import { z } from 'zod';

import {
  pulseAiRecipePreviewSchema,
  pulseAiRecipeSchema,
  type PulseAiRecipe,
  type PulseAiRecipePreview,
} from './pulseAi';

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

export type PantryIngredient = z.infer<typeof pantryIngredientSchema>;

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

// ─── Prévia bloqueada (CP-1.1.4b — "Wow Moment Paywall" no Pantry Scanner) ───
// Usuário grátis que já usou os scans do ciclo ganha 1 prévia por ciclo: a IA
// roda, mas só sai do servidor o que está abaixo. Visíveis: os ingredientes
// detectados na foto e, de cada receita, SÓ os macros. Nada que a IA gerou
// para a receita (nem o título, ver CP-1.1.4a) e nem as notas da análise
// (analysisNotes). Schema estrito: qualquer campo a mais faz a validação falhar.

export const pantryLockedPreviewResultSchema = z
  .object({
    locked: z.literal(true),
    previewId: z.string().trim().min(1, 'errors.validation.required'),
    previewExpiresAt: z.string().datetime('errors.validation.invalid_option'),
    ingredients: z.array(pantryIngredientSchema.strict()),
    recipes: z.array(pulseAiRecipePreviewSchema).min(1, 'errors.validation.required'),
    scansUsed: z.number().int('errors.validation.integer').min(0, 'errors.validation.number_range'),
    scansLimit: z.number().int('errors.validation.integer').min(1, 'errors.validation.number_range'),
    resetDate: z.string().datetime('errors.validation.invalid_option'),
  })
  .strict();

export interface PantryLockedPreviewResult
  extends Omit<z.infer<typeof pantryLockedPreviewResultSchema>, 'recipes'> {
  recipes: PulseAiRecipePreview[];
}

/** Resposta do desbloqueio (GET /pantry-scanner/previews/:id), só para Pro. */
export const pantryPreviewUnlockResultSchema = z.object({
  previewId: z.string().trim().min(1, 'errors.validation.required'),
  ingredients: z.array(pantryIngredientSchema),
  recipes: z.array(pulseAiRecipeSchema).min(1, 'errors.validation.required'),
});

export interface PantryPreviewUnlockResult
  extends Omit<z.infer<typeof pantryPreviewUnlockResultSchema>, 'recipes'> {
  recipes: PulseAiRecipe[];
}
