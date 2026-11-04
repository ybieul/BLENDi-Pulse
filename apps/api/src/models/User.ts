// apps/api/src/models/User.ts

import { randomUUID } from 'node:crypto';
import mongoose, { type Document, type Model } from 'mongoose';
import argon2 from 'argon2';

// Exceção pontual à convenção deste arquivo de não importar de
// @blendi/shared (os outros tipos redeclarados aqui — UserGoal, BlendiModel
// etc. — continuam como estão). Só pros limites numéricos de validação dos
// campos de macro, centralizados no Zod desde o CP-A.1/CP-A.2.2 — evita uma
// cópia solta dos mesmos números só neste arquivo. DAILY_PROTEIN_TARGET_
// VALIDATION_MIN/MAX (não DAILY_PROTEIN_TARGET_MIN/MAX — esse par é o clamp
// automático, usado só em macroCalculation.utils.ts, nunca na validação do
// schema) é a correção do CP-A.2.2: desacopla a validação de edição manual
// do clamp do cálculo automático.
import {
  DAILY_CALORIE_TARGET_MAX,
  DAILY_CALORIE_TARGET_MIN,
  DAILY_CARB_TARGET_MAX,
  DAILY_CARB_TARGET_MIN,
  DAILY_FAT_TARGET_MAX,
  DAILY_FAT_TARGET_MIN,
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,
  MAX_PLAUSIBLE_AGE_YEARS,
  MIN_PLAUSIBLE_AGE_YEARS,
} from '@blendi/shared';

// Reaproveitada pelo validador de idade plausível de `birthDate` (abaixo) —
// sem risco de ciclo real: macroCalculation.utils.ts só importa TIPOS deste
// arquivo (`import type {...}`), que são erased na compilação, então o
// grafo de módulos em runtime é só User.ts -> macroCalculation.utils.ts,
// nunca os dois sentidos (CP-A.2.4, confirmado via tsc --noEmit).
import { calculateAge } from '../utils/macroCalculation.utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
export type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
export type BiologicalSex = 'male' | 'female';
export type WeightGoal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel =
  | 'sedentary'
  | 'lightlyActive'
  | 'moderatelyActive'
  | 'veryActive'
  | 'extremelyActive';
export type UserLocale = 'en' | 'pt-BR';
export type UserUnitSystem = 'metric' | 'imperial';
export type SupplementTiming = 'morning' | 'preWorkout' | 'postWorkout' | 'evening' | 'withMeal';
export type UserSubscriptionPlan = 'monthly' | 'annual';

export interface IUserSupplement {
  supplementId: string;
  name: string;
  dosage: string;
  dailyTargetCount?: number;
  timing: SupplementTiming;
  isActive: boolean;
  order: number;
}

export interface IUserNotificationPreferences {
  dailyPulse: boolean;
  streakReminder: boolean;
  supplementReminder: boolean;
  hydrationReminder: boolean;
  levelUp: boolean;
}

export interface IUserDailyPulseTime {
  hour: number;
  minute: number;
}

export interface IUserLastLevelUp {
  level: number;
  awardedAt: Date;
}

export interface IUserWeightHistoryEntry {
  weight: number;
  recordedAt: Date;
}

export interface IUser {
  email: string;
  /**
   * Reflete o claim `email_verified` do provedor OAuth no momento da
   * CRIAÇÃO da conta (ex: identityToken da Apple — ver apple.controller.ts,
   * Caso 3). Default `false`: contas via email/senha (register) e via
   * Google (google.controller.ts) ainda não populam este campo — ele só é
   * setado hoje pelo fluxo de criação de conta via Apple.
   */
  emailVerified: boolean;
  /**
   * Hash Argon2id da senha. Ausente em contas criadas exclusivamente via OAuth.
   * Nunca retornado por padrão (select: false no schema).
   */
  password?: string;
  /**
   * ID único do usuário no Google (campo `sub` do ID token).
   * Ausente em contas criadas via email/senha.
   * Nunca retornado por padrão — usado apenas internamente para lookup.
   */
  googleId?: string;
  /**
   * ID único e estável do usuário na Apple (campo `sub` do identityToken).
   * Ausente em contas criadas via email/senha ou via Google.
   * Nunca retornado por padrão — usado apenas internamente para lookup.
   */
  appleUserId?: string;
  /**
   * Refresh token emitido pela Apple na troca do authorizationCode (ver
   * apple.service.ts). Guardado apenas para permitir a revogação do acesso
   * da Apple quando a conta for excluída — nunca usado para gerar sessão
   * no BLENDi. Nunca retornado por padrão (select: false), mesmo motivo de
   * segurança do password e do googleId.
   */
  appleRefreshToken?: string;
  /**
   * URL da foto de perfil vinda do Google.
   * Ausente em contas criadas via email/senha (sem foto padrão).
   */
  profilePhoto?: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: Date;
  name: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  /**
   * Objetivo de peso corporal (perder/manter/ganhar) — independente de
   * `goal`, que é só a proposta do blend/conteúdo do Pulse AI. Único campo
   * que controla o ajuste calórico do TDEE em `calculateMacros`.
   */
  weightGoal: WeightGoal;
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  /**
   * Timezone IANA do dispositivo do usuário.
   * Exemplos: 'America/Sao_Paulo', 'Europe/London', 'Asia/Tokyo'.
   * Capturado automaticamente via expo-localization durante o onboarding —
   * nunca digitado manualmente. Atualizado via PATCH /auth/timezone sempre
   * que o app detectar divergência com o timezone do dispositivo.
   */
  timezone: string;
  pushToken?: string;
  notificationPreferences: IUserNotificationPreferences;
  dailyPulseTime: IUserDailyPulseTime;
  dailyProteinTarget: number;
  dailyCalorieTarget: number;
  dailyCarbTarget?: number;
  /**
   * Meta diária de gordura em gramas — derivada de dailyFatCalories (30% das
   * calorias) em calculateMacroTargets. Opcional: contas criadas antes desta
   * adição (ou que nunca passaram por um recálculo de updateMe) não têm esse
   * campo até a primeira vez que a meta for recalculada.
   */
  dailyFatTarget?: number;
  dailyHydrationTarget: number;
  supplementStack: IUserSupplement[];
  currentStreak: number;
  longestStreak: number;
  blendCount: number;
  totalXP: number;
  lastLevelUp?: IUserLastLevelUp;
  lastCleanedAt?: Date;
  /** Peso corporal em quilogramas. Opcional até o onboarding coletar o valor. */
  weight?: number;
  /** Altura em centímetros. Opcional até o onboarding coletar o valor. */
  height?: number;
  /**
   * Peso-alvo em quilogramas — opcional, nunca obrigatório. Usado só pra
   * calcular `weightTargetEta` (ver `calculateWeightTargetEta`); não afeta
   * nenhuma meta de macro em si.
   */
  targetWeight?: number;
  /**
   * Histórico de peso — uma entrada por valor de `weight` efetivamente
   * diferente do já salvo, gravada em `updateMe` (ver `PATCH /users/me`).
   * Nunca há entrada duplicada para o mesmo valor consecutivo. A primeira
   * entrada é criada pela mesma primeira definição de `weight` (hoje, só
   * via PATCH /users/me — `calculateMacros` é stateless e nunca grava no
   * usuário). Lida via `GET /users/me/weight-history`.
   */
  weightHistory: IUserWeightHistoryEntry[];
  /**
   * Data de nascimento. Usada para derivar a idade real no momento do
   * cálculo de BMR/TDEE (ver `calculateMacros`) — a idade nunca é
   * armazenada como número, porque ficaria desatualizada com o tempo
   * sem que nada precisasse escrevê-la de novo.
   */
  birthDate: Date;
  /** Sexo biológico — usado só para a constante da fórmula de Mifflin-St Jeor (+5 / −161). */
  biologicalSex: BiologicalSex;
  /**
   * Nível de atividade usado no multiplicador de TDEE. Precisa ficar
   * persistido (e não só transitar no payload de `calculateMacros`) para
   * que `updateMe` saiba recalcular a meta mesmo quando o PATCH só traz
   * outro campo-gatilho (ex.: `weightGoal` sozinho).
   */
  activityLevel: ActivityLevel;
  /**
   * Flag sticky de "perfil completo" (CP-B.1) — true só quando o usuário de
   * fato passou pelo fluxo real de conclusão do onboarding de corpo
   * (OnboardingMacrosScreen/CompleteProfileScreen, mobile), nunca inferido a
   * partir dos valores salvos (um usuário real de 30 anos/male/maintain é
   * indistinguível dos placeholders do CP-A.4). Setado só em `updateMe`
   * quando o sinal explícito `completingBodyOnboarding` vem no corpo do
   * PATCH — nunca resetado para false depois de true.
   */
  hasRealBodyProfile: boolean;
  /**
   * Quantos scans do Pantry Scanner já foram consumidos no mês corrente.
   * Usado pelo rate limiting atômico do free tier e do Pro.
   */
  scanCount: number;
  /**
   * Data de referência para reset do contador mensal de scans.
   * A lógica de reset por timezone será implementada no CP1.5.
   */
  scanResetDate: Date;
  /** Quantas consultas ao Pulse AI o usuário consumiu no dia atual do seu timezone. */
  dailyAiUsage: number;
  /** Data em que o contador diário do Pulse AI foi zerado pela última vez. */
  aiUsageResetDate: Date;
  /** Flag de assinatura Pro; usuários Pro terão limite ilimitado no Pulse AI. */
  isPro: boolean;
  /** ID unico da assinatura ativa no provedor de pagamentos. */
  subscriptionId?: string;
  /** Tipo do plano contratado no momento. */
  subscriptionPlan?: UserSubscriptionPlan;
  /** Momento em que a assinatura atual perde validade. */
  subscriptionExpiresAt?: Date;
  /** ID do usuario no sistema externo de pagamentos. */
  revenueCatCustomerId?: string;
  /** Momento em que o cancelamento da renovacao automatica foi detectado. */
  subscriptionCancelRequestedAt?: Date;
  isActive: boolean;
  /**
   * Timestamp da última troca de senha via fluxo de reset.
   * Usado para invalidar resetTokens já utilizados:
   * se passwordChangedAt > token.iat, o token foi emitido antes da última
   * troca e portanto não pode ser reutilizado.
   */
  passwordChangedAt?: Date;
  /**
   * Contador de geração de sessão — incrementado em `POST /auth/logout` e
   * na redefinição de senha bem-sucedida. Todo refresh token carrega o
   * `tokenVersion` vigente no momento em que foi emitido; se o valor do
   * token divergir do valor atual do usuário, a sessão foi revogada e o
   * refresh é rejeitado (`auth/session-revoked`). Não exposto ao cliente.
   */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  /** Compara a senha em texto puro com o hash Argon2 armazenado. */
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export type UserDocument = Document<unknown, object, IUser> & IUser & IUserMethods;
type UserModel = Model<IUser, object, IUserMethods>;

// ─── Parâmetros Argon2id — OWASP 2025 ────────────────────────────────────────

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

const supplementTimingValues = [
  'morning',
  'preWorkout',
  'postWorkout',
  'evening',
  'withMeal',
] as const satisfies readonly SupplementTiming[];

const userSubscriptionPlanValues = ['monthly', 'annual'] as const satisfies readonly UserSubscriptionPlan[];

const userSupplementSchema = new mongoose.Schema<IUserSupplement>(
  {
    supplementId: {
      type: String,
      required: [true, 'errors.validation.required'],
      default: () => randomUUID(),
      immutable: true,
    },
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      maxlength: [60, 'errors.validation.too_long'],
    },
    dosage: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      maxlength: [30, 'errors.validation.too_long'],
    },
    dailyTargetCount: {
      type: Number,
      default: 1,
      min: [1, 'errors.validation.number_range'],
      max: [20, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    timing: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: supplementTimingValues,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
  },
  {
    _id: false,
  }
);

const userNotificationPreferencesSchema = new mongoose.Schema<IUserNotificationPreferences>(
  {
    dailyPulse: {
      type: Boolean,
      default: true,
    },
    streakReminder: {
      type: Boolean,
      default: true,
    },
    supplementReminder: {
      type: Boolean,
      default: true,
    },
    hydrationReminder: {
      type: Boolean,
      default: true,
    },
    levelUp: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  }
);

const userDailyPulseTimeSchema = new mongoose.Schema<IUserDailyPulseTime>(
  {
    hour: {
      type: Number,
      default: 7,
      min: [0, 'errors.validation.number_range'],
      max: [23, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    minute: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      max: [59, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
  },
  {
    _id: false,
  }
);

const userLastLevelUpSchema = new mongoose.Schema<IUserLastLevelUp>(
  {
    level: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    awardedAt: {
      type: Date,
      required: [true, 'errors.validation.required'],
    },
  },
  {
    _id: false,
  }
);

const userWeightHistorySchema = new mongoose.Schema<IUserWeightHistoryEntry>(
  {
    weight: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [20, 'errors.validation.number_range'],
      max: [300, 'errors.validation.number_range'],
    },
    recordedAt: {
      type: Date,
      required: [true, 'errors.validation.required'],
    },
  },
  {
    _id: false,
  }
);

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: [true, 'errors.validation.required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Ver JSDoc de IUser.emailVerified — hoje só setado por
    // apple.controller.ts (Caso 3). Default false por segurança: ausência de
    // verificação positiva nunca deve ser tratada como "verificado".
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // select: false — a senha NUNCA é retornada por padrão nas queries.
    // Opcional: usuários que se cadastram via Google OAuth não têm senha local.
    password: {
      type: String,
      required: false,
      select: false,
    },
    // ID do usuário no Google (campo `sub` do ID token).
    // sparse: true → permite múltiplos documentos com googleId ausente (undefined/null)
    //                  enquanto mantém uniqueness para valores presentes.
    // select: false → não exposto em queries padrão (lookup interno apenas).
    googleId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      select: false,
    },
    // ID do usuário na Apple (campo `sub` do identityToken).
    // sparse: true → permite múltiplos documentos com appleUserId ausente
    //                  (undefined/null) enquanto mantém uniqueness para valores presentes.
    // select: false → não exposto em queries padrão (lookup interno apenas).
    appleUserId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      select: false,
    },
    // Refresh token emitido pela Apple — guardado apenas para permitir a
    // revogação do acesso na exclusão de conta (ver apple.service.ts,
    // revokeAppleRefreshToken). Não é identificador, então sem unique/sparse.
    // select: false → mesmo motivo de segurança do password e do googleId.
    appleRefreshToken: {
      type: String,
      required: false,
      select: false,
    },
    // URL da foto de perfil vinda do Google.
    // Opcional — usuários de email/senha não têm este campo.
    profilePhoto: {
      type: String,
      required: false,
    },
    hasProfilePhoto: {
      type: Boolean,
      default: false,
    },
    profilePhotoUpdatedAt: {
      type: Date,
      required: false,
    },
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    blendiModel: {
      type: String,
      enum: ['Lite', 'ProPlus', 'Steel'] satisfies BlendiModel[],
      required: [true, 'errors.validation.required'],
    },
    goal: {
      type: String,
      enum: ['Muscle', 'Wellness', 'Energy', 'Recovery'] satisfies UserGoal[],
      required: [true, 'errors.validation.required'],
    },
    weightGoal: {
      type: String,
      enum: ['lose', 'maintain', 'gain'] satisfies WeightGoal[],
      required: [true, 'errors.validation.required'],
    },
    locale: {
      type: String,
      enum: ['en', 'pt-BR'] satisfies UserLocale[],
      default: 'en',
    },
    unitSystem: {
      type: String,
      enum: ['metric', 'imperial'] satisfies UserUnitSystem[],
      default: 'metric',
    },
    // Timezone IANA — ver comentário na interface IUser acima.
    // Padrão: 'America/New_York' (UTC-5/-4) — escolhido por ser o timezone
    // com maior base de usuários EN esperada no lançamento. Sempre sobrescrito
    // pelo valor real do dispositivo durante o onboarding.
    timezone: {
      type: String,
      required: [true, 'errors.validation.required'],
      default: 'America/New_York',
    },
    pushToken: {
      type: String,
      required: false,
    },
    notificationPreferences: {
      type: userNotificationPreferencesSchema,
      default: () => ({}),
    },
    dailyPulseTime: {
      type: userDailyPulseTimeSchema,
      default: () => ({}),
    },
    dailyProteinTarget: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [DAILY_PROTEIN_TARGET_VALIDATION_MIN, 'errors.validation.number_range'],
      max: [DAILY_PROTEIN_TARGET_VALIDATION_MAX, 'errors.validation.number_range'],
    },
    dailyCalorieTarget: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [DAILY_CALORIE_TARGET_MIN, 'errors.validation.number_range'],
      max: [DAILY_CALORIE_TARGET_MAX, 'errors.validation.number_range'],
    },
    dailyCarbTarget: {
      type: Number,
      required: false,
      default: 200,
      min: [DAILY_CARB_TARGET_MIN, 'errors.validation.number_range'],
      max: [DAILY_CARB_TARGET_MAX, 'errors.validation.number_range'],
    },
    dailyFatTarget: {
      type: Number,
      required: false,
      min: [DAILY_FAT_TARGET_MIN, 'errors.validation.number_range'],
      max: [DAILY_FAT_TARGET_MAX, 'errors.validation.number_range'],
    },
    dailyHydrationTarget: {
      type: Number,
      default: 2500,
      min: [500, 'errors.validation.number_range'],
      max: [8000, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    supplementStack: {
      type: [userSupplementSchema],
      default: [],
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    blendCount: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    totalXP: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    lastLevelUp: {
      type: userLastLevelUpSchema,
      required: false,
    },
    lastCleanedAt: {
      type: Date,
      required: false,
    },
    weight: {
      type: Number,
      required: false,
      min: [20, 'errors.validation.number_range'],
      max: [300, 'errors.validation.number_range'],
    },
    height: {
      type: Number,
      required: false,
      min: [100, 'errors.validation.number_range'],
      max: [250, 'errors.validation.number_range'],
    },
    targetWeight: {
      type: Number,
      required: false,
      min: [20, 'errors.validation.number_range'],
      max: [300, 'errors.validation.number_range'],
    },
    weightHistory: {
      type: [userWeightHistorySchema],
      default: [],
    },
    birthDate: {
      type: Date,
      required: [true, 'errors.validation.required'],
      // Idade plausível (13-120), não só formato — reaproveita calculateAge
      // (../utils/macroCalculation.utils.ts), a mesma função usada pelo
      // cálculo de BMR/TDEE. Ao contrário do .refine() equivalente em
      // packages/shared/src/schemas/user.ts (que precisa duplicar o
      // algoritmo porque packages/shared não pode importar de apps/api),
      // este validador já está DENTRO de apps/api — sem motivo de
      // dependência circular pra duplicar aqui (CP-A.2.4: confirmado que
      // a duplicação original era desnecessária, corrigida).
      validate: {
        validator: function (value: Date) {
          const age = calculateAge(value, new Date());
          return age >= MIN_PLAUSIBLE_AGE_YEARS && age <= MAX_PLAUSIBLE_AGE_YEARS;
        },
        message: 'errors.validation.number_range',
      },
    },
    biologicalSex: {
      type: String,
      enum: ['male', 'female'] satisfies BiologicalSex[],
      required: [true, 'errors.validation.required'],
    },
    activityLevel: {
      type: String,
      enum: [
        'sedentary',
        'lightlyActive',
        'moderatelyActive',
        'veryActive',
        'extremelyActive',
      ] satisfies ActivityLevel[],
      required: [true, 'errors.validation.required'],
    },
    hasRealBodyProfile: {
      type: Boolean,
      default: false,
    },
    scanCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    scanResetDate: {
      type: Date,
      default: Date.now,
    },
    dailyAiUsage: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    aiUsageResetDate: {
      type: Date,
      default: Date.now,
    },
    isPro: {
      type: Boolean,
      default: false,
    },
    subscriptionId: {
      type: String,
      required: false,
      trim: true,
    },
    subscriptionPlan: {
      type: String,
      required: false,
      enum: userSubscriptionPlanValues,
    },
    subscriptionExpiresAt: {
      type: Date,
      required: false,
    },
    revenueCatCustomerId: {
      type: String,
      required: false,
      trim: true,
    },
    subscriptionCancelRequestedAt: {
      type: Date,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    passwordChangedAt: {
      type: Date,
      required: false,
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
  },
  {
    timestamps: true,
  }
);

// ─── Middleware: hash da senha antes de salvar ────────────────────────────────

userSchema.pre('save', async function (next) {
  // Só faz hash se a senha foi modificada E existe (OAuth users não têm senha)
  if (!this.isModified('password') || !this.password) return next();
  this.password = await argon2.hash(this.password, ARGON2_OPTIONS);
  // Registrar o momento da troca para invalidar resetTokens anteriores
  this.passwordChangedAt = new Date();
  next();
});

// ─── Método de instância: verificar senha ─────────────────────────────────────

userSchema.method(
  'comparePassword',
  async function (candidatePassword: string): Promise<boolean> {
    // Conta OAuth sem senha local — never matches any password
    if (!this.password) return false;
    return argon2.verify(this.password, candidatePassword);
  }
);

// ─── Índices ──────────────────────────────────────────────────────────────────

// Usado por findUserForWebhook (revenueCatWebhook.controller.ts) no braço não-_id
// do $or. sparse: true porque a maioria dos usuários não tem esse campo
// preenchido até assinar o Pro — um índice não-sparse indexaria todo documento
// com o campo ausente, sem ganho de performance.
userSchema.index({ revenueCatCustomerId: 1 }, { sparse: true });

// Usado pelos cron jobs de notificação (notifications.jobs.ts), que filtram
// por { pushToken: { $exists: true, $type: 'string', $ne: '' } } antes de
// checar notificationPreferences em memória. sparse: true porque a maioria
// dos usuários em desenvolvimento não tem pushToken definido — o índice
// cobre exatamente o subconjunto de documentos onde o campo existe.
userSchema.index({ pushToken: 1 }, { sparse: true });

// ─── Modelo ───────────────────────────────────────────────────────────────────
// O campo email já possui unique: true, que cria o índice automaticamente.
// Não declarar userSchema.index({ email: 1 }) para evitar índice duplicado.

export const UserModel = mongoose.model<IUser, UserModel>('User', userSchema);
