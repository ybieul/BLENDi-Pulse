# CP2.2 — Push Notifications

This checkpoint implements the complete push-notification system for BLENDi Pulse: four notification types with smart timing based on each user's individual timezone, internal cron jobs powered by `node-cron`, Daily Pulse personalization using the user's real Pulse AI cache entries instead of new AI calls, deep-link routing to the correct app surfaces when a notification is opened, and configurable notification preferences in the MeScreen profile area.

## Files Created

### Backend

- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts): updated the user model with `pushToken`, `notificationPreferences`, and `dailyPulseTime`, including defaults for all notification flags and the default Daily Pulse time of 07:00.
- [apps/api/src/models/NotificationLog.ts](../../apps/api/src/models/NotificationLog.ts): added the `notification_logs` collection used to guarantee per-user, per-type, per-day idempotency.
- [apps/api/src/services/pushNotification.service.ts](../../apps/api/src/services/pushNotification.service.ts): implemented Expo Push API batching, response parsing, and invalid-token cleanup.
- [apps/api/src/services/notificationContent.service.ts](../../apps/api/src/services/notificationContent.service.ts): centralized the copy-generation layer for Daily Pulse, streak, supplement, and hydration notifications.
- [apps/api/src/jobs/notifications.jobs.ts](../../apps/api/src/jobs/notifications.jobs.ts): registered and implemented the internal cron jobs that evaluate user timezones and dispatch notifications.
- [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts): added the three notification-related handlers `updatePushToken()`, `updateNotificationPreferences()`, and `updateDailyPulseTime()`.
- [apps/api/src/routes/users.ts](../../apps/api/src/routes/users.ts): exposed the three authenticated endpoints `PATCH /users/push-token`, `PATCH /users/notification-preferences`, and `PATCH /users/daily-pulse-time`.

### Mobile

- [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts): implemented permission requests, Android channel creation, Expo push token retrieval, backend synchronization, and deep-link decoding.
- [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx): added the notification-preferences section with toggle rows and Daily Pulse time editing.

### Supporting Integration

- [apps/mobile/src/hooks/useNotificationPreferences.ts](../../apps/mobile/src/hooks/useNotificationPreferences.ts): added optimistic mobile mutations for notification preferences and Daily Pulse time updates.
- [apps/mobile/src/components/me/DailyPulseTimeSheet.tsx](../../apps/mobile/src/components/me/DailyPulseTimeSheet.tsx): implemented the time-picker sheet used by the MeScreen preferences section.
- [apps/mobile/App.tsx](../../apps/mobile/App.tsx): wired permission timing, notification listeners, deep-link navigation, and push-token synchronization into the authenticated app lifecycle.
- [apps/mobile/src/navigation/navigationRef.ts](../../apps/mobile/src/navigation/navigationRef.ts): added the navigation container ref used to route the user to the correct screen after tapping a notification.
- [apps/api/src/index.ts](../../apps/api/src/index.ts): calls `initializeNotificationJobs()` immediately after MongoDB connection during server bootstrap.

## Push Notification Flow

The notification delivery path spans both mobile and backend, but each layer stays intentionally narrow in responsibility.

1. On mobile, [apps/mobile/App.tsx](../../apps/mobile/App.tsx) waits until the user is authenticated and then, after a 3-second delay, calls `requestPermissionsAndGetToken()` from [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts).
2. `requestPermissionsAndGetToken()` checks existing permissions, requests them through `expo-notifications` when needed, resolves `projectId` from `Constants.expoConfig.extra`, and calls `Notifications.getExpoPushTokenAsync({ projectId })`.
3. If a token is returned and it differs from the last known token, mobile sends it to the backend through `PATCH /users/push-token`.
4. The backend stores the token in `User.pushToken` through [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts).
5. When a cron job decides to send a notification, [apps/api/src/services/pushNotification.service.ts](../../apps/api/src/services/pushNotification.service.ts) posts the normalized payload to `https://exp.host/--/api/v2/push/send` using Bearer authentication with `EXPO_ACCESS_TOKEN`.
6. Expo routes the notification to APNs on iOS or FCM on Android.
7. The platform push service delivers the notification to the device.

The architecture deliberately uses Expo as the delivery abstraction layer so the BLENDi backend does not need to manage the very different authentication and transport requirements of APNs and FCM directly.

## NotificationLog Idempotency

Idempotency is implemented in [apps/api/src/models/NotificationLog.ts](../../apps/api/src/models/NotificationLog.ts) through the `notification_logs` collection.

Each record contains:

- `userId`
- `type`
- `notificationDate`
- `createdAt`

`type` is an enum with five values:

- `dailyPulse`
- `streakReminder`
- `supplementReminder`
- `hydrationReminder`
- `levelUp`

`notificationDate` is stored as a `YYYY-MM-DD` string in the user's own timezone, not UTC. The collection also has a TTL index on `createdAt` with 259,200 seconds, which means logs expire automatically after 3 days.

The real guarantee comes from the unique compound index on `userId + type + notificationDate`. That index ensures that a given notification type can be reserved at most once per user per local day, regardless of how many times a cron job runs inside the same window or how many users are processed in parallel.

At runtime, [apps/api/src/jobs/notifications.jobs.ts](../../apps/api/src/jobs/notifications.jobs.ts) uses `reserveNotificationLog(...)` before enqueueing any notification payload. The function first checks `NotificationLogModel.exists(...)` and then attempts `create(...)`; duplicate-key failures are treated as a normal "already sent" path rather than an error.

## Cron Jobs Architecture

The internal notification scheduler lives in [apps/api/src/jobs/notifications.jobs.ts](../../apps/api/src/jobs/notifications.jobs.ts). [apps/api/src/index.ts](../../apps/api/src/index.ts) calls `initializeNotificationJobs()` only after MongoDB is connected, so the jobs start with database availability guaranteed.

Four cron jobs are registered.

### Daily Pulse

- Cron expression: `*/5 * * * *`
- Timezone window logic: computes the user's next local Daily Pulse occurrence through `getNextOccurrenceUTC(hour, minute, timezone)` and checks whether it falls inside the current 5-minute UTC window.
- Trigger condition: `notificationPreferences.dailyPulse === true`, a non-empty `pushToken`, and the next occurrence landing between `nowUtc` and `nowUtc + 5 minutes`.
- Content: generated by `getDailyPulseContent(...)`, personalized by goal and optionally by the latest cached recipe title.

### Streak Reminder

- Cron expression: `*/30 * * * *`
- Timezone window logic: converts `nowUtc` to the user's local time and checks whether it is inside the 19:00–19:30 local window.
- Trigger condition: `notificationPreferences.streakReminder === true`, `currentStreak > 0`, a non-empty `pushToken`, and `BlendLog` count for the current local day equal to `0`.
- Content: streak-length-aware copy from `getStreakReminderContent(...)`.

### Supplement Reminder

- Cron expression: `*/30 * * * *`
- Timezone window logic: converts `nowUtc` to the user's local time and checks whether it is inside the 20:00–20:30 local window.
- Trigger condition: `notificationPreferences.supplementReminder === true`, at least one active supplement in `supplementStack`, a non-empty `pushToken`, and at least one active supplement still missing from today's `SupplementLog` entries.
- Content: generated by `getSupplementReminderContent(...)`, optionally summarizing up to two pending supplement names.

### Hydration Reminder

- Cron expression: `*/30 * * * *`
- Timezone window logic: converts `nowUtc` to the user's local time and checks whether it is inside the 15:00–15:30 local window.
- Trigger condition: `notificationPreferences.hydrationReminder === true`, a non-empty `pushToken`, and current hydration total below 50% of `dailyHydrationTarget` for the local day.
- Content: generated by `getHydrationReminderContent(...)`, including the current hydration total and target in metric or imperial display format.

## Daily Pulse Personalization

The Daily Pulse content generator lives in [apps/api/src/services/notificationContent.service.ts](../../apps/api/src/services/notificationContent.service.ts) as `getDailyPulseContent(...)`.

Its strategy is intentionally cheap and deterministic:

1. Query the `ai_cache` collection through `AiCacheModel.find({ userId })`.
2. Sort by `createdAt` descending.
3. Limit to the 3 most recent entries.
4. Try to extract a recipe title from `response.title` or, as a fallback, `response.recipe.title`.

If at least one cached recipe is found, the notification body is personalized with a real recipe name. For example, the English `Muscle` template is:

`Ready for gains? Your {recipeName} shake is waiting 💪`

If the user has no cached recipes yet, the function falls back to static goal-based copy with no recipe reference. This keeps Daily Pulse useful for new users while guaranteeing zero additional AI cost, because the system only reads already-persisted cache entries instead of generating new content.

## Batch Sending Strategy

[apps/api/src/services/pushNotification.service.ts](../../apps/api/src/services/pushNotification.service.ts) sends notifications in batches of up to 100 payloads, which matches the Expo Push API batch-size limit enforced by `EXPO_MAX_BATCH_SIZE`.

The sending flow is:

1. Accumulate `PushNotificationPayload` objects in arrays inside each job.
2. Split them into 100-item chunks through `chunkPayloads(...)`.
3. POST each chunk to the Expo Push API with Bearer authentication.
4. Parse the ticket response and normalize each result as success or error.
5. Collect any tokens whose Expo error is `DeviceNotRegistered`.
6. Run `UserModel.updateMany(..., { $unset: { pushToken: '' } })` through `cleanInvalidTokens(...)`.

That last step is important operationally: when a user revokes permission or uninstalls the app, the system stops retrying the stale token after the first explicit `DeviceNotRegistered` response.

## Deep Link Mapping

Deep-link decoding happens on mobile in [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts), and the actual navigation is executed through [apps/mobile/src/navigation/navigationRef.ts](../../apps/mobile/src/navigation/navigationRef.ts) from [apps/mobile/App.tsx](../../apps/mobile/App.tsx).

Every backend push payload includes `data.deepLink` and `data.type`. The current job layer maps types to these deep links:

- `dailyPulse` → `blendipulse://pulse-ai/chat`
- `streakReminder` → `blendipulse://blend`
- `supplementReminder` → `blendipulse://track`
- `hydrationReminder` → `blendipulse://track`

On the mobile side, `processDeepLink(...)` resolves the route as follows:

- `dailyPulse` opens `PulseAI -> PulseAIChat`
- `streakReminder` opens `Blend`
- `supplementReminder` opens `Track -> TrackMain`
- `hydrationReminder` opens `Track -> TrackMain`

The Daily Pulse branch also supports `prefilledMessage` when `data.recipeTitle` exists in the notification payload, because `processDeepLink(...)` calls `buildDailyPulsePrompt(recipeTitle)`. Important implementation note: the current backend cron payload includes only `deepLink` and `type`, so Daily Pulse already navigates to the correct chat screen, but it does not yet send the recipe name in the payload for chat prefill.

## Permission Strategy

Permission timing is intentionally delayed in [apps/mobile/App.tsx](../../apps/mobile/App.tsx). After `isAuthenticated === true`, the app waits 3 seconds before calling `requestPermissionsAndGetToken()`.

The goal is UX discipline: the app does not bombard the user with the OS permission prompt immediately on launch or immediately after authentication state flips.

On Android, [apps/mobile/src/services/notifications.service.ts](../../apps/mobile/src/services/notifications.service.ts) creates the default notification channel through `Notifications.setNotificationChannelAsync(...)` with:

- `importance: Notifications.AndroidImportance.MAX`
- `lightColor: '#9a4893'`
- vibration pattern `[0, 250, 250, 250]`

This ensures the app has a high-visibility channel before any remote notification is displayed.

## MeScreen Preferences

The notification settings UI was added to [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx) as a dedicated preferences section. In the current implementation, the MeScreen exposes:

- `dailyPulse`
- `streakReminder`
- `supplementReminder`
- `hydrationReminder`
- a Daily Pulse time row that opens [apps/mobile/src/components/me/DailyPulseTimeSheet.tsx](../../apps/mobile/src/components/me/DailyPulseTimeSheet.tsx)

The mobile layer updates these values optimistically through [apps/mobile/src/hooks/useNotificationPreferences.ts](../../apps/mobile/src/hooks/useNotificationPreferences.ts), then synchronizes them to the backend via `PATCH /users/notification-preferences` and `PATCH /users/daily-pulse-time`.

Implementation note: the backend user model already carries a `levelUp` preference flag, but that toggle is not part of the initial CP2.2 MeScreen row set.

## Pending Items

The `levelUp` notification path was integrated later in CP2.3-A through [apps/api/src/services/xp.service.ts](../../apps/api/src/services/xp.service.ts).

That later integration differs from the four CP2.2 cron-driven reminders:

- it does not use a cron job
- it sends immediately after level-up detection
- it still reuses the same push delivery infrastructure and the same `notificationPreferences.levelUp` flag

In other words, CP2.2 established the scheduled push-notification platform, and CP2.3-A later attached level-up as an event-driven notification on top of that platform.