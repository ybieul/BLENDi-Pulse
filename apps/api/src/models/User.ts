// apps/api/src/models/User.ts

import mongoose, { type Document, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';

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
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  /** Compara a senha em texto puro com o hash armazenado. */
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export type UserDocument = Document<unknown, object, IUser> & IUser & IUserMethods;
type UserModel = Model<IUser, object, IUserMethods>;

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: [true, 'Email é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false — a senha NUNCA é retornada por padrão nas queries
    password: {
      type: String,
      required: [true, 'Senha é obrigatória'],
      select: false,
    },
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
    },
    blendiModel: {
      type: String,
      enum: ['Lite', 'ProPlus', 'Steel'] satisfies BlendiModel[],
      required: [true, 'Modelo BLENDi é obrigatório'],
    },
    goal: {
      type: String,
      enum: ['Muscle', 'Wellness', 'Energy', 'Recovery'] satisfies UserGoal[],
      required: [true, 'Goal é obrigatório'],
    },
    locale: {
      type: String,
      enum: ['en', 'pt-BR'] satisfies UserLocale[],
      default: 'en',
    },
  },
  {
    timestamps: true, // createdAt e updatedAt automáticos
  }
);

// ─── Middleware: hash da senha antes de salvar ────────────────────────────────

userSchema.pre('save', async function (next) {
  // Só faz hash se a senha foi modificada (criação ou troca de senha)
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Método de instância: comparar senha ─────────────────────────────────────

userSchema.method('comparePassword', async function (candidatePassword: string) {
  return bcrypt.compare(candidatePassword, this.password);
});

// ─── Exportação ───────────────────────────────────────────────────────────────

export const User = mongoose.model<IUser, UserModel>('User', userSchema);
