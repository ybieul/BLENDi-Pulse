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

### Phase 2 — Hábito

| Checkpoint | Document | Description |
|---|---|---|
| CP2.1 | [phase-2/cp2.1-pantry-scanner.md](phase-2/cp2.1-pantry-scanner.md) | Pantry Scanner with configurable Vision AI provider via VISION_* env vars, billing cycle rate limiting anchored to account creation date, and ingredient confidence filtering |
| CP2.2 | [phase-2/cp2.2-push-notifications.md](phase-2/cp2.2-push-notifications.md) | Push Notifications with four cron job types, Expo Push API batching, and Daily Pulse personalized with user's Pulse AI recipe cache |
| CP2.3-A | [phase-2/cp2.3-a-xp-system.md](phase-2/cp2.3-a-xp-system.md) | XP system with MongoDB persistence, XPLog idempotency via unique index, and integration across six existing controllers |
| CP2.3-B | [phase-2/cp2.3-b-level-ui.md](phase-2/cp2.3-b-level-ui.md) | Level UI with global LevelUpCelebration overlay, compact HomeScreen indicator, LevelDetailSheet, and MeScreen 2x2 StatCard grid |
| CP2.3-C | [phase-2/cp2.3-c-daily-missions.md](phase-2/cp2.3-c-daily-missions.md) | Daily Missions with goal-based weighted random pool, dynamic pool filtering, and missionProgress.service.ts with strict unidirectional dependency hierarchy |
| CP2.4 | [phase-2/cp2.4-shopping-list.md](phase-2/cp2.4-shopping-list.md) | Shopping List with multiple lists per user, free tier limit of one active list, favorites import, and offline state-final sync |
| CP2.4.1 | [phase-2/cp2.4.1-shopping-list-detail-screen.md](phase-2/cp2.4.1-shopping-list-detail-screen.md) | Complete reimplementation of ShoppingListDetailScreen which was blank after CP2.4, including SectionList, optimistic UI handlers, and fixed bottom input field |

### Phase 3 — Monetização e Crescimento

| Checkpoint | Document | Description |
|---|---|---|
| CP3.1 | [phase-3/cp3.1-revenuecat-paywall.md](phase-3/cp3.1-revenuecat-paywall.md) | RevenueCat integration with UpgradeScreen paywall, configurable pricing constants, purchase verification endpoint, webhook handler for four subscription lifecycle events, and instant Pro unlock across all feature gates |
| CP3.2 | [phase-3/cp3.2-profile-photo-share-cards.md](phase-3/cp3.2-profile-photo-share-cards.md) | Profile photo stored as base64 in dedicated user_photos collection with MMKV cache strategy, and three on-device Share Card types (recipe, achievement, weekly) generated via react-native-view-shot with no server involvement |
| CP3.3 | [phase-3/cp3.3-pulse-ai-avancado.md](phase-3/cp3.3-pulse-ai-avancado.md) | Persistent conversation history in MongoDB with 90-day TTL, automatic last-6-exchange context injection into AI calls, ConversationHistoryScreen, nutrition reference table in system prompt, 15% macro validation with intelligent retry, and per-model volume guardrails (LITE/PRO+ 400ml, STEEL 600ml) |
| CP3.4 | [phase-3/cp3.4-relatorio-semanal-pro.md](phase-3/cp3.4-relatorio-semanal-pro.md) | Pro-only weekly report generated every Monday at 9am in user timezone via cron, four aggregated data sections, dynamic push notification with priority-based hook, WeeklyReportScreen with week selector, and blurred preview paywall for free users |

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
- Vision environment variables split from Pulse AI chat variables: `VISION_PROVIDER`, `VISION_MODEL`, and `VISION_API_KEY` stay independent from the `AI_*` chat settings, allowing different providers and models for chat and image analysis at the same time without code changes.
- Pantry Scanner billing cycle anchored to the account creation date: the reset advances with `addMonths(previousScanResetDate, 1)` from `date-fns` instead of `addMonths(Date.now(), 1)`, preserving each user's cycle regardless of when they open the app.
- `totalXP` persisted in MongoDB while level remains computed: XP is stored against the user account so it survives reinstalls, and the level is always derived through the pure `calculateLevel` function in the shared package instead of an extra database field.
- Daily mission dependency hierarchy kept strictly unidirectional: `missionProgress.service.ts` imports `xp.service.ts` but never the inverse, and controllers are the only layer that knows both services simultaneously, preventing circular dependencies.
- Shopping lists stored in a dedicated `shopping_lists` collection instead of embedding arrays in `User`: this scales better for historical list volume and supports granular per-list operations without inflating the user document.
- Free tier shopping list limit enforced on creation and restoration: the free tier supports only one active list, checked in both `createList` and `updateList` when archived lists are restored, with `canCreateMore` returned by `getLists` for mobile-side gating.
- Profile photo stored as base64 in a dedicated `user_photos` collection instead of the `User` document or external cloud storage: eliminates egress cost, keeps the `User` document lightweight for the dozens of daily queries it serves, and an MMKV cache keyed by timestamp avoids unnecessary re-fetches.
- Share Cards generated entirely on-device: all three card types are captured with `react-native-view-shot` directly on the user's phone with no server involved, eliminating network latency and infrastructure cost, and keeping sharing available offline.
- Conversation history capped at the last 6 message exchanges injected into AI context: balances useful continuity with token cost, and each prior assistant response is represented by its recipe title rather than the full `PulseAiRecipe` object.
- Macro validation tolerance set to 15%: accommodates real-world macro variance across brands, ingredient ripeness, and preparation method — below that threshold, the math is considered to reconcile for practical purposes.
- `XPLog` and `DailyMission` TTL increased to 90 days: the original 48h TTL was designed only for old-log cleanup, since idempotency is guaranteed by the unique index rather than the TTL itself; the increase was required so the weekly report cron can aggregate the full previous week of data.
- Weekly report streak data derived from `BlendLog` instead of stored snapshots: `streakAtStart` and `streakAtEnd` were replaced by `blendDaysInWeek` and `streakBrokenOnDate`, removing the need for historical streak snapshots without losing informational value.

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

The current `.env.example` files are fully documented below, including the Phase 1 AI provider settings and the Phase 2 vision and push-notification additions. The backend is currently configured to use `AI_PROVIDER=google` with `AI_MODEL=gemini-2.5-flash-lite`.

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
| `VISION_PROVIDER` | Vision AI provider used by Pantry Scanner (`openai`, `anthropic`, or `google`) |
| `VISION_MODEL` | Vision model identifier used by the selected provider, for example `gemini-2.5-flash` |
| `VISION_API_KEY` | API key for the selected vision provider; it can match `AI_API_KEY` when the same provider is used for both |
| `EXPO_ACCESS_TOKEN` | Expo access token used to authenticate calls to the Expo Push API without rate limits; generate it in `expo.dev/settings/access-tokens` |
| `REVENUECAT_API_KEY` | RevenueCat secret key with the `sk_` prefix, used to validate purchases via the REST API; optional at boot, the server starts with a warning if absent |
| `REVENUECAT_WEBHOOK_SECRET` | Custom string sent by RevenueCat in each webhook request header to authenticate the payload; optional at boot |
| `REVENUECAT_APP_ID` | Project identifier from the RevenueCat dashboard, in the format `proj_xxxxxxxx`; optional at boot |

### Mobile Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL used by the Expo client to reach the backend API |
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | Public SDK key for iOS, generated in the RevenueCat dashboard when registering the Apple app |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | Public SDK key for Android, generated in the RevenueCat dashboard when registering the Google app |

---

## External Services Status

| Service | Status |
|---|---|
| RevenueCat | Account created and backend API key available; waiting on the Apple Developer Account to complete the iOS app setup and on the Google Play Console to complete the Android app setup |
| Expo EAS | Pending `eas init` to obtain the real Project ID; `app.json` currently holds the placeholder `PENDING_EAS_PROJECT_ID` |
| Firebase FCM | Project created, but credentials have not been uploaded to the Expo dashboard yet |
| Apple Developer Account | Blocked, pending the $99/year payment by Jon; unblocks RevenueCat iOS, production APNs, the App Store, and the P8 key |
| Google Play Console | Blocked, pending the $25 payment by Jon |
| Image assets | `swirl.png` and `blendi-logo.png` are still missing from `assets/images/` since Phase 1; `notification-icon.png` is present and in use |

---

## Open Questions

The unresolved items carried over from Phase 0 remain open as critical questions for Jon and continue blocking the same downstream phases listed below.

Phase 3 is closed, the current app version is tracked as `0.4.0`, and Phase 4 — Launch is planned.

These questions still block specific checkpoints across Phase 3 and Phase 4.

| Question | Impact |
|---|---|
| Is the Apple Developer Account registered under the BLENDi company name? | Blocks Phase 5 distribution planning and the final App Store publishing path under the company brand |
| Will the Golden Ticket QR code be unique per unit or shared per production batch? | Blocks Phase 4 Golden Ticket activation and ownership validation rules |
| Does the e-commerce stack use Shopify, and is API access available? | Blocks Phase 3 purchase verification and commerce integration planning |
| Is there a target launch date? | Blocks Phase 5 prioritization, release sequencing, and scope tradeoff decisions |

---

## Contributing

Every newly implemented checkpoint must have its corresponding `.md` file created before that checkpoint is marked as complete. New documentation should follow the same structure used by the existing phase documents so that every phase remains consistent, reviewable, and easy to navigate.