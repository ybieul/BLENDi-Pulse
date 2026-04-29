# CP0.4 — Internationalization (i18n)

This checkpoint implements the complete internationalization system using i18next, ensuring that no user-visible string is written directly inside components. Every visible string is referenced by key in the translation JSON files. Initial language support covers English (`en`) and Brazilian Portuguese (`pt-BR`).

---

## Files Created

| File | Description |
|---|---|
| `apps/mobile/src/locales/i18n.ts` | Central i18next configuration file responsible for locale resolution, resource registration, and synchronous initialization |
| `apps/mobile/src/locales/en.json` | English translation file used as the reference locale structure |
| `apps/mobile/src/locales/pt-BR.json` | Brazilian Portuguese translation file mirroring the same key structure as the English file |
| `apps/mobile/src/locales/i18n.d.ts` | Type declaration file that extends i18next with the translation key structure for TypeScript autocomplete |
| `apps/mobile/src/hooks/useAppTranslation.ts` | Custom hook that encapsulates i18next usage and persists language changes to MMKV |

---

## Namespace Structure

Technically, the current implementation uses a single i18next namespace called `translation`. Inside that namespace, the keys are organized into domain groups that behave as the logical namespaces of the app.

| Logical namespace | Categories of keys currently defined |
|---|---|
| `common` | Generic actions, shared UI states, measurement units, and macro labels |
| `onboarding` | Copy for the four onboarding flows: welcome, profile, model selection, goal selection, and daily target setup |
| `home` | Home screen greetings, Goal Rings labels and progress text, streak messaging, recipe-of-the-day copy, and quick protocols |
| `blend` | Blend timer states, model labels, blend feedback messages, and clean-cycle reminder content |
| `recipes` | Pulse AI placeholders and loading states, recipe filters, favorites messages, and substitution UI copy |
| `track` | Hydration, supplements, blend history, and share-card messaging for the Track tab |
| `profile` | Profile labels, badge titles and descriptions, subscription copy, and language selector labels |
| `errors` | Validation errors, authentication errors, network errors, and generic not-found messaging |
| `notifications` | Push notification copy for Daily Pulse and streak reminders |

Additional note: the current translation tree also includes an `auth` group for Google sign-in button text. The main documentation structure, however, continues to treat the domains above as the core logical namespaces of the product.

---

## Language Detection

The initial language is resolved in the following priority order:

1. User-selected language stored in MMKV under the key `user_language`
2. Device language reported by `expo-localization`
3. Final fallback to `en`

This logic lives in `apps/mobile/src/locales/i18n.ts` and is executed before the app renders user-facing content.

Initialization is intentionally synchronous through `initImmediate: false`. That decision avoids flickers where translation keys or the wrong language could appear during app startup before i18next finishes loading resources.

---

## useAppTranslation Hook

The `useAppTranslation` hook is the only approved interface for consuming translations inside React components.

It exposes:

| Export | Purpose |
|---|---|
| `t` | Translation function with full TypeScript autocomplete for valid keys |
| `changeLocale(locale)` | Changes the active language and persists the new value to MMKV using the `user_language` key |
| `locale` | Current active locale as a string union of `en` or `pt-BR` |

The hook also exposes `supportedLocales` and `isRTL`, but the primary contract of the checkpoint is the typed translation function, the language switcher, and access to the active locale.

By wrapping `useTranslation` behind a project-specific hook, the app centralizes translation behavior and prevents components from bypassing persistence or typing guarantees.

---

## Type Safety

Type safety is provided by `apps/mobile/src/locales/i18n.d.ts`, which augments the i18next module with the exact structure of `en.json`.

That means:

- translation keys are inferred directly from the reference JSON structure
- invalid keys become TypeScript compilation errors
- autocomplete in editors is aware of nested translation paths

This is important because a mistyped translation key is treated as a build-time defect rather than becoming a silent runtime bug in production.

---

## Technical Decisions

### Why i18next Was Chosen

i18next was chosen because it is a mature and widely adopted localization engine with strong React integration, robust interpolation support, and a clean path to typed usage through `react-i18next`. It solves the current app needs without requiring custom translation infrastructure.

### Why Simple JSON Files Were Chosen

Translations are stored as plain JSON files because the project currently supports a small number of app-bundled languages and benefits more from version-controlled, reviewable translation files than from a remote translation database. JSON keeps the system simple, diffable in Git, and easy to update alongside feature development.

### Why Language Preference Is Stored In MMKV

The active language is persisted in MMKV rather than AsyncStorage because MMKV is faster, synchronous, and already part of the app's local persistence strategy. That aligns well with startup-time language resolution, where the app needs immediate access to the saved preference before the first render.

---

## Adding a New Language

Adding a new language is intentionally simple.

1. Create a new translation JSON file in `apps/mobile/src/locales/` matching the same key structure as `en.json`.
2. Add the new locale code to `SupportedLocale`, `SUPPORTED_LOCALES`, and the i18next `resources` configuration in `apps/mobile/src/locales/i18n.ts`.
3. Update the language selector in the profile area so the new language can be chosen by the user.

No other code changes are required as long as the new JSON file matches the established translation structure.

---

## Pending Items

Translation keys for Phase 1 screens will be added incrementally as those screens are created, following the namespace structure already established in this checkpoint.