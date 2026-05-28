# CP1.1 — Navigation System + Cache Config + persistQueryClient

This checkpoint establishes three foundations that every later Phase 1 slice depends on: the React Navigation routing system, the centralized cache configuration with adjustable TTLs, and offline persistence through React Query hydration with MMKV. Together, these pieces define how the app switches between public and authenticated flows, how long data is considered fresh, and which queries survive app restarts for resilient offline-first behavior.

## Files Created

| File | Description |
|---|---|
| [apps/mobile/src/navigation/types.ts](../../apps/mobile/src/navigation/types.ts) | TypeScript source of truth for root, auth, onboarding, tab, Pulse AI, and Track route params. |
| [apps/mobile/src/navigation/AuthNavigator.tsx](../../apps/mobile/src/navigation/AuthNavigator.tsx) | Public native-stack navigator that owns the unauthenticated flow. |
| [apps/mobile/src/navigation/AppNavigator.tsx](../../apps/mobile/src/navigation/AppNavigator.tsx) | Authenticated bottom-tab navigator with the five primary app destinations and the emphasized center Blend tab. |
| [apps/mobile/src/navigation/RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx) | Root native-stack switch that chooses between auth, onboarding, and app flows and applies the anti-flicker fade transition. |
| [apps/mobile/src/config/cache.config.ts](../../apps/mobile/src/config/cache.config.ts) | Centralized mobile cache constants, query keys, persistence whitelist, and animation timing values. |
| [apps/mobile/src/config/queryClient.ts](../../apps/mobile/src/config/queryClient.ts) | Configured QueryClient plus the MMKV-backed persister and persist options consumed by PersistQueryClientProvider. |
| [apps/api/src/models/AiCache.ts](../../apps/api/src/models/AiCache.ts) | MongoDB model for Pulse AI cache entries with a unique cache key and a 7-day TTL enforced through expiresAt. |
| [apps/api/src/services/cache.service.ts](../../apps/api/src/services/cache.service.ts) | Cache helpers responsible for generateCacheKey, getFromCache, setInCache, and invalidateUserCache. |
| [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts) | Existing user model updated to include scanCount and scanResetDate defaults; the current file also carries later Phase 1 counters added on top of this base. |

Although the persister plumbing lives in [apps/mobile/src/config/queryClient.ts](../../apps/mobile/src/config/queryClient.ts), the provider is mounted in [apps/mobile/App.tsx](../../apps/mobile/App.tsx) via PersistQueryClientProvider so the hydrated cache is available before the rest of the application tree renders.

## Navigation Architecture

### AuthStack

The public stack is defined in [apps/mobile/src/navigation/AuthNavigator.tsx](../../apps/mobile/src/navigation/AuthNavigator.tsx) and contains five screens in a straightforward native-stack flow:

1. Login
2. Register
3. ForgotPassword
4. VerifyOtp
5. ResetPassword

All screens render with headerShown disabled so each screen controls its own layout and branding without native-stack chrome.

### AppStack

The authenticated shell is defined in [apps/mobile/src/navigation/AppNavigator.tsx](../../apps/mobile/src/navigation/AppNavigator.tsx) as a five-tab bottom navigator. The tab order is fixed and intentional:

1. Home in position 1
2. PulseAI in position 2
3. Blend in the central position 3 with a larger icon shell
4. Track in position 4
5. Me in position 5

The center Blend tab is visually lifted through the larger icon container, circular border, and negative top offset, making the primary hardware action more prominent than the surrounding navigation destinations.

### Root Switching

The switching logic lives in [apps/mobile/src/navigation/RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx). The checkpoint foundation is the automatic transition between AuthNavigator and AppNavigator based on Zustand auth state, specifically `isAuthenticated`, with `animation: 'fade'` applied at the root stack level to avoid abrupt flashes during auth changes.

The current Phase 1 implementation goes one step further than the original CP1.1 scope and also branches into OnboardingFlow when `isNewUser` is true, plus a separate Upgrade screen once the authenticated shell is mounted. That expansion does not change the core CP1.1 contract: auth state still controls whether the user is in the public stack or inside the authenticated application shell.

## Cache Configuration

The mobile cache source of truth is [apps/mobile/src/config/cache.config.ts](../../apps/mobile/src/config/cache.config.ts). All TTLs are expressed in milliseconds because React Query and the MMKV persistence layer both consume millisecond-based timings.

| Constant | Value | Why this value exists |
|---|---|---|
| `PULSE_AI_RESPONSES_TTL` | `7 * 24 * 60 * 60 * 1000` = 7 days | Pulse AI responses are expensive to recompute, so a week-long TTL maximizes reuse while still allowing backend prompt improvements to age out naturally. |
| `FAVORITES_TTL` | `30 * 24 * 60 * 60 * 1000` = 30 days | Favorites change rarely outside explicit user actions, so a long TTL improves offline continuity with minimal consistency risk. |
| `BLEND_HISTORY_TTL` | `7 * 24 * 60 * 60 * 1000` = 7 days | Recent history benefits from local reuse, but should still refresh regularly enough to stay aligned with server truth. |
| `HYDRATION_TODAY_TTL` | `60 * 60 * 1000` = 1 hour | Same-day hydration data needs higher freshness than archival history, but does not require a refetch on every screen focus. |
| `SUPPLEMENT_STACK_TTL` | `24 * 60 * 60 * 1000` = 24 hours | Supplement configuration is stable during a typical day, so a daily TTL reduces redundant reads without hiding changes for long. |
| `USER_PROFILE_TTL` | `15 * 60 * 1000` = 15 minutes | Profile data is read often and should reflect edits fairly quickly, making a short TTL the right compromise. |
| `MAX_CACHED_RECIPES` | `20` | Caps locally retained recipe payloads so offline coverage improves without unbounded device storage growth. |

### QUERY_KEYS

The `QUERY_KEYS` object currently defines these root keys:

- `user`
- `userProfile`
- `blendHistory`
- `blendLogsToday`
- `favorites`
- `hydrationHistory`
- `hydrationToday`
- `supplementHistory`
- `supplementStack`
- `pulseAiHistory`

### MMKV Persistence Whitelist

Only a subset of query roots is persisted to MMKV through `PERSISTABLE_QUERY_KEYS` in [apps/mobile/src/config/cache.config.ts](../../apps/mobile/src/config/cache.config.ts):

- `user`
- `userProfile`
- `blendLogsToday`
- `favorites`
- `hydrationToday`
- `supplementStack`
- `pulseAiHistory`

This whitelist is enforced in [apps/mobile/src/config/queryClient.ts](../../apps/mobile/src/config/queryClient.ts) by checking the query root before dehydration. Large or highly time-sensitive histories such as `blendHistory`, `hydrationHistory`, and `supplementHistory` are intentionally excluded from offline persistence.

### persistQueryClient with MMKV

The QueryClient layer in [apps/mobile/src/config/queryClient.ts](../../apps/mobile/src/config/queryClient.ts) applies these baseline rules:

- `staleTime` defaults to 5 minutes
- `gcTime` is aligned with `FAVORITES_TTL`
- retry count is 2 with exponential backoff capped at 30 seconds
- MMKV is used as the backing store through `createSyncStoragePersister`
- persisted state uses the storage key `blendi_query_cache`
- `maxAge` for persisted queries is aligned with the 30-day favorites TTL

At runtime, [apps/mobile/App.tsx](../../apps/mobile/App.tsx) mounts `PersistQueryClientProvider` with `queryClient` and `persistOptions`, which makes hydration part of the app boot sequence instead of an ad hoc side effect.

## MongoDB Cache Collection

The persistent AI cache is defined in [apps/api/src/models/AiCache.ts](../../apps/api/src/models/AiCache.ts) and stored in the `ai_cache` collection.

### Schema Fields

| Field | Type | Purpose |
|---|---|---|
| `cacheKey` | string | Materialized unique key used for O(1) cache lookup. |
| `userId` | ObjectId | Owner of the cache entry. |
| `model` | string | Active BLENDi model at request time. |
| `goal` | string | Active user goal at request time. |
| `language` | string | Response language used to build the AI answer. |
| `messageHash` | string | SHA-256 of the normalized user message. |
| `dietaryFlags` | string[] | Normalized dietary modifiers reserved for broader prompt context. |
| `response` | object | Structured cached payload returned by the configured AI provider. |
| `expiresAt` | Date | Absolute expiration timestamp used by the TTL index. |
| `createdAt` | Date | Automatic creation timestamp. |

### Indexes

- Unique index on `cacheKey` for deterministic lookups and collision prevention.
- TTL index on `expiresAt` with `expireAfterSeconds: 0`, which makes MongoDB delete the document as soon as the expiration time is reached.

### Cache Key Structure

The original checkpoint intent can be summarized as a composed key of `userId:model:goal:language:messageHash:dietaryFlags`, separating cache entries by identity, personalization context, and normalized prompt content.

The current implementation in [apps/api/src/services/cache.service.ts](../../apps/api/src/services/cache.service.ts) is a stricter superset:

```text
userId:model:goal:language:unitSystem:aiProvider:aiModel:messageHash:dietaryFlagsHash
```

This evolution prevents false cache hits across metric versus imperial units, different AI providers, different models, and dietary flag combinations. The service also normalizes the raw message before hashing and hashes the sorted dietary flags array to keep the final key deterministic.

## Anti-flicker Pattern

The anti-flicker gate lives in [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts) through the Zustand field `isRestoringSession`.

Boot flow:

1. The auth store initializes with `isRestoringSession: true`.
2. [apps/mobile/App.tsx](../../apps/mobile/App.tsx) calls `restoreSession()` immediately after mount.
3. [apps/mobile/src/navigation/RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx) checks `isRestoringSession` before rendering any navigator.
4. While restoration is in progress, RootNavigator renders a dedicated splash state instead of AuthNavigator or AppNavigator.
5. Once refresh-token restoration finishes, the store flips `isRestoringSession` to false and the root stack fades into the correct flow.

This avoids the classic boot-time flash where the public auth stack appears for a frame before the restored authenticated session takes over.

## Pending Items

No pending items. The navigation shell, cache constants, offline persistence strategy, and MongoDB cache collection are complete and stable for the checkpoint scope.

## Validation

Confirm CP1.1 with these checks:

1. Launch the app with no session and verify that AuthNavigator renders first; then authenticate or simulate a restored session and confirm the transition into the authenticated shell uses a fade and does not flash the public stack in between.
2. Restart the app while a refresh token exists and verify RootNavigator holds the splash state during session restoration instead of briefly showing Login.
3. Open MongoDB Atlas for the `ai_cache` collection and confirm that the indexes list includes a unique `cacheKey` index and a TTL index on `expiresAt`.
4. Inspect the React Query cache behavior by relaunching the app offline and confirming that persisted roots such as `favorites`, `hydrationToday`, and `supplementStack` are rehydrated from MMKV without a network round trip.