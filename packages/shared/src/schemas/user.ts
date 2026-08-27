// packages/shared/src/schemas/user.ts
// Schema Zod de perfil/metas do usuário.
// Usado no onboarding e na tela de configurações.
//
// ⚠️  Mensagens de erro são CHAVES de i18n — nunca texto traduzido.
//
//   • Mobile  → t(error.message, params)
//   • Backend → retorna a chave no JSON

import { z } from 'zod';

import { isValidIanaTimezone } from '../utils/timezone.utils';

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
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range')
    .max(23, 'errors.validation.number_range'),
  minute: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range')
    .max(59, 'errors.validation.number_range'),
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
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(10, 'errors.validation.number_range')
      .max(400, 'errors.validation.number_range'),

    dailyCalorieTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(500, 'errors.validation.number_range')
      .max(10_000, 'errors.validation.number_range'),

    dailyCarbTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(50, 'errors.validation.number_range')
      .max(800, 'errors.validation.number_range'),

    dailyHydrationTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(500, 'errors.validation.number_range')
      .max(8000, 'errors.validation.number_range'),

    weight: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .min(20, 'errors.validation.number_range')
      .max(300, 'errors.validation.number_range'),

    height: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.number_range',
      })
      .min(100, 'errors.validation.number_range')
      .max(250, 'errors.validation.number_range'),

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
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(500, 'errors.validation.number_range')
    .max(10_000, 'errors.validation.number_range'),

  dailyProteinTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(10, 'errors.validation.number_range')
    .max(400, 'errors.validation.number_range'),

  dailyCarbTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(50, 'errors.validation.number_range')
    .max(800, 'errors.validation.number_range')
    .optional(),

  dailyFatTarget: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(0, 'errors.validation.number_range')
    .max(500, 'errors.validation.number_range')
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
