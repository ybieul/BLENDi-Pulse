# CP1.8 — My Stack, Track Tab, and History Endpoints

This checkpoint brings the Track tab to life with two concrete sections, detailed hydration tracking and a supplement checklist, implements My Stack as an array inside the user document with `SupplementLog` stored separately, extends `HydrationLog` and `SupplementLog` retention to 365 days so historical queries remain viable, and delivers the three history endpoints that later checkpoints consume for the full analytics surface.

## Supplement Stack Data Model

The supplement stack lives directly inside the user document in [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts) as the `supplementStack` array instead of being modeled as a separate top-level MongoDB collection.

That decision keeps the common path simple:

- reading the user's active stack is a single user lookup,
- updating the stack is a single document replacement operation,
- and the app gets effectively O(1) access to the user's current stack state from the same document that already holds the rest of the profile context.

Each stack item includes:

- `supplementId`
- `name`
- `dosage`
- `dailyTargetCount`
- `timing`
- `isActive`
- `order`

The backend generates `supplementId` with `crypto.randomUUID()` when a new item is introduced. `timing` is constrained to five enum values:

1. `morning`
2. `preWorkout`
3. `postWorkout`
4. `evening`
5. `withMeal`

Daily completion logs are intentionally stored separately in [apps/api/src/models/SupplementLog.ts](../../apps/api/src/models/SupplementLog.ts). That collection uses `logDate` as a normalized `YYYY-MM-DD` string so the database can enforce a single per-day document per supplement through a unique compound index.

## Atomicity in Check/Uncheck

The core anti-duplication guarantee for supplement taps lives in the unique compound index on [apps/api/src/models/SupplementLog.ts](../../apps/api/src/models/SupplementLog.ts):

```text
userId + supplementId + logDate
```

This means the database will never allow two separate log documents for the same user, supplement, and local day.

### Check Flow

`checkSupplement(...)` in [apps/api/src/controllers/supplementStack.controller.ts](../../apps/api/src/controllers/supplementStack.controller.ts) follows a two-layer strategy:

1. It first tries the ordinary path by reading the existing per-day log.
2. If no log exists, it attempts to create one with `consumedCount: 1`.
3. If MongoDB returns duplicate-key error `11000`, the handler loads the existing document instead of surfacing an error.

So while the current implementation includes a fast-path read, the race-condition safety still comes from the unique index plus duplicate-key recovery. Rapid taps cannot create duplicate daily documents.

### Uncheck Flow

`uncheckSupplement(...)` works against that same single per-day document and decrements the tracked count instead of deleting and recreating separate log rows. The model is therefore one mutable daily record per supplement, not one row per tap.

## TTL Migration Note

The historical-log retention window in CP1.8 was expanded from 90 days to 365 days. In the current codebase, both [apps/api/src/models/HydrationLog.ts](../../apps/api/src/models/HydrationLog.ts) and [apps/api/src/models/SupplementLog.ts](../../apps/api/src/models/SupplementLog.ts) use `31536000` seconds, which is 365 days.

MongoDB TTL changes are not retroactive for an existing index definition. Updating the schema constant alone does not update the already-created Atlas index for production data.

For production environments, the operational migration reference is [docs/phase-1/cp1.8-migration-notes.md](../../docs/phase-1/cp1.8-migration-notes.md). The required Atlas procedure is to drop the previous TTL index and recreate it with `expireAfterSeconds: 31536000` using `dropIndex(...)` and `createIndex(...)`.

## History Endpoints

CP1.8 adds the three history endpoints that the later analytics UI depends on. All three align their date windows to the user's timezone rather than raw UTC calendar days.

### GET /blend-logs/history

Declared in [apps/api/src/routes/blendLogs.ts](../../apps/api/src/routes/blendLogs.ts) and implemented in [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts), this endpoint returns:

- paginated raw logs,
- `summary` totals and averages,
- `dailyBreakdown` grouped by local day,
- and pagination metadata.

It uses the user's timezone when converting `createdAt` into the local `YYYY-MM-DD` bucket for aggregations.

### GET /hydration-logs/history

Declared in [apps/api/src/routes/hydrationLogs.ts](../../apps/api/src/routes/hydrationLogs.ts) and implemented in [apps/api/src/controllers/hydration.controller.ts](../../apps/api/src/controllers/hydration.controller.ts), this endpoint returns:

- paginated hydration logs,
- `summary.totalMl`,
- `summary.averageDailyMl`,
- `dailyBreakdown`,
- the daily hydration target,
- and pagination metadata.

It also groups by user-local day through timezone-aware date bucketing.

### GET /supplement-logs/history

Declared in [apps/api/src/routes/supplementLogs.ts](../../apps/api/src/routes/supplementLogs.ts) and implemented in [apps/api/src/controllers/supplementLog.controller.ts](../../apps/api/src/controllers/supplementLog.controller.ts), this endpoint returns one day-level record per local day containing:

- `checkedSupplements`,
- `missedSupplements`,
- and `adherenceRate` for that day,

plus a summary with `averageAdherence` across the requested window.

### Shared Validation

All three history endpoints validate `from`, `to`, `page`, and `limit` through `historyQuerySchema` in [packages/shared/src/schemas/supplementStack.ts](../../packages/shared/src/schemas/supplementStack.ts).

The schema caps the requested interval to 365 days, which prevents excessively wide historical queries from turning into expensive unbounded scans.

## Track Navigator

The Track tab uses its own internal stack navigator in [apps/mobile/src/navigation/TrackNavigator.tsx](../../apps/mobile/src/navigation/TrackNavigator.tsx), following the same pattern introduced earlier for Pulse AI.

The checkpoint foundation is:

1. `TrackMain` as the initial route
2. `ManageStack` stacked above it

That structure lets the user manage supplements without leaving the Track tab or losing the current hydration and checklist context underneath.

The current codebase already goes one step further and also mounts `History` on the same stack, which prepares the navigator for the later history UI without changing the core CP1.8 decision.

## 7-Day Inline History

The hydration block in [apps/mobile/src/components/track/HydrationSection.tsx](../../apps/mobile/src/components/track/HydrationSection.tsx) includes an inline 7-day bar chart rendered from hydration history data.

In [apps/mobile/src/screens/TrackScreen.tsx](../../apps/mobile/src/screens/TrackScreen.tsx), that chart is powered by a dedicated history query rather than reusing the “today” hydration query.

The query key is currently materialized as:

```text
[...QUERY_KEYS.hydrationHistory, historyTimezone, '7days']
```

This is slightly more specific than the simplified checkpoint wording `[QUERY_KEYS.hydrationHistory, '7days']` because the live code also includes the timezone in the key. The important outcome is the same: the 7-day inline history query is isolated from `QUERY_KEYS.hydrationToday`, so the chart cache does not collide with the single-day hydration cache.

## Pending Items

The full history charts and the dedicated history visualization surface land in CP1.10. CP1.8 provides the data model, stack navigation foundation, and 7-day inline hydration slice that those later screens build on.