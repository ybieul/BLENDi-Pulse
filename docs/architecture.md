# BLENDi Pulse — Architecture

BLENDi Pulse is a mobile-first application built on top of three independent layers that communicate through an HTTPS REST API. The strict separation between these layers allows the mobile app, the backend, and the persistence layer to evolve independently, with clear contracts and minimal coupling between implementation details.

---

## System Overview

BLENDi Pulse is organized as a layered system with explicit responsibilities per tier.

### 1. Mobile Client

The mobile app lives in `apps/mobile` and is built with React Native and Expo for iOS and Android. It is the user-facing client installed on devices and is responsible for rendering UI, driving navigation, capturing device context, and calling the backend over HTTPS.

At the current Phase 0 foundation, Zustand manages in-memory authentication state, `expo-secure-store` persists the refresh token across app restarts, and MMKV is already used for lightweight persisted preferences such as the saved locale. TanStack React Query is part of the mobile stack and is intended to become the server-state layer as screens and feature flows are added.

### 2. Backend API

The backend lives in `apps/api` and is built with Node.js and Express 5, deployed on Railway. It owns all business logic, validates external input, manages JWT authentication, persists data to MongoDB, and acts as the single integration point for external providers. In the current codebase, the implemented third-party integration is Google OAuth; future providers are expected to follow the same backend-only boundary.

No mobile client talks directly to MongoDB or third-party APIs. Every privileged operation flows through the backend so that validation, authorization, auditing, and rate-limiting decisions remain centralized.

### 3. Persistence

MongoDB Atlas stores the system's persistent application data, including users, authentication state, OTP records, and future domain entities.

Object storage for binary assets is a planned architectural direction for later phases, but no object storage provider is integrated in the current Phase 0 codebase.

### Request Flow

```text
User
  |
  v
iOS / Android App (React Native + Expo)
  |
  | HTTPS JSON
  v
Railway - Node.js / Express 5 API
  |                |
  |                +--------------------> Google OAuth API
  |
  v
MongoDB Atlas
```

Additional provider integrations can be added later, but they should preserve the same rule: the mobile client talks only to the BLENDi Pulse API, and the API talks to external services.

---

## Monorepo Structure

The repository uses pnpm workspaces to keep all runtime layers, shared contracts, and project documentation inside a single versioned codebase.

| Root path | Responsibility | May be imported by |
|---|---|---|
| `apps/mobile` | React Native/Expo application, screens, hooks, local state, and mobile-specific services | Not imported by other packages |
| `apps/api` | Express API, controllers, services, models, middleware, and backend integrations | Not imported by other packages |
| `packages/shared` | Cross-layer contracts such as design tokens, shared Zod schemas, and inferred types | `apps/mobile` and `apps/api` |
| `.github/workflows` | CI/CD automation, validation pipelines, and repository-level checks | Not importable runtime code |
| `docs` | Human-readable technical documentation, architecture, API reference, and checkpoint writeups | Not importable runtime code |

Dependency rule:

- `apps/mobile` may import from `packages/shared`.
- `apps/api` may import from `packages/shared`.
- `packages/shared` must never import from `apps/mobile` or `apps/api`.

This rule preserves one-way dependency flow. Shared code stays framework-agnostic, while application code depends on shared contracts rather than the opposite.

---

## Shared Package

The `packages/shared` workspace contains everything that must remain consistent across frontend and backend.

The package exports three main groups:

| Export group | Location | Purpose |
|---|---|---|
| Design tokens | `tokens.ts` | Shared spacing, typography, radii, colors, and other design constants used to keep the product visually consistent |
| Zod schemas | `schemas/` | Validation rules for inputs and payloads that need to be enforced identically across layers |
| Inferred TypeScript types | Inferred from the schemas and re-exported by the package | Strongly typed contracts without hand-maintained duplicate interfaces |

Any validation rule that must be applied in both frontend and backend must live in `packages/shared`. It must never be duplicated in both layers, because duplicated validation drifts over time and creates mismatched behavior between form UX and server enforcement.

---

## Authentication Architecture

Authentication is implemented as a token-based flow designed for native mobile applications rather than browser sessions.

### Registration Flow

1. The mobile app submits the registration payload to `POST /auth/register`.
2. The client injects the device timezone before sending the request.
3. The backend validates the payload with shared Zod schemas, creates the user, hashes the password with Argon2id, and returns `user`, `accessToken`, and `refreshToken`.
4. The mobile app stores the refresh token in `expo-secure-store` and keeps the access token only in Zustand memory.

### Login Flow

1. The mobile app submits credentials to `POST /auth/login`.
2. The backend validates credentials and returns a new token pair plus the public user payload.
3. The refresh token is persisted securely on device, while the access token is loaded into the in-memory auth store.

### Google OAuth Flow

1. The mobile app requests `GET /auth/google/url` and opens the returned URL with `expo-web-browser`.
2. Google redirects to the backend callback configured in `GOOGLE_REDIRECT_URI`.
3. The backend validates the `state` token, exchanges the authorization code, and either logs in, links, or creates the user.
4. The backend redirects to `blendipulse://auth/callback` with the app tokens and a serialized user payload.

This keeps Google client secrets and account-linking logic on the backend instead of the mobile runtime.

### Password Reset Flow

1. The mobile app starts the flow with `POST /auth/forgot-password`.
2. The backend generates a six-digit OTP, stores only its hash, and sends the code by email.
3. The mobile app submits the code to `POST /auth/verify-otp` and receives a short-lived reset token.
4. The final password update happens through `PATCH /auth/reset-password`, which validates the reset token purpose and rejects replay after `passwordChangedAt` changes.

The reset token is separate from access and refresh tokens because it authorizes a different, more sensitive operation.

### Refresh Token Rotation

1. When the access token expires, the Axios response interceptor catches the `401`.
2. The app loads the persisted refresh token from `expo-secure-store`.
3. The mobile app calls `POST /auth/refresh`.
4. The backend validates the refresh token and returns a brand-new access token and refresh token.
5. The app overwrites the stored refresh token and retries the original request exactly once.

### Token Responsibilities

- The access token lasts 15 minutes and is stored only in memory in Zustand.
- The refresh token lasts 30 days and is stored in `expo-secure-store`, backed by Keychain on iOS and Keystore on Android.

This split minimizes the blast radius of token theft. The short-lived token never touches persistent storage, while the long-lived token is kept in the most secure storage primitive available in the Expo managed workflow.

### Why HttpOnly Cookies Were Not Used

HttpOnly cookies are a browser-oriented mechanism. BLENDi Pulse is a native Expo application, not a browser SPA, so the project cannot rely on browser cookie semantics for secure session handling. Token storage therefore uses native secure storage plus explicit Authorization headers managed by the app itself.

### Axios Interceptors

The shared Axios instance is intentionally kept stateless. Authentication interceptors are registered by the auth store so they always read the latest access token from Zustand and can perform a single automatic retry after refresh. This avoids stale closures, circular dependencies, and infinite refresh loops.

---

## Internationalization Architecture

BLENDi Pulse enforces a zero-hardcoded-strings rule for all screens, components, and user-visible error messages. If text appears in the UI, it belongs in the translation files.

Translation content is organized by functional namespaces. In the current mobile bootstrap, these groups are loaded under a single i18next translation namespace for synchronous initialization, but the domain split remains the documentation contract for where strings belong:

- `common`
- `onboarding`
- `home`
- `blend`
- `recipes`
- `track`
- `profile`
- `errors`
- `notifications`

At runtime, the mobile app initializes i18next synchronously and wraps translation access through `useAppTranslation`. That hook encapsulates i18next usage behind a project-specific API with complete TypeScript key autocomplete, compile-time protection against invalid keys, and centralized language persistence.

This architecture removes ambiguity around where strings belong, keeps localization reviewable in one place, and prevents UI regressions caused by ad hoc text literals scattered through the codebase.

---

## Timezone Strategy

The golden rule is simple:

- The backend always stores dates in UTC.
- The frontend always converts dates to the user's local timezone for display.

The user's timezone is captured automatically on device through `Intl.DateTimeFormat().resolvedOptions().timeZone` and stored in the `timezone` field of the `User` document in MongoDB. The mobile app also re-syncs that value when the app returns to the foreground and detects that the device timezone has changed.

Persisting the timezone in the backend is required for time-based automation. Features such as Daily Pulse, Goal Rings reset windows, and weekly summary reports must execute according to each user's local time rather than the server timezone or raw UTC offsets.

UTC persistence plus local rendering prevents daylight-saving bugs, inconsistent analytics windows, and schedule drift when users travel.

---

## Error Handling Strategy

Error handling is centralized and consistent across layers.

### Backend

The Express `errorHandler` middleware is the final middleware in the chain and catches all uncaught application errors. It returns a standardized JSON payload with the fields `success` and `message`, and includes a stack trace only in development mode.

Validation errors are handled before business logic executes. Shared Zod schemas are used to validate request bodies, and invalid payloads are returned as `400 Bad Request` responses with normalized error messages that the mobile app can translate or surface consistently.

### Mobile

On mobile, Axios interceptors centralize handling of authentication failures and network-level errors. Authentication failures trigger refresh or logout logic, while generic request failures can be mapped into user-facing states without duplicating try/catch behavior throughout the UI.

This separation keeps components focused on rendering states instead of re-implementing transport and session recovery logic.

---

## Offline Strategy

The app is designed so that temporary network loss degrades gracefully instead of making the UI unusable, but the current Phase 0 implementation only lays the storage foundations for that strategy.

- `expo-secure-store` already persists the refresh token for authenticated session recovery.
- MMKV already persists lightweight preferences such as the selected locale.
- TanStack React Query is part of the stack and is intended to manage server-state caching, request deduplication, and stale-data synchronization as feature screens are added.
- Feature-specific offline caches such as recipes, favorites, hydration logs, and supplement tracking are planned consumers of that storage model rather than behavior already implemented in Phase 0.

The goal is predictable behavior: sensitive credentials stay in secure native storage, lightweight preferences survive restarts, and future local-first features will be able to keep working while network-only workflows fail clearly and recover cleanly.

---

## Security Decisions

| Decision | Rationale |
|---|---|
| Argon2id for password hashing instead of bcrypt | Argon2id is the modern password hashing default and offers better memory-hard resistance against GPU attacks than bcrypt |
| Refresh token rotation on every use | A stolen refresh token becomes less useful because each successful refresh invalidates the previous token |
| Forgot-password returns the same response for existing and non-existing emails | Prevents user enumeration by attackers probing which email addresses are registered |
| OTP is blocked after 5 failed attempts | Limits online brute-force attacks against a 6-digit OTP space |
| Reset tokens are temporary, last 10 minutes, and include a `purpose` claim | Prevents reusing access or refresh tokens for password reset and narrows the window for misuse |
| Reset token replay is checked against `passwordChangedAt` | Rejects reuse of a previously valid reset token after the password has already been changed |
| `googleId` uses a sparse unique index on `User` | Preserves uniqueness for Google-linked accounts while allowing regular email/password users to exist without a `googleId` value |

These decisions are intentionally layered: credential storage, token lifecycle, account recovery, and schema-level database constraints each contribute to the overall security posture.

---

## Environment Variables

The following environment variables define the current runtime contract for backend and mobile environments.

### Database

| Variable | Layer | Purpose | Used in |
|---|---|---|---|
| `MONGODB_URI` | Backend | MongoDB connection string for the primary application database | `apps/api/src/config/env.ts`, database bootstrap |

### JWT Authentication

| Variable | Layer | Purpose | Used in |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Backend | Secret used to sign and verify short-lived access tokens | `apps/api/src/config/env.ts`, auth service |
| `JWT_REFRESH_SECRET` | Backend | Secret used to sign and verify long-lived refresh tokens | `apps/api/src/config/env.ts`, auth service |
| `JWT_RESET_SECRET` | Backend | Dedicated secret used only for password reset tokens | `apps/api/src/config/env.ts`, password reset flow |
| `JWT_ACCESS_EXPIRES_IN` | Backend | Lifetime configuration for access tokens, defaulting to 15 minutes | `apps/api/src/config/env.ts`, auth service |
| `JWT_REFRESH_EXPIRES_IN` | Backend | Lifetime configuration for refresh tokens, defaulting to 30 days | `apps/api/src/config/env.ts`, auth service |

### Google OAuth

| Variable | Layer | Purpose | Used in |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Backend | Google OAuth client identifier issued by Google Cloud | `apps/api/src/config/env.ts`, Google OAuth service |
| `GOOGLE_CLIENT_SECRET` | Backend | Google OAuth client secret used during code exchange | `apps/api/src/config/env.ts`, Google OAuth service |
| `GOOGLE_REDIRECT_URI` | Backend | Redirect URI registered in Google Cloud and used during OAuth callback validation | `apps/api/src/config/env.ts`, Google OAuth controller/service |

### General Configuration

| Variable | Layer | Purpose | Used in |
|---|---|---|---|
| `PORT` | Backend | TCP port where the Express server listens | `apps/api/src/config/env.ts`, server bootstrap |
| `NODE_ENV` | Backend | Runtime mode controlling behavior such as stack trace exposure | `apps/api/src/config/env.ts`, error handling |
| `API_VERSION` | Backend | Version label for the API surface and operational metadata | `apps/api/src/config/env.ts`, server config |
| `ALLOWED_ORIGINS` | Backend | CORS allowlist configuration for approved client origins | `apps/api/src/config/env.ts`, HTTP server setup |
| `EXPO_PUBLIC_API_URL` | Mobile | Public base URL for the backend API consumed by the mobile client | `apps/mobile/.env.example`, `apps/mobile/src/config/api.ts` |

The mobile app does not define private secrets in environment files. Any variable with the `EXPO_PUBLIC_` prefix is bundled into the client and must therefore be treated as public configuration only.