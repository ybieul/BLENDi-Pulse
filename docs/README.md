# BLENDi Pulse — Documentation

BLENDi Pulse is the companion app for the BLENDi hardware platform, built in React Native with Expo for iOS and Android, with a Node.js and Express backend hosted on Railway, MongoDB Atlas as the primary database, and a centralized design tokens system shared across the stack. This `/docs` directory contains the project's technical documentation organized by development phase, and each phase is expected to have its own subfolder with one file per implemented checkpoint.

---

## Project Structure

| Layer | Path | Responsibility |
|---|---|---|
| Mobile app | `apps/mobile` | React Native and Expo client responsible for screens, navigation, device integration, and user-facing state |
| Backend API | `apps/api` | Node.js and Express service responsible for business logic, authentication, integrations, and persistence |
| Shared packages | `packages/shared` | Shared design tokens, Zod schemas, and TypeScript contracts consumed by mobile and backend |

---

## Documentation Index

### Architecture

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Global architecture decisions, stack overview, and cross-cutting concerns |

### API Reference

| Document | Description |
|---|---|
| [api/endpoints.md](api/endpoints.md) | Complete REST API reference with all implemented endpoints |

### Phase 0 — Foundation

| Checkpoint | Document | Description |
|---|---|---|
| CP0.1 | [phase-0/cp0.1-monorepo.md](phase-0/cp0.1-monorepo.md) | Monorepo structure and workspace configuration |
| CP0.2 | [phase-0/cp0.2-tokens.md](phase-0/cp0.2-tokens.md) | Design tokens and shared constants |
| CP0.3 | [phase-0/cp0.3-expo-init.md](phase-0/cp0.3-expo-init.md) | Expo project initialization and dependencies |
| CP0.4 | [phase-0/cp0.4-i18n.md](phase-0/cp0.4-i18n.md) | Internationalization system with i18next |
| CP0.5 | [phase-0/cp0.5-skeleton-loader.md](phase-0/cp0.5-skeleton-loader.md) | SkeletonLoader component and loading states |
| CP0.6 | [phase-0/cp0.6-backend-setup.md](phase-0/cp0.6-backend-setup.md) | Backend setup with Railway and MongoDB |
| CP0.7 | [phase-0/cp0.7-auth.md](phase-0/cp0.7-auth.md) | Authentication system with JWT and Zod schemas |
| CP0.8 | [phase-0/cp0.8-timezone.md](phase-0/cp0.8-timezone.md) | Timezone detection and date formatting |
| CP0.9 | [phase-0/cp0.9-google-login-otp.md](phase-0/cp0.9-google-login-otp.md) | Google OAuth login and OTP password reset |

### Phase 1 — MVP Core

| Checkpoint | Document | Description |
|---|---|---|
| CP1.1 | [phase-1/cp1.1-navigation-cache.md](phase-1/cp1.1-navigation-cache.md) | Navigation system with React Navigation and MongoDB cache collection |
| CP1.2 | [phase-1/cp1.2-auth-screens.md](phase-1/cp1.2-auth-screens.md) | Authentication screens with Revolut-inspired design and aurora gradient background |
| CP1.3 | [phase-1/cp1.3-onboarding.md](phase-1/cp1.3-onboarding.md) | Onboarding flow with BLENDi model selection, goal selection, and macro calculation |
| CP1.4 | [phase-1/cp1.4-home-screen.md](phase-1/cp1.4-home-screen.md) | Home screen with animated SVG Goal Rings for protein, carbs, and calories |
| CP1.5 | [phase-1/cp1.5-pulse-ai.md](phase-1/cp1.5-pulse-ai.md) | Pulse AI chat with provider abstraction, MongoDB cache, atomic usage limits, and recipe cards |
| CP1.5.1 | [phase-1/cp1.5.1-units-ai-provider.md](phase-1/cp1.5.1-units-ai-provider.md) | Dual unit system, locale-based imperial default, and configurable AI provider abstraction |
| CP1.6 | [phase-1/cp1.6-blend-timer.md](phase-1/cp1.6-blend-timer.md) | Blend timer with recipe integration, haptic feedback, and blend logging |
| CP1.7 | [phase-1/cp1.7-favorites.md](phase-1/cp1.7-favorites.md) | Favorites system with offline persistence, ownership checks, and FlashList removal flow |
| CP1.8 | [phase-1/cp1.8-my-stack-track.md](phase-1/cp1.8-my-stack-track.md) | My Stack supplement checklist, Track tab, history endpoints, and 7-day inline history |
| CP1.9 | [phase-1/cp1.9-offline-mode.md](phase-1/cp1.9-offline-mode.md) | Offline mode with NetInfo detection, pending blend queue, and auto-sync |
| CP1.10 | [phase-1/cp1.10-history.md](phase-1/cp1.10-history.md) | Complete history dashboard with custom nutrition and hydration SVG charts, supplement heatmap, and paginated blend history |
| CP1.11 | [phase-1/cp1.11-profile.md](phase-1/cp1.11-profile.md) | Complete profile screen with badges, editable settings, upgrade flow, and full sign-out cleanup |

### Phase 2 — Hardware Integration

To be documented as phases are implemented.

### Phase 3 — Social & Community

To be documented as phases are implemented.

### Phase 4 — Notifications & Email

To be documented as phases are implemented.

### Phase 5 — Launch Readiness

To be documented as phases are implemented.

---

## Key Decisions

- React Native with Expo managed workflow over bare workflow: reduces native maintenance overhead, keeps development faster, and remains sufficient for the current product scope.
- pnpm workspaces for the monorepo: enables a single lockfile, consistent dependency management, and clean sharing of internal packages across layers.
- Shared Zod schemas between frontend and backend: keeps validation rules as a single source of truth and prevents contract drift between form validation and API enforcement.
- Refresh token in `expo-secure-store` and access token in Zustand memory: keeps the long-lived credential in secure native storage while avoiding persistence of the short-lived access token.
- Six-digit OTP for password reset instead of magic link: works reliably in the current development phase without depending on production-grade transactional email link flows.
- EmailService in console mode in development with an interface ready for Resend in Phase 4: decouples local development from a live provider while preserving a clean integration boundary for future rollout.
- Timezone stored in the user profile in MongoDB: allows backend cron jobs and time-based automation to run according to each user's local timezone.
- `Recipes` renamed to `Pulse AI`, with `Blend` moved to the center tab bar position: keeps the most frequent action visually central and matches the MVP information architecture.
- MongoDB chosen as the Pulse AI cache layer without Redis: keeps infrastructure cost at zero in the current stage while using native TTL indexes already supported by Atlas.
- AI provider selection driven by `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY`: allows the same backend abstraction to switch between OpenAI, Anthropic, and Google without code changes; the current Phase 1 backend setup runs on Google Gemini 2.5 Flash-Lite.
- Animated aurora gradient implemented with `expo-linear-gradient` instead of `expo-blur`: preserves the intended visual direction while staying compatible with Expo Go during development and QA.
- Dual-unit system standardized on metric storage with `useUnits` converting values for display: keeps persisted calculations consistent while supporting imperial and metric UX.
- Pending blend queue stored locally in MMKV with automatic sync after reconnection: protects user actions during offline usage without requiring server-side draft state.
- Profile badges derived on the frontend from existing profile data instead of a dedicated endpoint: avoids expanding the API for presentation-only computed state.

---

## Development Setup

```bash
# Clone the repository
git clone https://github.com/<org>/blendi-pulse.git
cd blendi-pulse

# Install all workspace dependencies
pnpm install

# Configure backend environment
cp apps/api/.env.example apps/api/.env

# Configure mobile environment
cp apps/mobile/.env.example apps/mobile/.env

# Start the backend
pnpm --filter @blendi/api dev

# Start the mobile app in another terminal
pnpm --filter @blendi/mobile start
```

Fill in the values required by each `.env` file before running the stack locally.

The current `.env.example` files are fully documented below, including the Phase 1 AI provider settings. The backend is currently configured to use `AI_PROVIDER=google` with `AI_MODEL=gemini-2.5-flash-lite`.

### API Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Local port used by the Express API server |
| `NODE_ENV` | Runtime environment selector (`development`, `staging`, or `production`) |
| `API_VERSION` | Human-readable API version exposed by the backend configuration |
| `MONGODB_URI` | MongoDB Atlas connection string for the primary database |
| `JWT_ACCESS_SECRET` | Secret used to sign short-lived access tokens |
| `JWT_REFRESH_SECRET` | Secret used to sign long-lived refresh tokens |
| `JWT_RESET_SECRET` | Secret used only for password reset tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist for local and deployed clients |
| `GOOGLE_CLIENT_ID` | Google OAuth client identifier used by the backend callback flow |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Redirect URI registered in Google OAuth for the API callback |
| `AI_PROVIDER` | Active Pulse AI provider (`openai`, `anthropic`, or `google`); the current setup uses `google` |
| `AI_MODEL` | Model name used for the selected provider; the current setup uses `gemini-2.5-flash-lite` |
| `AI_API_KEY` | API key for the selected AI provider |

### Mobile Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL used by the Expo client to reach the backend API |

---

## Open Questions

The unresolved items carried over from Phase 0 remain open and continue blocking the same downstream phases listed below. Phase 1 is closed, and the current app version is tracked as `0.2.0`.

| Question | Impact |
|---|---|
| Is the Apple Developer Account registered under the BLENDi company name? | Blocks Phase 5 distribution planning and the final App Store publishing path under the company brand |
| Will the Golden Ticket QR code be unique per unit or shared per production batch? | Blocks Phase 2 hardware pairing and ownership validation rules |
| Does the e-commerce stack use Shopify, and is API access available? | Blocks Phase 3 purchase verification and commerce integration planning |
| Is there a target launch date? | Blocks Phase 5 prioritization, release sequencing, and scope tradeoff decisions |

---

## Contributing

Every newly implemented checkpoint must have its corresponding `.md` file created before that checkpoint is marked as complete. New documentation should follow the same structure used by the existing phase documents so that every phase remains consistent, reviewable, and easy to navigate.