// apps/api/src/models/HydrationLog.ts
// Registro de consumo de água do usuário.

import mongoose, { type Document } from 'mongoose';

const HYDRATION_LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface IHydrationLog {
  userId: mongoose.Types.ObjectId;
  amountMl: number;
  createdAt: Date;
}

export type HydrationLogDocument = Document<unknown, object, IHydrationLog> & IHydrationLog;

const hydrationLogSchema = new mongoose.Schema<IHydrationLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amountMl: {
      type: Number,
      default: 250,
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
  },
  {
    collection: 'hydration_logs',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

hydrationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: HYDRATION_LOG_TTL_SECONDS });
hydrationLogSchema.index({ userId: 1, createdAt: -1 });

export const HydrationLogModel = mongoose.model<IHydrationLog>('HydrationLog', hydrationLogSchema);