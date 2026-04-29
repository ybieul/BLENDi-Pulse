# CP0.8 — Timezone Support

This checkpoint implements full timezone support across the BLENDi Pulse system, guaranteeing that dates and times are always stored in UTC on the backend and converted to the user's local timezone only at display time. This is critical for features such as Goal Rings resetting at local midnight, streak calculations based on the user's local day, and push notifications firing at the correct hour for each user.

---

## Files Created

### packages/shared

| File or change | Description |
|---|---|
| `packages/shared/src/schemas/auth.ts` | `registerSchema` includes the required `timezone` field so the user's timezone is captured during registration |
| `packages/shared/src/schemas/user.ts` | Adds `timezoneSchema` as the shared validation source for timezone-related user operations |

### apps/api

| File or change | Description |
|---|---|
| `apps/api/src/utils/timezone.utils.ts` | Central timezone-aware date conversion and scheduling utilities implemented with the native `Intl` API |
| `apps/api/src/models/User.ts` | User model updated to persist the user's IANA timezone with default `America/New_York` |
| `apps/api/src/controllers/auth.controller.ts` | Register flow stores timezone on user creation and `PATCH /auth/timezone` updates the persisted timezone |

### apps/mobile

| File or change | Description |
|---|---|
| `apps/mobile/src/services/timezone.service.ts` | Exposes device timezone detection and conditional backend synchronization |
| `apps/mobile/src/hooks/useDateFormat.ts` | Central hook for timezone-aware date, time, relative date, and same-day formatting in the UI |
| `apps/mobile/src/services/auth.service.ts` | Injects the device timezone into the register payload automatically |
| `apps/mobile/src/store/auth.store.ts` | Adds `updateTimezone` and preserves timezone in the auth user state |
| `apps/mobile/App.tsx` | Calls timezone synchronization after session restore and whenever the app returns to the foreground |

---

## The Golden Rule

> [!WARNING]
> The backend always stores dates in UTC, and the frontend always converts them to the user's local timezone for display. Never the other way around.

Concrete example:

A blend logged at 23:00 in São Paulo on April 22 is saved on the backend as 02:00 UTC on April 23, because São Paulo is UTC-3. When the app displays that record back to the same user, it converts the UTC timestamp back into the local timezone and shows 23:00 on April 22 again.

This rule avoids ambiguous date math, makes database storage consistent, and prevents the server timezone from leaking into user-facing behavior.

---

## Backend Utilities

The timezone utility layer lives in `apps/api/src/utils/timezone.utils.ts` and centralizes all timezone-aware business logic.

### `toUTC(localDate, timezone)`

| Item | Value |
|---|---|
| Parameters | `localDate: Date`, `timezone: string` |
| Returns | `Date` representing the equivalent UTC instant |
| Purpose | Converts a local user date/time into the canonical UTC value to be stored |

Example:

- Input: local components interpreted as March 15, 2025 at 09:30 in `America/Sao_Paulo`
- Output: `2025-03-15T12:30:00.000Z`

### `toLocalDate(utcDate, timezone)`

| Item | Value |
|---|---|
| Parameters | `utcDate: Date`, `timezone: string` |
| Returns | `Date` whose UTC fields encode the user's local components in that timezone |
| Purpose | Converts a stored UTC instant into a local-calendar representation for timezone-aware calculations |

Example:

- Input: `2025-03-15T03:00:00.000Z` and `America/Sao_Paulo`
- Output: a `Date` whose UTC fields correspond to local midnight on March 15 in São Paulo

### `getMidnightUTC(timezone)`

| Item | Value |
|---|---|
| Parameters | `timezone: string` |
| Returns | `Date` representing the UTC instant of local midnight for the current day in that timezone |
| Purpose | Supports day-boundary features such as Goal Rings reset and daily checklists |

Example:

- Input: `America/Sao_Paulo`
- Output: if local midnight in São Paulo is UTC-3, the result is `03:00:00.000Z` for that local day

### `isSameDayInTimezone(utcA, utcB, timezone)`

| Item | Value |
|---|---|
| Parameters | `utcA: Date`, `utcB: Date`, `timezone: string` |
| Returns | `boolean` |
| Purpose | Checks whether two UTC instants fall on the same local calendar day for a user |

Example:

- Input A: `2025-03-15T02:59:00.000Z`
- Input B: `2025-03-15T03:01:00.000Z`
- Timezone: `America/Sao_Paulo`
- Output: `false`, because those instants span 23:59 and 00:01 locally in São Paulo

### `getNextOccurrenceUTC(hour, minute, timezone)`

| Item | Value |
|---|---|
| Parameters | `hour: number`, `minute: number`, `timezone: string` |
| Returns | `Date` for the next UTC instant when that local hour and minute will occur |
| Purpose | Supports per-user scheduling such as notification delivery at local preferred times |

Example:

- Current local time in São Paulo: 08:00
- Input target: `hour = 9`, `minute = 0`, timezone `America/Sao_Paulo`
- Output: today's `12:00:00.000Z`, which corresponds to 09:00 local in São Paulo

If the target hour has already passed locally, the function returns tomorrow's occurrence instead.

---

## Timezone Sync Strategy

The user's timezone is captured and kept up to date through a layered strategy.

### Initial Capture

During registration, the mobile app reads the device timezone through:

`Intl.DateTimeFormat().resolvedOptions().timeZone`

That value is injected into the register request body by `apps/mobile/src/services/auth.service.ts` and persisted in MongoDB through the register flow on the backend.

### Mobile Service API

`apps/mobile/src/services/timezone.service.ts` exposes two public functions:

| Function | Role |
|---|---|
| `getDeviceTimezone()` | Returns the current IANA timezone from the device runtime |
| `syncTimezoneIfNeeded()` | Compares device timezone to the stored user timezone and calls `PATCH /auth/timezone` only when they differ |

### When Sync Happens

Synchronization is triggered in two moments:

1. Immediately after `restoreSession()` when the app opens
2. Whenever the app returns to the foreground through an `AppState` listener in `App.tsx`

Why this is necessary:

A user who travels between countries can have the device timezone changed automatically by the operating system. With this strategy, the backend is updated without requiring the user to log out and log back in, so all time-based features keep following the user's current local day and hour.

---

## useDateFormat Hook

The UI formats all user-facing dates through `apps/mobile/src/hooks/useDateFormat.ts`.

### `formatDate(value)`

Formats a date in the current locale and the current device timezone.

Examples:

- English: `April 22, 2026`
- Portuguese: `22 de abril de 2026`

### `formatTime(value)`

Formats only the time component using locale-appropriate conventions.

- English uses 12-hour time with AM/PM, such as `11:00 PM`
- Portuguese uses 24-hour time, such as `23:00`

### `formatRelative(value)`

Formats dates relative to the current local day.

Cases handled:

- `Today` or `Hoje`
- `Yesterday` or `Ontem`
- older values such as `3 days ago` or `há 3 dias`

### `isSameLocalDay(a, b)`

Returns `true` when two instants fall on the same local calendar day in the device timezone, and `false` otherwise.

### Why The Hook Uses Device Timezone Directly

The hook reads timezone directly from `Intl` instead of Zustand. That guarantees the display layer always reflects the device's current timezone immediately, even if the backend synchronization has not completed yet.

---

## Test Results

The timezone support implemented in the auth and sync flow was confirmed through the authentication smoke tests.

| Test | Confirmed result |
|---|---|
| Register stores timezone | Register response returned `user.timezone = America/Sao_Paulo` |
| PATCH timezone success | `PATCH /auth/timezone` completed successfully with authenticated request |
| Updated timezone value | The response returned `Asia/Tokyo` after update |
| PATCH timezone without token | Protected timezone update without token returned `401` |

These checks confirm both the initial persistence of timezone and the protected update flow.

---

## Technical Decisions

### Why Native `Intl` Was Used Instead Of `moment-timezone` Or `date-fns-tz`

The runtime already provides full timezone-aware formatting and conversion primitives through `Intl`. Adding libraries such as `moment-timezone` or `date-fns-tz` would increase bundle size, add dependencies, and duplicate capabilities that already exist in modern Node.js and React Native runtimes.

### Why The Hook Uses Device Timezone Instead Of Zustand

The persisted timezone in Zustand reflects what the backend last knows. The device timezone reflects what is true right now. For display, the current device value is the correct source of truth, because rendering should follow the user's present local environment even before the backend has been synchronized.

---

## Pending Items

The push-notification cron job will need to use `getNextOccurrenceUTC()` to schedule delivery at the correct local hour for each user. That scheduling layer is planned for implementation in Phase 2.