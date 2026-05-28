# CP1.11 — Complete Profile Screen

This checkpoint implements the MeScreen as the user hub for identity, achievements, and settings: a header with profile photo or initials, three headline stats for current streak, total blends, and longest streak, a frontend-computed badge system with four categories, editable settings driven by bottom sheets, an upgrade card that currently shows a Coming Soon flow for the RevenueCat integration planned for Phase 3, and a sign-out path that clears session, cache, and onboarding state. The original checkpoint brief referred to seven editable settings, but the current implementation renders eight editable settings rows.

## Files Created

### Backend

- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts): added the `longestStreak` field to the user model.
- [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts): updated the createBlendLog streak pipeline to persist `longestStreak` with `$max`.
- [apps/api/src/routes/pulseAi.ts](../../apps/api/src/routes/pulseAi.ts): exposed `DELETE /pulse-ai/cache` so stale recipe caches can be invalidated after important profile changes.
- [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts): expanded `getMe` to return the fields required by the complete profile screen, including streaks, blend count, hydration target, Pro flag, and profile metadata.

### Mobile

- [apps/mobile/src/utils/badges.utils.ts](../../apps/mobile/src/utils/badges.utils.ts)
- [apps/mobile/src/components/me/BadgeCard.tsx](../../apps/mobile/src/components/me/BadgeCard.tsx)
- [apps/mobile/src/components/me/BadgeDetailSheet.tsx](../../apps/mobile/src/components/me/BadgeDetailSheet.tsx)
- [apps/mobile/src/components/me/SettingRow.tsx](../../apps/mobile/src/components/me/SettingRow.tsx)
- [apps/mobile/src/components/me/EditSettingSheet.tsx](../../apps/mobile/src/components/me/EditSettingSheet.tsx)
- [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx)

## Badge System

The badge system is calculated entirely on the frontend in [apps/mobile/src/utils/badges.utils.ts](../../apps/mobile/src/utils/badges.utils.ts) through `calculateUserBadges(profile)`. Each badge definition carries its stage requirements, and the calculation step derives both `currentStage` and `progress`, which are later consumed by [apps/mobile/src/components/me/BadgeDetailSheet.tsx](../../apps/mobile/src/components/me/BadgeDetailSheet.tsx) for the stage list and next-stage progress bar.

### Blend Journey

Blend Journey is driven by `blendCount` and has three progression stages:

- bronze at 1 blend
- silver at 10 blends
- gold at 50 blends

### Streak Master

Streak Master is driven by `longestStreak`, not the transient current streak, and unlocks at:

- bronze at 3 days
- silver at 7 days
- gold at 30 days

### Early Adopter

Early Adopter is a single-stage badge intended for all Phase 1 users. In the current implementation it is always treated as unlocked by returning a metric value of `1`, so it behaves as a unique identity badge rather than a progression ladder.

### BLENDi Model

The BLENDi Model badge is an identity badge tied to the user's hardware profile. Instead of one badge with multiple tiers, the current implementation defines three separate model badges (`Lite`, `ProPlus`, `Steel`) and unlocks only the one that matches `profile.blendiModel`. There is no progression track for this category.

## longestStreak Architecture

The `longestStreak` guarantee is enforced in [apps/api/src/controllers/blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts). After `createBlendLog` calculates `nextStreak`, the persistence step uses a single atomic `findByIdAndUpdate(...)` with both:

```ts
$set: { currentStreak: nextStreak }
$max: { longestStreak: nextStreak }
```

Because `$max` only writes when the incoming value is greater than the stored one, `longestStreak` can move upward or stay unchanged, but it never decreases regardless of later streak resets or log ordering after the current streak recomputation.

## Settings Edit Flow

[apps/mobile/src/components/me/EditSettingSheet.tsx](../../apps/mobile/src/components/me/EditSettingSheet.tsx) is parameterized by the `type` prop, whose current union has eight values:

- `model`
- `goal`
- `protein`
- `carbs`
- `calories`
- `hydration`
- `unitSystem`
- `language`

This matches the eight `SettingRow` entries rendered in [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx), even though the original checkpoint brief referred to seven editable settings.

### Input Strategy By Type

- `model` and `goal` reuse the onboarding `SelectionCard` pattern for visual consistency.
- `protein`, `carbs`, `calories`, and `hydration` use `AuthInput` with `keyboardType="numeric"`.
- `unitSystem` and `language` use the sheet's internal toggle-button rows.

### Confirm Flow

When the user confirms a change, MeScreen performs this sequence:

1. `PATCH /users/me` with the field-specific request body.
2. `invalidateQueries({ queryKey: QUERY_KEYS.userProfile })` so the profile query refreshes.
3. `updateUserProfile(...)` in the auth store for immediate local consistency.
4. `changeLocale(...)` when the edited type is `language`.

For `goal` and `model`, the flow also calls `DELETE /pulse-ai/cache` on a best-effort basis so cached recipes that were generated for the old hardware or nutritional context are discarded.

## Sign Out Complete Cleanup

The sign-out flow spans three storage layers so the next user on the same device does not inherit profile, cache, or onboarding state.

In the current [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx) implementation, the cleanup order is:

1. delete `onboarding_completed` from MMKV
2. call `queryClient.clear()` to remove all React Query cache
3. call `logout()` from [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts)

Inside the auth store, `logout()` deletes the persisted refresh token from Expo Secure Store on a best-effort basis and resets the Zustand auth state to `user: null`, `accessToken: null`, `isAuthenticated: false`, and `isNewUser: false`.

This is slightly different from the historical narrative of “logout first, then clear caches,” but it achieves the same outcome: the session is removed, query cache is emptied, and the device is forced back through onboarding before a new user can continue.

## Phase 1 Completion

At the documentation milestone level, [docs/README.md](../README.md) marks Phase 1 as closed and tracks the release label as `0.2.0`. With CP1.11, the intended Phase 1 product slice is complete end-to-end: a user can register, finish onboarding, generate recipes with Pulse AI, complete blends with the timer, track hydration and supplements, review full history, and manage profile settings and badges from the Me tab.

Implementation note: the MeScreen footer reads its version from [apps/mobile/app.json](../../apps/mobile/app.json), which currently still reports `1.0.0`, so the runtime footer label and the Phase 1 documentation milestone are not yet aligned.

## Pending Items for Future Phases

- Profile photo capture or gallery upload — Phase 3
- RevenueCat integration for Pro upgrade — Phase 3
- Badge unlocked notifications — Phase 2
- Profile share cards — Phase 3
- Contextual help tooltips — Phase 5