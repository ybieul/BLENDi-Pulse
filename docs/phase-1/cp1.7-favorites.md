# CP1.7 — Favorites System

This checkpoint completes the loop started in CP1.5: the favorite button on the Pulse AI recipe card already existed with optimistic UI feedback, but without real persistence behind it. CP1.7 adds the MongoDB `Favorite` model with full recipe storage, three REST endpoints with ownership verification, a dedicated Favorites screen backed by FlashList and optimistic removal through LayoutAnimation, and an internal Pulse AI stack navigator so favorites can open above the chat without losing chat context.

## Files Created

| File | Description |
|---|---|
| [apps/api/src/models/Favorite.ts](../../apps/api/src/models/Favorite.ts) | MongoDB favorite model that stores the complete recipe payload plus the user's BLENDi model and goal context. |
| [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts) | Implements `getFavorites(...)`, `addFavorite(...)`, and `removeFavorite(...)`, including duplicate handling and ownership checks. |
| [apps/api/src/routes/favorites.ts](../../apps/api/src/routes/favorites.ts) | Declares the three authenticated REST endpoints for listing, creating, and deleting favorites. |
| [apps/mobile/src/services/favorites.service.ts](../../apps/mobile/src/services/favorites.service.ts) | Mobile API layer for loading, adding, removing, and toggling favorites, including translation-key-aware error mapping. |
| [apps/mobile/src/hooks/useFavorites.ts](../../apps/mobile/src/hooks/useFavorites.ts) | React Query hooks that expose the favorites list and invalidate the cached list after writes. |
| [apps/mobile/src/components/pulseAi/RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx) | Existing recipe card upgraded from optimistic-only UI to real add/remove favorite mutations. |
| [apps/mobile/src/components/favorites/FavoriteCard.tsx](../../apps/mobile/src/components/favorites/FavoriteCard.tsx) | Compact card used by the favorites list with Start Blend and remove actions. |
| [apps/mobile/src/screens/FavoritesListScreen.tsx](../../apps/mobile/src/screens/FavoritesListScreen.tsx) | Favorites screen implementation using FlashList, optimistic removal, stale indicator, and empty/error states. |
| [apps/mobile/src/navigation/PulseAINavigator.tsx](../../apps/mobile/src/navigation/PulseAINavigator.tsx) | Internal stack navigator for the Pulse AI tab, mounting chat first and favorites above it. |

## Data Denormalization Decision

The `Favorite` model in [apps/api/src/models/Favorite.ts](../../apps/api/src/models/Favorite.ts) stores the full recipe payload instead of just a pointer to the Pulse AI cache.

That decision is intentional.

- The Pulse AI cache in `ai_cache` has a 7-day TTL.
- A favorite is expected to outlive the cache that originally produced it.
- If favorites only stored a reference to `ai_cache`, the recipe would disappear as soon as the cached source document expired.

By denormalizing and storing the complete recipe object directly in the `favorites` collection, the user keeps the favorited recipe indefinitely, independent of the 7-day AI cache lifecycle.

## Duplicate Prevention

Duplicate protection is implemented in two layers.

### Unique Compound Index

[apps/api/src/models/Favorite.ts](../../apps/api/src/models/Favorite.ts) defines a unique compound index on:

```text
userId + recipeName
```

This guarantees that the same user cannot persist the same recipe name twice at the database level.

### Friendly Handler Behavior

The `addFavorite(...)` handler in [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts) first checks for an existing document with `findOne(...)`.

If the favorite already exists, the handler returns:

- HTTP `200`
- the existing document
- `alreadyExists: true`

instead of returning a `409 Conflict`.

That behavior absorbs the common double-tap case without surfacing an error to the user. The controller also includes a duplicate-key fallback branch after `create(...)`, so even a rare race still resolves to the same friendly `200 + alreadyExists: true` response.

## Ownership Verification

Deletion is guarded by explicit ownership verification in `removeFavorite(...)` inside [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts).

The flow is:

1. Validate that `:id` is a valid Mongo ObjectId.
2. Load the target favorite document.
3. Compare `favorite.userId` against the authenticated user id from the JWT.
4. If they do not match, return `403 Forbidden` with code `favorites/forbidden`.
5. Only delete when ownership matches.

This prevents one authenticated user from deleting another user's favorite even if they somehow obtain the document id.

## Optimistic UI with LayoutAnimation

The optimistic-removal flow is implemented in [apps/mobile/src/screens/FavoritesListScreen.tsx](../../apps/mobile/src/screens/FavoritesListScreen.tsx).

### Removal Sequence

1. The user presses remove on a favorite card.
2. `LayoutAnimation.configureNext(...)` is triggered before local state changes.
3. The favorite id is added to `pendingRemovals`, so the item disappears immediately from `displayedFavorites`.
4. The DELETE mutation runs in the background through `useRemoveFavorite()`.
5. The remaining cards smoothly reorganize because LayoutAnimation already wrapped the list update.

### Failure Recovery

If the DELETE request fails:

- LayoutAnimation is configured again,
- the item id is removed from `pendingRemovals`,
- the card is restored to the list,
- and an error toast is shown.

This gives the user the speed of optimistic UI without silently losing state when the server write fails.

## PulseAI Navigator

The Pulse AI tab needed its own stack navigator because Favorites is not a sibling tab; it is a detail flow that should open above the chat and preserve the active chat context underneath.

That stack is implemented in [apps/mobile/src/navigation/PulseAINavigator.tsx](../../apps/mobile/src/navigation/PulseAINavigator.tsx) with two routes:

1. `PulseAIChat` as the initial route
2. `Favorites` as the stacked detail route

This lets the user enter Favorites from the chat header, inspect saved recipes, and return to the exact chat state they left, instead of bouncing through a separate top-level tab.

## Offline Behavior

Favorite reads are designed to work offline from persisted query state.

- `favorites` is part of `PERSISTABLE_QUERY_KEYS` in [apps/mobile/src/config/cache.config.ts](../../apps/mobile/src/config/cache.config.ts).
- The React Query persister in [apps/mobile/src/config/queryClient.ts](../../apps/mobile/src/config/queryClient.ts) stores that query snapshot in MMKV.
- `useFavorites()` applies `staleTime: CACHE_CONFIG.FAVORITES_TTL`, which is 30 days.

In practice, that means previously fetched favorites can be reopened offline from MMKV for up to 30 days.

Write operations intentionally do not use an offline queue.

- In [apps/mobile/src/components/pulseAi/RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx), add/remove is blocked when `isConnected` is false and a toast is shown.
- In [apps/mobile/src/screens/FavoritesListScreen.tsx](../../apps/mobile/src/screens/FavoritesListScreen.tsx), removal is also blocked offline with the same toast behavior.

That tradeoff is acceptable here because favorite writes are low-risk and easy for the user to repeat later, so Phase 1 avoids the complexity of a deferred write queue.

## Pending Items

No pending items. The favorites model, backend endpoints, duplicate protection, ownership verification, internal Pulse AI stack navigation, and offline read persistence are complete for this checkpoint.