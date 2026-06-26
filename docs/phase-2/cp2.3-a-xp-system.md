# CP2.3-A — XP System

This checkpoint implements the data layer and business logic for the BLENDi Pulse XP system, without any UI. `totalXP` is persisted in MongoDB at the user-account level, the `xp_logs` collection guarantees idempotency through a unique compound index, and the centralized [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) service is the only backend write path that mutates `totalXP`.

## Files Created

### Backend

- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts): added persisted `totalXP` with default `0` and optional `lastLevelUp` with `{ level, awardedAt }`.
- [apps/api/src/models/XPLog.ts](../../apps/api/src/models/XPLog.ts): added the `xp_logs` collection with TTL cleanup and the unique `userId + xpType + logDate` index.
- [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts): implemented the centralized `awardXP(...)` write path, level-up detection, duplicate protection, and level-up push notification dispatch.

### Shared

- [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts): added `calculateLevel`, `LEVEL_THRESHOLDS`, `LEVEL_NAMES`, `XP_EVENTS`, `XPEventType`, and `LevelInfo` as the shared source of truth for XP math.

### Existing Controllers Updated

- [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts): integrated synchronous XP awards for `blend`, `proteinGoal`, and `calorieGoal`, and returns the full XP response contract.
- [apps/api/src/controllers/hydration.controller.ts](../../apps/api/src/controllers/hydration.controller.ts): integrated background XP for `hydrationGoal` once the daily target is reached.
- [apps/api/src/controllers/supplementStack.controller.ts](../../apps/api/src/controllers/supplementStack.controller.ts): integrated background XP for `supplementGoal` once all active supplements are completed for the day.
- [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts): integrated background XP for successful Pulse AI usage on both cache-hit and fresh-generation paths.
- [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts): integrated background XP for successful pantry scans with usable ingredients.
- [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts): integrated background XP for newly saved favorites only when `alreadyExists === false`.

## Architecture Decision — totalXP in MongoDB

The core architectural decision in CP2.3-A was to persist `totalXP` in MongoDB instead of keeping XP only on the frontend in MMKV or Zustand.

If XP lived only in local mobile storage, uninstalling the app would erase the user's entire progression history. That is unacceptable for a gamification system whose job is to motivate consistent behavior over weeks and months. XP must survive device reinstalls, device changes, and ordinary app-state loss.

For that reason, [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts) stores `totalXP` directly on the user document, and [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) is the single backend path that increments it.

Level is intentionally not stored as a separate persisted field. It is a derived value computed deterministically by `calculateLevel(totalXP)` from [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts). That design has two practical benefits:

1. It avoids redundant state that can drift out of sync with `totalXP`.
2. If the threshold curve ever needs rebalancing, every user's current level is recalculated automatically from the same persisted `totalXP` without a data migration.

The mobile layer still keeps a local XP snapshot in [apps/mobile/src/store/gamification.store.ts](../../apps/mobile/src/store/gamification.store.ts), but that store is only a client cache for immediate UI updates. It is not the source of truth.

## level.utils.ts in Shared Package

[packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts) lives in the shared package rather than the backend because both runtime surfaces consume the exact same leveling rules.

- The backend uses it in [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) to detect whether an XP award crossed a level boundary.
- The backend also uses it in [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts) to include level information in the user profile response.
- The mobile imports the same shared function in places like [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx), [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx), and [apps/mobile/src/components/gamification/LevelDetailSheet.tsx](../../apps/mobile/src/components/gamification/LevelDetailSheet.tsx) so it can render the user's level locally without an extra backend-only calculation layer.

That shared placement creates a single source of truth: the level shown on mobile always matches the level calculated on the backend because both sides execute the same `calculateLevel(...)` function exported through [packages/shared/src/index.ts](../../packages/shared/src/index.ts).

For levels 1 through 10, the implemented thresholds are:

- Level 1: `0` XP
- Level 2: `100` XP
- Level 3: `250` XP
- Level 4: `500` XP
- Level 5: `850` XP
- Level 6: `1300` XP
- Level 7: `1850` XP
- Level 8: `2500` XP
- Level 9: `3250` XP
- Level 10: `4100` XP

Implementation note: the current code does not use the simplified formula `threshold[n] = threshold[n-1] + 1000 * (n - 10)`. For levels above 10, [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts) grows the threshold by a dynamic increment that starts at `1000` XP and increases by `100` XP per additional level above 10.

- Level 11: `5100` XP
- Level 12: `6200` XP
- Level 13: `7400` XP

In code, that is implemented as an iterative progression where each step adds `1000 + (currentLevel - 11) * 100` on top of the previous threshold.

The exported `LevelInfo` interface returns these fields:

- `level`
- `levelNameKey`
- `xpForCurrentLevel`
- `xpForNextLevel`
- `progress`
- `xpToNextLevel`

`LEVEL_NAMES` stores translation keys rather than already-localized strings, which lets mobile and backend-adjacent consumers resolve the displayed level name through their own i18n layer.

## XPLog Idempotency Strategy

Idempotency is implemented in [apps/api/src/models/XPLog.ts](../../apps/api/src/models/XPLog.ts) through the `xp_logs` collection. The collection keeps two log-date strategies under the same unique compound index.

For types that must only award once per local day, the `logDate` is stored as a plain `YYYY-MM-DD` key in the user's timezone. The CP2.3-A controller integrations that rely on this daily uniqueness include:

- `proteinGoal`
- `calorieGoal`
- `hydrationGoal`
- `supplementGoal`
- `missionBonus`

More generally, any XP type not included in `MULTI_OCCURRENCE_XP_TYPES` follows this day-scoped strategy, which is why the same index also works for mission XP awarded through [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts).

For multi-occurrence types, the service appends a millisecond timestamp suffix, producing keys like `YYYY-MM-DD_1747176234000`. The current multi-occurrence set is:

- `blend`
- `pulseAi`
- `favoriteRecipe`
- `pantryScanner`

This means the unique index on `userId + xpType + logDate` prevents double-awarding a same-day unique event such as `proteinGoal`, while still allowing repeated awards for legitimate multi-occurrence actions such as multiple blends or multiple Pulse AI requests on the same day.

The model also applies a TTL index on `createdAt` with `172800` seconds, so logs automatically expire after 2 days once they are no longer needed for idempotency.

## awardXP Service Sequence

The `awardXP(...)` flow in [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) follows a strict sequence.

1. Compute `logDate` through `buildLogDate(xpType, timezone)`, which uses `YYYY-MM-DD` for day-unique types and `YYYY-MM-DD_<timestamp>` for multi-occurrence types.
2. Resolve the XP amount through `customAmount ?? XP_EVENTS[xpType]`, then validate that it is a positive integer.
3. Attempt `XPLogModel.insertOne({ userId, xpType, logDate, amount })` inside a `try/catch`.
4. If MongoDB raises duplicate-key error `11000`, treat it as the normal idempotent path: read the current user's `totalXP` and return `{ awarded: false, amount: 0, newTotalXP, leveledUp: false, newLevel: null }`.
5. If the insert succeeds, run `UserModel.findOneAndUpdate(..., { $inc: { totalXP: amount } }, { new: true })` to apply the award atomically and fetch the updated user snapshot.
6. Compute `levelBefore` as `calculateLevel(newTotalXP - amount)` and `levelAfter` as `calculateLevel(newTotalXP)`.
7. If `levelAfter.level > levelBefore.level`, compare it against `lastLevelUp.level` to avoid duplicate level-up side effects under race conditions.
8. Persist `lastLevelUp` only if the user has not already recorded that same or higher level in a competing request.
9. If that persistence actually modifies the user record, send the level-up push notification through [apps/api/src/services/pushNotification.service.ts](../../apps/api/src/services/pushNotification.service.ts) and then clean invalid Expo tokens.
10. Return `{ awarded, amount, newTotalXP, leveledUp, newLevel }`, where `newLevel` is the new numeric level only when a level boundary was crossed.

That sequence is what makes the service safe under retries and concurrent requests: the XP log insert protects the write, while the secondary `lastLevelUp` check protects the level-up notification.

## Six Controllers Integration Table

| Controller | Tipo de XP | Valor | Condição de Disparo | Modo de Execução |
| --- | --- | ---: | --- | --- |
| `blendLog` | `blend` | `10 XP` | Sempre que um blend é criado com sucesso | Síncrono em `Promise.all(...)` |
| `blendLog` | `proteinGoal` | `8 XP` | Se a proteína total do dia, já incluindo o blend recém-criado, for `>= dailyProteinTarget` | Síncrono em `Promise.all(...)` |
| `blendLog` | `calorieGoal` | `5 XP` | Se as calorias totais do dia, já incluindo o blend recém-criado, forem `>= dailyCalorieTarget` | Síncrono em `Promise.all(...)` |
| `hydration` | `hydrationGoal` | `5 XP` | Se o total de água do dia for `>= dailyHydrationTarget` | Background fire-and-forget via `Promise.resolve().then(...)` |
| `supplementStack` | `supplementGoal` | `5 XP` | Se todos os suplementos ativos estiverem completos no dia | Background fire-and-forget via `Promise.resolve().then(...)` |
| `pulseAi` | `pulseAi` | `3 XP` | Após resposta bem-sucedida do Pulse AI, tanto em cache-hit quanto em geração nova | Background fire-and-forget via `Promise.resolve().then(...)` |
| `pantryScanner` | `pantryScanner` | `5 XP` | Após análise com pelo menos um ingrediente utilizável | Background fire-and-forget via `Promise.resolve().then(...)` |
| `favorite` | `favoriteRecipe` | `2 XP` | Somente quando o favorito é criado e `alreadyExists === false` | Background fire-and-forget via `Promise.resolve().then(...)` |

Only [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts) waits for `awardXP(...)` inline. The other five controllers deliberately decouple XP awarding from the request critical path.

## Dependency Hierarchy

The write-path hierarchy around XP is intentionally one-way.

At its core, [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) depends on:

- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts)
- [apps/api/src/models/XPLog.ts](../../apps/api/src/models/XPLog.ts)
- `calculateLevel`, `XP_EVENTS`, and `XPEventType` from [packages/shared/src/utils/level.utils.ts](../../packages/shared/src/utils/level.utils.ts)
- `getMidnightUTC` from [apps/api/src/utils/timezone.utils.ts](../../apps/api/src/utils/timezone.utils.ts)
- `sendNotificationBatch(...)` and `cleanInvalidTokens(...)` from [apps/api/src/services/pushNotification.service.ts](../../apps/api/src/services/pushNotification.service.ts) because level-up notifications are emitted directly from the XP service

Just as important are the dependencies it does not have:

- [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) does not import any controller.
- [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts) does not import [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts).
- Controllers import `awardXP(...)`, and [apps/api/src/services/missionProgress.service.ts](../../apps/api/src/services/missionProgress.service.ts) also imports `awardXP(...)`; the reverse dependency never exists.

That hierarchy is the structural protection against circular dependencies. XP is the lower-level capability. Controllers and mission logic consume it; XP never reaches upward into request handlers or back into mission orchestration.

## Response Fields Added

CP2.3-A did not introduce a perfectly uniform response envelope across all six integrations.

The full trio of XP response fields appears in [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts):

- `xpAwarded` as number
- `leveledUp` as boolean
- `newLevel` as number or `null`

The other five controllers touched in CP2.3-A currently return `xpAwarded` only:

- [apps/api/src/controllers/hydration.controller.ts](../../apps/api/src/controllers/hydration.controller.ts)
- [apps/api/src/controllers/supplementStack.controller.ts](../../apps/api/src/controllers/supplementStack.controller.ts)
- [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts)
- [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts)
- [apps/api/src/controllers/favorite.controller.ts](../../apps/api/src/controllers/favorite.controller.ts)

On mobile, that asymmetry is absorbed by [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts). `handleXPResponse(...)` increments [apps/mobile/src/store/gamification.store.ts](../../apps/mobile/src/store/gamification.store.ts) immediately from `xpAwarded`, so total XP can update without an extra profile request. When `leveledUp` and `newLevel` are present, the same helper also stages the pending level-up state for the celebration UI.

In practice, that means CP2.3-A already supports no-extra-request XP updates across all six integrations, but only the blend-log mutation currently carries the explicit `leveledUp/newLevel` pair needed for an immediate in-app level-up reveal purely from the mutation response. Background-awarded paths still rely on the persisted `totalXP` source of truth and the level-up push-notification path inside [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts).