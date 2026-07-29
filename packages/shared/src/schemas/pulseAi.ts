import { z } from 'zod';

const PULSE_AI_MESSAGE_MAX = 500;

export const pulseAiChatSchema = z.object({
  message: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(PULSE_AI_MESSAGE_MAX, 'errors.validation.too_long'),
  language: z.enum(['en', 'pt-BR']).optional(),
});

export type PulseAiChatInput = z.infer<typeof pulseAiChatSchema>;

export interface PulseAiRecipe {
  title: string;
  ingredients: Array<{
    name: string;
    amount: string;
  }>;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
  prepTimeSeconds: number;
  blendInstruction: string;
  tip?: string;
  hasSubstitutes: boolean;
  macrosValidated?: boolean;
}

const pulseAiIngredientSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
  amount: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
});

const pulseAiMacrosSchema = z.object({
  protein: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }),
  carbs: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }),
  fat: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }),
  calories: z.number({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.number_range',
  }),
});

export const pulseAiRecipeSchema: z.ZodType<PulseAiRecipe> = z.object({
  title: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required'),
  ingredients: z.array(pulseAiIngredientSchema, {
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  }),
  macros: pulseAiMacrosSchema,
  prepTimeSeconds: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer'),
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
  }),
  macrosValidated: z
    .boolean({ invalid_type_error: 'errors.validation.invalid_option' })
    .default(true),
});