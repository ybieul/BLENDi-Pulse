// apps/api/src/models/BlendLog.ts
// Registro de cada blend consumido pelo usuário.

import mongoose, { type Document } from 'mongoose';
import type { BlendiModel } from './User';

export interface IBlendLog {
  userId: mongoose.Types.ObjectId;
  recipeName?: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  blendiModel: BlendiModel;
  durationSeconds: number;
  rating?: number;
  createdAt: Date;
}

export type BlendLogDocument = Document<unknown, object, IBlendLog> & IBlendLog;

const blendLogSchema = new mongoose.Schema<IBlendLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipeName: {
      type: String,
      required: false,
      trim: true,
    },
    protein: {
      type: Number,
      required: true,
      min: [0, 'errors.validation.number_range'],
    },
    carbs: {
      type: Number,
      required: true,
      min: [0, 'errors.validation.number_range'],
    },
    fat: {
      type: Number,
      required: true,
      min: [0, 'errors.validation.number_range'],
    },
    calories: {
      type: Number,
      required: true,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    blendiModel: {
      type: String,
      enum: ['Lite', 'ProPlus', 'Steel'] satisfies BlendiModel[],
      required: true,
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: [5, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    rating: {
      type: Number,
      required: false,
      min: [1, 'errors.validation.number_range'],
      max: [5, 'errors.validation.number_range'],
      validate: {
        validator: (value: number | null | undefined) => value == null || Number.isInteger(value),
        message: 'errors.validation.integer',
      },
    },
  },
  {
    collection: 'blend_logs',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

blendLogSchema.index({ userId: 1, createdAt: -1 });

export const BlendLogModel = mongoose.model<IBlendLog>('BlendLog', blendLogSchema);