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

// Teto checado antes dos itens (CP-1.1.1d): com .max depois do array de
// objetos, o Zod validava os milhares de itens antes de recusar o tamanho e
// devolvia um issue por item. .pipe só roda a validação dos itens se o teto
// passou (mesmo padrão de dietaryPreferences em user.ts).
export const SHOPPING_LIST_MAX_ITEMS = 100;

export const updateItemsSchema = z
  .array(z.unknown(), {
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  })
  .max(SHOPPING_LIST_MAX_ITEMS, 'errors.validation.too_long')
  .pipe(z.array(shoppingListItemSchema));

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
