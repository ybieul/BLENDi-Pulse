import { z } from 'zod';

export const shoppingListItemSourceSchema = z.enum(['manual', 'recipe'], {
  required_error: 'errors.validation.required',
  message: 'errors.validation.invalid_option',
});

export const createShoppingListSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(80, 'errors.validation.too_long'),
});

export const updateShoppingListSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(80, 'errors.validation.too_long')
    .optional(),
  isArchived: z.boolean().optional(),
});

export const shoppingListItemSchema = z.object({
  itemId: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .optional(),
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(100, 'errors.validation.too_long'),
  quantity: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .max(50, 'errors.validation.too_long')
    .optional(),
  checked: z.boolean().default(false),
  source: shoppingListItemSourceSchema.default('manual'),
});

export const updateItemsSchema = z.array(shoppingListItemSchema, {
  required_error: 'errors.validation.required',
  invalid_type_error: 'errors.validation.invalid_option',
}).max(100, 'errors.validation.too_long');

export type ShoppingListItemSource = z.infer<typeof shoppingListItemSourceSchema>;
export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
export type UpdateShoppingListInput = z.infer<typeof updateShoppingListSchema>;
export type UpdateItemsInput = z.infer<typeof updateItemsSchema>;

export interface ShoppingListItem {
  itemId: string;
  name: string;
  quantity?: string;
  checked: boolean;
  addedAt: string;
  source: ShoppingListItemSource;
}

export interface ShoppingListSummary {
  id: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  pendingItems: number;
}

export interface ShoppingListDetail extends ShoppingListSummary {
  items: ShoppingListItem[];
}
