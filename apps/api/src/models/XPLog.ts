import mongoose, { type Document } from 'mongoose';
import { XP_EVENTS, type XPEventType } from '@blendi/shared';

const XP_LOG_TTL_SECONDS = 172_800;
const xpLogDatePattern = /^\d{4}-\d{2}-\d{2}(?:_\d+)?$/;
const xpEventTypeValues = Object.keys(XP_EVENTS) as XPEventType[];

export interface IXPLog {
  userId: mongoose.Types.ObjectId;
  xpType: XPEventType;
  logDate: string;
  amount: number;
  createdAt: Date;
}

export type XPLogDocument = Document<unknown, object, IXPLog> & IXPLog;

const xpLogSchema = new mongoose.Schema<IXPLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    xpType: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: xpEventTypeValues,
    },
    // Convenção de idempotência do XP:
    // - eventos únicos por dia usam `YYYY-MM-DD`
    // - eventos multi-ocorrência (`blend`, `pulseAi`, `favoriteRecipe`, `pantryScanner`)
    //   usam `YYYY-MM-DD_<timestampEmMilissegundos>` para tornar cada ocorrência única
    //   sem depender de índices parciais mais complexos.
    logDate: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [xpLogDatePattern, 'errors.validation.invalid_option'],
    },
    amount: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
  },
  {
    collection: 'xp_logs',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

xpLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: XP_LOG_TTL_SECONDS });
xpLogSchema.index({ userId: 1, xpType: 1, logDate: 1 }, { unique: true, sparse: false });

export const XPLogModel = mongoose.model<IXPLog>('XPLog', xpLogSchema);
