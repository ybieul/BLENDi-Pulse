import mongoose, { type Document } from 'mongoose';

const DAILY_MISSION_TTL_SECONDS = 172800;
const missionDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export interface IDailyMissionItem {
  missionId: string;
  type: string;
  titleKey: string;
  descriptionKey: string;
  requirement: number;
  progress: number;
  completed: boolean;
  xpReward: number;
}

export interface IDailyMission {
  userId: mongoose.Types.ObjectId;
  missionDate: string;
  missions: [IDailyMissionItem, IDailyMissionItem, IDailyMissionItem];
  bonusAwarded: boolean;
  createdAt: Date;
}

export type DailyMissionDocument = Document<unknown, object, IDailyMission> & IDailyMission;

const dailyMissionItemSchema = new mongoose.Schema<IDailyMissionItem>(
  {
    missionId: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    titleKey: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    descriptionKey: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    requirement: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    progress: {
      type: Number,
      default: 0,
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    completed: {
      type: Boolean,
      default: false,
    },
    xpReward: {
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
    _id: false,
  }
);

const dailyMissionSchema = new mongoose.Schema<IDailyMission>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    missionDate: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [missionDatePattern, 'errors.validation.invalid_option'],
    },
    missions: {
      type: [dailyMissionItemSchema],
      required: [true, 'errors.validation.required'],
      validate: {
        validator: (missions: IDailyMissionItem[]) => Array.isArray(missions) && missions.length === 3,
        message: 'errors.validation.invalid_option',
      },
    },
    bonusAwarded: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'daily_missions',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

dailyMissionSchema.index({ createdAt: 1 }, { expireAfterSeconds: DAILY_MISSION_TTL_SECONDS });
dailyMissionSchema.index({ userId: 1, missionDate: 1 }, { unique: true });

export const DailyMissionModel = mongoose.model<IDailyMission>('DailyMission', dailyMissionSchema);
