import axios, { type AxiosError } from 'axios';
import type {
  CreateShoppingListInput,
  ShoppingListDetail,
  ShoppingListItem,
  ShoppingListSummary,
  UpdateItemsInput,
  UpdateShoppingListInput,
} from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
  upgradeRequired?: boolean;
}

interface ShoppingListsResponse {
  success: true;
  data: {
    lists: ShoppingListSummary[];
    canCreateMore: boolean;
  };
}

interface ShoppingListSummariesResponse {
  success: true;
  data: {
    lists: ShoppingListSummary[];
  };
}

interface ShoppingListDetailResponse {
  success: true;
  data: {
    shoppingList: ShoppingListDetail;
  };
}

interface DeleteListResponse {
  success: true;
  data: {
    message: string;
  };
}

interface ToggleItemCheckResponse {
  success: true;
  data: {
    item: ShoppingListItem;
  };
}

interface ClearCheckedItemsResponse {
  success: true;
  data: {
    removedCount: number;
    shoppingList: ShoppingListDetail;
  };
}

const SHOPPING_LIST_ERROR_TRANSLATION_KEYS = {
  'shoppinglist/free-tier-limit': 'errors.shoppingList_free_tier_limit',
} as const;

export interface ShoppingListsResult {
  lists: ShoppingListSummary[];
  canCreateMore: boolean;
}

export interface ClearCheckedItemsResult {
  removedCount: number;
  shoppingList: ShoppingListDetail;
}

export class ShoppingListServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string,
    public readonly upgradeRequired = false
  ) {
    super(message);
    this.name = 'ShoppingListServiceError';
  }
}

function getShoppingListPath(listId: string): string {
  return `/shopping-lists/${encodeURIComponent(listId)}`;
}

function getShoppingListErrorTranslationKey(apiCode?: string | null): string {
  const normalizedCode = apiCode?.trim().toLowerCase();

  if (normalizedCode && normalizedCode in SHOPPING_LIST_ERROR_TRANSLATION_KEYS) {
    return SHOPPING_LIST_ERROR_TRANSLATION_KEYS[
      normalizedCode as keyof typeof SHOPPING_LIST_ERROR_TRANSLATION_KEYS
    ];
  }

  return getApiErrorTranslationKey(apiCode);
}

function mapShoppingListErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
  if (error.code === 'ECONNABORTED') {
    return 'errors.network.timeout';
  }

  if (!error.response) {
    return 'errors.network.offline';
  }

  return getShoppingListErrorTranslationKey(error.response.data?.code);
}

function toShoppingListServiceError(error: unknown): ShoppingListServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    const normalizedCode = apiCode?.trim().toLowerCase();
    const upgradeRequired = error.response?.data?.upgradeRequired === true
      || normalizedCode === 'shoppinglist/free-tier-limit';

    return new ShoppingListServiceError(
      error.response?.data?.message ?? error.message,
      mapShoppingListErrorTranslationKey(error),
      apiCode,
      upgradeRequired,
    );
  }

  return new ShoppingListServiceError(
    'Unexpected shopping list service error.',
    'errors.network_internal_server_error',
  );
}

export async function getLists(): Promise<ShoppingListsResult> {
  try {
    const response = await api.get<ShoppingListsResponse>('/shopping-lists');
    return response.data.data;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function getArchivedLists(): Promise<ShoppingListSummary[]> {
  try {
    const response = await api.get<ShoppingListSummariesResponse>('/shopping-lists/archived');
    return response.data.data.lists;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function getListById(listId: string): Promise<ShoppingListDetail> {
  try {
    const response = await api.get<ShoppingListDetailResponse>(getShoppingListPath(listId));
    return response.data.data.shoppingList;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function createList(name: CreateShoppingListInput['name']): Promise<ShoppingListDetail> {
  try {
    const response = await api.post<ShoppingListDetailResponse>('/shopping-lists', { name });
    return response.data.data.shoppingList;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function updateList(
  listId: string,
  updates: UpdateShoppingListInput
): Promise<ShoppingListDetail> {
  try {
    const response = await api.patch<ShoppingListDetailResponse>(
      getShoppingListPath(listId),
      updates,
    );

    return response.data.data.shoppingList;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function deleteList(listId: string): Promise<void> {
  try {
    await api.delete<DeleteListResponse>(getShoppingListPath(listId));
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function updateItems(
  listId: string,
  items: UpdateItemsInput
): Promise<ShoppingListDetail> {
  try {
    const response = await api.put<ShoppingListDetailResponse>(
      `${getShoppingListPath(listId)}/items`,
      items,
    );

    return response.data.data.shoppingList;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function toggleItemCheck(
  listId: string,
  itemId: string
): Promise<ShoppingListItem> {
  try {
    const response = await api.patch<ToggleItemCheckResponse>(
      `${getShoppingListPath(listId)}/items/${encodeURIComponent(itemId)}/check`,
    );

    return response.data.data.item;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}

export async function clearCheckedItems(
  listId: string
): Promise<ClearCheckedItemsResult> {
  try {
    const response = await api.delete<ClearCheckedItemsResponse>(
      `${getShoppingListPath(listId)}/items/checked`,
    );

    return response.data.data;
  } catch (error) {
    throw toShoppingListServiceError(error);
  }
}