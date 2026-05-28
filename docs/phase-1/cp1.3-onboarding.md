# CP1.3 — Onboarding Flow

This checkpoint implements the four-screen onboarding flow that collects the user's BLENDi model, primary goal, body data for automatic macro calculation with BMI and the revised Harris-Benedict / Mifflin-St Jeor-style formula used by the backend, and the final editable macro targets before the app shell unlocks. Every new user, whether created through email/password registration or Google login, is routed through onboarding before reaching Home.

## Files Created

| File | Description |
|---|---|
| [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts) | User model expanded to persist `weight`, `height`, and `dailyCarbTarget` alongside the existing onboarding-derived profile data. |
| [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts) | Adds the protected `calculateMacros` handler used by onboarding to compute BMI, TDEE, calories, protein, and carbs. |
| [apps/mobile/src/navigation/OnboardingNavigator.tsx](../../apps/mobile/src/navigation/OnboardingNavigator.tsx) | Dedicated native-stack flow for onboarding with fade transitions between all four steps. |
| [apps/mobile/src/store/onboarding.store.ts](../../apps/mobile/src/store/onboarding.store.ts) | Temporary in-memory store that accumulates onboarding data across steps and is reset after completion. |
| [apps/mobile/src/components/ui/OnboardingLayout.tsx](../../apps/mobile/src/components/ui/OnboardingLayout.tsx) | Shared onboarding shell with progress dots, aurora background, back navigation, and bottom CTA slot. |
| [apps/mobile/src/components/ui/SelectionCard.tsx](../../apps/mobile/src/components/ui/SelectionCard.tsx) | Reusable selection card used by model and goal steps with animated selected state. |
| [apps/mobile/src/screens/onboarding/OnboardingModelScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingModelScreen.tsx) | Step 1 screen for selecting the user's BLENDi hardware model. |
| [apps/mobile/src/screens/onboarding/OnboardingGoalScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingGoalScreen.tsx) | Step 2 screen for selecting the primary nutrition or lifestyle goal. |
| [apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx) | Step 3 screen for body inputs, activity level, BMI preview, and macro calculation trigger. |
| [apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx) | Step 4 screen for reviewing and finalizing macro targets before completing onboarding. |

## Macro Calculation Algorithm

The calculation logic lives in [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts) inside `calculateMacros`.

### Basal Metabolism Formula

The handler uses the following basal metabolism formula with a fixed assumed age of 30:

$$
MB = (10 \times peso_{kg}) + (6.25 \times altura_{cm}) - (5 \times 30) + 5
$$

This is the exact formula currently implemented in code.

### Activity Multipliers

The calculated basal metabolism is multiplied by one of these activity factors to derive TDEE:

| Activity level | Multiplier |
|---|---|
| `sedentary` | `1.2` |
| `lightlyActive` | `1.375` |
| `moderatelyActive` | `1.55` |
| `veryActive` | `1.725` |

### Calorie Adjustment By Goal

After TDEE is computed, the handler applies a goal-specific calorie adjustment:

| Goal | Adjustment |
|---|---|
| `Muscle` | `+300 kcal` |
| `Wellness` | `0 kcal` |
| `Recovery` | `0 kcal` |
| `Energy` | `-150 kcal` |

### Protein Multipliers By Goal

Daily protein is calculated from body weight in kilograms using these per-goal multipliers:

| Goal | Protein rule |
|---|---|
| `Muscle` | `2.0 g/kg` |
| `Wellness` | `1.6 g/kg` |
| `Energy` | `1.8 g/kg` |
| `Recovery` | `2.2 g/kg` |

### Carbohydrate Calculation

The handler reserves 30% of total calories for fat, converts protein to calories using `protein × 4`, and then derives carbs from the remaining calories:

$$
calorias\_gordura = calorias\_totais \times 0.3
$$

$$
carboidratos = \frac{calorias\_totais - (proteina \times 4) - calorias\_gordura}{4}
$$

### BMI Calculation

The onboarding body step also displays BMI in real time from the same backend response:

$$
IMC = \frac{peso_{kg}}{(altura_{m})^2}
$$

The response classifies BMI into `underweight`, `normal`, `overweight`, or `obese`.

## Unit Conversion in Onboarding

When `unitSystem` is `imperial`, the backend handler supports converting the incoming values before calculation:

- `weight` in pounds is divided by `2.205` to obtain kilograms.
- `height` in inches is multiplied by `2.54` to obtain centimeters.

Those conversions are implemented directly in [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts) through `POUNDS_PER_KILOGRAM` and `CENTIMETERS_PER_INCH`.

One precision note about the current mobile flow: [apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx) already converts imperial input to storage-normalized metric values through [apps/mobile/src/hooks/useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts) before calling `/users/calculate-macros`, and currently sends `unitSystem: 'metric'` in that request. The backend conversion path still exists and remains valid for direct API consumers or future mobile changes.

## isNewUser Flow

The onboarding gate is controlled by the authentication store and the root navigator.

### Entry Conditions

- Email registration sets `isNewUser: true` in [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts) and persists `onboarding_completed: false` in MMKV.
- Google login passes `isNewUser` from the OAuth deep link into `_setSession(...)` in [apps/mobile/src/hooks/useGoogleAuth.ts](../../apps/mobile/src/hooks/useGoogleAuth.ts).
- `_setSession(...)` in [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts) keeps onboarding active when the backend marks the user as new or when MMKV already contains an unfinished onboarding marker.

### RootNavigator Switching

In [apps/mobile/src/navigation/RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx), the root stack branches like this:

1. If `isRestoringSession` is true, show the splash state.
2. If not authenticated, show `AuthNavigator`.
3. If authenticated and `isNewUser` is true, show `OnboardingNavigator`.
4. Only authenticated users with `isNewUser: false` reach `AppNavigator` and therefore Home.

### Completion

The final onboarding step in [apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx):

1. PATCHes `/users/me` with the chosen model, goal, macro targets, unit system, and any collected body data.
2. Calls `completeOnboarding()` from the auth store.
3. `completeOnboarding()` sets `isNewUser: false` and persists `onboarding_completed: true` in MMKV.
4. Calls `resetOnboarding()` to clear the temporary onboarding store.

Because RootNavigator reacts directly to `isNewUser`, navigation into the main app happens automatically with no imperative redirect from the onboarding screen.

## Pending Items

| Item | Status |
|---|---|
| `dailyCarbTarget` in the onboarding completion payload | Added retroactively during CP1.4. The current onboarding implementation already persists it in [apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx) and [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts). |
| Post-onboarding UI for editing targets | Lives in the profile/settings surface implemented in CP1.11. |