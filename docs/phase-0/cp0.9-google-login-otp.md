# CP0.9 — Google OAuth Login & OTP Password Reset

This checkpoint implements two complementary authentication features: social login through Google OAuth 2.0 using the authorization code flow with a backend callback and mobile deep link, and password reset through a 6-digit email OTP chosen because it is the smoothest mobile experience. The user stays inside the app flow instead of leaving the app to open email links in an external client.

---

## Files Created

### Part A — Google OAuth Backend

| File or update | Description |
|---|---|
| `apps/api/src/services/google.service.ts` | Encapsulates Google OAuth 2.0 communication, including authorization URL generation, code exchange, and verified user extraction from the Google ID token |
| `apps/api/src/controllers/google.controller.ts` | Implements the backend OAuth flow, CSRF validation via `state`, account merge logic, and deep-link redirect back to the mobile app |
| `apps/api/src/routes/auth.ts` | Updated to add `GET /auth/google/url` and `GET /auth/google/callback` |

### Part B — Google Login Mobile

| File or update | Description |
|---|---|
| `apps/mobile/src/hooks/useGoogleAuth.ts` | Encapsulates the complete Google sign-in flow with `expo-web-browser`, deep-link parsing, and session persistence |
| `apps/mobile/src/components/ui/GoogleSignInButton.tsx` | Presentation-only Google sign-in button component with loading and accessibility behavior |
| `apps/mobile/src/services/auth.service.ts` | Updated to expose `getGoogleAuthUrl()` so the mobile app can request the backend-generated authorization URL |

### Part C — OTP Reset

| File or update | Description |
|---|---|
| `apps/api/src/models/Otp.ts` | Mongoose model for password reset OTPs with TTL expiration, `used` flag, and attempt counter |
| `apps/api/src/services/otp.service.ts` | Generates, hashes, validates, and invalidates OTP codes with brute-force protection |
| `apps/api/src/controllers/password.controller.ts` | Implements `forgotPassword`, `verifyOtp`, and `resetPassword` handlers |
| `apps/api/src/routes/auth.ts` | Updated to add `POST /auth/forgot-password`, `POST /auth/verify-otp`, and `PATCH /auth/reset-password` |
| `apps/api/src/services/email.service.ts` | Updated with `sendPasswordResetEmail()` and locale-based password reset email templates |
| `packages/shared/src/schemas/auth.ts` | Updated with `googleCallbackSchema`, `forgotPasswordSchema`, `verifyOtpSchema`, and `resetPasswordSchema` |

---

## Google OAuth Architecture

The implemented OAuth flow uses the backend as the intermediary between Google and the mobile app.

### Step 1

The mobile app calls `GET /auth/google/url` on the backend and receives a fully built Google authorization URL.

### Step 2

The mobile app opens that URL with `expo-web-browser` using `openAuthSessionAsync`.

### Step 3

Google authenticates the user and redirects to:

`http://localhost:3000/auth/google/callback?code=...&state=...`

The redirect URI points to the backend, not directly to the mobile app, because Google OAuth for this setup expects a standard backend callback and does not use Expo runtime URLs such as `exp://...` as the callback target.

### Step 4

The backend processes the authorization code, creates or logs in the user, and redirects to the app deep link.

In the current implementation, that redirect is:

`blendipulse://auth/callback?accessToken=...&refreshToken=...&isNewUser=...&user=...`

### Step 5

`expo-web-browser` detects the deep link based on the `blendipulse` scheme configured in `app.json`, closes automatically, and `useGoogleAuth` parses the URL, extracts the tokens, decodes the serialized user payload, and saves the session via the Zustand store.

**This backend-as-intermediary architecture is the correct one for this native mobile flow and replaces the initial prompt assumption that the app itself should be the Google redirect target.**

---

## Google Service

`apps/api/src/services/google.service.ts` exposes three core functions.

### `getAuthorizationUrl(state)`

Builds the Google OAuth authorization URL using:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_REDIRECT_URI`
- scopes `email` and `profile`
- `prompt: 'select_account'`
- a JWT `state` token used for CSRF protection

### `exchangeCodeForTokens(code)`

Exchanges the one-time authorization code received in the callback for Google tokens and returns the `id_token` used by the application.

The service intentionally returns the ID token because that is the token used to verify the user identity and extract the profile data required by BLENDi Pulse.

### `getUserInfoFromToken(idToken)`

Verifies the Google ID token and extracts:

- Google user ID (`googleId`)
- email
- name
- profile photo URL

Verification is delegated to the official `googleapis` SDK, which also handles the necessary token validation details such as audience, issuer, and expiration.

---

## User Model Updates

The Mongoose user schema was extended with two Google-related fields.

| Field | Type | Behavior |
|---|---|---|
| `googleId` | `string` | Optional, unique, sparse, and `select: false` |
| `profilePhoto` | `string` | Optional URL to the user's Google profile image |

### Why The Sparse Index Matters

The sparse unique index on `googleId` ensures uniqueness only for documents that actually have a `googleId` value. Documents created through regular email-and-password registration do not have that field, and the sparse index ignores them instead of treating missing values as conflicting duplicates.

This is required because the system supports both OAuth users and traditional credential-based users in the same collection.

---

## Account Merging Logic

`handleGoogleCallback` in `apps/api/src/controllers/google.controller.ts` handles three scenarios.

### 1. User With This `googleId` Already Exists

The user has already logged in with Google before. The backend logs them in directly and returns tokens.

### 2. User With This Email Exists But Has No `googleId`

The user originally registered with email and password. The backend merges the accounts by adding `googleId` and `profilePhoto` to the existing user document without losing any existing data.

### 3. No User With This Email Exists

The backend creates a brand-new user using Google profile data and onboarding defaults:

- `locale: 'en'`
- `timezone: 'America/New_York'`
- `blendiModel: 'Lite'`
- `goal: 'Wellness'`
- `dailyProteinTarget: 150`
- `dailyCalorieTarget: 2000`

The app can later complete or adjust those values during onboarding.

---

## OTP System

The OTP password reset flow is implemented entirely on the backend and uses MongoDB plus JWTs.

### Stored Fields In The `Otp` Model

| Field | Purpose |
|---|---|
| `email` | Identifies which user the OTP was issued for |
| `otpHash` | Argon2 hash of the 6-digit OTP |
| `expiresAt` | Expiration timestamp, set to 15 minutes after issuance |
| `used` | Marks whether the OTP has already been consumed successfully |
| `attempts` | Counts validation attempts to enforce the retry limit |

### Expiration And Cleanup

The `expiresAt` field has a TTL index, so MongoDB automatically removes expired OTP documents without any cron job.

### OTP Generation

The 6-digit code is generated with `crypto.randomInt`, which is cryptographically secure, then hashed with Argon2 before being stored.

### Attempt Limit

The system blocks the OTP after 5 incorrect attempts. Attempts are incremented before verification to reduce race-condition bypasses.

### Reset Token Issuance

After successful OTP verification, the backend issues a temporary reset JWT valid for 10 minutes. Its payload includes:

- `sub` as the user email
- `purpose: password_reset`

That purpose field prevents other JWT types from being reused as password reset authorization.

### One More Implemented Protection

After a successful password change, `passwordChangedAt` is used to reject reset-token reuse. If the token was issued before the most recent password change, it is no longer accepted.

---

## Security Decisions

| Decision | Reason |
|---|---|
| Identical `forgot-password` response for existing and non-existing emails | Prevents account enumeration |
| 5-attempt OTP limit | Reduces online brute-force viability against a 6-digit code |
| Separate reset token with `purpose: password_reset` | Prevents misuse of other token types for password reset |
| MongoDB TTL cleanup for expired OTPs | Removes stale OTPs automatically without additional cleanup infrastructure |
| Argon2 for OTP hashing | Applies the same strong hashing posture used for passwords to short-lived codes |
| Reset token reuse blocked through `passwordChangedAt` | Prevents a valid-but-already-used reset token from being replayed |

---

## EmailService Updates

The `EmailService` gained a new public method:

`sendPasswordResetEmail(name, email, code, locale)`

In development, this method does not send real email. Instead, it logs the OTP to the console in a highlighted block, making manual testing much easier during local development.

The implementation also loads localized email templates from JSON locale files, so the public interface is already compatible with a real email provider.

In Phase 4, the console-based implementation will be replaced by a real Resend integration without changing the controller-facing method signature.

---

## Pending Items

| Item | Planned phase |
|---|---|
| Integrate `GoogleSignInButton` into the login and registration screens | Phase 1 |
| Create `ForgotPasswordScreen`, `VerifyOtpScreen`, and `ResetPasswordScreen` | Phase 1 |
| Update `useGoogleAuth` to return `isNewUser` once onboarding flow consumes it | Phase 1 |
| Add `profilePhoto` to the mobile `AuthUser` interface when the profile screen starts rendering it | Phase 1 |

---

## Technical Decisions

### Why OTP Instead Of Magic Link

OTP was chosen over magic link because it is more fluid in a mobile app context. The user receives a code and stays inside the in-app reset flow, instead of jumping between email client and app deep links.

### Why The Backend Is The OAuth Intermediary

The backend intermediary pattern keeps Google client credentials off the mobile app, centralizes token exchange and validation, and uses a standard backend callback URL that Google accepts. It also gives the backend control over account merge logic before issuing the app's own tokens.

### Why `crypto.randomInt` Instead Of `Math.random`

`crypto.randomInt` uses a cryptographically secure random source. `Math.random` is not suitable for security-sensitive codes such as password reset OTPs because it is predictable enough to weaken the flow.

### Why The Reset Token Lasts Only 10 Minutes

The reset token is short-lived because it authorizes a sensitive operation. Ten minutes is long enough for a normal user to complete the reset flow but short enough to keep the misuse window narrow if the token is intercepted or exposed.