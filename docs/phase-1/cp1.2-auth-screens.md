# CP1.2 — Authentication Screens

This checkpoint implements the five authentication screens with a visual language inspired by Revolut and Vercel, closes the remaining OTP/password-reset and Google-auth state-consumption work left open by CP0.9, and introduces the standardized backend error-code contract consumed through i18n on mobile. In practice, this slice turns the CP0.7 and CP0.9 auth scaffolding into a production-shaped flow with consistent UI primitives, animated OTP handling, and deterministic error translation based on backend `code` values instead of raw server messages.

## Files Created

| File | Description |
|---|---|
| [apps/mobile/src/components/ui/AuroraBackground.tsx](../../apps/mobile/src/components/ui/AuroraBackground.tsx) | Animated aurora backdrop with three `LinearGradient` layers and an `intensity` prop that switches between full and reduced motion timing. |
| [apps/mobile/src/components/ui/AuthInput.tsx](../../apps/mobile/src/components/ui/AuthInput.tsx) | Glassmorphism input without `expo-blur`, with floating label animation, focus border animation, inline success check, and animated error state. |
| [apps/mobile/src/components/ui/AuthButton.tsx](../../apps/mobile/src/components/ui/AuthButton.tsx) | Primary CTA button with press-scale animation and integrated loading state. |
| [apps/mobile/src/components/ui/AuthProgressDots.tsx](../../apps/mobile/src/components/ui/AuthProgressDots.tsx) | Animated progress indicator used for multi-step auth flows such as registration. |
| [apps/mobile/src/components/ui/GoogleSignInButton.tsx](../../apps/mobile/src/components/ui/GoogleSignInButton.tsx) | Dedicated Google CTA styled differently from the form fields and currently consumed by the login screen. |
| [apps/mobile/src/components/ui/AuthScreenLayout.tsx](../../apps/mobile/src/components/ui/AuthScreenLayout.tsx) | Shared auth layout wrapper combining `ScrollView` and `KeyboardAvoidingView` to keep the CTA anchored at the bottom without the old fixed-bar overlap bug. |
| [apps/mobile/src/screens/auth/LoginScreen.tsx](../../apps/mobile/src/screens/auth/LoginScreen.tsx) | Login form with email/password, forgot-password link, Google sign-in entry point, and backend-code-aware error handling. |
| [apps/mobile/src/screens/auth/RegisterScreen.tsx](../../apps/mobile/src/screens/auth/RegisterScreen.tsx) | Registration form with live validation, password strength meter, progress dots, and legal links. |
| [apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx](../../apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx) | Email capture screen that starts the OTP recovery flow. |
| [apps/mobile/src/screens/auth/VerifyOtpScreen.tsx](../../apps/mobile/src/screens/auth/VerifyOtpScreen.tsx) | Six-box OTP verification UI with auto-submit, resend countdown, autofill support, and invalid-code feedback animation. |
| [apps/mobile/src/screens/auth/ResetPasswordScreen.tsx](../../apps/mobile/src/screens/auth/ResetPasswordScreen.tsx) | Password reset screen with strength meter, confirmation flow, and success-state animation before redirecting back to login. |
| [apps/mobile/src/utils/error.utils.ts](../../apps/mobile/src/utils/error.utils.ts) | Mobile utility that maps backend error codes into `errors.*` i18n keys and falls back to offline and timeout translations for transport failures. |

## Design Language

The visual baseline for the auth experience comes from the shared Deep Plum background token `#2b1429`, defined in [packages/shared/src/tokens.ts](../../packages/shared/src/tokens.ts), then layered with an animated aurora backdrop in [apps/mobile/src/components/ui/AuroraBackground.tsx](../../apps/mobile/src/components/ui/AuroraBackground.tsx).

### Background And Motion

- The base screen color is Deep Plum `#2b1429`.
- `AuroraBackground` renders three animated `LinearGradient` layers over a darker vertical mid-tone.
- `intensity="full"` runs an 8-second half-cycle and `intensity="reduced"` runs a 14-second half-cycle.
- Reduced intensity also lowers opacity through a `0.6` multiplier rather than removing the aurora entirely.

### Inputs And Surfaces

- The auth inputs intentionally avoid `expo-blur` and simulate glass with layered `View`s.
- The implemented input surface uses `rgba(255,255,255,0.07)` as the base fill, a top highlight at `rgba(255,255,255,0.04)`, and an idle border starting from `rgba(255,255,255,0.10)` before animating into the Pulse accent color on focus.
- Inputs use a `borderRadius` of `14` instead of a pill shape, which keeps the forms closer to Vercel's tighter geometry than to a fully rounded consumer-fintech look.
- Titles across the auth screens use `letterSpacing: -0.8` for a tighter display rhythm.

### CTA Placement

The bottom CTA is anchored through layout mechanics instead of fixed positioning. In [apps/mobile/src/components/ui/AuthScreenLayout.tsx](../../apps/mobile/src/components/ui/AuthScreenLayout.tsx), `ScrollView` uses `contentContainerStyle` with `flexGrow: 1` and `justifyContent: 'space-between'`, while `KeyboardAvoidingView` absorbs keyboard movement. This avoids the classic fixed-footer bug where the action bar overlaps fields on smaller devices.

### Differentiated Google CTA

`GoogleSignInButton` is visually separated from the main form fields through its own outline treatment, Google icon, and non-filled surface. That makes it read as an alternate authentication method instead of a second primary CTA.

## Error Code System

The standardized auth error contract lives on the backend and is consumed on mobile through [apps/mobile/src/utils/error.utils.ts](../../apps/mobile/src/utils/error.utils.ts). The backend returns JSON in the shape `{ success: false, code, message }`, but the mobile auth screens do not display the backend `message` directly. Instead, they convert `code` into an i18n key under the `errors` namespace.

### Backend Codes Used By The Auth Flow

| Code | Meaning |
|---|---|
| `auth/invalid-credentials` | Email/password combination was rejected during login. |
| `auth/email-already-exists` | Registration attempted with an email that already exists. |
| `auth/otp-invalid` | OTP code is wrong but not expired; this is the generic incorrect-code path currently emitted by the backend. |
| `auth/otp-expired` | OTP exists but is no longer valid. |
| `auth/otp-max-attempts` | OTP verification was blocked after too many attempts. |
| `auth/reset-token-invalid` | Reset token is malformed, wrong-purpose, already invalidated, or otherwise unusable. |
| `auth/reset-token-expired` | Reset token expired before password reset completed. |

### Mobile Translation Rule

`getApiErrorTranslationKey()` lowercases the backend code and rewrites `/` and `-` into `_`, so `auth/invalid-credentials` becomes `errors.auth_invalid_credentials`. The auth screens then pass that key to `t(...)` and render the localized copy from the mobile i18n resources.

### Important Constraint

The auth UI never trusts the backend `message` field for user-facing copy. The `message` remains useful for logs, API consumers, and non-localized clients, but the mobile app always uses `code` as the translation source of truth. Transport failures that arrive without a backend response are handled separately through offline and timeout fallbacks.

## OTP Input Behavior

The OTP UI is implemented inside [apps/mobile/src/screens/auth/VerifyOtpScreen.tsx](../../apps/mobile/src/screens/auth/VerifyOtpScreen.tsx) as a visual six-box component driven by a single hidden `TextInput`.

### Interaction Model

- Digits advance automatically because the hidden input appends characters and the rendered active box follows `otpCode.length`.
- Deleting characters moves the active position backward immediately because the visual cursor is derived from the current string length.
- When the sixth digit is filled, a `useEffect` submits the code automatically without waiting for a manual CTA tap.
- Incorrect OTP responses trigger a horizontal shake animation plus a temporary red error border overlay across the boxes.
- On iOS, SMS autofill is supported through `textContentType="oneTimeCode"`; the screen also sets `autoComplete="one-time-code"` for the broader platform hint.

### Visual Feedback

- The active box pulses subtly through a scale animation while waiting for input.
- Expired and max-attempt OTP errors immediately clear the current code, surface the translated error message, and unlock the resend action.
- The verify button at the bottom acts as a busy-state indicator during submission, but the screen's primary completion path is the auto-submit on six digits.

## Pending Items

| Item | Status |
|---|---|
| Integrate `profilePhoto` into the broader authenticated profile surface once the Me screen exists | Resolved in CP1.11. The base mobile `AuthUser` type already includes `profilePhoto`, but the full profile-oriented surface lands later. |
| Configure `bundleIdentifier` for production iOS builds | Still pending. [apps/mobile/app.json](../../apps/mobile/app.json) does not yet declare an iOS bundle identifier, and final provisioning is blocked by the Apple Developer Account setup. |

## Technical Decisions

### Why `expo-blur` Was Removed

`expo-blur` was intentionally avoided for this auth surface because the target developer workflow depends on Expo Go, where the blur-based version caused compatibility issues and could fail with the platform-level unimplemented component error. The design goal was a premium translucent surface without adding a native dependency that undermined the development and QA loop.

### How Glassmorphism Is Simulated

Instead of blur, [apps/mobile/src/components/ui/AuthInput.tsx](../../apps/mobile/src/components/ui/AuthInput.tsx) composes the effect from layered `View`s:

1. A low-opacity base fill for the glass body.
2. A top highlight layer to simulate light passing through the surface.
3. An animated border that brightens on focus.
4. Floating-label and success/error animations layered above the surface.

This approach preserves the intended visual softness while staying fully compatible with Expo Go and keeping interaction performance predictable.