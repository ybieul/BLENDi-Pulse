import { randomUUID } from 'node:crypto';
import mongoose, { type Document } from 'mongoose';

const shoppingListItemSourceValues = ['manual', 'recipe'] as const;

export type ShoppingListItemSource = (typeof shoppingListItemSourceValues)[number];

export interface IShoppingListItem {
  itemId: string;
  name: string;
  quantity?: string;
  checked: boolean;
  addedAt: Date;
  source: ShoppingListItemSource;
}

export interface IShoppingList {
  userId: mongoose.Types.ObjectId;
  name: string;
  items: IShoppingListItem[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ShoppingListDocument = Document<unknown, object, IShoppingList> & IShoppingList;

const shoppingListItemSchema = new mongoose.Schema<IShoppingListItem>(
  {
    itemId: {
      type: String,
      required: [true, 'errors.validation.required'],
      default: () => randomUUID(),
      immutable: true,
    },
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      minlength: [1, 'errors.validation.required'],
      maxlength: [100, 'errors.validation.too_long'],
    },
    quantity: {
      type: String,
      required: false,
      trim: true,
    },
    checked: {
      type: Boolean,
      default: false,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: shoppingListItemSourceValues,
    },
  },
  {
    _id: false,
  }
);

const shoppingListSchema = new mongoose.Schema<IShoppingList>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      minlength: [1, 'errors.validation.required'],
      maxlength: [80, 'errors.validation.too_long'],
    },
    items: {
      type: [shoppingListItemSchema],
      default: [],
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'shopping_lists',
    timestamps: true,
  }
);

shoppingListSchema.index({ userId: 1, isArchived: 1 });
shoppingListSchema.index({ userId: 1, updatedAt: -1 });

export const ShoppingListModel = mongoose.model<IShoppingList>('ShoppingList', shoppingListSchema);
