# CP2.3-C — Daily Missions System

This checkpoint implements the BLENDi Pulse daily-engagement loop: three missions generated per day from goal-specific weighted random pools, renewed on the user's own local date, integrated into the same six action surfaces introduced in CP2.3-A, and rendered in the HomeScreen with sequencing that coexists correctly with the CP2.3-B level-up celebration overlay.

## Files Created

### Shared

- [packages/shared/src/schemas/blendLog.ts](../../packages/shared/src/schemas/blendLog.ts): added the optional `fromFavoriteId` field to `createBlendLogSchema` so favorite-origin blends can be detected by the backend.
- [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts): added the mission-related XP event entries used by CP2.3-C.

Implementation note: although this checkpoint conceptually expands shared XP utilities, the current codebase does not have a shared file at `packages/shared/src/utils/xp.utils.ts`. The mission XP additions were implemented in [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts). Also, the implemented set contains ten mission-related XP entries when `missionBonus` is counted.

### Backend

- [apps/api/src/config/missionDefinitions.ts](../../apps/api/src/config/missionDefinitions.ts): defines `MISSION_DEFINITIONS`, `MISSION_POOLS`, and `FALLBACK_MISSION_TYPES`.
- [apps/api/src/models/DailyMission.ts](../../apps/api/src/models/DailyMission.ts): adds the `daily_missions` collection with a per-user-per-day unique index and 2-day TTL cleanup.
- [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts): implements mission generation, mission progress updates, completion XP, and full-day bonus XP.
- [apps/api/src/controllers/dailyMission.controller.ts](../../apps/api/src/controllers/dailyMission.controller.ts): exposes mission retrieval for the authenticated user.
- [apps/api/src/routes/dailyMissions.ts](../../apps/api/src/routes/dailyMissions.ts): registers `GET /daily-missions`.
- [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts): integrates progress updates for `makeBlend`, `hitProteinGoal`, `hitCalorieGoal`, and `makeBlendFromFavorite`.
- [apps/api/src/controllers/hydration.controller.ts](../../apps/api/src/controllers/hydration.controller.ts): integrates progress updates for `hitHydrationGoal`.
- [apps/api/src/controllers/supplementStack.controller.ts](../../apps/api/src/controllers/supplementStack.controller.ts): integrates progress updates for `completeSuppStack`.
- [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts): integrates progress updates for `usePulseAI`.
- [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts): integrates progress updates for `scanPantry`.
- [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts): integrates progress updates for `favoriteRecipe`.

### Mobile

- [apps/mobile/src/services/dailyMission.service.ts](../../apps/mobile/src/services/dailyMission.service.ts): adds the typed `GET /daily-missions` client.
- [apps/mobile/src/components/missions/MissionCard.tsx](../../apps/mobile/src/components/missions/MissionCard.tsx): adds the mission UI card with idle/completed visual states and animated progress.
- [apps/mobile/src/components/missions/MissionCompletionToast.tsx](../../apps/mobile/src/components/missions/MissionCompletionToast.tsx): adds the temporary completion celebration toast.
- [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx): adds the mission block, the query-diff completion detector, and the toast/level-up sequencing logic.
- [apps/mobile/src/services/blendLog.service.ts](../../apps/mobile/src/services/blendLog.service.ts): calls `handleMissionResponse(...)` after successful blend logging.
- [apps/mobile/src/services/hydration.service.ts](../../apps/mobile/src/services/hydration.service.ts): calls `handleMissionResponse(...)` after hydration logging.
- [apps/mobile/src/services/supplementStack.service.ts](../../apps/mobile/src/services/supplementStack.service.ts): calls `handleMissionResponse(...)` after supplement checks.
- [apps/mobile/src/services/pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts): calls `handleMissionResponse(...)` after successful Pulse AI responses.
- [apps/mobile/src/services/pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts): calls `handleMissionResponse(...)` after pantry analysis.
- [apps/mobile/src/services/favorites.service.ts](../../apps/mobile/src/services/favorites.service.ts): calls `handleMissionResponse(...)` after creating a brand-new favorite.
- [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts): adds `activeFavoriteId` to preserve favorite-origin context during the blend flow.
- [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx): forwards `fromFavoriteId` to `POST /blend-logs` when the active blend originated from a favorite.
- [apps/mobile/src/components/favorites/FavoriteCard.tsx](../../apps/mobile/src/components/favorites/FavoriteCard.tsx): remains the visible CTA surface whose `Start Blend` action participates in the favorite-to-blend mission flow through its screen-level caller.
- [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts): adds `handleMissionResponse(...)`, which invalidates the daily-missions query when a response explicitly lists updated mission types.

## Mission Pool Architecture

The mission generator is driven by four goal-specific weighted pools defined in [apps/api/src/config/missionDefinitions.ts](../../apps/api/src/config/missionDefinitions.ts).

### Muscle

- `makeBlend` weight `3`
- `hitProteinGoal` weight `3`
- `hitCalorieGoal` weight `2`
- `makeBlendFromFavorite` weight `2`
- `usePulseAI` weight `1`
- `favoriteRecipe` weight `1`

### Wellness

- `hitHydrationGoal` weight `3`
- `completeSuppStack` weight `3`
- `usePulseAI` weight `2`
- `makeBlend` weight `1`
- `scanPantry` weight `1`
- `favoriteRecipe` weight `1`

### Energy

- `hitCalorieGoal` weight `3`
- `hitHydrationGoal` weight `2`
- `makeBlend` weight `2`
- `usePulseAI` weight `1`
- `scanPantry` weight `1`
- `makeBlendFromFavorite` weight `1`

### Recovery

- `completeSuppStack` weight `3`
- `hitHydrationGoal` weight `3`
- `usePulseAI` weight `2`
- `makeBlend` weight `1`
- `favoriteRecipe` weight `1`
- `scanPantry` weight `1`

Each mission definition also carries title key, description key, requirement, XP reward type, and icon metadata through `MISSION_DEFINITIONS` in the same file.

## Dynamic Pool Filtering

Before random selection happens, [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts) filters the goal pool against the user's current account state.

The three pre-selection checks are:

1. Remove `completeSuppStack` if `supplementStack.filter(s => s.isActive).length === 0`.
2. Remove `makeBlendFromFavorite` if `Favorite.countDocuments({ userId }) === 0`.
3. Remove `scanPantry` if the user is free tier and `scanCount >= 3`.

After that filtering pass, the service verifies whether at least three distinct types remain. If not, it appends fallback mission types from `FALLBACK_MISSION_TYPES` in this priority order:

- `makeBlend`
- `usePulseAI`
- `hitHydrationGoal`

Fallback entries are added only if they are not already present, and the process stops as soon as the candidate set reaches three unique types.

## Weighted Random Selection Algorithm

Mission type selection in [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts) uses an expanded weighted array plus Fisher-Yates shuffle.

For example, a pool fragment such as:

```ts
[{ type: 'makeBlend', weight: 3 }, { type: 'hitProteinGoal', weight: 3 }]
```

first expands into:

```ts
['makeBlend', 'makeBlend', 'makeBlend', 'hitProteinGoal', 'hitProteinGoal', 'hitProteinGoal']
```

The full expanded array is then shuffled in place with Fisher-Yates, which runs in $O(n)$ time.

After shuffling, the generator walks the array from left to right and collects the first three unique types, skipping duplicates that appear later in the shuffled list.

That algorithm gives the system these guarantees:

- higher-weight types have higher probability of being selected
- higher weight never guarantees selection
- the same mission type can never appear twice on the same day because only unique types are collected

## missionProgress.service.ts Dependency Rules

This is the most important architectural rule in CP2.3-C.

[apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts) imports [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) to award mission XP. This is the only permitted direction between those two services.

[apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) must never import [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts) under any circumstance.

Controllers are the only layer allowed to know both services at the same time. That is the structural boundary that prevents circular imports during server bootstrap.

If this hierarchy is violated, the server risks circular dependency resolution at module load time, which can break initialization.

The `updateMissionProgress(...)` sequence is:

1. Compute the local mission date from the user's timezone.
2. Fetch or lazily generate the daily mission document through `findOrCreateDailyMission(...)`.
3. Find the mission by `type`.
4. If the mission is not present, return without error because that is a normal case when the triggered action is not part of today's three generated missions.
5. If the mission is already `completed`, return idempotently without re-awarding mission XP.
6. Run an atomic positional increment with `findOneAndUpdate(...)` and the `$` operator to increase `missions.$.progress`.
7. If the incremented mission now has `progress >= requirement`, mark `missions.$.completed = true` in a second guarded update and award mission XP through `awardXP(userId, 'mission{Type}', timezone)`.
8. Reconcile the day-level bonus through `reconcileMissionBonus(...)`.
9. If all three missions are completed and `bonusAwarded === false`, award `missionBonus` XP through `awardXP(...)` and then mark `bonusAwarded: true`.

This keeps XP assignment below mission orchestration in the dependency graph, while still allowing mission completion and full-day completion to reuse the same idempotent XP infrastructure from CP2.3-A.

## makeBlendFromFavorite Special Case

The `makeBlendFromFavorite` mission is the only mission type that spans navigation state, client store state, shared schema state, and backend request handling.

The complete flow is:

1. In [apps/mobile/src/screens/FavoritesListScreen.tsx](../../apps/mobile/src/screens/FavoritesListScreen.tsx), starting a blend from a favorite navigates to the Blend tab with `{ recipe, favoriteId: item.id }`.
2. [apps/mobile/src/components/favorites/FavoriteCard.tsx](../../apps/mobile/src/components/favorites/FavoriteCard.tsx) is the visible CTA component whose `onStartBlend` callback is wired by the screen above.
3. In [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx), `route.params?.favoriteId` is read and forwarded into `setActiveFavoriteId(...)` on [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts).
4. When the user finishes the blend in `handleRateOrSkip(...)`, the request body for `POST /blend-logs` includes `fromFavoriteId: activeFavoriteId` whenever that store field is not `null`.
5. The field is validated by [packages/shared/src/schemas/blendLog.ts](../../packages/shared/src/schemas/blendLog.ts), which now includes optional `fromFavoriteId`.
6. In [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts), the controller checks for the presence of `fromFavoriteId` and conditionally appends `updateMissionProgress(userId, 'makeBlendFromFavorite', timezone)` to the `Promise.all(...)` mission update batch.

The store then clears `activeFavoriteId` on `completeBlend()` and `resetToFree()`, so favorite-origin context does not leak into future unrelated blends.

## HomeScreen Mission Block

The HomeScreen mission block is implemented in [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx).

In the current layout, it appears after Goal Rings and StreakBadge, and before the Quick Protocol Cards section. So from a broader navigation perspective it sits in the middle band between the metrics section and the quick-start actions.

Each mission is rendered through [apps/mobile/src/components/missions/MissionCard.tsx](../../apps/mobile/src/components/missions/MissionCard.tsx), which has two visual states:

- idle: translucent neutral card with the mission icon and progress fill in `colors.brand.pulse`
- completed: success-tinted card with a checkmark icon and success-colored fill

The animated state transitions use:

- `cardState` animated in `300ms` with `useNativeDriver: false`
- `progressValue` animated in `300ms` with `useNativeDriver: false`
- `iconState` animated separately in `200ms` with `useNativeDriver: true`

[apps/mobile/src/components/missions/MissionCompletionToast.tsx](../../apps/mobile/src/components/missions/MissionCompletionToast.tsx) runs this sequence:

- enters from `opacity: 0, translateY: -20` to `opacity: 1, translateY: 0` in `250ms`
- stays visible for `2000ms`
- exits with the inverse animation in `200ms`

Only after `onDismiss` fires does HomeScreen inspect `pendingLevelUp` in the gamification store and decide whether the level-up overlay should be released.

Implementation note: the toast is not triggered directly from mutation responses. HomeScreen compares the previous and current daily-missions query snapshots and detects newly completed missions by diffing `completed` flags. That query-diff mechanism is what drives `pendingMissionXP` and `showMissionToast`.

## Toast and Level-Up Sequencing

CP2.3-C reuses and expands the sequencing rule established in CP2.3-B.

When a mission completes and the same user action also causes a level-up:

1. The mission completion toast appears first.
2. It remains visible for `2` seconds.
3. After the toast dismisses, HomeScreen waits an additional `500ms`.
4. Only then does it call `triggerLevelUp(...)` and allow [apps/mobile/src/components/gamification/LevelUpCelebration.tsx](../../apps/mobile/src/components/gamification/LevelUpCelebration.tsx) to appear.

This sequencing is an explicit design decision to prevent the mission toast and the level-up overlay from competing for the same attention window.

Implementation note: this orchestration is strongest in the blend flow because [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts) is the only current controller that returns `missionsUpdated`, allowing [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts) to invalidate the daily-missions query immediately after the mutation. The other five controller integrations update mission progress on the backend, and the six mobile services already call `handleMissionResponse(...)`, but those responses currently do not include `missionsUpdated`, so the invalidation helper is a no-op for those paths today.