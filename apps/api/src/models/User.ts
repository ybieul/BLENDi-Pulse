// apps/api/src/models/User.ts

import { randomUUID } from 'node:crypto';
import mongoose, { type Document, type Model } from 'mongoose';
import argon2 from 'argon2';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
export type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
export type UserLocale = 'en' | 'pt-BR';
export type UserUnitSystem = 'metric' | 'imperial';
export type SupplementTiming = 'morning' | 'preWorkout' | 'postWorkout' | 'evening' | 'withMeal';

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

export interface IUser {
  email: string;
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
   * URL da foto de perfil vinda do Google.
   * Ausente em contas criadas via email/senha (sem foto padrão).
   */
  profilePhoto?: string;
  name: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
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
  dailyHydrationTarget: number;
  supplementStack: IUserSupplement[];
  currentStreak: number;
  longestStreak: number;
  blendCount: number;
  lastCleanedAt?: Date;
  /** Peso corporal em quilogramas. Opcional até o onboarding coletar o valor. */
  weight?: number;
  /** Altura em centímetros. Opcional até o onboarding coletar o valor. */
  height?: number;
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
  isActive: boolean;
  /**
   * Timestamp da última troca de senha via fluxo de reset.
   * Usado para invalidar resetTokens já utilizados:
   * se passwordChangedAt > token.iat, o token foi emitido antes da última
   * troca e portanto não pode ser reutilizado.
   */
  passwordChangedAt?: Date;
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
    // URL da foto de perfil vinda do Google.
    // Opcional — usuários de email/senha não têm este campo.
    profilePhoto: {
      type: String,
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
      min: [10, 'errors.validation.number_range'],
      max: [400, 'errors.validation.number_range'],
    },
    dailyCalorieTarget: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [500, 'errors.validation.number_range'],
      max: [10000, 'errors.validation.number_range'],
    },
    dailyCarbTarget: {
      type: Number,
      required: false,
      default: 200,
      min: [50, 'errors.validation.number_range'],
      max: [800, 'errors.validation.number_range'],
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
    isActive: {
      type: Boolean,
      default: true,
    },
    passwordChangedAt: {
      type: Date,
      required: false,
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

// ─── Modelo ───────────────────────────────────────────────────────────────────
// O campo email já possui unique: true, que cria o índice automaticamente.
// Não declarar userSchema.index({ email: 1 }) para evitar índice duplicado.

export const UserModel = mongoose.model<IUser, UserModel>('User', userSchema);
