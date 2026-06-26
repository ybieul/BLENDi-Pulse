import { createAppStorage } from '../config/storage';

const SHOPPING_LIST_SYNC_STORAGE_ID = 'blendi-pulse';
const SHOPPING_LISTS_DIRTY_STORAGE_KEY = 'shopping_lists_dirty';

const shoppingListSyncStorage = createAppStorage(SHOPPING_LIST_SYNC_STORAGE_ID);

type DirtyShoppingListsMap = Record<string, boolean>;

function sanitizeDirtyShoppingListsMap(value: unknown): DirtyShoppingListsMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean',
    ),
  );
}

function readDirtyShoppingListsMap(): DirtyShoppingListsMap {
  const serializedDirtyFlags = shoppingListSyncStorage.getString(SHOPPING_LISTS_DIRTY_STORAGE_KEY);

  if (!serializedDirtyFlags) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(serializedDirtyFlags);
    return sanitizeDirtyShoppingListsMap(parsed);
  } catch {
    return {};
  }
}

function persistDirtyShoppingListsMap(dirtyFlags: DirtyShoppingListsMap): void {
  if (Object.keys(dirtyFlags).length === 0) {
    shoppingListSyncStorage.delete(SHOPPING_LISTS_DIRTY_STORAGE_KEY);
    return;
  }

  shoppingListSyncStorage.set(
    SHOPPING_LISTS_DIRTY_STORAGE_KEY,
    JSON.stringify(dirtyFlags),
  );
}

export function markListDirty(listId: string): void {
  const dirtyFlags = readDirtyShoppingListsMap();

  persistDirtyShoppingListsMap({
    ...dirtyFlags,
    [listId]: true,
  });
}

export function markListClean(listId: string): void {
  const dirtyFlags = readDirtyShoppingListsMap();

  persistDirtyShoppingListsMap({
    ...dirtyFlags,
    [listId]: false,
  });
}

export function getDirtyLists(): string[] {
  return Object.entries(readDirtyShoppingListsMap())
    .filter(([, isDirty]) => isDirty)
    .map(([listId]) => listId);
}

export function clearAllDirtyFlags(): void {
  shoppingListSyncStorage.delete(SHOPPING_LISTS_DIRTY_STORAGE_KEY);
}