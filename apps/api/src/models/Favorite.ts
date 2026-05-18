import mongoose, { type Document } from 'mongoose';
import type { BlendiModel, UserGoal } from './User';

const blendiModelValues = ['Lite', 'ProPlus', 'Steel'] as const satisfies readonly BlendiModel[];
const userGoalValues = ['Muscle', 'Wellness', 'Energy', 'Recovery'] as const satisfies readonly UserGoal[];

export interface IFavoriteIngredient {
  name: string;
  amount: string;
}

export interface IFavorite {
  userId: mongoose.Types.ObjectId;
  recipeName: string;
  ingredients: IFavoriteIngredient[];
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  prepTimeSeconds: number;
  blendInstruction: string;
  tip?: string;
  hasSubstitutes: boolean;
  blendiModel: BlendiModel;
  goal: UserGoal;
  createdAt: Date;
  updatedAt: Date;
}

export type FavoriteDocument = Document<unknown, object, IFavorite> & IFavorite;

const favoriteIngredientSchema = new mongoose.Schema<IFavoriteIngredient>(
  {
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    amount: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const favoriteSchema = new mongoose.Schema<IFavorite>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    recipeName: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      maxlength: [100, 'errors.validation.too_long'],
    },
    ingredients: {
      type: [favoriteIngredientSchema],
      required: [true, 'errors.validation.required'],
      validate: {
        validator: (value: IFavoriteIngredient[] | null | undefined) => Array.isArray(value) && value.length > 0,
        message: 'errors.validation.required',
      },
    },
    protein: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    carbs: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    fat: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    calories: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    prepTimeSeconds: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    blendInstruction: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    tip: {
      type: String,
      required: false,
      trim: true,
    },
    hasSubstitutes: {
      type: Boolean,
      default: false,
    },
    blendiModel: {
      type: String,
      enum: blendiModelValues,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    goal: {
      type: String,
      enum: userGoalValues,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
  },
  {
    collection: 'favorites',
    timestamps: true,
  }
);

favoriteSchema.index({ userId: 1, createdAt: -1 });
favoriteSchema.index({ userId: 1, recipeName: 1 }, { unique: true });

export const FavoriteModel = mongoose.model<IFavorite>('Favorite', favoriteSchema);