// apps/api/src/models/User.ts

import mongoose, { type Document, type Model } from 'mongoose';
import argon2 from 'argon2';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
export type UserGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
export type UserLocale = 'en' | 'pt-BR';

export interface IUser {
  email: string;
  password: string;
  name: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
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
    // select: false — a senha NUNCA é retornada por padrão nas queries
    password: {
      type: String,
      required: [true, 'errors.validation.required'],
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
  // Só faz hash se a senha foi modificada (criação ou troca de senha)
  if (!this.isModified('password')) return next();
  this.password = await argon2.hash(this.password, ARGON2_OPTIONS);
  next();
});

// ─── Método de instância: verificar senha ─────────────────────────────────────

userSchema.method(
  'comparePassword',
  async function (candidatePassword: string): Promise<boolean> {
    return argon2.verify(this.password, candidatePassword);
  }
);

// ─── Modelo ───────────────────────────────────────────────────────────────────
// O campo email já possui unique: true, que cria o índice automaticamente.
// Não declarar userSchema.index({ email: 1 }) para evitar índice duplicado.

export const UserModel = mongoose.model<IUser, UserModel>('User', userSchema);
