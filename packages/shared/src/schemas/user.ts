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
const biologicalSexValues = ['male', 'female'] as const;
const weightGoalValues = ['lose', 'maintain', 'gain'] as const;
const activityLevelValues = [
  'sedentary',
  'lightlyActive',
  'moderatelyActive',
  'veryActive',
  'extremelyActive',
] as const;
const weightTargetEtaUnavailableReasonValues = ['weightGoal_is_maintain', 'contradictory_direction'] as const;

// Posse de liquidificador (Onboarding Additions). 'blendi' = tem um BLENDi
// atual (Lite/Pro+/Steel); 'other' = modelo antigo ou outra marca; 'none' =
// ainda não tem. Nos dois últimos o blendiModel gravado é sempre 'Lite' (os
// limites mais conservadores de BLENDER_LIMITS) — a regra é aplicada no
// backend (resolveBlenderOwnershipUpdates, apps/api), não só no app.
export const BLENDI_OWNERSHIP_VALUES = ['blendi', 'other', 'none'] as const;
export type BlendiOwnership = (typeof BLENDI_OWNERSHIP_VALUES)[number];

// Texto livre digitado pelo usuário (marca/modelo do liquidificador). Nunca
// entra no prompt da IA, em evento de analytics nem em log.
export const OTHER_BLENDER_MODEL_MAX_LENGTH = 60;

// Caracteres de controle (\p{Cc}: NUL, quebra de linha, tab...) e de controle
// bidirecional (U+202A-202E, U+2066-2069 — o "RTL override" inverte a ordem
// visual do texto) viram espaço. O campo é de uma linha só e vai ser lido por
// listas/exports futuros (Shop Tab); em vez de rejeitar com 400 (o usuário não
// teria como entender o motivo ao colar um texto com tab), saneia. Achado X01
// do pentest do CP-1.1.1a. ZWJ/ZWNJ ficam de fora de propósito: fazem parte de
// emojis compostos.
const UNSAFE_TEXT_CHARS_PATTERN = /[\p{Cc}\u202A-\u202E\u2066-\u2069]+/gu;

// Teto de itens enviados em dietaryPreferences. Há só 4 valores válidos; o
// teto deixa margem para duplicados (que são aceitos e removidos) mas corta
// payloads gigantes ANTES da validação item a item — sem ele, 4000 itens
// inválidos geravam 4000 issues (resposta ~20x maior que o pedido, achado D03).
export const DIETARY_PREFERENCES_MAX_ITEMS = 16;

// Restrições alimentares aplicadas pelo prompt da Pulse AI e do Pantry Scanner.
export const DIETARY_PREFERENCE_VALUES = ['dairy_free', 'vegan', 'nut_free', 'no_added_sugar'] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCE_VALUES)[number];

// Limites do CLAMP automático de dailyProteinTarget (calculateMacroTargets,
// apps/api/src/utils/macroCalculation.utils.ts) — 10-400, decisão do CP-A.1,
// INTOCADA pelo CP-A.2.2. Deliberadamente DESACOPLADO (desde o CP-A.2.2) do
// limite de VALIDAÇÃO do schema (ver DAILY_PROTEIN_TARGET_VALIDATION_MIN/MAX
// abaixo) — o clamp nunca participa do caminho de edição manual pura (sem
// campo-gatilho no body de PATCH /users/me), então travar a validação do
// schema no mesmo par do clamp rejeitava uma edição manual legítima acima de
// 400g (ex. meta prescrita por nutricionista) com ValidationError, mesmo o
// clamp nunca tendo chance de agir nesse caminho.
export const DAILY_PROTEIN_TARGET_MIN = 10;
export const DAILY_PROTEIN_TARGET_MAX = 400;

// Limites de VALIDAÇÃO de dailyProteinTarget (Zod e Mongoose) — deliberadamente
// mais largos que o clamp acima. Piso igual ao do clamp (sem motivo pra
// mudar); teto (800) confirmado por calculo: maior peso aceito pelo schema
// (300kg) × maior multiplicador de PROTEIN_MULTIPLIERS (Recovery, 2.2g/kg)
// = 660g — 800 fica acima com margem, mesmo numa edição manual extrema.
export const DAILY_PROTEIN_TARGET_VALIDATION_MIN = 10;
export const DAILY_PROTEIN_TARGET_VALIDATION_MAX = 800;

// Limites de dailyCalorieTarget/dailyCarbTarget/dailyFatTarget — única fonte
// pros três schemas (Zod ×2 + Mongoose). Alargados no CP-A.2.2: os limites
// antigos (500-10.000 / 50-800) rejeitavam perfis plausíveis, não só dados
// quebrados (ex.: mulher 40kg/150cm/70 anos sedentária weightGoal 'lose' —
// meta real de 492kcal, abaixo do piso antigo de 500). Filosofia explícita:
// este piso/teto é só proteção de sanidade contra dado obviamente quebrado
// (negativo, NaN, erro de digitação) — a orientação de "dieta saudável" já
// existe à parte, no aviso suave não-bloqueante (evaluateManualMacroEditWarnings,
// CP-A.2 Tarefa 6), que não muda aqui.
export const DAILY_CALORIE_TARGET_MIN = 300;
export const DAILY_CALORIE_TARGET_MAX = 15_000;
export const DAILY_CARB_TARGET_MIN = 0;
export const DAILY_CARB_TARGET_MAX = 1_500;
// dailyFatTarget: já tinha um limite (0-500, só no Mongoose, nunca unificado)
// — alargado pra 0-600, margem segura acima do que a fórmula produz mesmo no
// novo teto de calorias (15.000×0,3÷9=500).
export const DAILY_FAT_TARGET_MIN = 0;
export const DAILY_FAT_TARGET_MAX = 600;

// Piso de sanidade só da SUGESTÃO automática de dailyCalorieTarget
// (calculateMacroTargets) — CP-A.2.3. Não é um limite de validação de
// schema (esse continua DAILY_CALORIE_TARGET_MIN/MAX, 300-15.000, sem
// mudança): uma edição MANUAL entre 300 e 1.200 continua aceita
// normalmente. Nome deliberadamente diferente pra não confundir os dois.
export const AUTO_CALORIE_TARGET_MIN_SUGGESTION = 1_200;

// Idade plausível derivada de birthDate — CP-A.2.3. Confirmado na auditoria
// do CP-A.2.2 que nunca existiu nenhum limite de idade em lugar nenhum (só
// formato de data). 13-120: biologicamente plausível e compatível com um
// app de nutrição/suplementação (não um produto infantil).
export const MIN_PLAUSIBLE_AGE_YEARS = 13;
export const MAX_PLAUSIBLE_AGE_YEARS = 120;

// Mesmo algoritmo de apps/api/src/utils/macroCalculation.utils.ts
// (calculateAge) — duplicado deliberadamente aqui, não importado: a direção
// de dependência do monorepo é só apps/* -> packages/shared, nunca o
// inverso, e esta validação precisa rodar nos dois lados (mobile e
// backend) que consomem este schema Zod.
function calculatePlausibleAgeFromBirthDate(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();

  const birthdayNotYetReachedThisYear =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());

  if (birthdayNotYetReachedThisYear) {
    age -= 1;
  }

  return age;
}

// Data de nascimento — usada por calculateMacrosSchema e updateUserSchema para
// derivar a idade real no momento do cálculo (ver calculateMacros no backend).
// Aceita só o formato de data pura ISO 8601 (YYYY-MM-DD, sem hora/fuso — uma
// data de nascimento não tem componente de hora) e transforma em Date. Não usa
// z.date()/z.coerce.date() porque nenhum dos dois preserva as chaves de i18n
// customizadas em todos os casos de erro (z.date() exige um objeto Date já
// desserializado, que nunca chega assim via JSON; z.coerce.date() aceita
// null/boolean/number e os converte silenciosamente em datas bogus, e usa a
// mensagem hardcoded "Invalid date" — não uma chave — para string malformada).
const birthDateSchema = z
  .string({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.required',
  })
  .date('errors.validation.invalid_option')
  .transform(value => new Date(value))
  .refine(
    date => {
      const age = calculatePlausibleAgeFromBirthDate(date, new Date());
      return age >= MIN_PLAUSIBLE_AGE_YEARS && age <= MAX_PLAUSIBLE_AGE_YEARS;
    },
    rangeErrorMessage(MIN_PLAUSIBLE_AGE_YEARS, MAX_PLAUSIBLE_AGE_YEARS)
  );

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

    blendiOwnership: z.enum(BLENDI_OWNERSHIP_VALUES, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    // String vazia é aceita e significa "limpar" (ver resolveBlenderOwnershipUpdates).
    otherBlenderModel: z
      .string({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.invalid_option',
      })
      .transform(value => value.replace(UNSAFE_TEXT_CHARS_PATTERN, ' '))
      .pipe(z.string().trim().max(OTHER_BLENDER_MODEL_MAX_LENGTH, 'errors.validation.too_long')),

    // Lista vazia é válida (sem restrições). Duplicados são removidos aqui,
    // mantendo a ordem da primeira ocorrência.
    dietaryPreferences: z
      .array(z.unknown(), {
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.invalid_option',
      })
      .max(DIETARY_PREFERENCES_MAX_ITEMS, 'errors.validation.invalid_option')
      // .pipe só roda o schema seguinte se o anterior passou — é o que impede
      // a explosão de issues quando o array estoura o teto acima.
      .pipe(
        z
          .array(z.enum(DIETARY_PREFERENCE_VALUES, { message: 'errors.validation.invalid_option' }))
          .transform(values => [...new Set(values)])
      ),

    goal: z.enum(userGoalValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    weightGoal: z.enum(weightGoalValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    activityLevel: z.enum(activityLevelValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    dailyProteinTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(DAILY_PROTEIN_TARGET_VALIDATION_MIN, DAILY_PROTEIN_TARGET_VALIDATION_MAX),
      })
      .int('errors.validation.integer')
      .min(DAILY_PROTEIN_TARGET_VALIDATION_MIN, rangeErrorMessage(DAILY_PROTEIN_TARGET_VALIDATION_MIN, DAILY_PROTEIN_TARGET_VALIDATION_MAX))
      .max(DAILY_PROTEIN_TARGET_VALIDATION_MAX, rangeErrorMessage(DAILY_PROTEIN_TARGET_VALIDATION_MIN, DAILY_PROTEIN_TARGET_VALIDATION_MAX)),

    dailyCalorieTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(DAILY_CALORIE_TARGET_MIN, DAILY_CALORIE_TARGET_MAX),
      })
      .int('errors.validation.integer')
      .min(DAILY_CALORIE_TARGET_MIN, rangeErrorMessage(DAILY_CALORIE_TARGET_MIN, DAILY_CALORIE_TARGET_MAX))
      .max(DAILY_CALORIE_TARGET_MAX, rangeErrorMessage(DAILY_CALORIE_TARGET_MIN, DAILY_CALORIE_TARGET_MAX)),

    dailyCarbTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(DAILY_CARB_TARGET_MIN, DAILY_CARB_TARGET_MAX),
      })
      .int('errors.validation.integer')
      .min(DAILY_CARB_TARGET_MIN, rangeErrorMessage(DAILY_CARB_TARGET_MIN, DAILY_CARB_TARGET_MAX))
      .max(DAILY_CARB_TARGET_MAX, rangeErrorMessage(DAILY_CARB_TARGET_MIN, DAILY_CARB_TARGET_MAX)),

    // Editável manualmente desde esta correção — mesmo padrão de
    // dailyProteinTarget/dailyCalorieTarget/dailyCarbTarget acima. Reaproveita
    // DAILY_FAT_TARGET_MIN/MAX (0-600), o limite de sanidade que já existia
    // só no Mongoose (CP-A.2, Tarefa 1) pro valor calculado automaticamente —
    // agora estendido pra também validar este caminho de edição manual.
    dailyFatTarget: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX),
      })
      .int('errors.validation.integer')
      .min(DAILY_FAT_TARGET_MIN, rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX))
      .max(DAILY_FAT_TARGET_MAX, rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX)),

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

    // Peso-alvo (kg) — opcional, ao contrário de weight/height/birthDate/
    // biologicalSex/weightGoal/activityLevel (obrigatórios desde o CP-A).
    // Mesma faixa física de `weight`, já que representa o mesmo tipo de
    // valor, só que como meta em vez de estado atual.
    targetWeight: z
      .number({
        required_error: 'errors.validation.required',
        invalid_type_error: rangeErrorMessage(20, 300),
      })
      .min(20, rangeErrorMessage(20, 300))
      .max(300, rangeErrorMessage(20, 300)),

    birthDate: birthDateSchema,

    biologicalSex: z.enum(biologicalSexValues, {
      required_error: 'errors.validation.required',
      message: 'errors.validation.invalid_option',
    }),

    // Sinal explícito e transiente (CP-B.1) — nunca persistido no schema do
    // Mongoose. Marca que este PATCH específico é o fluxo real de conclusão
    // do onboarding de corpo (OnboardingMacrosScreen/CompleteProfileScreen),
    // não uma edição pontual de um campo isolado (ex.: MeScreen). É o único
    // jeito do backend saber quando setar `hasRealBodyProfile` — nunca por
    // inferência de quais campos vieram no corpo.
    completingBodyOnboarding: z.literal(true),

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
    .min(20, rangeErrorMessage(20, 300))
    .max(300, rangeErrorMessage(20, 300)),

  height: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .min(100, rangeErrorMessage(100, 250))
    .max(250, rangeErrorMessage(100, 250)),

  // Opcional — calculateMacros é stateless (não lê o perfil do usuário), então
  // a previsão de prazo só aparece na resposta se o próprio payload trouxer
  // targetWeight. Piso/teto (20-300) alinhados com updateUserSchema.targetWeight
  // abaixo — mesmos números, mesma unidade (kg). Antes só `.positive()`, o que
  // deixava este endpoint aceitar um peso-alvo absurdamente baixo (ex.: 0,5kg),
  // já que calculateMacros nunca salva o perfil e por isso nunca passava pela
  // validação de updateUserSchema. Nota: igual a `weight`/`height` abaixo, esta
  // checagem assume o valor já em kg — o único caller real hoje
  // (OnboardingBodyScreen, mobile) sempre converte pra métrico e envia
  // `unitSystem: 'metric'` antes de chamar este endpoint; um `unitSystem:
  // 'imperial'` com `targetWeight` em libras (ambos aceitos pelo schema) só
  // seria convertido pro métrico DEPOIS desta validação, no controller
  // (`calculateMacros`, user.controller.ts) — mesma limitação pré-existente
  // de `weight`/`height` neste schema, não introduzida aqui.
  targetWeight: z
    .number({
      invalid_type_error: rangeErrorMessage(20, 300),
    })
    .min(20, rangeErrorMessage(20, 300))
    .max(300, rangeErrorMessage(20, 300))
    .optional(),

  birthDate: birthDateSchema,

  biologicalSex: z.enum(biologicalSexValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  activityLevel: z.enum(activityLevelValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  goal: z.enum(userGoalValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  weightGoal: z.enum(weightGoalValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  unitSystem: z.enum(unitSystemValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),
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

// Previsão de prazo pra atingir targetWeight — presente na resposta só
// quando targetWeight foi informado (payload de calculateMacros ou perfil
// já salvo, no caso do recálculo de updateMe). `etaDays` é `null` nos dois
// casos descritos em `etaUnavailableReason`; nunca bloqueia o PATCH/POST.
export const weightTargetEtaSchema = z.object({
  etaDays: z.number().int().nullable(),
  etaUnavailableReason: z.enum(weightTargetEtaUnavailableReasonValues).optional(),
});

export const calculateMacrosResponseSchema = z.object({
  imc: z.number(),
  imcUnit: z.literal('kg/m²'),
  imcClassification: z.enum(imcClassificationValues),
  dailyCalorieTarget: z.number().int(),
  dailyProteinTarget: z.number().int(),
  dailyCarbTarget: z.number().int(),
  dailyFatTarget: z.number().int(),
  tdee: z.number().int(),
  weightTargetEta: weightTargetEtaSchema.optional(),
});

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type DailyPulseTimeInput = z.infer<typeof dailyPulseTimeSchema>;
export type TimezoneInput = z.infer<typeof timezoneSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CalculateMacrosInput = z.infer<typeof calculateMacrosSchema>;
export type CalculateMacrosResponse = z.infer<typeof calculateMacrosResponseSchema>;
