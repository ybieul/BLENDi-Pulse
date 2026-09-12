// packages/shared/src/schemas/user.ts
// Schema Zod de perfil/metas do usuário.
// Usado no onboarding e na tela de configurações.
//
// ⚠️  Mensagens de erro são CHAVES de i18n — nunca texto traduzido.
//
//   • Mobile  → t(error.message, params)
//   • Backend → retorna a chave no JSON
//
// number_range usa rangeErrorMessage(min, max) — string JSON com os dois
// limites embutidos, porque a chave precisa de {{min}} e {{max}} juntos e um
// único ZodIssue de min()/max() só carrega o lado que falhou. too_short/
// too_long continuam string simples — o limite vem de issue.minimum/maximum,
// que o Zod já injeta automaticamente.

import { z } from 'zod';

import { isValidIanaTimezone } from '../utils/timezone.utils';
import { rangeErrorMessage } from '../utils/validationRange.utils';

const userGoalValues = ['Muscle', 'Wellness', 'Energy', 'Recovery'] as const;
const imcClassificationValues = ['underweight', 'normal', 'overweight', 'obese'] as const;
const unitSystemValues = ['metric', 'imperial'] as const;

export const notificationPreferencesSchema = z.object({
  dailyPulse: z.boolean().optional(),
  streakReminder: z.boolean().optional(),
  supplementReminder: z.boolean().optional(),
  hydrationReminder: z.boolean().optional(),
  levelUp: z.boolean().optional(),
});

export const dailyPulseTimeSchema = z.object({
  hour: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(0, 23),
    })
    .int('errors.validation.integer')
    .min(0, rangeErrorMessage(0, 23))
    .max(23, rangeErrorMessage(0, 23)),
  minute: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(0, 59),
    })
    .int('errors.validation.integer')
    .min(0, rangeErrorMessage(0, 59))
    .max(59, rangeErrorMessage(0, 59)),
});

// ─── Schema: atualização parcial do perfil do usuário ───────────────────────

export const updateUserSchema = z
  .object({
    blendiModel: z.enum(['Lite', 'ProPlus', 'Steel'], {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    goal: z.enum(userGoalValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    dailyProteinTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(10, 400),
      })
      .int('errors.validation.integer')
      .min(10, rangeErrorMessage(10, 400))
      .max(400, rangeErrorMessage(10, 400)),

    dailyCalorieTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(500, 10_000),
      })
      .int('errors.validation.integer')
      .min(500, rangeErrorMessage(500, 10_000))
      .max(10_000, rangeErrorMessage(500, 10_000)),

    dailyCarbTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(50, 800),
      })
      .int('errors.validation.integer')
      .min(50, rangeErrorMessage(50, 800))
      .max(800, rangeErrorMessage(50, 800)),

    dailyHydrationTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(500, 8000),
      })
      .int('errors.validation.integer')
      .min(500, rangeErrorMessage(500, 8000))
      .max(8000, rangeErrorMessage(500, 8000)),

    weight: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(20, 300),
      })
      .min(20, rangeErrorMessage(20, 300))
      .max(300, rangeErrorMessage(20, 300)),

    height: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(100, 250),
      })
      .min(100, rangeErrorMessage(100, 250))
      .max(250, rangeErrorMessage(100, 250)),

    scanCount: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(0, 'errors.validation.number_range'),

    scanResetDate: z.date({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.invalid_option',
    }),

    preferredLanguage: z.enum(['en', 'pt-BR'], {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    unitSystem: z.enum(unitSystemValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    notificationPreferences: notificationPreferencesSchema,

    dailyPulseTime: dailyPulseTimeSchema,

    pushToken: z.string({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.required',
    }),
  })
  .partial();

// ─── Schema: cálculo de macros e metas calóricas ────────────────────────────

export const calculateMacrosSchema = z.object({
  weight: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .positive('errors.validation.number_range'),

  height: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .positive('errors.validation.number_range'),

  activityLevel: z.enum(['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive'], {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  goal: z.enum(userGoalValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  unitSystem: z.enum(unitSystemValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),
});

// ─── Schema: metas de macronutrientes ────────────────────────────────────────

export const macroTargetSchema = z.object({
  dailyCalorieTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(500, 10_000),
    })
    .int('errors.validation.integer')
    .min(500, rangeErrorMessage(500, 10_000))
    .max(10_000, rangeErrorMessage(500, 10_000)),

  dailyProteinTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(10, 400),
    })
    .int('errors.validation.integer')
    .min(10, rangeErrorMessage(10, 400))
    .max(400, rangeErrorMessage(10, 400)),

  dailyCarbTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(50, 800),
    })
    .int('errors.validation.integer')
    .min(50, rangeErrorMessage(50, 800))
    .max(800, rangeErrorMessage(50, 800))
    .optional(),

  dailyFatTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: rangeErrorMessage(0, 500),
    })
    .int('errors.validation.integer')
    .min(0, rangeErrorMessage(0, 500))
    .max(500, rangeErrorMessage(0, 500))
    .optional(),
});

// ─── Schema: timezone do usuário ─────────────────────────────────────────────
// Fonte de verdade para validação do campo timezone em qualquer contexto de
// domínio do usuário (perfil, preferências, sincronização de dispositivo).
//
// Valida que o valor é um timezone IANA reconhecido (ex: 'America/Sao_Paulo',
// 'UTC', 'Europe/London') via isValidIanaTimezone — mesma checagem usada pelo
// runtime do backend (apps/api/src/utils/timezone.utils.ts, validateTimezone).
//
// Consumidores:
//   • Backend  → PATCH /auth/timezone (updateTimezoneSchema reutiliza este)
//   • Mobile   → serviço de sincronização de timezone ao detectar mudança de fuso

export const timezoneSchema = z.object({
  timezone: z
    .string({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.required',
    })
    .min(1, 'errors.validation.required')
    .refine(isValidIanaTimezone, 'errors.validation.timezone_invalid'),
});

export const calculateMacrosResponseSchema = z.object({
  imc: z.number(),
  imcUnit: z.literal('kg/m²'),
  imcClassification: z.enum(imcClassificationValues),
  dailyCalorieTarget: z.number().int(),
  dailyProteinTarget: z.number().int(),
  dailyCarbTarget: z.number().int(),
  tdee: z.number().int(),
});

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type MacroTargetInput = z.infer<typeof macroTargetSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type DailyPulseTimeInput = z.infer<typeof dailyPulseTimeSchema>;
export type TimezoneInput = z.infer<typeof timezoneSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CalculateMacrosInput = z.infer<typeof calculateMacrosSchema>;
export type CalculateMacrosResponse = z.infer<typeof calculateMacrosResponseSchema>;
