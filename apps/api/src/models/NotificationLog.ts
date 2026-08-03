import mongoose, { type Document } from 'mongoose';

const NOTIFICATION_LOG_TTL_SECONDS = 259_200;
const notificationTypeValues = [
  'dailyPulse',
  'streakReminder',
  'supplementReminder',
  'hydrationReminder',
  'levelUp',
  'weeklyReport',
] as const;
const notificationDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export type NotificationType = (typeof notificationTypeValues)[number];

export interface INotificationLog {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  notificationDate: string;
  createdAt: Date;
}

export type NotificationLogDocument = Document<unknown, object, INotificationLog> & INotificationLog;

const notificationLogSchema = new mongoose.Schema<INotificationLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: notificationTypeValues,
    },
    notificationDate: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [notificationDatePattern, 'errors.validation.invalid_option'],
    },
  },
  {
    collection: 'notification_logs',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

notificationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_LOG_TTL_SECONDS });
notificationLogSchema.index({ userId: 1, type: 1, notificationDate: 1 }, { unique: true });

export const NotificationLogModel = mongoose.model<INotificationLog>(
  'NotificationLog',
  notificationLogSchema
);
