import { z } from 'zod';

import {
  PULSE_AI_MESSAGE_MAX,
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

// ─── CP-B5.4: leitura e geração em duas etapas ──────────────────────────────
// POST /pantry-scanner/read só lê a foto (não conta scan); a pessoa confirma
// os ingredientes; POST /pantry-scanner/generate gera as receitas e conta o
// scan. Constantes únicas dos limites (API e app).

/** Free: leituras por scan (e por prévia) do ciclo — teto = (scans + prévia) × isto. */
export const PANTRY_READS_PER_SCAN = 3;
/** Pro: proteção contra robô — no máximo isto de leituras na janela abaixo. */
export const PANTRY_PRO_READ_BURST_LIMIT = 10;
export const PANTRY_PRO_READ_BURST_WINDOW_MS = 10 * 60 * 1000;
/** Pro: teto de segurança de leituras por dia (fuso da conta). */
export const PANTRY_PRO_READ_DAILY_LIMIT = 100;
/** Validade de uma leitura guardada no servidor (sem a imagem). */
export const PANTRY_READ_TTL_MS = 30 * 60 * 1000;
/** Itens adicionados à mão: quantos e de que tamanho. */
export const PANTRY_ADDED_ITEMS_MAX = 10;
export const PANTRY_ADDED_ITEM_MAX_LENGTH = 40;
/** O pedido opcional tem o mesmo tamanho máximo da mensagem do Pulse AI. */
export const PANTRY_REQUEST_MAX_LENGTH = PULSE_AI_MESSAGE_MAX;
/** Teto de itens marcados (a leitura nunca traz mais que isto de usáveis). */
export const PANTRY_SELECTED_ITEMS_MAX = 60;

export const pantryLiquidChoiceValues = ['water', 'milk', 'plant_milk', 'none'] as const;
export type PantryLiquidChoice = (typeof pantryLiquidChoiceValues)[number];

/** Idade para álcool como o backend resolveu (CP-B5): o app só desenha a tela. */
export const pantryAlcoholAgeValues = ['of-age', 'under-age', 'unknown'] as const;
export type PantryAlcoholAge = (typeof pantryAlcoholAgeValues)[number];

/** Ingrediente lido da foto. isAlcoholic vem da lista do validador, não da IA. */
export const pantryReadIngredientSchema = pantryIngredientSchema
  .extend({ isAlcoholic: z.boolean() })
  .strict();

export type PantryReadIngredient = z.infer<typeof pantryReadIngredientSchema>;

export const pantryReadResultSchema = z
  .object({
    /** Ausente quando não há o que confirmar (sem comida ou sem ingrediente usável). */
    readId: z.string().trim().min(1).optional(),
    readExpiresAt: z.string().datetime().optional(),
    ingredients: z.array(pantryReadIngredientSchema),
    hasLiquid: z.boolean(),
    noFoodDetected: z.boolean(),
    noUsableIngredients: z.boolean().optional(),
    analysisNotes: z.string().trim().min(1).optional(),
    alcoholAge: z.enum(pantryAlcoholAgeValues),
    /** A próxima geração do free será a prévia bloqueada (scans do ciclo esgotados). */
    nextGenerationIsPreview: z.boolean(),
    scansUsed: z.number().int().min(0),
    scansLimit: z.number().int().min(1),
    resetDate: z.string().datetime(),
  })
  .strict();

export type PantryReadResult = z.infer<typeof pantryReadResultSchema>;

const pantryItemNameSchema = (maxLength: number) =>
  z
    .string({ required_error: 'errors.validation.required', invalid_type_error: 'errors.validation.invalid_option' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(maxLength, 'errors.validation.too_long');

/**
 * Corpo do POST /pantry-scanner/generate. Estrito: campo a mais é recusado.
 * `selected` só aceita itens da leitura (conferido no backend); `added` é
 * pedido explícito (obrigatório em todas as receitas); `request` é texto
 * livre, tratado como dado no prompt.
 */
export const pantryGenerateSchema = z
  .object({
    readId: z.string({ required_error: 'errors.validation.required' }).trim().min(1, 'errors.validation.required').max(64, 'errors.validation.too_long'),
    selected: z.array(pantryItemNameSchema(200)).max(PANTRY_SELECTED_ITEMS_MAX, 'errors.validation.too_long'),
    added: z.array(pantryItemNameSchema(PANTRY_ADDED_ITEM_MAX_LENGTH)).max(PANTRY_ADDED_ITEMS_MAX, 'errors.validation.too_long').default([]),
    liquid: z.enum(pantryLiquidChoiceValues, { message: 'errors.validation.invalid_option' }).optional(),
    request: z
      .string({ invalid_type_error: 'errors.validation.invalid_option' })
      .trim()
      .max(PANTRY_REQUEST_MAX_LENGTH, 'errors.validation.too_long')
      .optional()
      .transform(value => (value ? value : undefined)),
  })
  .strict()
  .refine(input => input.selected.length + input.added.length > 0, {
    message: 'errors.validation.required',
    path: ['selected'],
  });

export type PantryGenerateInput = z.input<typeof pantryGenerateSchema>;
export type PantryGenerateParsed = z.output<typeof pantryGenerateSchema>;

/** Resposta do generate (receitas completas). */
export const pantryGenerateResultSchema = z.object({
  /** Novo id para editar e gerar de novo sem nova foto (mesmo vencimento). */
  readId: z.string().trim().min(1),
  readExpiresAt: z.string().datetime(),
  ingredients: z.array(pantryIngredientSchema),
  recipes: z.array(pulseAiRecipeSchema),
  scansUsed: z.number().int().min(0).optional(),
  scansLimit: z.number().int().min(1).optional(),
  resetDate: z.string().datetime().optional(),
});

export interface PantryGenerateResult extends Omit<z.infer<typeof pantryGenerateResultSchema>, 'recipes'> {
  recipes: PulseAiRecipe[];
}
