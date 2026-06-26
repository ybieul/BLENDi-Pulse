# CP2.4 + CP2.4.1 — Shopping List

These two checkpoints implement the complete BLENDi Pulse Shopping List system: multiple lists per user, permanent database-backed history, free-tier versus Pro behavior, ingredient import from favorite recipes, and an offline strategy centered on final-state synchronization where that tradeoff is appropriate. CP2.4.1 was necessary because [apps/mobile/src/screens/ShoppingListDetailScreen.tsx](../../apps/mobile/src/screens/ShoppingListDetailScreen.tsx) was effectively empty after CP2.4, rendering only the background with no usable UI, so the entire detail screen had to be reimplemented from scratch.

## Files Created

### Backend

- [apps/api/src/models/ShoppingList.ts](../../apps/api/src/models/ShoppingList.ts): defines the `shopping_lists` collection, item subdocuments, and indexes for per-user filtering and updated-at sorting.
- [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts): implements the Shopping List REST handlers.
- [apps/api/src/routes/shoppingList.ts](../../apps/api/src/routes/shoppingList.ts): registers the Shopping List routes.

Implementation note: the current code exposes nine route handlers, not eight. The handler set is `getLists`, `getArchivedLists`, `getListById`, `createList`, `updateList`, `deleteList`, `updateItems`, `toggleItemCheck`, and `clearCheckedItems`.

### Shared

- [packages/shared/src/schemas/shoppingList.ts](../../packages/shared/src/schemas/shoppingList.ts): defines all request schemas and shared interfaces for Shopping List summaries, details, items, and mutations.

### Mobile

- [apps/mobile/src/services/shoppingList.service.ts](../../apps/mobile/src/services/shoppingList.service.ts): typed mobile client for the Shopping List API.
- [apps/mobile/src/utils/shoppingListSync.utils.ts](../../apps/mobile/src/utils/shoppingListSync.utils.ts): persists dirty-list flags in MMKV for reconnect synchronization.
- [apps/mobile/src/screens/ShoppingListsScreen.tsx](../../apps/mobile/src/screens/ShoppingListsScreen.tsx): list-of-lists UI with create, rename, archive, restore, delete, and free-tier upgrade flows.
- [apps/mobile/src/screens/ShoppingListDetailScreen.tsx](../../apps/mobile/src/screens/ShoppingListDetailScreen.tsx): fully reimplemented detail screen in CP2.4.1.
- [apps/mobile/src/components/shoppingList/ImportFromFavoritesSheet.tsx](../../apps/mobile/src/components/shoppingList/ImportFromFavoritesSheet.tsx): two-step import flow from saved favorites into a shopping list.
- [apps/mobile/src/components/shoppingList/AddToListSheet.tsx](../../apps/mobile/src/components/shoppingList/AddToListSheet.tsx): add-to-list selector and direct-add wrapper used from recipe and favorite surfaces.
- [apps/mobile/src/utils/shoppingListAddItems.utils.ts](../../apps/mobile/src/utils/shoppingListAddItems.utils.ts): optimistic append helper that patches React Query caches, attempts sync, and marks dirty lists on failure.

### Integration Updates

- [apps/mobile/src/navigation/TrackNavigator.tsx](../../apps/mobile/src/navigation/TrackNavigator.tsx): adds `ShoppingLists` and `ShoppingListDetail` to the Track stack.
- [apps/mobile/src/screens/TrackScreen.tsx](../../apps/mobile/src/screens/TrackScreen.tsx): adds the cart entry point and pending-item badge in the header.
- [apps/mobile/src/components/pulseAi/RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx): adds the cart CTA and `AddToListSheet` integration for AI recipes.
- [apps/mobile/src/components/favorites/FavoriteCard.tsx](../../apps/mobile/src/components/favorites/FavoriteCard.tsx): adds the cart CTA and `AddToListSheet` integration for favorites.
- [apps/mobile/src/utils/reconnectSync.utils.ts](../../apps/mobile/src/utils/reconnectSync.utils.ts): adds Shopping List reconnect synchronization as a fourth step after the older offline flows.

## Architecture Decision — Separate Collection

Shopping lists are stored in a dedicated `shopping_lists` collection through [apps/api/src/models/ShoppingList.ts](../../apps/api/src/models/ShoppingList.ts), not as an embedded array on the user document.

That decision is different from the `supplementStack` architecture for a reason. The supplement stack usually stays small and stable, often below 15 items. Shopping lists behave very differently:

- a single list can easily hold 30 to 60 items
- users can keep multiple lists over time
- item-level operations happen frequently

Putting those lists inside the user document would inflate one hot document with a growing, long-lived, multi-list history. Using a separate collection keeps list operations isolated and allows granular document updates without rewriting the user's full profile record.

That matters especially for operations like clearing checked items, which the backend performs with `$pull: { items: { checked: true } }` in [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts). Those granular item-array mutations are a better fit for dedicated list documents than for an oversized user document.

History is also intentionally permanent here. Unlike logs and caches that use TTL expiration, shopping lists have no TTL. They are stored indefinitely unless the user explicitly deletes them.

## Free Tier Limit Implementation

The free-tier rule is simple: free users can keep only one active shopping list at a time. Pro users bypass the restriction entirely.

The limit is enforced in three places.

### 1. `createList`

In [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts), `createList(...)` checks the number of active lists when `isPro === false`.

If `countDocuments({ userId, isArchived: false }) >= 1`, the controller returns:

- HTTP `403`
- code `shoppingList/free-tier-limit`
- `upgradeRequired: true`

### 2. `updateList` restore path

When an archived list is restored with `isArchived: false`, [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts) re-runs the same active-list count check before allowing the restore.

That prevents a free user from bypassing the one-list limit by archiving and restoring multiple lists.

### 3. Mobile UI gating

[apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts) returns `canCreateMore` from `getLists(...)`, and [apps/mobile/src/screens/ShoppingListsScreen.tsx](../../apps/mobile/src/screens/ShoppingListsScreen.tsx) uses that field to drive the visual create affordance.

- the header add button becomes visually disabled when `canCreateMore === false`
- tapping create opens the upgrade sheet instead of the create sheet
- restore also checks `canCreateMore` on the mobile side before attempting the mutation

Implementation note: [apps/mobile/src/components/shoppingList/AddToListSheet.tsx](../../apps/mobile/src/components/shoppingList/AddToListSheet.tsx) does not currently hide or gate its “Criar nova lista” action based on `canCreateMore`. The hard enforcement remains in the Shopping Lists screen and in the backend controller.

## Items Array Strategy

The item write path is centered on `PUT /shopping-lists/:listId/items`, implemented by `updateItems(...)` in [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts).

Instead of individual add/remove/update item endpoints, the system uses full-array replacement.

For each incoming item in the request body:

1. If it has `itemId` and that id does not start with `temp_`, the controller looks up the existing stored item by id.
2. If the existing item is found, it preserves both the original `itemId` and the original `addedAt` timestamp.
3. If the item has an id with prefix `temp_`, or no `itemId`, or the id is not found among existing items, the controller generates a new UUID through `randomUUID()` and sets `addedAt` to `new Date()`.

That logic lives in `normalizeStoredItem(...)` in [apps/api/src/controllers/shoppingList.controller.ts](../../apps/api/src/controllers/shoppingList.controller.ts).

This mirrors the same broader design philosophy used for `supplementStack`: the client edits a normalized in-memory array, and the backend replaces the stored version with a validated, normalized final array. It is simpler and safer than exposing many separate item mutation endpoints for reorder/add/edit/remove.

## CP2.4.1 — ShoppingListDetailScreen Reimplementation

### Why CP2.4.1 existed

The original CP2.4 version of [apps/mobile/src/screens/ShoppingListDetailScreen.tsx](../../apps/mobile/src/screens/ShoppingListDetailScreen.tsx) was effectively empty. The historical file state contained only a root `View` and [apps/mobile/src/components/ui/AuroraBackground.tsx](../../apps/mobile/src/components/ui/AuroraBackground.tsx), so opening the detail screen showed only the background color and no interactive content.

The follow-up commit that fixed it was isolated to this single file. Git history shows the CP2.4.1 change as a one-file rewrite with 726 insertions and 3 deletions.

### Local state architecture

The reimplemented screen uses a local mirrored state model:

- `localItems` is the local UI mirror of the query result
- a `useEffect` copies `data.items` from `getListById(listId)` into `localItems`
- `useMemo` derives `pendingItems` and `checkedItems` from `localItems`

The derived arrays are both sorted by descending `addedAt` via `sortItemsByAddedAtDesc(...)`, so recent additions stay visually prominent.

### Four core handlers

#### `handleToggleCheck`

- updates `localItems` optimistically in memory immediately
- if offline, marks the list dirty through `markListDirty(listId)` and shows a local-save toast
- if online, calls `toggleItemCheck(...)`
- on server failure, rolls back to the previous local array snapshot

#### `handleDeleteItem`

- removes the item immediately from `localItems`
- sends the full remaining array through `updateItems(...)` in the background
- on failure, restores the previous array and shows an error toast

#### `handleAddItem`

- builds a temporary item id with `temp_${Date.now()}`
- prepends the new item to the local array
- calls `updateItems(...)` with the full array
- on success, replaces local state with the server-normalized list and invalidates the detail and summary queries
- on failure, rolls back the optimistic insertion

#### `handleClearChecked`

- confirms the destructive action through `Alert.alert(...)`
- calls `clearCheckedItems(...)`
- on success, replaces `localItems` with the server-returned normalized list

### SectionList structure

The screen renders a dynamic `SectionList` with two conceptual sections:

- “Comprar” for unchecked items
- “No carrinho” for checked items

The implementation builds a two-section array and then filters out any section whose `data.length === 0`. That is why the checked section header is omitted entirely when there are no checked items, instead of showing an empty header block.

### Fixed footer input

The add-item composer is anchored at the bottom with:

- `position: 'absolute'`
- bottom padding derived from `useSafeAreaInsets()`
- a top fade gradient rendered by [expo-linear-gradient](../../apps/mobile/src/screens/ShoppingListDetailScreen.tsx)

The first 20 pixels above the footer are covered by a transparent-to-background fade strip, and the `SectionList` uses `contentContainerStyle.paddingBottom = 120` so content never disappears behind the fixed input row.

## Offline Shopping Strategy

The offline approach here is intentionally different from CP1.9.

Pending blends use a queue because losing a real completed blend log is unacceptable. Shopping list checks do not need event-by-event replay. What matters is the final visible list state.

That is why [apps/mobile/src/utils/shoppingListSync.utils.ts](../../apps/mobile/src/utils/shoppingListSync.utils.ts) stores a final-state dirty map in MMKV using this shape:

```ts
{ [listId]: boolean }
```

When a list is marked dirty, the current local React Query cache becomes the authoritative pending state.

On reconnect, [apps/mobile/src/utils/reconnectSync.utils.ts](../../apps/mobile/src/utils/reconnectSync.utils.ts) adds a fourth synchronization step:

1. read all dirty list ids through `getDirtyLists()`
2. for each `listId`, fetch the current cached detail state through `queryClient.getQueryData([...QUERY_KEYS.shoppingListDetail, listId])`
3. send `updateItems(listId, shoppingList.items)` with the full current array
4. if sync succeeds, mark the list clean
5. if sync fails, keep the dirty flag for the next reconnect attempt

This guarantees that no checkbox state is lost as long as the latest local cached array survives, because the reconnect path syncs the full final array rather than trying to replay individual toggle events.

Implementation note: the strongest offline support today covers checkbox toggles and the optimistic append helper used by recipe/favorite imports. Manual add and delete inside the detail screen still behave as online-first mutations with rollback on failure rather than deferred dirty-sync writes.

## Import from Favorites

[apps/mobile/src/components/shoppingList/ImportFromFavoritesSheet.tsx](../../apps/mobile/src/components/shoppingList/ImportFromFavoritesSheet.tsx) implements a two-step local-state flow:

- `selectRecipe`
- `selectIngredients`

In the first step, the user chooses one favorite recipe from the cached favorites query.

In the second step:

- all ingredients start pre-selected
- the user can uncheck ingredients they already have
- the selected ingredients are converted into shopping-list inputs using the original favorite ingredient amount as `quantity`

The actual append call goes through `appendIngredientsToShoppingList(...)`, which creates optimistic items with:

- `source: 'recipe'`
- `quantity` copied from the recipe/favorite ingredient amount field

There is intentionally no duplicate detection. If a user imports the same ingredient twice, cleanup is manual by design.

## AddToListSheet Logic

[apps/mobile/src/components/shoppingList/AddToListSheet.tsx](../../apps/mobile/src/components/shoppingList/AddToListSheet.tsx) handles the cart-button flow used by both [apps/mobile/src/components/pulseAi/RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx) and [apps/mobile/src/components/favorites/FavoriteCard.tsx](../../apps/mobile/src/components/favorites/FavoriteCard.tsx).

The decision tree is:

1. If the user has exactly one active list, the sheet does not open. The component auto-adds the ingredients directly to that list and shows a confirmation toast.
2. If the user has two or more active lists, the sheet opens and shows the available list options plus a create-new-list action.
3. If the user has zero active lists, the sheet opens into an empty state and still exposes the create-new-list action.

The direct-add path uses `appendIngredientsToShoppingList(...)`, which patches caches optimistically and then either syncs immediately or marks the list dirty.

Implementation note: the current component does not perform an explicit `canCreateMore` check before rendering the create-new-list action. It always renders the action button. The real free-tier enforcement remains on the dedicated Shopping Lists screen and in the backend `createList`/restore checks.

## Pending Items for Future Phases

The current Shopping List system is complete for Phase 2, but some adjacent roadmap items remain out of scope for these checkpoints.

- Direct purchase integration with Shopify belongs to Phase 3.
- List sharing via message and automatic ingredient suggestions from recipe history belong to Phase 5.