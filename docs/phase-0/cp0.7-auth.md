# CP0.7 — Authentication System

This checkpoint implements the complete authentication foundation for BLENDi Pulse across four connected areas: shared Zod schemas in `packages/shared` for end-to-end validation, JWT-based authentication with Argon2 hashing in the backend, full mobile integration through Zustand and `expo-secure-store`, and an `EmailService` running in console mode during development while preserving a stable interface for Resend integration in Phase 4.

---

## Files Created

### packages/shared

| File | Description |
|---|---|
| `packages/shared/src/schemas/auth.ts` | Shared Zod schemas for register, login, refresh token, timezone update, and the later auth-related OTP/reset flows, plus inferred exported types |
| `packages/shared/src/schemas/user.ts` | Shared user-domain schemas, including macro targets and timezone validation |

### apps/api

| File | Description |
|---|---|
| `apps/api/src/config/auth.ts` | Central auth constants defining access-token and refresh-token secrets and lifetimes |
| `apps/api/src/services/auth.service.ts` | Pure auth utilities for JWT generation and verification plus Argon2 helpers |
| `apps/api/src/services/email.service.ts` | Console-backed email transport abstraction with stable public methods and future Resend swap-in point |
| `apps/api/src/services/otp.service.ts` | OTP generation and validation service that now extends the auth surface with password-reset support |
| `apps/api/src/controllers/auth.controller.ts` | HTTP handlers for register, login, refresh, and timezone update |
| `apps/api/src/routes/auth.ts` | Updated auth router wiring the authentication endpoints and protected timezone route, alongside later Google OAuth and OTP-related endpoints |

### apps/mobile

| File | Description |
|---|---|
| `apps/mobile/src/services/auth.service.ts` | Stateless mobile client for auth endpoints, typed against the shared schemas and backend response contracts |
| `apps/mobile/src/store/auth.store.ts` | Zustand auth store that owns session state, secure refresh-token persistence, and Axios interceptor registration |
| `apps/mobile/App.tsx` | Updated app bootstrap that registers Axios interceptors and restores the session on startup |

---

## Shared Schemas

Authentication validation is centralized in `packages/shared/src/schemas/auth.ts`, making the mobile app and backend agree on the same input rules.

### `registerSchema`

| Field | Rules |
|---|---|
| `email` | Required string, lowercased, max `255`, valid email format |
| `password` | Required string, min `8`, max `72`, must contain at least one uppercase letter, one lowercase letter, and one digit |
| `name` | Required string, trimmed, min `2`, max `60` |
| `blendiModel` | Required enum: `Lite`, `ProPlus`, `Steel` |
| `goal` | Required enum: `Muscle`, `Wellness`, `Energy`, `Recovery` |
| `preferredLanguage` | Enum: `en`, `pt-BR`; defaults to `en` |
| `dailyProteinTarget` | Required integer between `10` and `400` |
| `dailyCalorieTarget` | Required integer between `500` and `10000` |
| `timezone` | Required non-empty string |

### `loginSchema`

| Field | Rules |
|---|---|
| `email` | Required string, lowercased, valid email format |
| `password` | Required non-empty string |

`loginSchema` intentionally does not re-run password complexity validation. It accepts whatever the user typed and lets credential verification happen against the stored hash.

### `refreshTokenSchema`

| Field | Rules |
|---|---|
| `refreshToken` | Required non-empty string |

### `macroTargetSchema` in `packages/shared/src/schemas/user.ts`

The macro-target schema currently includes more than the two original core targets, but the required authentication-related baseline is:

| Field | Rules |
|---|---|
| `dailyCalorieTarget` | Required integer between `500` and `10000` |
| `dailyProteinTarget` | Required integer between `10` and `400` |

The same schema now also supports optional `dailyCarbTarget` and `dailyFatTarget`, extending the profile domain without changing the original validation approach.

### Inferred Types

All shared schemas export inferred TypeScript types, including:

- `RegisterInput`
- `LoginInput`
- `RefreshTokenInput`
- `UpdateTimezoneInput`
- `MacroTargetInput`

This keeps the mobile forms and backend controllers aligned without hand-maintained duplicate interfaces.

---

## Token Strategy

The authentication system uses two JWT types with different lifetimes and storage rules.

### Access Token

| Property | Value |
|---|---|
| Secret | `JWT_ACCESS_SECRET` |
| Lifetime | `15 minutes` |
| Payload | `sub`, `email`, `iat`, `exp` |
| Storage | In-memory only, inside the mobile Zustand store |

The access token is never persisted to disk. Because it is short-lived and held only in memory, the window of exposure is minimized if the device state is inspected or the app process is compromised.

### Refresh Token

| Property | Value |
|---|---|
| Secret | `JWT_REFRESH_SECRET` |
| Lifetime | `30 days` |
| Payload | `sub`, `iat`, `exp` |
| Storage | `expo-secure-store`, backed by Keychain on iOS and Keystore on Android |

The refresh token is the only long-lived session artifact. It must survive app restarts, so it is stored in the most secure storage primitive available in the Expo managed workflow.

### Why The Tokens Are Split This Way

The short-lived access token stays in memory to reduce exposure risk. The long-lived refresh token lives in secure storage so the user does not need to log in again every time the app reopens. This separation balances security and user experience without relying on browser-based session mechanisms.

---

## Refresh Token Rotation

Refresh token rotation is enabled in `POST /auth/refresh`.

Mechanism:

1. The client sends the current refresh token.
2. The backend validates it.
3. If valid, the backend generates a new access token and a new refresh token.
4. The client replaces the stored refresh token with the new one.
5. The previous refresh token is treated as obsolete.

Security implication:

If a stolen refresh token is used, the legitimate client that later tries to use the old token will receive `401 Unauthorized`. That creates a hard failure instead of allowing both actors to continue refreshing indefinitely, which helps expose possible token compromise earlier.

---

## Mobile Auth Store

The mobile authentication state is centralized in `apps/mobile/src/store/auth.store.ts` using Zustand.

### State Fields

| Field | Meaning |
|---|---|
| `user` | Public authenticated user payload or `null` |
| `accessToken` | Current access token in memory or `null` |
| `isAuthenticated` | Boolean derived from the presence of `accessToken` |
| `isLoading` | Tracks async auth operations such as login, register, and session restore |

### Core Actions

| Action | Behavior |
|---|---|
| `login` | Calls the backend, stores the refresh token in Secure Store, stores the access token in memory, and sets the public user object |
| `logout` | Deletes the refresh token from Secure Store and clears all local auth state |
| `restoreSession` | Reads the refresh token from Secure Store on app startup, requests a new token pair, persists the rotated refresh token, and restores the access token without user interaction |

Additional store actions such as `register`, `_setAccessToken`, `_setSession`, and `updateTimezone` extend the core session flow but do not change the main design: memory-only access token, secure persisted refresh token, and centralized state transitions.

---

## Axios Interceptors

Axios authentication behavior is registered by `setupAxiosInterceptors()` in the auth store and called from `App.tsx` during boot.

### Request Interceptor

The request interceptor reads the latest `accessToken` from Zustand and automatically appends:

```http
Authorization: Bearer <accessToken>
```

This avoids manual header wiring in each service call.

### Response Interceptor

The response interceptor handles `401` errors with a single retry strategy:

1. Detect a `401`
2. Confirm the request was not already retried using `_isRetry`
3. Read the refresh token from Secure Store
4. Call `POST /auth/refresh`
5. Persist the rotated refresh token
6. Update the in-memory access token
7. Replay the original request once

If refresh fails, the store performs logout and invokes the session-expired callback, allowing the app to redirect the user back to login when navigation is wired.

---

## EmailService

In development, all email methods in `apps/api/src/services/email.service.ts` log to the console instead of sending real emails.

### Core Public Methods

| Method | Purpose |
|---|---|
| `sendWelcomeEmail(name, email)` | Simulates the post-registration welcome email |
| `sendVerificationEmail(name, email, code)` | Simulates the account verification email with a visible console code block |

The service now also includes `sendPasswordResetEmail(...)` as a later authentication extension, but the key architectural point remains the same: controllers depend on the stable `IEmailService` interface, not on a specific transport provider.

When Resend is integrated in Phase 4, the public interface is expected to stay the same. Only the internal implementation will change.

---

## Test Results

The authentication smoke test script in `apps/api/scripts/test-auth.sh` validates the core auth surface. Based on the provided results, the following 11 checks passed:

| Test | Result |
|---|---|
| Health check | `GET /ping` returned success and confirmed the API was online |
| Register | `POST /auth/register` returned `201` and included `accessToken` plus `refreshToken` |
| Duplicate email | A second register attempt with the same email returned `409` |
| Login | `POST /auth/login` returned `200` and issued new tokens |
| Wrong password | Login with incorrect password returned generic `401` |
| Valid token on protected flow | A valid access token was accepted in the authenticated flow and bearer handling worked as expected |
| Authentication middleware registered | Middleware behavior was verified as wired and functional in the protected-route path |
| Refresh with rotation | `POST /auth/refresh` returned `200` and a new refresh token different from the original |
| Invalid refresh | Refresh with an invalid token returned `401` |
| PATCH timezone success | `PATCH /auth/timezone` succeeded and persisted `Asia/Tokyo` |
| PATCH timezone without token | Protected timezone update without a token returned `401` |

Operational note: the same smoke script also contains an additional assertion that the register response echoes `user.timezone`, but the 11 core results above are the set requested for this checkpoint summary.

---

## Technical Decisions

### Why Argon2 Was Chosen Instead Of bcrypt

Argon2id is the modern password-hashing default and the winner of the Password Hashing Competition. It is memory-hard, making large-scale GPU and ASIC attacks more expensive than with bcrypt. For a security-sensitive auth layer, that makes it the stronger long-term choice.

### Why The Password Limit Is 72 Characters

The shared validation schema keeps an explicit ceiling of `72` characters because the original auth validation was designed to avoid silent truncation in bcrypt-based implementations. Even though the current hashing logic uses Argon2id, preserving a hard upper bound keeps validation predictable and avoids unexpectedly large password inputs.

### Why Login Errors Are Generic

The login controller returns the same `401` message for unknown emails and incorrect passwords. This prevents attackers from using the login form as an account-enumeration tool.

### Why HttpOnly Cookies Were Not Used

HttpOnly cookies are a browser feature. BLENDi Pulse is a native Expo app, not a browser SPA, so the project uses explicit bearer tokens plus secure native storage instead of relying on cookie-based session semantics.

---

## Pending Items

| Item | Planned phase |
|---|---|
| Login and registration screens in the mobile UI | Phase 1 |
| Password reset screen in the mobile UI | Phase 1 |
| Resend email transport integration | Phase 4 |