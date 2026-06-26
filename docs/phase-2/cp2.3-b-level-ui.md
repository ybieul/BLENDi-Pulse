# CP2.3-B — Level UI and Celebration

This checkpoint is entirely mobile and introduces zero backend changes. Its sole responsibility is to make the XP system from CP2.3-A visible and satisfying to the user through three UI layers: a centralized gamification store with a reusable XP-response handler, a global level-up celebration overlay, and visual level-progress updates in the HomeScreen and MeScreen.

## Files Created

### Core Gamification Layer

- [apps/mobile/src/store/gamification.store.ts](../../apps/mobile/src/store/gamification.store.ts): added the centralized Zustand store for XP state, visible level-up state, and deferred level-up sequencing.
- [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts): added `handleXPResponse(...)` and the centralized mobile-side response handling pattern for XP and level-up data.

### UI Components

- [apps/mobile/src/components/gamification/LevelUpCelebration.tsx](../../apps/mobile/src/components/gamification/LevelUpCelebration.tsx): added the full-screen animated level-up overlay.
- [apps/mobile/src/components/gamification/LevelDetailSheet.tsx](../../apps/mobile/src/components/gamification/LevelDetailSheet.tsx): added the bottom sheet for inspecting the current level, XP progress, and remaining XP to the next level.

### Screen Integration

- [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx): added the compact header level indicator, animated mini progress bar, level-detail sheet trigger, mission-toast sequencing, and pending level-up consumption.
- [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx): replaced the old 3-stat row with a 2x2 grid and added the dedicated level-progress section.
- [apps/mobile/App.tsx](../../apps/mobile/App.tsx): mounted the global `LevelUpCelebration` overlay as the last child of `SafeAreaProvider`.
- [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts): synchronizes `totalXP` into the gamification store whenever `setUser(...)` receives a new profile snapshot.

### Mobile Service Updates

- [apps/mobile/src/services/blendLog.service.ts](../../apps/mobile/src/services/blendLog.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` after blend-log mutations.
- [apps/mobile/src/services/hydration.service.ts](../../apps/mobile/src/services/hydration.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` after hydration mutations.
- [apps/mobile/src/services/supplementStack.service.ts](../../apps/mobile/src/services/supplementStack.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` after supplement-check mutations.
- [apps/mobile/src/services/pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` after successful Pulse AI responses.
- [apps/mobile/src/services/pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` after pantry analysis.
- [apps/mobile/src/services/favorites.service.ts](../../apps/mobile/src/services/favorites.service.ts): calls `handleXPResponse(...)` and `handleMissionResponse(...)` only when a favorite is newly created.

## gamification.store.ts Architecture

Conceptually, CP2.3-B revolves around two user-facing pieces of state:

- `totalXP` as a number
- `levelUpData` as `{ newLevel, newLevelNameKey } | null`

`totalXP` is synchronized from profile responses and incremented optimistically in mutation flows:

- [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts) calls `useGamificationStore.getState().setTotalXP(user?.totalXP ?? 0)` inside `setUser(...)`, so any full-profile update immediately refreshes the gamification state.
- [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) and [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx) also call `setTotalXP(...)` after `GET /users/me` query success.
- [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts) calls `incrementXP(...)` immediately when a mutation response contains positive `xpAwarded`.

The store is intentionally not persisted in MMKV. There is no local persistence layer attached to [apps/mobile/src/store/gamification.store.ts](../../apps/mobile/src/store/gamification.store.ts); the source of truth remains the backend `totalXP`, and mobile always rehydrates from `GET /users/me` during normal session initialization.

Implementation note: the current store is slightly broader than the minimal conceptual model. In addition to `totalXP` and `levelUpData`, it also stores `pendingLevelUp` to support deferred sequencing with the mission-completion toast. Because of that, the actual store exports three fields and six actions:

- State fields: `totalXP`, `levelUpData`, `pendingLevelUp`
- Actions: `setTotalXP`, `incrementXP`, `triggerLevelUp`, `dismissLevelUp`, `setPendingLevelUp`, `clearPendingLevelUp`

So while the product-facing design is centered on the two visible state domains, the implementation intentionally adds one extra transient field and two extra actions to support smooth orchestration.

## handleXPResponse Pattern

The central response-handling pattern lives in [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts) as `handleXPResponse(...)`.

The function accepts a flexible payload shape with optional fields:

- `xpAwarded`
- `leveledUp`
- `newLevel`
- `newLevelNameKey`

Its behavior is intentionally defensive and minimal:

1. If `xpAwarded` is a finite number greater than `0`, call `incrementXP(...)` on the gamification store.
2. If the response also indicates `leveledUp === true` and provides a valid numeric `newLevel`, stage that event in `pendingLevelUp` through `setPendingLevelUp(...)`.
3. Swallow any error in a silent `try/catch` so the XP UI layer never breaks the main mutation flow.

The sequencing decision is important: `handleXPResponse(...)` does not call `triggerLevelUp(...)` directly. It only stores the pending event, and the UI context that received the mutation decides when the celebration should actually appear.

Implementation note: although the accepted interface includes `newLevelNameKey`, the current code does not consume that field from the response. Instead, [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts) derives the translation key locally from `LEVEL_NAMES` exported by the shared package.

The six mobile service integrations all use the same one-line pattern immediately after receiving a successful mutation response:

- [apps/mobile/src/services/blendLog.service.ts](../../apps/mobile/src/services/blendLog.service.ts)
- [apps/mobile/src/services/hydration.service.ts](../../apps/mobile/src/services/hydration.service.ts)
- [apps/mobile/src/services/supplementStack.service.ts](../../apps/mobile/src/services/supplementStack.service.ts)
- [apps/mobile/src/services/pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts)
- [apps/mobile/src/services/pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts)
- [apps/mobile/src/services/favorites.service.ts](../../apps/mobile/src/services/favorites.service.ts)

Each one calls `handleXPResponse(...)` and, when applicable, `handleMissionResponse(...)` right after the successful response object is available.

## LevelUpCelebration Animation Sequence

The full-screen celebration sequence is implemented in [apps/mobile/src/components/gamification/LevelUpCelebration.tsx](../../apps/mobile/src/components/gamification/LevelUpCelebration.tsx).

When the component mounts with `levelUpData !== null`, it runs this sequence:

1. `overlayOpacity` animates from `0` to `1` in `200ms`.
2. In parallel, `cardScale` springs from `0` to `1.05` with `tension: 100` and `friction: 8`.
3. Also in parallel, `cardOpacity` fades from `0` to `1` in `250ms`.
4. After `100ms`, the card settles from `1.05` to `1.0` with a second spring using `tension: 120` and `friction: 12`.
5. After `150ms`, `15` particles are emitted with a stagger of `30ms` per particle.

For each particle:

- `translateY` animates to `-120`
- `translateX` is computed radially from `Math.cos(angle) * 80`, where `angle = (i * 2π) / 15`
- `opacity` goes from `1` to `0`
- `scale` goes from `1` to `0.3`
- all particle animations run for `1200ms` with `Easing.out(Easing.cubic)`

The overlay auto-closes after `3000ms`, and it can also be dismissed by tapping anywhere on the overlay.

The close sequence then:

1. Fades `overlayOpacity` to `0` in `200ms`
2. Fades `cardOpacity` to `0` in `200ms`
3. Calls `setValue(0)` on all animated values through `resetAnimatedValues()` so the next opening starts from a clean baseline

The component is mounted in [apps/mobile/App.tsx](../../apps/mobile/App.tsx) as the last child of `SafeAreaProvider`, and its root overlay style sets `zIndex: 1000`.

## HomeScreen Level Indicator

The compact level indicator lives in the HomeScreen header at [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx).

Its visible structure is:

- a text label using `DM Sans` body font with bold weight at `11px`
- text color `colors.brand.pulse`
- a compact progress bar sized `40 x 3`

The displayed label uses the localized level prefix plus the current level, and the progress width is animated with `Animated.timing(...)` over `400ms`, with `useNativeDriver: false`, inside a `useEffect` that observes `levelInfo.progress` derived from `totalXP`.

Tapping the indicator opens [apps/mobile/src/components/gamification/LevelDetailSheet.tsx](../../apps/mobile/src/components/gamification/LevelDetailSheet.tsx), which currently appears only from the HomeScreen.

Inside the sheet, the user sees:

- the current level number in `Syne` bold at `52px`
- the level detail title line
- total XP formatted with locale thousands separators via `toLocaleString()`
- an animated progress bar that fills to `levelInfo.progress`
- `xpForCurrentLevel` and `xpForNextLevel` shown at the left and right ends of the bar
- copy showing how much XP remains until the next level name

Implementation note: the sheet currently renders the localized current level name as secondary copy below the total-XP label, and the main heading line is the generic localized `levelDetail` label rather than the raw level name itself.

## MeScreen 2x2 Grid

The profile statistics layout in [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx) was reworked from a single 3-card row into a 2x2 arrangement.

The implementation uses:

- a `statsGrid` container
- two stacked `statsRow` wrappers
- each row with `flexDirection: 'row'`
- a horizontal `gap` of `10`

The four cards are arranged as follows:

- first row: current streak and total blends
- second row: longest streak and current level

The level card uses the `star` icon with `rgba(245,158,11,0.90)` as its accent color.

Below the grid, the screen adds a dedicated level-progress section with:

- the level name rendered in `Syne` bold at `16px`
- an animated horizontal progress bar
- localized copy showing remaining XP to the next level

Unlike the HomeScreen, the MeScreen does not currently open `LevelDetailSheet` when the level section is touched. In CP2.3-B as implemented, the detailed sheet remains a HomeScreen interaction.

## Level-Up Sequencing Decision

The main sequencing decision in CP2.3-B is about conflict avoidance between mission completion feedback and level-up celebration.

When a mission completes and that same action also produces a level-up, the overlay does not appear immediately on top of the mission toast. Instead, [apps/mobile/src/utils/xp.utils.ts](../../apps/mobile/src/utils/xp.utils.ts) stores the level-up event in `pendingLevelUp`.

Then [apps/mobile/src/screens/HomeScreen.tsx](../../apps/mobile/src/screens/HomeScreen.tsx) coordinates the release:

1. Mission completion updates make `MissionCompletionToast` visible for `2000ms`.
2. When `onDismiss` fires, `handleMissionToastDismiss(...)` clears the toast state.
3. If `pendingLevelUp` exists, HomeScreen clears it from the store and schedules `triggerLevelUp(...)` after an additional `500ms` delay.

There is also a second HomeScreen guard path: if `pendingLevelUp` exists while no mission toast is visible, a dedicated effect immediately promotes it to `levelUpData` and clears the pending state.

Implementation note: the current codebase does not implement a separate “other screens trigger directly” branch. The only explicit consumer of `pendingLevelUp` and the only caller of `triggerLevelUp(...)` outside the store itself is the HomeScreen. So the documented design intent is present, but the concretely implemented sequencing logic today is HomeScreen-specific.

## Pending Items

There are no pending items for CP2.3-B in the current implementation. The level UI, celebration overlay, XP-response handler pattern, and the HomeScreen and MeScreen integrations are complete and stable for this phase.