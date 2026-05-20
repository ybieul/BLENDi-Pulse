import mongoose, { type Document } from 'mongoose';

const SUPPLEMENT_LOG_TTL_SECONDS = 31_536_000;

export interface ISupplementLog {
  userId: mongoose.Types.ObjectId;
  supplementId: string;
  supplementName: string;
  logDate: string;
  consumedCount: number;
  createdAt: Date;
}

export type SupplementLogDocument = Document<unknown, object, ISupplementLog> & ISupplementLog;

const supplementLogSchema = new mongoose.Schema<ISupplementLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    supplementId: {
      type: String,
      required: true,
      trim: true,
    },
    supplementName: {
      type: String,
      required: true,
      trim: true,
    },
    logDate: {
      type: String,
      required: true,
      trim: true,
    },
    consumedCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  {
    collection: 'supplement_logs',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

supplementLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: SUPPLEMENT_LOG_TTL_SECONDS });
supplementLogSchema.index({ userId: 1, createdAt: -1 });
supplementLogSchema.index({ userId: 1, supplementId: 1, logDate: 1 }, { unique: true });

export const SupplementLogModel = mongoose.model<ISupplementLog>('SupplementLog', supplementLogSchema);