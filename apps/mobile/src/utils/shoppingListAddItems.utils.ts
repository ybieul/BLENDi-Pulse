import type {
  ShoppingListDetail,
  ShoppingListItem,
  ShoppingListSummary,
} from '@blendi/shared';
import type { QueryClient } from '@tanstack/react-query';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import {
  getListById,
  updateItems,
  type ShoppingListsResult,
} from '../services/shoppingList.service';
import { markListClean, markListDirty } from './shoppingListSync.utils';

export interface ShoppingListIngredientInput {
  name: string;
  quantity: string;
}

export interface AppendIngredientsResult {
  shoppingList: ShoppingListDetail;
  didSync: boolean;
}

function getShoppingListDetailKey(listId: string) {
  return [...QUERY_KEYS.shoppingListDetail, listId] as const;
}

function buildPendingSummary(detail: ShoppingListDetail): ShoppingListSummary {
  return {
    id: detail.id,
    name: detail.name,
    isArchived: detail.isArchived,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    totalItems: detail.totalItems,
    pendingItems: detail.pendingItems,
  };
}

function patchSummaryLists(
  summaries: ShoppingListSummary[],
  nextSummary: ShoppingListSummary,
): ShoppingListSummary[] {

  let changed = false;

  const nextSummaries = summaries.map((summary) => {
    if (summary.id !== nextSummary.id) {
      return summary;
    }

    changed = true;
    return {
      ...summary,
      ...nextSummary,
    };
  });

  return changed ? nextSummaries : summaries;
}

function patchShoppingListCaches(
  queryClient: QueryClient,
  shoppingList: ShoppingListDetail,
): void {
  const detailKey = getShoppingListDetailKey(shoppingList.id);
  const summary = buildPendingSummary(shoppingList);

  queryClient.setQueryData(detailKey, shoppingList);

  queryClient.setQueryData<ShoppingListsResult | undefined>(
    QUERY_KEYS.shoppingLists,
    (current) => {
      if (!current) {
        return current;
      }

      const nextLists = patchSummaryLists(current.lists, summary);

      return nextLists === current.lists
        ? current
        : {
            ...current,
            lists: nextLists,
          };
    },
  );

  queryClient.setQueryData<ShoppingListSummary[] | undefined>(
    QUERY_KEYS.shoppingListsArchived,
    (current) => (current ? patchSummaryLists(current, summary) : current),
  );
}

async function getCurrentShoppingList(
  queryClient: QueryClient,
  listId: string,
): Promise<ShoppingListDetail> {
  const detailKey = getShoppingListDetailKey(listId);
  const cachedDetail = queryClient.getQueryData<ShoppingListDetail>(detailKey);

  if (cachedDetail) {
    return cachedDetail;
  }

  return queryClient.fetchQuery({
    queryKey: detailKey,
    queryFn: () => getListById(listId),
    staleTime: CACHE_CONFIG.SHOPPING_LISTS_TTL,
  });
}

function buildOptimisticItems(
  currentItems: ShoppingListItem[],
  ingredients: ShoppingListIngredientInput[],
): ShoppingListItem[] {
  const timestamp = Date.now();

  const nextItems: ShoppingListItem[] = ingredients.map((ingredient, index) => ({
    itemId: `temp_${timestamp}${index}`,
    name: ingredient.name,
    quantity: ingredient.quantity,
    checked: false,
    addedAt: new Date(timestamp + index).toISOString(),
    source: 'recipe',
  }));

  return [...currentItems, ...nextItems];
}

function buildOptimisticDetail(
  currentDetail: ShoppingListDetail,
  nextItems: ShoppingListItem[],
): ShoppingListDetail {
  return {
    ...currentDetail,
    items: nextItems,
    totalItems: nextItems.length,
    pendingItems: nextItems.filter((item) => !item.checked).length,
    updatedAt: new Date().toISOString(),
  };
}

export async function appendIngredientsToShoppingList(
  queryClient: QueryClient,
  listId: string,
  ingredients: ShoppingListIngredientInput[],
): Promise<AppendIngredientsResult> {
  const currentDetail = await getCurrentShoppingList(queryClient, listId);
  const nextItems = buildOptimisticItems(currentDetail.items, ingredients);
  const optimisticDetail = buildOptimisticDetail(currentDetail, nextItems);

  patchShoppingListCaches(queryClient, optimisticDetail);

  try {
    const syncedShoppingList = await updateItems(listId, optimisticDetail.items);

    patchShoppingListCaches(queryClient, syncedShoppingList);
    markListClean(listId);

    return {
      shoppingList: syncedShoppingList,
      didSync: true,
    };
  } catch {
    markListDirty(listId);

    return {
      shoppingList: optimisticDetail,
      didSync: false,
    };
  }
}