# CP3.4 — Relatório Semanal Pro

Most Pro benefits in BLENDi Pulse are felt by the *absence* of a limit — one more Pulse AI query, one more Pantry scan, one more active shopping list. The Weekly Report is different: it is something Pro subscribers actively receive, every Monday morning, without having to do anything. It is the feature most likely to make a subscriber notice, week after week, that the subscription is paying off — a generated report with their own numbers landing as a push notification rather than a limit quietly not being hit.

This checkpoint did not introduce a new subsystem so much as it wired together infrastructure from three earlier phases: the cron job platform from CP2.2, the SVG chart components from CP1.10, the Share Card mechanism from CP3.2, and the `isPro` flag from CP3.1.

## Files Created and Modified

### Backend

- [apps/api/src/models/WeeklyReport.ts](../../apps/api/src/models/WeeklyReport.ts): new file, the `weekly_reports` collection.
- [packages/shared/src/schemas/weeklyReport.ts](../../packages/shared/src/schemas/weeklyReport.ts): new file, 9 exported interfaces — `WeeklyReportBestDay`, `WeeklyReportHighlightRecipe`, `WeeklyReportNutrition`, `WeeklyReportHydration`, `WeeklyReportSupplements`, `WeeklyReportGamification`, `WeeklyReportData`, `WeeklyReportComparison`, and `WeeklyReportSummary`.
- [apps/api/src/services/weeklyReportGenerator.service.ts](../../apps/api/src/services/weeklyReportGenerator.service.ts): new file, `generateWeeklyReport()`.
- [apps/api/src/jobs/notifications.jobs.ts](../../apps/api/src/jobs/notifications.jobs.ts): added the fifth cron job, `runWeeklyReportJob()`.
- [apps/api/src/services/notificationContent.service.ts](../../apps/api/src/services/notificationContent.service.ts): extended with `getWeeklyReportContent()`.
- [apps/api/src/controllers/weeklyReport.controller.ts](../../apps/api/src/controllers/weeklyReport.controller.ts): new file, three handlers — `getLatestReport`, `getReportByWeek`, `getAllReportDates`.
- [apps/api/src/routes/weeklyReports.ts](../../apps/api/src/routes/weeklyReports.ts): new file, exposes `GET /weekly-reports/latest`, `GET /weekly-reports`, and `GET /weekly-reports/dates`.
- [apps/api/src/index.ts](../../apps/api/src/index.ts): mounted `/weekly-reports`.

### Mobile

- [apps/mobile/src/services/weeklyReport.service.ts](../../apps/mobile/src/services/weeklyReport.service.ts): new file.
- [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts): `processDeepLink()` extended to route the `weeklyReport` notification type to the root-level `WeeklyReport` screen.
- [apps/mobile/src/screens/WeeklyReportScreen.tsx](../../apps/mobile/src/screens/WeeklyReportScreen.tsx): new file.
- [apps/mobile/src/components/weeklyReport/HighlightRecipeCard.tsx](../../apps/mobile/src/components/weeklyReport/HighlightRecipeCard.tsx): new file, not part of the original planned file list but created to render the week's top-rated recipe.
- [apps/mobile/src/components/ui/GoalRing.tsx](../../apps/mobile/src/components/ui/GoalRing.tsx): extended with an `animate` prop so the same CP1.4 ring component can render a static, non-animating gauge for the supplement adherence section.
- [apps/mobile/src/navigation/RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx) and [apps/mobile/src/navigation/types.ts](../../apps/mobile/src/navigation/types.ts): registered `WeeklyReport` as a root-stack screen, alongside `Upgrade`.
- [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx): added the header entry point.

### Modified for this checkpoint's needs

- [apps/api/src/models/XPLog.ts](../../apps/api/src/models/XPLog.ts): TTL increased from 172,800 seconds (48h) to 7,776,000 seconds (90 days).
- [apps/api/src/models/DailyMission.ts](../../apps/api/src/models/DailyMission.ts): TTL increased from 172,800 seconds (48h) to 7,776,000 seconds (90 days).
- [apps/api/src/models/NotificationLog.ts](../../apps/api/src/models/NotificationLog.ts): `weeklyReport` added to the `type` enum.

## WeeklyReport Model

[apps/api/src/models/WeeklyReport.ts](../../apps/api/src/models/WeeklyReport.ts) defines the `weekly_reports` collection:

| Field | Notes |
|---|---|
| `userId` | Indexed |
| `weekStartDate` / `weekEndDate` | `YYYY-MM-DD` strings |
| `isProAtGeneration` | Boolean, captures the user's plan at the moment the report was generated — a retroactive audit snapshot, independent of the user's *current* plan |
| `data` | The aggregated report content, detailed below |
| `previousWeekComparison` | Optional; present only when a report for the immediately preceding week also exists |
| `createdAt` | TTL index at 90 days (`7_776_000` seconds) |

A unique compound index on `userId` + `weekStartDate` is the collection's idempotency guarantee: the cron job can run more than once inside the same hourly window without ever producing a duplicate report for the same user and week — a second attempt simply fails the unique-index write and is treated as "already generated," not as an error.

`data` has exactly four top-level sub-objects:

- **`nutrition`**: `blendCount`, `avgProteinPerDay`, `proteinGoalHitDays`, `calorieGoalHitDays`, `bestDay` (`{ date, proteinAmount }`), and an optional `highlightRecipe` (`{ name, protein, carbs, fat, calories, rating? }`) — populated only when at least one blend that week has both a rating and a recipe name.
- **`hydration`**: `totalMl`, `avgDailyMl`, `goalHitDays`, and `dailyBreakdown` — always exactly 7 numbers in chronological order, one per day of the week, with `0` for days with no hydration logs so the mobile chart never has to handle a missing index.
- **`supplements`**: `adherenceRate`, `perfectDays`, `bySupplementName` (a map from each active supplement's name to its 7-day check rate), `topSupplement`, and `bottomSupplement`.
- **`gamification`**: `xpEarned`, `currentLevel`, `missionsCompleted`, `blendDaysInWeek`, `currentStreak`, an optional `streakBrokenOnDate`, and `levelUpOccurred`.

There is no separate top-level `highlights` field — the highlighted recipe lives inside `nutrition.highlightRecipe`. The Weekly Report *screen* renders it as its own visual card, but it is not its own entry in the persisted data model.

## Architecture Corrections Applied During Implementation

The following adjustments were made during Claude's VS Code analysis, before any code was written, based on what the existing codebase actually supported. They are recorded here so future maintenance does not rediscover the same constraints from scratch.

1. **`XPLog` and `DailyMission` TTL raised from 172,800s (48h) to 7,776,000s (90 days).** The report generation cron runs on Monday and needs to aggregate XP and mission data for the entire previous week. A 48-hour TTL would have already deleted most of that week's documents by the time the cron ran. Idempotency for both models is guaranteed by their own unique indexes, not by the TTL, so lengthening it introduced no correctness risk.
2. **`streakAtStart` / `streakAtEnd` replaced with `blendDaysInWeek` and `streakBrokenOnDate`, both derived from `BlendLog`.** `User` does not store historical streak snapshots, only the current streak value, so there was nothing to read a "streak at the start of the week" from. Deriving the count of distinct blend days in the week and the first day a streak gap appears — both computable directly from that week's `BlendLog` entries — carries equivalent information without requiring a new field on `User`.
3. **The weekly report query is not persisted to MMKV.** An earlier draft of the requirements asked for local caching of the report query; that instruction conflicted with an explicit "do not" constraint that took precedence, so no MMKV persistence was added — the report is always fetched fresh through React Query.
4. **"PaywallScreen" corrected to `UpgradeScreen`**, the screen's actual name in the project (see CP3.1).
5. **"`preferredLanguage`" corrected to `user.locale`**, the actual field name on the `User` schema that the request-time language originally referenced.
6. **The cron follows the existing pattern instead of a day-of-week cron expression.** Like the four CP2.2 jobs, `runWeeklyReportJob` runs on `0 * * * *` (hourly) and checks each user's local Monday/9am window internally, rather than using a cron expression tied to a fixed UTC day and hour. A day-of-week cron expression cannot account for per-user timezones on its own.

## Cron Job and Notification

The fifth cron job, registered in [apps/api/src/jobs/notifications.jobs.ts](../../apps/api/src/jobs/notifications.jobs.ts), runs on `0 * * * *` — the same hourly cadence pattern as the four CP2.2 jobs. On every run, it converts the current time into each candidate user's local time and only proceeds for users where that local time falls in the Monday 9:00–9:59 window.

Three conditions gate report generation for a given user:

1. `isPro === true`.
2. A non-empty `pushToken` is set.
3. No `WeeklyReport` already exists for that user and the previous week's `weekStartDate` (checked via `WeeklyReportModel.exists(...)`, backed by the unique index described above).

When all three hold, [apps/api/src/services/weeklyReportGenerator.service.ts](../../apps/api/src/services/weeklyReportGenerator.service.ts)'s `generateWeeklyReport()` aggregates five independent sources in a single `Promise.all`: blend/nutrition totals, hydration totals, supplement adherence, XP earned, and completed missions. The first three of those map directly onto the `nutrition`, `hydration`, and `supplements` sub-objects; XP and missions are combined into the single `gamification` sub-object together with streak data derived from the same nutrition aggregation.

`getWeeklyReportContent()` in [apps/api/src/services/notificationContent.service.ts](../../apps/api/src/services/notificationContent.service.ts) then picks the notification's body from a fixed priority hierarchy — the first condition that matches wins, and the conditions are not cumulative:

1. A level-up occurred this week → mentions the level reached.
2. Supplement adherence was perfect all 7 days → perfect-adherence copy.
3. The protein goal was hit on 6 or more days → protein-goal copy.
4. The hydration goal was hit on 6 or more days → hydration-goal copy.
5. Fallback → the week's total blend count.

## WeeklyReportScreen

`WeeklyReportScreen` has two entry points: the `bar-chart-outline` icon in the `MeScreen` header, and the `weeklyReport` push notification's deep link. Because the screen lives on the root navigation stack rather than nested inside a tab — the same placement as `UpgradeScreen` — its deep-link handling in [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts) is a simple root-level route rather than the nested tab/screen pair used by the four CP2.2 reminder types.

A week selector with chevron arrows lets the user move between weeks. `getAllReportDates` supplies the full list of weeks that have a report; the current position in that list determines whether the "older" or "newer" chevron is enabled, so navigation can never go past the earliest or latest available week.

The report renders as five visual sections: Nutrition, Hydration, Supplements, Gamification, and — only when `nutrition.highlightRecipe` is present — a Highlight Recipe card. Hydration reuses `HydrationBarChart` from CP1.10, adapted to the report's fixed 7-point `dailyBreakdown`. Supplement adherence reuses `GoalRing` (originally built for the CP1.4 Home Screen) in its new static, non-animating mode as a circular gauge.

Free and Pro users see the same screen — access is never blocked — but the content inside differs. The Nutrition section is always shown in full, including the week-over-week comparison when available. For Pro users, the remaining four sections render normally. For free users, those same four sections render behind a `BlurView` at `intensity={25}`, with a centered upgrade card overlaid on top and a button that navigates to `UpgradeScreen`. Letting everyone reach the screen, rather than gating it entirely, is deliberate: seeing a real, personalized report sitting just behind a blur is a stronger conversion trigger than a generic locked-feature message would be.
