// apps/api/src/models/User.ts

import mongoose, { type Document, type Model } from 'mongoose';
import argon2 from 'argon2';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
export type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
export type UserLocale = 'en' | 'pt-BR';

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
  name: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
  /**
   * Timezone IANA do dispositivo do usuário.
   * Exemplos: 'America/Sao_Paulo', 'Europe/London', 'Asia/Tokyo'.
   * Capturado automaticamente via expo-localization durante o onboarding —
   * nunca digitado manualmente. Atualizado via PATCH /auth/timezone sempre
   * que o app detectar divergência com o timezone do dispositivo.
   */
  timezone: string;
  dailyProteinTarget: number;
  dailyCalorieTarget: number;
  isActive: boolean;
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
    // Timezone IANA — ver comentário na interface IUser acima.
    // Padrão: 'America/New_York' (UTC-5/-4) — escolhido por ser o timezone
    // com maior base de usuários EN esperada no lançamento. Sempre sobrescrito
    // pelo valor real do dispositivo durante o onboarding.
    timezone: {
      type: String,
      required: [true, 'errors.validation.required'],
      default: 'America/New_York',
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
    isActive: {
      type: Boolean,
      default: true,
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
