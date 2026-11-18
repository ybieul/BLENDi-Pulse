import { z } from 'zod';

import {
  RECIPE_CAPACITY_NOTICE_MAX_LENGTH,
  RECIPE_DIET_OVERRIDE_MAX_ITEMS,
} from '../recipeContent';

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

/**
 * CP-B5: resposta única à pergunta "Tenho 21 anos ou mais" (só para quem não
 * tem data de nascimento real no perfil). Gravada uma vez; o app reenvia o
 * pedido depois.
 */
export const pulseAiAgeConfirmationSchema = z
  .object({
    isAdult: z.boolean({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    }),
  })
  .strict();

export type PulseAiAgeConfirmationInput = z.infer<typeof pulseAiAgeConfirmationSchema>;

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
  /**
   * CP-B2: preenchido pela IA só quando o pedido da pessoa não coube no copo
   * e foi ajustado — frase curta, no idioma da pessoa, com o que foi pedido,
   * o que foi possível e por quê. O app mostra como alerta no topo do card.
   */
  capacityNotice?: string;
  /**
   * CP-B2 (só Pantry Scanner): a receita usa água que não estava entre os
   * ingredientes detectados na foto. Marcado pelo backend, nunca pela IA.
   */
  usesWaterNotInPhoto?: boolean;
  /**
   * CP-B5: gramas de álcool puro (etanol) da receita, preenchido pela IA só
   * quando há bebida alcoólica. Entra na conferência de calorias (7 kcal/g).
   */
  alcoholGrams?: number;
  /**
   * CP-B5 (só Pulse AI): ingredientes fora da dieta do perfil que a pessoa
   * pediu explicitamente na mensagem atual. Marcado pelo backend (o que vier
   * da IA é descartado). O app mostra "Inclui X, fora da sua dieta, como
   * você pediu".
   */
  dietOverrideIngredients?: string[];
  /**
   * CP-B5 (só Pulse AI): a mensagem pediu bebida alcoólica e a receita saiu
   * na versão sem álcool (menor de 21 ou idade não confirmada). Marcado pelo
   * backend, nunca pela IA.
   */
  alcoholFreeVersion?: boolean;
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

// Saneado como os outros textos da receita (trim) e com tamanho máximo.
// Texto vazio conta como ausente: a IA às vezes devolve "" quando não houve
// ajuste, e isso não pode invalidar a receita inteira.
const capacityNoticeSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string({ invalid_type_error: 'errors.validation.invalid_option' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(RECIPE_CAPACITY_NOTICE_MAX_LENGTH, 'errors.validation.too_long')
    .optional()
) as z.ZodType<string | undefined>;

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
  capacityNotice: capacityNoticeSchema,
  usesWaterNotInPhoto: z
    .boolean({ invalid_type_error: 'errors.validation.invalid_option' })
    .optional(),
  alcoholGrams: z
    .number({ invalid_type_error: 'errors.validation.number_range' })
    .min(0, 'errors.validation.number_range')
    .optional(),
  dietOverrideIngredients: z
    .array(z.string().trim().min(1, 'errors.validation.required'))
    .max(RECIPE_DIET_OVERRIDE_MAX_ITEMS, 'errors.validation.too_long')
    .optional(),
  alcoholFreeVersion: z
    .boolean({ invalid_type_error: 'errors.validation.invalid_option' })
    .optional(),
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
