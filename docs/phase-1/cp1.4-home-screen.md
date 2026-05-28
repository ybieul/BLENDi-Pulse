# CP1.4 — Home Screen with Goal Rings

This checkpoint implements the app home screen, the first screen a user sees after onboarding, with three animated SVG Goal Rings for protein, carbs, and calories, a hydration progress bar, the Quick Action Trigger, a streak counter, Quick Protocol Cards, and the Daily Recipe Card. The slice also establishes the image-asset folder contract and the backend data models and endpoints that feed the Home experience.

## Files Created

| File | Description |
|---|---|
| [apps/mobile/assets/images/README.md](../../apps/mobile/assets/images/README.md) | Documents the expected static image assets for the Home surface inside the mobile image-assets folder, including the pending swirl and BLENDi logo files. |
| [apps/mobile/src/assets/index.ts](../../apps/mobile/src/assets/index.ts) | Centralizes image requires and currently exposes placeholder styles while the real PNG assets are still pending. |
| [apps/api/src/models/BlendLog.ts](../../apps/api/src/models/BlendLog.ts) | MongoDB model for per-blend nutrition records used by the Home totals and streak-derived product signals. |
| [apps/api/src/models/HydrationLog.ts](../../apps/api/src/models/HydrationLog.ts) | MongoDB model for water-intake events with a one-year TTL and per-user day queries. |
| [apps/api/src/routes/users.ts](../../apps/api/src/routes/users.ts) | Declares GET /users/me, which supplies the Home greeting, plan badge, goal, streak, macro targets, and hydration target. |
| [apps/api/src/routes/blendLogs.ts](../../apps/api/src/routes/blendLogs.ts) | Declares GET /blend-logs/today, which supplies the current-day protein, carbs, calories, and blend list displayed on Home. |
| [apps/api/src/routes/hydrationLogs.ts](../../apps/api/src/routes/hydrationLogs.ts) | Declares POST /hydration-logs and GET /hydration-logs/today, which power the optimistic water action and hydration progress bar. |
| [apps/mobile/src/components/ui/GoalRing.tsx](../../apps/mobile/src/components/ui/GoalRing.tsx) | Animated SVG ring primitive consumed by the Home section; the implementation lives under ui rather than components/home. |
| [apps/mobile/src/components/home/GoalRingsSection.tsx](../../apps/mobile/src/components/home/GoalRingsSection.tsx) | Composes the three Goal Rings, hydration bar, and stale-data indicator into the primary dashboard block. |
| [apps/mobile/src/components/home/QuickActionTrigger.tsx](../../apps/mobile/src/components/home/QuickActionTrigger.tsx) | Renders the paired Log Water and Last Blend / Start Blend CTA row with optimistic micro-feedback. |
| [apps/mobile/src/components/home/StreakBadge.tsx](../../apps/mobile/src/components/home/StreakBadge.tsx) | Displays the streak counter with staged swirl placeholder styling and legendary rotation at 30+ days. |
| [apps/mobile/src/components/home/QuickProtocolCards.tsx](../../apps/mobile/src/components/home/QuickProtocolCards.tsx) | Horizontal protocol shortcuts that jump the user into Pulse AI with prefilled prompts. |
| [apps/mobile/src/components/home/DailyRecipeCard.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.tsx) | Goal-based recipe recommendation card with a Start Blend CTA and static macro metadata. |
| [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) | Main authenticated Home screen that orchestrates the queries, loading state, fade-in, and layout composition. |

## Goal Ring Architecture

The ring primitive is implemented in [apps/mobile/src/components/ui/GoalRing.tsx](../../apps/mobile/src/components/ui/GoalRing.tsx) with react-native-svg and Animated.

### SVG Progress Math

Each ring derives its circumference from the circle radius:

$$
circunferencia = 2 \times \pi \times raio
$$

That value is used as the `strokeDasharray`, while the animated visible progress is controlled by:

$$
strokeDashoffset = circunferencia \times (1 - progresso)
$$

Where `progresso` is clamped between `0` and `1` from `current / target`.

### Animation Lifecycle

- The ring mounts with `dashOffset` initialized to the full circumference so the progress stroke starts hidden.
- Animation starts only after `InteractionManager.runAfterInteractions(...)` completes, followed by the shared Home interaction delay from cache config.
- `Animated.timing(...)` drives `dashOffset` toward the target offset with cubic easing.

### Completion Celebration

When progress reaches 100%, the ring switches from the default accent color to `colors.feedback.success` for explicit completion feedback.

After the stroke animation finishes, the component runs a three-pulse scale celebration:

1. Scale from `1` to `1.05`
2. Return to `1`
3. Repeat that pulse cycle three times

This celebration is implemented as a composed `Animated.sequence(...)` over the container scale.

### Why `useNativeDriver: false`

The progress animation uses `useNativeDriver: false` because `strokeDashoffset` is an SVG property, not a natively drivable transform or opacity value. The scale celebration itself still uses the native driver because it animates a standard view transform.

## Performance Strategy

The Home implementation deliberately avoids starting every effect at once.

- `InteractionManager.runAfterInteractions(...)` defers the Goal Ring and hydration-bar SVG-like progress work until the initial navigation and layout interactions settle.
- [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) enables `removeClippedSubviews` on the main ScrollView so off-screen content does not stay fully mounted in the native view hierarchy.
- [apps/mobile/src/components/home/QuickProtocolCards.tsx](../../apps/mobile/src/components/home/QuickProtocolCards.tsx) uses a horizontal FlatList with `initialNumToRender={2}`, `maxToRenderPerBatch={2}`, and `windowSize={3}` so only the first cards are materialized immediately.
- [apps/mobile/src/components/ui/AuroraBackground.tsx](../../apps/mobile/src/components/ui/AuroraBackground.tsx) runs with `intensity="reduced"` on Home, which lowers aurora opacity by 40% through a `0.6` multiplier and stretches the half-cycle from 8 seconds to 14 seconds.
- [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) also keeps the first content reveal cheap by using skeleton placeholders plus a single 300 ms fade-in once the critical queries resolve.

## Quick Action Trigger

The paired CTA row is implemented in [apps/mobile/src/components/home/QuickActionTrigger.tsx](../../apps/mobile/src/components/home/QuickActionTrigger.tsx).

### Water Logging

The Log Water action shows optimistic micro-feedback before the backend confirms the write.

- Pressing the button immediately triggers a scale pop on the water icon.
- At the same time, an animated floating label shows `+250 ml` or the localized volume equivalent from `useUnits()`.
- That confirmation label fades out and moves upward over 600 ms.
- Only after the optimistic micro-animation starts does the component call `onLogWater()`, which posts to POST /hydration-logs and invalidates the hydration queries.

If the device is offline, the component still plays the feedback animation, adds a cloud-offline icon, surfaces a toast, and skips the backend call.

### Last Blend Integration

The second button integrates with [apps/mobile/src/store/blend.store.ts](../../apps/mobile/src/store/blend.store.ts).

- If `lastBlend` exists in the Zustand store, the button label changes from Start Blend to Last Blend.
- Pressing it navigates to the Blend tab with `navigation.navigate('Blend', { recipe: lastBlend })`.
- If there is no stored previous recipe, the button falls back to the generic Blend entry point.

## Streak Badge

The streak indicator is implemented in [apps/mobile/src/components/home/StreakBadge.tsx](../../apps/mobile/src/components/home/StreakBadge.tsx) and currently renders a placeholder swirl based on [apps/mobile/src/assets/index.ts](../../apps/mobile/src/assets/index.ts).

### Stage 1: 1-6 Days

- Placeholder swirl shown with 50% opacity.
- No rotation.
- Used as the low-intensity streak state.

### Stage 2: 7-29 Days

- Placeholder swirl switches to solid `colors.brand.pulse` styling at full opacity.
- No rotation yet.
- Used as the established-habit state.

### Stage 3: 30+ Days

- Placeholder swirl stays fully opaque.
- A continuous rotation loop starts with a 3-second linear cycle.
- This is the legendary stage treatment.

### Swirl Placeholder TODO

The component currently contains a TODO to replace the placeholder view with a real `Image` once the swirl asset files are added to the mobile image-assets folder.

## Pending Items

| Item | Status |
|---|---|
| assets/images/ pending files | Still waiting for `swirl.png`, `swirl@2x.png`, `swirl@3x.png`, and `blendi-logo.png`. Until they exist, [apps/mobile/src/assets/index.ts](../../apps/mobile/src/assets/index.ts) exposes placeholder styles instead of real `require(...)` entries. |
| Daily Recipe Card data source | [apps/mobile/src/components/home/DailyRecipeCard.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.tsx) still uses static recipes keyed by goal. This becomes dynamic in Phase 3 with Biometric Sync. |