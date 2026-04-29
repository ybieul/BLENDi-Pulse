# BLENDi Pulse API — Endpoint Reference

BLENDi Pulse API follows a REST-style design and returns JSON for application endpoints, with one redirect-based OAuth callback flow. Authentication-protected routes use JWT Bearer tokens sent in the `Authorization` header as `Bearer <accessToken>`. Successful application responses use `success: true`, while error responses use `success: false` plus a descriptive `message` field containing an i18n key. Development base URL is `http://localhost:3000`. The production base URL will be defined after the Railway deployment configuration is finalized.

> Exceptions: `GET /ping` returns a plain JSON health payload without the `success` envelope, and `GET /auth/google/callback` returns an HTTP redirect to the mobile deep link instead of JSON.

---

## Base Conventions

### Authorization Header

```http
Authorization: Bearer <accessToken>
```

### Content Type

```http
Content-Type: application/json
Accept: application/json
```

### Message Format

The API returns message keys such as `errors.auth.invalid_credentials` rather than already translated text. The mobile client is responsible for resolving those keys to the active locale.

---

## Authentication

### POST /auth/register

Creates a new user account and returns the initial session tokens.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Valid email address, normalized to lowercase |
| `password` | string | Yes | Minimum 8 characters, maximum 72, must include uppercase, lowercase, and a digit |
| `name` | string | Yes | 2 to 60 characters |
| `blendiModel` | string | Yes | One of `Lite`, `ProPlus`, `Steel` |
| `goal` | string | Yes | One of `Muscle`, `Wellness`, `Energy`, `Recovery` |
| `preferredLanguage` | string | No | One of `en`, `pt-BR`; defaults to `en` when omitted |
| `dailyProteinTarget` | number | Yes | Integer between 10 and 400 |
| `dailyCalorieTarget` | number | Yes | Integer between 500 and 10000 |
| `timezone` | string | Yes | IANA timezone string such as `America/Sao_Paulo` |

**Success response**

**Status:** `201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "name": "string",
      "blendiModel": "Lite | ProPlus | Steel",
      "goal": "Muscle | Wellness | Energy | Recovery",
      "locale": "en | pt-BR",
      "timezone": "string",
      "dailyProteinTarget": 150,
      "dailyCalorieTarget": 2000,
      "createdAt": "2026-04-29T12:34:56.000Z"
    },
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `201` | User created successfully |
| `400` | Request body failed Zod validation |
| `409` | Email already exists |
| `500` | Unexpected server error |

### POST /auth/login

Authenticates an existing user and returns a fresh access token and refresh token.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Valid email address, normalized to lowercase |
| `password` | string | Yes | Raw password entered by the user |

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "string",
      "email": "string",
      "name": "string",
      "blendiModel": "Lite | ProPlus | Steel",
      "goal": "Muscle | Wellness | Energy | Recovery",
      "locale": "en | pt-BR",
      "timezone": "string",
      "dailyProteinTarget": 150,
      "dailyCalorieTarget": 2000,
      "createdAt": "2026-04-29T12:34:56.000Z"
    },
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Login successful |
| `400` | Request body failed Zod validation |
| `401` | Invalid credentials; response is intentionally generic for security and does not reveal whether the email exists |
| `500` | Unexpected server error |

### POST /auth/refresh

Rotates the refresh token and returns a brand-new token pair.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | Yes | Previously issued refresh token |

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Refresh token accepted and rotated successfully |
| `400` | Request body failed Zod validation |
| `401` | Refresh token invalid, expired, or user no longer active |
| `500` | Unexpected server error |

### GET /auth/google/url

Returns the Google OAuth authorization URL that the mobile app must open using `expo-web-browser`.

**JWT required:** No

**Request parameters**

None.

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Authorization URL generated successfully |
| `500` | Unexpected server error |

### GET /auth/google/callback

Google OAuth callback endpoint. This endpoint is called by Google after the user authorizes access and is not meant to be called directly by the mobile client.

The backend validates the callback, exchanges the authorization code, logs the user in or creates a new account when needed, and then redirects the browser to the mobile deep link.

**JWT required:** No

**Query parameters**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Usually yes | Authorization code returned by Google |
| `state` | string | Yes | CSRF protection token originally issued by `GET /auth/google/url`; implemented as a short-lived JWT signed by the backend |
| `error` | string | No | Present when the user cancels or Google returns an auth error |

**Success behavior**

**Status:** `302 Found`

Redirects to:

```text
blendipulse://auth/callback?accessToken=<jwt>&refreshToken=<jwt>&isNewUser=<true|false>&user=<base64-json>
```

The `user` parameter is a Base64-encoded JSON payload containing:

| Field | Type |
|---|---|
| `id` | string |
| `email` | string |
| `name` | string |
| `profilePhoto` | string or undefined |
| `blendiModel` | string |
| `goal` | string |
| `locale` | string |
| `timezone` | string |
| `dailyProteinTarget` | number |
| `dailyCalorieTarget` | number |
| `createdAt` | ISO datetime string |

**Error behavior**

Handled OAuth failures also return a redirect instead of JSON. The backend redirects with an i18n error key:

```text
blendipulse://auth/callback?error=errors.auth.google_auth_failed
```

Possible error keys include `errors.auth.google_cancelled`, `errors.auth.invalid_state`, `errors.validation.required`, and `errors.auth.google_auth_failed`.

**Status codes**

| Status | Meaning |
|---|---|
| `302` | Redirect to the mobile deep link after successful or handled failed OAuth flow |
| `500` | Unexpected server error |

### POST /auth/forgot-password

Starts the password reset flow by generating an OTP and attempting to send it by email.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Valid email address |

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "message": "errors.auth.forgot_password_sent"
  }
}
```

This endpoint always returns the same `200` response regardless of whether the email exists. This is intentional and prevents attackers from discovering registered accounts through response differences.

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Request accepted; response is identical for existing and non-existing emails |
| `400` | Request body failed Zod validation |
| `500` | Unexpected server error before the immediate response is sent |

### POST /auth/verify-otp

Validates the six-digit OTP sent by email and returns a temporary password reset token.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Valid email address |
| `otp` | string | Yes | Exactly 6 numeric digits |

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "resetToken": "string"
  }
}
```

The `resetToken` is a JWT signed with a dedicated reset secret and valid for 10 minutes.

**Status codes**

| Status | Meaning |
|---|---|
| `200` | OTP accepted; temporary reset token issued |
| `400` | Request body failed validation, or OTP is invalid, expired, already used, or blocked after too many attempts |
| `500` | Unexpected server error |

### PATCH /auth/reset-password

Resets the account password using the temporary reset token issued by `POST /auth/verify-otp`.

**JWT required:** No

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `resetToken` | string | Yes | JWT issued by `POST /auth/verify-otp` |
| `newPassword` | string | Yes | Minimum 8 characters, maximum 72, must include uppercase, lowercase, and a digit |

For the token to be accepted, its payload must include `purpose: password_reset`.

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "message": "errors.auth.password_reset_success"
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Password reset completed successfully |
| `400` | Request body failed validation, reset token expired, token payload invalid, token purpose invalid, or target user not found |
| `401` | Reset token already used because the password was already changed after the token was issued |
| `500` | Unexpected server error |

---

## User

### PATCH /auth/timezone

Updates the authenticated user's stored IANA timezone.

**JWT required:** Yes

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `timezone` | string | Yes | IANA timezone string such as `America/Sao_Paulo` |

**Success response**

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "string",
    "timezone": "America/Sao_Paulo"
  }
}
```

**Status codes**

| Status | Meaning |
|---|---|
| `200` | Timezone updated successfully |
| `400` | Request body failed Zod validation |
| `401` | Missing, invalid, or expired Bearer token |
| `404` | Authenticated user record not found |
| `500` | Unexpected server error |

---

## Health

### GET /ping

Public health check endpoint used to confirm server availability and verify that a new Railway deploy is actually live.

**JWT required:** No

**Request parameters**

None.

**Success response**

**Status:** `200 OK`

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-04-29T12:34:56.000Z"
}
```

**Response fields**

| Field | Type | Description |
|---|---|---|
| `status` | string | Health indicator; current value is `ok` |
| `version` | string | API version from environment configuration; essential to confirm that a new Railway deploy was applied successfully |
| `environment` | string | Runtime environment such as `development`, `staging`, or `production` |
| `timestamp` | string | Current server time in ISO 8601 UTC format |

**Status codes**

| Status | Meaning |
|---|---|
| `200` | API is reachable and responding |

---

## Error Response Format

### Standard Error Envelope

Most error responses follow this format:

```json
{
  "success": false,
  "message": "errors.auth.invalid_credentials"
}
```

### Validation Errors

When a request fails Zod validation, the API returns `400 Bad Request` and includes an `errors` array describing each invalid field.

```json
{
  "success": false,
  "message": "errors.validation.required",
  "errors": [
    {
      "field": "email",
      "message": "errors.validation.email_invalid"
    },
    {
      "field": "password",
      "message": "errors.validation.too_short",
      "minimum": 8
    }
  ]
}
```

**Validation error fields**

| Field | Type | Description |
|---|---|---|
| `field` | string | Request field that failed validation |
| `message` | string | i18n key describing the validation failure |
| `minimum` | number | Present when the failure comes from a minimum constraint |
| `maximum` | number | Present when the failure comes from a maximum constraint |

### Development Diagnostics

Unhandled server errors pass through the global error middleware and may include a `stack` field when `NODE_ENV=development`.

```json
{
  "success": false,
  "message": "errors.network.server",
  "stack": "Error: ..."
}
```

---

## Planned Endpoints

The following endpoint groups are planned for later phases and are not implemented yet.

| Phase | Planned group |
|---|---|
| Phase 1 | Recipe endpoints and Pulse AI endpoints |
| Phase 1 | Blend Log endpoints and Goal Rings endpoints |
| Phase 1 | Hydration endpoints and Supplement Stack endpoints |
| Phase 2 | Pantry Scanner endpoints |
| Phase 3 | Biometric Sync endpoints and payment endpoints |