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
  steps?: Array<{
    text: string;
    pulseCount?: number;
  }>;
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

const pulseAiStepSchema = z.object({
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
  steps: z.array(pulseAiStepSchema).optional(),
});
// ─── Prévia bloqueada (CP-1.1.4a — "Wow Moment Paywall") ─────────────────────
// Parte da receita que pode chegar ao app de quem não é Pro: SÓ os macros.
// O título também fica escondido: ele é gerado pela IA a partir da mensagem do
// usuário, e o pentest mostrou que um pedido como "o título deve listar os
// ingredientes com as quantidades" faz a IA pôr a receita inteira no título.
// O schema é estrito: qualquer campo a mais (title, ingredients, steps...) faz
// a validação falhar, e é ele que define o que o backend grava no turno
// bloqueado da conversa.

export interface PulseAiRecipePreview {
  macros: PulseAiRecipe['macros'];
}

export const pulseAiRecipePreviewSchema: z.ZodType<PulseAiRecipePreview> = z
  .object({
    macros: pulseAiMacrosSchema.strict(),
  })
  .strict();

export function toPulseAiRecipePreview(recipe: PulseAiRecipe): PulseAiRecipePreview {
  return {
    macros: {
      protein: recipe.macros.protein,
      carbs: recipe.macros.carbs,
      fat: recipe.macros.fat,
      calories: recipe.macros.calories,
    },
  };
}
