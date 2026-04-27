// packages/shared/src/schemas/user.ts
// Schema Zod de perfil/metas do usuário.
// Usado no onboarding e na tela de configurações.
//
// ⚠️  Mensagens de erro são CHAVES de i18n — nunca texto traduzido.
//
//   • Mobile  → t(error.message, params)
//   • Backend → retorna a chave no JSON

import { z } from 'zod';

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
    .min(0, 'errors.validation.number_range')
    .max(1_500, 'errors.validation.number_range')
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
// Aceita qualquer string IANA não-vazia (ex: 'America/Sao_Paulo', 'UTC',
// 'Europe/London'). A validação de existência do timezone no banco de dados
// IANA é responsabilidade da camada de negócio — o schema garante apenas que
// o campo foi fornecido como string.
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
    .min(1, 'errors.validation.required'),
});

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type MacroTargetInput = z.infer<typeof macroTargetSchema>;
export type TimezoneInput = z.infer<typeof timezoneSchema>;
