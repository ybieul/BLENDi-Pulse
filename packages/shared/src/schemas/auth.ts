// packages/shared/src/schemas/auth.ts
// Schemas Zod de autenticação — fonte única da verdade para validação.
// Usados pelo backend (rotas Express) E pelo mobile (formulários React Native).
//
// ⚠️  IMPORTANTE — mensagens de erro são CHAVES de i18n, não texto traduzido.
//
//   • Mobile  → t(error.message, params)  — exibe no idioma do usuário
//   • Backend → retorna a chave no JSON   — cliente resolve como quiser
//
// Parâmetros de interpolação ({{min}}, {{max}}) são derivados dos campos
// `minimum` / `maximum` que o Zod injeta automaticamente em cada ZodIssue.
// Nunca codifique os valores numéricos dentro da string da chave.

import { z } from 'zod';

// ─── Constantes ───────────────────────────────────────────────────────────────

// bcryptjs trunca silenciosamente após 72 bytes — limite técnico explícito
const PASSWORD_MAX = 72;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

// ─── Schema: registro ─────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required')
    .max(255, 'errors.validation.too_long')
    .email('errors.validation.email_invalid')
    .toLowerCase(),

  password: z
    .string({ required_error: 'errors.validation.required' })
    .min(8, 'errors.validation.too_short')
    .max(PASSWORD_MAX, 'errors.validation.too_long')
    .regex(PASSWORD_REGEX, 'errors.validation.password_complexity'),

  name: z
    .string({ required_error: 'errors.validation.required' })
    .min(2, 'errors.validation.too_short')
    .max(60, 'errors.validation.too_long')
    .trim(),

  blendiModel: z.enum(['Lite', 'ProPlus', 'Steel'], {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  goal: z.enum(['Muscle', 'Wellness', 'Energy', 'Recovery'], {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  preferredLanguage: z.enum(['en', 'pt-BR']).default('en'),

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

  // Timezone IANA do dispositivo (ex: 'America/Sao_Paulo', 'Europe/London').
  // Capturado automaticamente pelo app durante o onboarding via expo-localization —
  // nunca digitado manualmente pelo usuário.
  timezone: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required'),
});

// ─── Schema: login ────────────────────────────────────────────────────────────
// Sem validação de complexidade — enviamos exatamente o que o usuário digitou.

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required')
    .email('errors.validation.email_invalid')
    .toLowerCase(),

  password: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required'),
});

// ─── Schema: atualização de timezone ─────────────────────────────────────────
// Usado pelo endpoint PATCH /auth/timezone.
// O app mobile chama este endpoint quando detecta divergência entre o timezone
// salvo no servidor e o timezone atual do dispositivo.

export const updateTimezoneSchema = z.object({
  timezone: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required'),
});

// ─── Schema: refresh token ────────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'errors.validation.required' })
    .min(1, 'errors.validation.required'),
});

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateTimezoneInput = z.infer<typeof updateTimezoneSchema>;
