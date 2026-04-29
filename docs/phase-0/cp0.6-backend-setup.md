# CP0.6 — Backend Setup

This checkpoint establishes the backend foundation of BLENDi Pulse: a Node.js server built with Express 5 and TypeScript, a validated configuration layer, a MongoDB Atlas connection through Mongoose, the initial `User` model, automated deployment wiring through GitHub Actions and Railway, and a versioned health-check endpoint. Together, these pieces create the minimum production-ready backend shell on top of which all application features can be added.

---

## Files Created

| File | Description |
|---|---|
| `apps/api/src/index.ts` | Server entry point with sequential boot logic: configuration import, database connection, middleware registration, route registration, error handling, and listener startup |
| `apps/api/src/config/env.ts` | Environment-variable validator built with Zod that aborts startup if any required variable is missing or invalid |
| `apps/api/src/config/database.ts` | MongoDB connection manager using Mongoose, including connection timeout settings and connection lifecycle events |
| `apps/api/src/middlewares/errorHandler.ts` | Global error handler returning standardized JSON responses and exposing stack trace only in development |
| `apps/api/src/middlewares/requestLogger.ts` | Development-only request logger printing method, route, status code, and response time |
| `apps/api/src/models/User.ts` | Initial Mongoose schema for the user domain model, including auth, profile, goal, and localization fields |
| `apps/api/src/routes/ping.ts` | Public health-check route exposing API status, version, environment, and server timestamp |
| `.github/workflows/deploy-api.yml` | GitHub Actions workflow that builds the API and triggers deployment on Railway |

---

## Boot Sequence

The backend startup order is deterministic and intentionally strict.

### 1. Environment Validation

`apps/api/src/index.ts` imports `env` from `apps/api/src/config/env.ts` at module load time. That import triggers synchronous validation of the entire environment contract before anything else runs.

If validation fails:

- the process prints all invalid or missing variables
- startup is aborted immediately with `process.exit(1)`

### 2. MongoDB Atlas Connection

Inside `bootstrap()`, the server awaits `connectDatabase()` before opening the HTTP listener.

This is critical because the API should not accept requests while the persistence layer is unavailable. Starting the HTTP server first would create a broken state where endpoints appear alive but fail as soon as they need the database.

### 3. Global Middleware Registration

Global middleware is registered in this order:

1. `cors()` using `ALLOWED_ORIGINS`
2. `express.json()` with a `1mb` limit
3. `express.urlencoded()` with a `1mb` limit
4. `requestLogger` for development logging

This order matters because parsing and logging must happen before route handlers execute.

### 4. Route Registration

After middleware, the server registers:

- `GET /ping`
- `/auth` route group
- a global `404` JSON handler

### 5. Global Error Handler

`errorHandler` is registered after all routes and after the `404` handler. It must be last so any uncaught error from previous middleware or controllers is normalized into the standard error format.

### 6. Listener Startup

Only after all previous steps succeed does the server call `app.listen(env.PORT)` and start accepting requests.

---

## Environment Variables

The current backend contract is defined in `apps/api/src/config/env.ts`.

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string used by Mongoose |
| `PORT` | No | Port used by the HTTP server; defaults to `3000` |
| `NODE_ENV` | No | Runtime environment; defaults to `development` |
| `API_VERSION` | Yes | Version string returned by the health check and startup logs |
| `JWT_ACCESS_SECRET` | Yes | Secret used to sign and verify access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret used to sign and verify refresh tokens |
| `JWT_RESET_SECRET` | Yes | Dedicated secret used by the password reset flow |
| `JWT_ACCESS_EXPIRES_IN` | No | Access token expiration; defaults to `15m` |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token expiration; defaults to `30d` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist; defaults to `http://localhost:8081` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID issued by Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret issued by Google Cloud |
| `GOOGLE_REDIRECT_URI` | Yes | Redirect URI registered in Google Cloud for the OAuth callback |

The core CP0.6 backend foundation depends on the variables requested in the checkpoint brief, and the current codebase now also includes the reset-token and CORS configuration listed above as part of the same validated environment contract.

---

## User Model

The user schema is defined in `apps/api/src/models/User.ts` using Mongoose.

### Core Fields

| Field | Type | Required | Default | Constraints / Notes |
|---|---|---|---|---|
| `email` | `String` | Yes | None | Unique, lowercased, trimmed |
| `password` | `String` | No | None | `select: false`; absent for Google-only accounts |
| `name` | `String` | Yes | None | Trimmed |
| `blendiModel` | `String` | Yes | None | Enum: `Lite`, `ProPlus`, `Steel` |
| `goal` | `String` | Yes | None | Enum: `Muscle`, `Wellness`, `Energy`, `Recovery` |
| `locale` | `String` | No | `en` | Stores the user's preferred language; enum: `en`, `pt-BR` |
| `timezone` | `String` | Yes | `America/New_York` | IANA timezone string |
| `dailyProteinTarget` | `Number` | Yes | None | Min `10`, max `400` |
| `dailyCalorieTarget` | `Number` | Yes | None | Min `500`, max `10000` |
| `googleId` | `String` | No | None | Optional, unique, sparse, `select: false` |
| `profilePhoto` | `String` | No | None | Optional URL to Google profile image |
| `createdAt` | `Date` | Automatic | Generated by Mongoose | Enabled through `timestamps: true` |
| `updatedAt` | `Date` | Automatic | Generated by Mongoose | Enabled through `timestamps: true` |

Note on naming: the original checkpoint brief refers to `preferredLanguage`, but the persisted field name in the current schema is `locale`. It plays the same role and defaults to `en`.

### Current Schema Extensions

The model has since gained additional operational fields that sit on top of the original CP0.6 foundation:

- `isActive` with default `true`
- `passwordChangedAt` for reset-token invalidation
- a `comparePassword()` instance method
- a pre-save hook that hashes passwords with Argon2id

Those fields are later security and lifecycle enhancements built on top of the original model structure.

---

## CI/CD Pipeline

The deployment workflow is defined in `.github/workflows/deploy-api.yml`.

### Trigger

The workflow runs on `push` to `main` when any of the following change:

- `apps/api/**`
- `packages/shared/**`
- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.json`

This is slightly broader than a backend-only path filter because shared contracts and root build configuration can also change the API build outcome.

### Steps Executed

1. Checkout repository code with `actions/checkout@v4`
2. Setup pnpm version 9 with `pnpm/action-setup@v4`
3. Setup Node.js 20 with pnpm cache via `actions/setup-node@v4`
4. Install monorepo dependencies with `pnpm install --frozen-lockfile`
5. Build the API TypeScript project with `pnpm --filter @blendi/api build`
6. Notify Railway and trigger deploy through `railway up --service blendi-pulse-api --detach`

### Failure Behavior

If any step fails:

- the job stops immediately
- the deploy step is not executed
- Railway is not notified

This behavior is reinforced by the explicit `if: success()` guard on the deploy step.

### Secrets

Railway is authenticated through `RAILWAY_TOKEN`, stored in GitHub repository secrets and injected into the workflow environment only for the deploy step.

---

## Health Check

The health check endpoint is `GET /ping`, defined in `apps/api/src/routes/ping.ts`.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Static health indicator; current value is `ok` |
| `version` | `string` | API version from `API_VERSION` |
| `environment` | `string` | Runtime environment from `NODE_ENV` |
| `timestamp` | `string` | Current server time in ISO 8601 UTC format |

The `version` field is especially important because it allows deploy verification without opening logs. If `GET /ping` returns the expected version after a deploy, the running service matches the intended release.

---

## Technical Decisions

### Why Express 5 Was Chosen

Express 5 was chosen because it preserves the simplicity and ecosystem maturity of Express while providing the modern version line the project will build on going forward. For this backend, the priority is predictable routing, middleware composition, and low ceremony rather than adopting a heavier framework too early.

### Why Environment Validation Aborts Startup

The environment validator aborts the server instead of silently falling back to guessed defaults because configuration errors are operational faults, not recoverable runtime conditions. Failing fast makes misconfiguration visible immediately and avoids broken deployments that appear healthy until a feature path is exercised.

### Why MongoDB Uses Automatic Reconnection

Mongoose 8 provides automatic reconnection behavior by default, and the backend explicitly listens to `disconnected`, `reconnected`, and `error` events. This improves resilience against transient network issues without requiring manual reconnection code in controllers or services.

---

## Pending Items

Railway production configuration, MongoDB Atlas production provisioning, and GitHub Actions secret wiring will be finalized after the end of Phase 0, before Phase 1 begins. The code and workflow scaffolding already exist; the remaining work is environment-level provisioning and credential setup.