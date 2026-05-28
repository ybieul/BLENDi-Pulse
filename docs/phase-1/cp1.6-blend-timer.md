# CP1.6 — Blend Timer with Recipe Integration

This checkpoint implements the full Blend tab with two distinct states, a free state with no active recipe and a richer state driven by an active Pulse AI recipe, plus the animated SVG timer, the completion haptic sequence, the post-blend rating modal, blend logging with streak updates backed by `$max`, and the Last Blend quick action consumed on Home. Together, these pieces turn recipe generation into a complete end-to-end “generate -> blend -> rate -> track streak” loop instead of a disconnected AI suggestion flow.

## Files Created

| File | Description |
|---|---|
| [apps/api/src/models/BlendLog.ts](../../apps/api/src/models/BlendLog.ts) | Complete MongoDB model for saved blend sessions with macros, BLENDi model, duration, optional recipe name, and optional rating. |
| [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts) | Adds `createBlendLog(...)` and the streak-update flow used after a blend finishes. |
| [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts) | Adds `markCleaned(...)`, which persists the cleaning timestamp used by the post-blend reminder. |
| [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts) | Zustand source of truth for active recipe, timer duration, timer runtime fields, and `lastBlend`. |
| [apps/mobile/src/services/blendLog.service.ts](../../apps/mobile/src/services/blendLog.service.ts) | Mobile API layer for creating blend logs and fetching today/history aggregates. |
| [apps/mobile/src/components/blend/TimerCircle.tsx](../../apps/mobile/src/components/blend/TimerCircle.tsx) | Animated SVG countdown circle with ready, running, completed, and stopped states. |
| [apps/mobile/src/components/blend/TimerControls.tsx](../../apps/mobile/src/components/blend/TimerControls.tsx) | Duration adjustment controls plus the Start and Stop CTAs. |
| [apps/mobile/src/components/blend/ActiveRecipeHeader.tsx](../../apps/mobile/src/components/blend/ActiveRecipeHeader.tsx) | Rich recipe header shown when the user enters Blend with an active Pulse AI recipe. |
| [apps/mobile/src/components/blend/RatingBottomSheet.tsx](../../apps/mobile/src/components/blend/RatingBottomSheet.tsx) | Post-completion rating modal that records a score or skip outcome before the blend is logged. |
| [apps/mobile/src/components/blend/CleaningReminder.tsx](../../apps/mobile/src/components/blend/CleaningReminder.tsx) | Animated cleaning banner shown after logging when the BLENDi has not been marked as cleaned recently. |
| [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx) | Main Blend tab screen orchestrating timer state, recipe state, rating, logging, and cache invalidation. |

The Home integration itself reuses the existing Quick Action Trigger from CP1.4. What CP1.6 adds is the `lastBlend` state written by [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts), which the Home quick action can later consume as “Last Blend”.

## Timer States

The timer state machine is split between [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx) and [apps/mobile/src/components/blend/TimerCircle.tsx](../../apps/mobile/src/components/blend/TimerCircle.tsx).

| State | Visual behavior | Transition triggers |
|---|---|---|
| `ready` | Shows the configured duration with a fully drawn ring. | Initial state, or the final state after a stop reset or successful post-completion logging flow. |
| `running` | Animates the ring downward as time decreases, updates the countdown every second, and pulses the numeric label on each tick. | Entered when the user presses Start. |
| `completed` | Replaces the timer text with a green checkmark and a success-colored circle, then triggers the rating flow. | Entered when the internal countdown reaches zero. |
| `stopped` | Immediately resets elapsed time and restores the full ring, then transitions back to `ready` after a short delay. | Entered when the user presses Stop during an active blend. |

### Transition Details

- `ready -> running`: BlendScreen starts the Zustand timer, switches `timerStatus` to `running`, and starts its own elapsed-seconds interval.
- `running -> completed`: TimerCircle reaches zero through its internal interval and calls `onComplete()`.
- `running -> stopped`: BlendScreen stops the interval, clears the running store state, and resets elapsed time.
- `stopped -> ready`: BlendScreen waits 300 ms and then normalizes the UI back to the baseline idle state.
- `completed -> ready`: after rating or skip, the blend is logged, the recipe is cleared, and the screen returns to the idle timer state.

## Haptic Sequence

The completion feedback sequence lives in `handleComplete()` inside [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx).

It fires three impacts with increasing intensity:

1. `ImpactFeedbackStyle.Light` at `t + 0 ms`
2. `ImpactFeedbackStyle.Medium` at `t + 100 ms`
3. `ImpactFeedbackStyle.Heavy` at `t + 200 ms`

This was chosen because the escalating intensity communicates “it reached the end” more clearly than three identical pulses, and the short stagger makes the completion feel intentional instead of abrupt.

For completeness, the screen also uses a separate success notification haptic on Start and a heavy impact on Stop, but the three-step sequence above is the dedicated completion signature.

## Streak Calculation

The streak logic lives in `updateCurrentStreak(...)` inside [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts).

### Current Streak Rules

- If the previous blend happened on the same local day, the streak does not increase and remains at least `1`.
- If the previous blend happened on the previous local day, the streak increments by `1`.
- Otherwise, the streak resets to `1` for the new blend.

The timezone-aware comparisons use `isSameDayInTimezone(...)` and the helper `isPreviousDayInTimezone(...)`, so streak logic follows the user's local day boundary instead of raw UTC days.

### `$max` For Longest Streak

After calculating the new `currentStreak`, the controller updates the user with:

```text
$set: { currentStreak: nextStreak }
$max: { longestStreak: nextStreak }
```

That `$max` operator updates the all-time record only when the new streak is greater, without requiring a prior read-compare-write roundtrip for `longestStreak`.

## Timer Persistence

The timer store is implemented in [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts) with Zustand persistence backed by MMKV.

### What Is Persisted Today

- `timerDuration` is persisted under the storage key `blend_timer_duration`.
- The value survives app restarts because the store uses `persist(...)` with MMKV-backed JSON storage.

### What The Current Recovery Actually Does

BlendScreen contains remount-recovery logic based on `isTimerRunning` and `timerStartedAt`:

1. On mount, if both values still exist in store state, it calculates elapsed seconds from `Date.now() - timerStartedAt`.
2. If the elapsed time already exceeds the configured duration, it completes the blend immediately.
3. Otherwise, it restores the remaining seconds and resumes the running state.

However, the current `partialize(...)` function only persists `timerDuration`, not `isTimerRunning` or `timerStartedAt`. So the implemented behavior is narrower than a full cold-start resume:

- remount recovery works while the in-memory store is still alive,
- a full app termination loses the running timer state.

That means the persisted-duration part of CP1.6 is implemented, while full timer continuation after a complete app close would require persisting `timerStartedAt` and `isTimerRunning` as well.

## Cleaning Reminder

The post-blend cleaning flow is split between [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx), [apps/mobile/src/components/blend/CleaningReminder.tsx](../../apps/mobile/src/components/blend/CleaningReminder.tsx), and [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts).

### Visibility Rule

After the rating sheet closes and the blend log succeeds, BlendScreen waits 300 ms and checks whether the banner should appear.

The reminder is shown when:

- `lastCleanedAt` is `null`, or
- the saved cleaning timestamp is 7 days old or older.

### Dismissal Behavior

- When visible, the banner auto-dismisses after 5 seconds.
- The component also animates itself out immediately once the user marks the BLENDi as cleaned.

### “Limpo” Action

Pressing the action button calls `markCleaned()` from [apps/mobile/src/services/user.service.ts](../../apps/mobile/src/services/user.service.ts), which issues PATCH /users/me/cleaned.

The backend `markCleaned(...)` handler updates `lastCleanedAt` to the current timestamp and returns it, and the mobile auth store updates the local user snapshot with that new value.

## Real-time Goal Ring Update

The Blend completion flow updates Home through React Query invalidation instead of through a manual event bus.

### Invalidation Flow

After a successful POST /blend-logs call, BlendScreen runs:

1. `invalidateQueries({ queryKey: QUERY_KEYS.blendLogsToday })`
2. `invalidateQueries({ queryKey: QUERY_KEYS.blendHistory })`
3. `invalidateQueries({ queryKey: QUERY_KEYS.userProfile })`

The first and third keys are the ones that matter for the Home dashboard.

### How Home Picks Up The Change

[apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) subscribes to `blendLogsToday` and `userProfile` through `useQuery(...)`.

When Blend invalidates those queries:

- React Query marks them stale immediately.
- If an observer is active, it can refetch right away.
- If Home is not the current active surface, the user sees the refetched values when Home becomes active again on the next focus/foreground cycle.

Once the new totals arrive, [apps/mobile/src/components/home/GoalRingsSection.tsx](../../apps/mobile/src/components/home/GoalRingsSection.tsx) passes the updated macro values into [apps/mobile/src/components/ui/GoalRing.tsx](../../apps/mobile/src/components/ui/GoalRing.tsx), whose animation effect reruns and redraws the rings with the latest protein, carb, and calorie progress.