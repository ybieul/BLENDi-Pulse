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

### Fixes — Macro Calculation Correction Track

A lettered track (CP-A, CP-A.1, CP-A.2, ...) parallel to the numbered phase roadmap, scoped to correcting the pre-launch macro/BMR calculation bug (idade e sexo reais, `weightGoal` separado de `goal`, recálculo automático, avisos de edição manual). Documents for this track live in `docs/fixes/` instead of a `phase-N` folder.

| Checkpoint | Document | Description |
|---|---|---|
| CP-A.2 | [fixes/cp-a.2-macros-complementares.md](fixes/cp-a.2-macros-complementares.md) | `dailyFatTarget` exposed, `extremelyActive` activity level, consistent IMC in `updateMe`, `targetWeight` with ETA prediction, weight history endpoint, and non-blocking manual-edit warnings for protein/calories. Revised in place by CP-A.2.2 (full numeric-limit audit, widened `dailyCalorieTarget`/`dailyCarbTarget`/`dailyFatTarget`, decoupled `dailyProteinTarget` validation from the automatic clamp) by CP-A.2.3 (plausible-age validation on `birthDate`, symmetric carb warning, 1,200kcal floor on the automatic calorie suggestion, and budget-based protein reclamp guaranteeing non-negative carbs by construction), and by CP-A.2.4 (verified the `dailyFatTarget` import, the `targetWeight` finding's chronology, and removed a duplicated age calculation in the Mongoose validator by reusing `calculateAge`) |
| CP-A.2.1 | [fixes/cp-a.2.1-overlap-select.md](fixes/cp-a.2.1-overlap-select.md) | Confirmed with a real test that `warnings` and `weightTargetEta` can appear together in the same `updateMe` response (only `imc` is mutually exclusive with `warnings`), corrected the CP-A.2 doc, and added a field-projected `.select()` to the already-unconditional `currentUser` read |
| CP-A.3 | [fixes/cp-a.3-targetweight-piso-e-gordura-manual.md](fixes/cp-a.3-targetweight-piso-e-gordura-manual.md) | `calculateMacrosSchema.targetWeight` floor/ceiling (20-300, matching `updateUserSchema`), and manual `dailyFatTarget` editing with the same sanity limit and non-blocking warning mechanism already used by protein/calories/carbs |
| CP-A.4 | [fixes/cp-a.4-registro-de-conta-e-historico-de-peso.md](fixes/cp-a.4-registro-de-conta-e-historico-de-peso.md) | Root cause of account registration being broken on both paths (direct signup and Google OAuth) since CP-A — `UserModel.create()` never supplied the 4 fields required since the real BMR/TDEE fix — fixed with reused placeholder defaults; weight history growth audited and found structurally capped at one entry per account under the current UI, pagination deliberately not implemented with the decision documented |
| CP-A.8 | [fixes/cp-a.8-dailyfattarget-criacao-de-conta-e-campo-mobile.md](fixes/cp-a.8-dailyfattarget-criacao-de-conta-e-campo-mobile.md) | `dailyFatTarget` was never set on account creation (either path) and had no schema default, unlike `dailyCarbTarget` — fixed by computing it from each account's own `dailyCalorieTarget` (extracted `calculateFatTargetFromCalories`) at creation and across 7 API response sites, plus a real backfill for the 3 pre-existing accounts missing it; added the matching mobile edit field (types, `EditSettingSheet`, `MeScreen` row, i18n) that never existed for this macro |

CP-A and CP-A.1 (idade/sexo reais, `weightGoal`, recálculo automático em `updateMe`, `goal` como gatilho, clamp de proteína) predate this folder and have their own root-level reports: [cp-a-macros.md](../cp-a-macros.md) and [cp-a1-macros.md](../cp-a1-macros.md).

### Fixes — Launch Readiness Track

Unlettered checkpoints scoped to specific items from Jon's "Fix Before Launch" feature brief (October 2026), documented in `docs/fixes/` like the macro track above instead of a `phase-N` folder.

| Document | Description |
|---|---|
| [fixes/posthog-analytics.md](fixes/posthog-analytics.md) | PostHog instrumentation across mobile (SDK init, identify/reset tied to session, `sign_up`, a single navigation listener for 7 screens, 4 business-action events) and backend (3 subscription lifecycle events on the RevenueCat webhook); includes the subsequent fix of 2 out-of-scope findings (2 more tracked screens, ESLint config created from scratch in `apps/api`/`packages/shared` and 8 real violations fixed across all 3 workspaces) and a live pentest batch against the webhook that surfaced an unrelated critical finding (see External Services Status above) |
| [fixes/posthog-analytics-achados-fora-do-escopo.md](fixes/posthog-analytics-achados-fora-do-escopo.md) | Findings documented without fixing, per the checkpoint's own open task — later 2 of them were fixed anyway at Gabriel's request (cross-referenced from the document above) |

### Fixes — CP1.1.8 (Step Mode + Home Recipe Pool)

A standalone checkpoint extending Home (CP1.4) and Blend (CP1.6), documented in `docs/fixes/` instead of `phase-1/` because it does not fit the sequential build order of that phase.

| Document | Description |
|---|---|
| [fixes/cp1.1.8-step-mode-pool-receitas.md](fixes/cp1.1.8-step-mode-pool-receitas.md) | Structured `steps` field added to the shared schemas, the `Favorite` model, and the AI prompt (additive, optional everywhere); a Timer/Steps segmented control and the new `StepModeView` component added inside `BlendScreen` as an alternate view (not a new screen), reusing `TimerCircle`/`TimerControls` unmodified; `expo-keep-awake` kept active for the whole screen; the Home's single fixed recipe per goal expanded to a 20-recipe pool per goal (80 total, content supplied pre-written and validated) with a deterministic daily rotation computed entirely client-side |
| [fixes/cp1.1.8-achados-fora-do-escopo.md](fixes/cp1.1.8-achados-fora-do-escopo.md) | Findings documented without fixing, per the checkpoint's own final task; all 4 were corrected across two follow-up rounds. Round 1 (High + Medium): daily rotation computing the day boundary in UTC instead of the device's local calendar day, and a broken `TranslationKey` type copied across 14 files — plus two extra bugs the fix itself surfaced (`new Date()` silently ignoring a mocked `Date.now()`, and an i18next pluralization-key gap in the new type). Round 2 (Low, initially declined, revisited on request): `@testing-library/react-native` added after a dependency-conflict check ruled out the latest major (which drops `react-test-renderer` for a new, Jest-30-oriented package) in favor of the last version still compatible with this project's stack — surfacing two more findings (`@types/react-test-renderer` turned out to exist and was swapped in for a hand-written stub; `fireEvent.press` doesn't await an async `onPress` handler, fixed with `fireEventAsync.press`) |
| [fixes/cp1.1.8-testes-pentest.md](fixes/cp1.1.8-testes-pentest.md) | Live test-and-pentest pass against the real backend (`pnpm dev`, real Atlas, disposable accounts, real cascade cleanup via `DELETE /users/me`) targeting everything this checkpoint touched in `apps/api`: the new `steps` field on `/favorites` and the AI prompt. Found and fixed two real bugs: `steps` was persisted correctly but never returned by `GET`/`POST /favorites` (a stale, hand-maintained response-serialization whitelist never updated for the new field — the Favorites side of Step Mode was non-functional end-to-end despite clean typechecks), and an invalid `pulseCount` (`0` or negative) crashed with a `500` instead of a clean `400` (the shared Zod schema was missing the same `.min(1)` the Mongoose model already had). Also surfaced that `packages/shared`'s compiled `dist/` had been stale for months, silently invalidating `apps/api dev`'s view of every shared-schema change until rebuilt — a local dev-workflow trap, not a confirmed production issue. 24/25 pentest checks passed; the one documented exception (`steps: []` instead of an absent field on favorites without steps, a side effect of Mongoose's implicit array default) has no behavioral impact and was left as-is |

### Fixes — CP-1.1.1a (Onboarding Additions)

Item "Onboarding Additions" of Jon's feature brief, scoped with Gabriel; documented in `docs/fixes/` like the other standalone checkpoints.

| Document | Description |
|---|---|
| [fixes/cp-1.1.1a-onboarding-additions.md](fixes/cp-1.1.1a-onboarding-additions.md) | Model power corrected everywhere (Lite 70W / Pro+ 120W / Steel 180W, badge `Starter` → `70W`, and the AI prompt's wrong `60W`); three new user fields — `blendiOwnership` (`blendi`/`other`/`none`), free-text `otherBlenderModel` (≤ 60 chars) and `dietaryPreferences` (`dairy_free`/`vegan`/`nut_free`/`no_added_sugar`) — with backend-enforced coherence rules (`other`/`none` always store `Lite`, so `BLENDER_LIMITS` and the `blendiModel` enum are untouched), serialized at every user-returning endpoint; the diet applied by the Pulse AI and Pantry Scanner prompts and included in the Pulse AI cache key; two new cards on the onboarding model screen, a new diet screen (onboarding now 5 steps: Model, Goal, Diet, Body, Macros), and the same 5 options in the Me model switch with the ownership shown on the settings row |
| [fixes/cp-1.1.1a-testes-pentest.md](fixes/cp-1.1.1a-testes-pentest.md) | Test-and-pentest pass against the real local API (dev Atlas, disposable accounts, real AI calls): API suite 86 → 102 tests, mobile 42 → 124. Six real findings fixed and re-verified — a concurrency race leaving orphan free text (5 of 6 rounds), a 20× response-amplification on the diet array, control/bidi characters in the free text, and three diet-enforcement gaps in the prompts (the user's own message could revoke the diet, the prompt itself offered `almond milk` to nut-free users in 2 of 12 generations, and the Pantry Scanner returned empty lists in 9 of 12 scans or used a forbidden item once). Final soak: 24/24 clean generations and 0 violations in 12 Pantry scans, with the residual risk of prompt-only enforcement and the recommendation of a post-generation ingredient check documented |

### Fixes — CP-1.1.1b ("Minhas metas")

Follow-up of CP-1.1.1a, scoped with Gabriel: the nutrition targets and the diet move out of the Me settings card into their own screen. No backend change.

| Document | Description |
|---|---|
| [fixes/cp-1.1.1b-minhas-metas.md](fixes/cp-1.1.1b-minhas-metas.md) | New `NutritionGoalsScreen` (root stack, opened from a "My goals" row in Me): protein, carbs, calories, hydration (ml) and the four dietary preferences, validated inline against the `packages/shared` limits (10–800 g, 0–1,500 g, 300–15,000 kcal, 500–8,000 ml — the hydration constants were exported for the app, values unchanged), `PATCH /users/me` with only the changed fields, `hydrationToday` invalidated only when hydration changes, discard-changes confirmation, and the backend's soft manual-edit `warnings` shown next to the right field (typed `code` → translation map, unknown codes ignored). Keyboard handling (`KeyboardAvoidingView` + explicit scroll-to-field + fixed Save button + a Next/Done bar on iOS, where the number pad has no return key) and the Android edge-to-edge findings. The four target rows left Me; the onboarding macros screen now uses the same limits (recommendation text kept separate); the model badges now require `blendiOwnership: "blendi"`; pt-BR dairy-free label is "Sem laticínios". New `DietaryPreferencesPicker` shared with the onboarding diet screen |
| [fixes/cp-1.1.1b-testes-pentest.md](fixes/cp-1.1.1b-testes-pentest.md) | Test-and-pentest pass: mobile suite 124 → 357 tests (adversarial screen tests, a 20,000-input deterministic fuzz with an independent oracle), 92 live checks against the real local API (dev Atlas, disposable accounts, 72 hostile target values, mass assignment, forged JWTs, prototype pollution, atomicity, concurrency, all 6 warning codes at their exact boundaries and all 7 recalculation triggers) and a production `expo export` for iOS and Android. Five real findings in the new screen fixed and re-verified (double-tap sent two PATCHes, fields editable while saving, `goBack()` after leaving mid-request, a false network error on an out-of-contract 2xx, and `buildGoalsPatch` not filtering the range); one pre-existing backend finding documented, not fixed (a JSON body nested ~5,000 levels deep returns `500` through `express-mongo-sanitize`; the process stays up) |

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
- Weight history left unpaginated for now (CP-A.4): growth is structurally capped at one entry per account under the current UI (no screen allows editing weight after onboarding), confirmed against real data (3 total accounts, 0 entries each) — revisit only if a future feature allows editing weight repeatedly after onboarding, since that changes the growth model entirely.
- `purchase_completed` is emitted only by the mobile app, never by the RevenueCat webhook's `INITIAL_PURCHASE` handler, even though both observe the same real-world purchase: firing it from both sides would double-count every purchase in PostHog.
- PostHog's mobile client runs without `@react-native-async-storage/async-storage`: the brief asked for installation plus initialization only, with no additional native dependency. The tradeoff is that the anonymous `distinctId` does not persist across app restarts, which is why `identifyAnalyticsUser` is called on every session-restoring path (not just login/register) instead of only once per install.
- Step Mode lives inside `BlendScreen` as an alternate view (`viewMode: 'timer' | 'steps'`) instead of a separate screen: the brewing timer (`TimerCircle`/`TimerControls`) and the preparation steps (`StepModeView`) are sequential phases of the same blend session, not independent flows, and this keeps the existing timer components completely unmodified.
- The Home daily recipe pool's rotation is computed entirely on-device with no network call, no `AsyncStorage`, and no persisted state, via an exported `getLocalDayIndex(date, timezone?)` in `DailyRecipeCard.tsx`. It extracts year/month/day through `Intl.DateTimeFormat(...).formatToParts(...)` (the same technique already used by `useDateFormat.ts`/`timezone.utils.ts`) instead of dividing the raw UTC epoch, so the day boundary follows the device's actual local calendar day, not UTC — see the CP1.1.8 findings document above for the original bug and its fix.
- `TranslationKey` is derived structurally from `en.json`'s shape (`locales/i18n.ts`) instead of extracted from `Parameters<typeof t>`, which silently resolved to plain `string` because `Parameters<T>` on an overloaded function type (react-i18next's `t`) always picks the last, most permissive overload. All 14 files that used to redefine this type locally now import the single correct one. `jest.spyOn(Date, 'now')` is not sufficient to mock "now" for date-dependent UI logic tested with `react-test-renderer` in this stack — `new Date()` with no arguments bypasses it; call `Date.now()` explicitly (e.g. `new Date(Date.now())`) wherever the current instant needs to be mockable in a test.
- `@testing-library/react-native` pinned to `13.3.3`, not the latest `14.x`: the 14.x line drops `react-test-renderer` (which this project's hook tests also depend on directly) for a new `test-renderer` package and requires Node `^22.13.0 || >=24` plus Jest-30-era internals, while this project runs Jest `~29.7.0`. `13.3.3` is the last version built on the classic `react-test-renderer`, which this project already pins at the same exact version as `react` (`19.1.0`), as the library itself requires. `@types/react-test-renderer` is published and does have a `19.1.0` release matching this project's `react`/`react-test-renderer` — it replaced a hand-written ambient `.d.ts` stub that had been added on the (unverified) assumption that no published types existed.
- `apps/api`'s `pnpm dev` (`tsx watch src/index.ts`) never rebuilds `packages/shared` — it resolves `@blendi/shared` through that package's own compiled `dist/` (its `package.json` `main`/`exports`), not its `src/*.ts`, and `tsx watch` does not treat edits to `packages/shared/src` as a reason to rebuild or restart. Editing a shared Zod schema and immediately testing against the locally running API will silently exercise the stale, previously-built schema with no warning, until `pnpm --filter @blendi/shared build` is run by hand. This bit the CP1.1.8 pentest pass directly (see its findings doc): the first round of `/favorites` validation tests all passed with the wrong (too permissive) result because `dist/schemas/favorite.js` was months out of date. `dist/` is gitignored, so this is a local-only trap, not a confirmed production issue — whether Railway's configured build step rebuilds `packages/shared` before starting `apps/api` is not verifiable from this repository.

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
| `POSTHOG_API_KEY` | PostHog project API key used to send subscription lifecycle events server-side; optional, analytics calls are a no-op when absent |

### Mobile Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL used by the Expo client to reach the backend API |
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | Public SDK key for iOS, generated in the RevenueCat dashboard when registering the Apple app |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | Public SDK key for Android, generated in the RevenueCat dashboard when registering the Google app |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | PostHog project API key bundled into the client; optional, the app functions normally and simply disables event sending when absent |

---

## External Services Status

| Service | Status |
|---|---|
| RevenueCat | Account created and backend API key available; waiting on the Apple Developer Account to complete the iOS app setup and on the Google Play Console to complete the Android app setup. **Resolved (2026-11-01):** the backend `REVENUECAT_API_KEY` was previously rejected by RevenueCat's own V1 REST API (`403`, code `7723`); Gabriel generated a new V1-compatible key and it was verified live against both the real RevenueCat API and this backend's webhook end-to-end (`getSubscriberCustomerInfo`, `200`). A second, separate RevenueCat endpoint (`POST /v1/receipts`, reachable only via an optional `receipt` field that no client ever sent) was found to always reject secret REST keys regardless — it was dead code and was deleted rather than fixed. See the "Achado crítico" section in [`fixes/posthog-analytics.md`](fixes/posthog-analytics.md) |
| PostHog | Not created yet — `POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_API_KEY` are intentionally left empty in both `.env` files until the Gabriel creates the account/project separately; all instrumentation already in place and tolerant of the missing key |
| Expo EAS | Pending `eas init` to obtain the real Project ID; `app.json` currently holds the placeholder `PENDING_EAS_PROJECT_ID` |
| Firebase FCM | Project created, but credentials have not been uploaded to the Expo dashboard yet |
| Apple Developer Account | Blocked, pending the $99/year payment by Jon; unblocks RevenueCat iOS, production APNs, the App Store, and the P8 key |
| Google Play Console | Blocked, pending the $25 payment by Jon |
| Image assets | `swirl.png` and `blendi-logo.png` are still missing from `assets/images/` since Phase 1; `notification-icon.png` is present and in use |

---

## Open Questions

The unresolved items carried over from Phase 0 remain open as critical questions for Jon and continue blocking the same downstream phases listed below.

Phase 3 is closed, the current app version is tracked as `1.0.0`, and Phase 4 — Launch is planned.

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