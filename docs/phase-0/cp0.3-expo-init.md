# CP0.3 — Expo Project Initialization

This checkpoint initializes the BLENDi Pulse mobile app with Expo, installs the core dependencies needed for Phases 0 and 1, defines the internal application folder structure, and configures the code-quality tooling used by the mobile workspace. The original goal of this checkpoint is the Expo bootstrap itself; in the current repository state, that bootstrap is represented by Expo SDK 54 and React Native 0.81.5.

---

## Files Created

| Path | Description |
|---|---|
| `apps/mobile/app.json` | Expo application manifest with project identity, splash, colors, permissions, plugins, and deep-link scheme |
| `apps/mobile/App.tsx` | Mobile root component responsible for bootstrapping i18n, loading fonts, keeping the splash screen visible, and preparing session/timezone startup logic |
| `apps/mobile/tsconfig.json` | Mobile TypeScript configuration extending the repository base config with React Native-specific compiler settings |
| `apps/mobile/.eslintrc.js` | ESLint configuration with React, TypeScript, React Native, and i18n rules, including the prohibition of hardcoded UI strings |
| `apps/mobile/.prettierrc` | Prettier configuration that standardizes formatting choices for the mobile codebase |
| `apps/mobile/src/screens` | Screen-level UI entry points for top-level app surfaces |
| `apps/mobile/src/components` | Shared React components used across multiple screens |
| `apps/mobile/src/components/ui` | Low-level UI primitives and reusable interface building blocks |
| `apps/mobile/src/hooks` | Custom hooks for view logic, translation, formatting, and auth-related flows |
| `apps/mobile/src/store` | Zustand stores and state-management glue for the mobile app |
| `apps/mobile/src/navigation` | Navigation setup and route organization |
| `apps/mobile/src/locales` | Translation resources, i18n bootstrap, and locale typing |
| `apps/mobile/src/services` | API-facing and platform-facing service modules |
| `apps/mobile/src/utils` | Small reusable utilities and helpers |

---

## Dependencies

The mobile workspace installs the runtime packages needed to support the foundation and early feature phases.

### Navigation

| Dependency | Why it was chosen |
|---|---|
| `@react-navigation/native` | Core navigation library for React Native with mature ecosystem support and strong Expo compatibility |
| `@react-navigation/bottom-tabs` | Provides the bottom tab navigator needed for app-level primary navigation |
| `@react-navigation/native-stack` | Uses native stack primitives for performant screen transitions |
| `react-native-screens` | Optimizes screen mounting behavior and is required by React Navigation for better native performance |
| `react-native-safe-area-context` | Ensures layouts respect device notches, status bars, and safe areas |
| `react-native-gesture-handler` | Required by React Navigation and improves gesture-based interactions |
| `react-native-reanimated` | Provides performant native-driven animations used by navigation and future UI interactions |

### State Management

| Dependency | Why it was chosen |
|---|---|
| `zustand` | Lightweight state manager with minimal boilerplate, ideal for auth state and app-scoped client state |

### API Communication And Server State

| Dependency | Why it was chosen |
|---|---|
| `axios` | Clear HTTP client API with interceptors, which is especially useful for JWT attach and refresh flows |
| `@tanstack/react-query` | Standardizes server-state fetching, caching, retries, and invalidation without custom cache infrastructure |

### Offline Cache

| Dependency | Why it was chosen |
|---|---|
| `react-native-mmkv` | Fast native key-value storage used for persisted local cache and preferences with better performance than AsyncStorage |

### Internationalization

| Dependency | Why it was chosen |
|---|---|
| `i18next` | Mature i18n engine with flexible resource loading and interpolation support |
| `react-i18next` | React bindings for i18next, enabling hooks-based translation access in components |
| `expo-localization` | Provides device locale information for initial language selection and locale-aware behavior |

### Fonts

| Dependency | Why it was chosen |
|---|---|
| `expo-font` | Loads custom fonts before first render in a way that integrates cleanly with Expo and Splash Screen control |
| `@expo-google-fonts/syne` | Supplies the Syne family used for display typography and brand-forward headings |
| `@expo-google-fonts/dm-sans` | Supplies the DM Sans family used for body copy and interface text |
| `@expo-google-fonts/dm-mono` | Supplies the DM Mono family used for precise numerical data such as timers and macro values |

### Haptic Feedback

| Dependency | Why it was chosen |
|---|---|
| `expo-haptics` | Gives the app a simple, Expo-friendly way to trigger meaningful tactile feedback |

### Icons

| Dependency | Why it was chosen |
|---|---|
| `@expo/vector-icons` | Provides a standard icon set already integrated with Expo and React Native projects |

### Auth, Deep Linking, And Secure Storage Support

| Dependency | Why it was chosen |
|---|---|
| `expo-auth-session` | Supports OAuth browser-based authentication flows in a mobile-friendly way |
| `expo-web-browser` | Opens and manages the external browser/auth session required by Google OAuth |
| `expo-linking` | Supports deep linking and callback routing back into the app |
| `expo-secure-store` | Stores sensitive values such as refresh tokens in secure native storage |

### Expo Runtime And Platform Support

| Dependency | Why it was chosen |
|---|---|
| `expo` | Core Expo runtime and managed workflow foundation |
| `react` | React runtime used by the mobile application |
| `react-native` | Native rendering runtime for iOS and Android |
| `expo-status-bar` | Gives controlled status bar styling across platforms |
| `expo-splash-screen` | Keeps the splash screen visible while fonts and critical startup resources load |
| `react-native-url-polyfill` | Adds a `URL` implementation compatible with Hermes in React Native |

### Developer Tooling

| Dependency | Why it was chosen |
|---|---|
| `typescript` | Provides static typing and editor tooling across the mobile workspace |
| `eslint` | Enforces code-quality and consistency rules in the mobile codebase |
| `@typescript-eslint/parser` | Lets ESLint understand TypeScript syntax |
| `@typescript-eslint/eslint-plugin` | Adds TypeScript-aware lint rules |
| `eslint-plugin-react` | Adds React-specific lint rules |
| `eslint-plugin-react-hooks` | Enforces the Rules of Hooks and dependency correctness |
| `eslint-plugin-react-native` | Adds React Native-specific linting rules |
| `eslint-plugin-i18next` | Enforces the no-hardcoded-strings rule tied to the i18n architecture |
| `eslint-config-prettier` | Disables formatting rules that would conflict with Prettier |
| `prettier` | Applies automatic formatting with a consistent style across the workspace |
| `@types/react` | Provides React type declarations for TypeScript |

---

## ESLint Configuration

The mobile ESLint configuration combines base JavaScript rules with React, React Hooks, TypeScript, React Native, and i18n-specific enforcement.

Key rules configured in `apps/mobile/.eslintrc.js`:

| Rule | Why it matters |
|---|---|
| `i18next/no-literal-string` | Prohibits hardcoded user-visible strings in JSX text-related components and attributes, forcing all interface text through the i18n system |
| `react-native/no-color-literals` | Prevents raw color values from being written directly in components, reinforcing the shared design token system |
| `react-native/no-raw-text` | Prevents raw text nodes outside controlled text components, which helps keep UI text structured and lintable |
| `react-native/no-inline-styles` | Discourages style creation inside render paths, keeping styling reusable and reviewable |
| `react-native/no-unused-styles` | Flags dead style definitions early |
| `@typescript-eslint/no-explicit-any` | Preserves type safety in a codebase that depends heavily on shared contracts and typed hooks |
| `@typescript-eslint/no-unused-vars` | Keeps modules clean and reduces stale code |
| `@typescript-eslint/no-floating-promises` | Prevents accidental dropped promises in async-heavy mobile flows |
| `@typescript-eslint/no-misused-promises` | Reduces subtle async bugs in event handlers and callbacks |
| `react-hooks/rules-of-hooks` | Enforces correct hook usage |
| `react-hooks/exhaustive-deps` | Warns about missing effect dependencies that can cause stale state bugs |

The most important rule for this project is `i18next/no-literal-string`. It explicitly blocks hardcoded strings in text-related JSX contexts and forces developers to use the translation layer instead. That prevents untranslated text from entering the codebase by accident and keeps the zero-hardcoded-strings rule enforceable at lint time instead of relying on code review alone.

---

## app.json Configuration

The Expo manifest defines the mobile app identity and the platform settings that are already fixed at this phase.

| Field | Value | Purpose |
|---|---|---|
| `expo.name` | `BLENDi Pulse` | Display name shown to users |
| `expo.slug` | `blendi-pulse` | Project slug used by Expo tooling |
| `expo.version` | `1.0.0` | Initial app version |
| `expo.orientation` | `portrait` | Locks the app to portrait orientation |
| `expo.backgroundColor` | `#2b1429` | Uses Deep Plum as the app background color |
| `expo.primaryColor` | `#9a4893` | Uses Pulse Purple as the primary accent color |
| `expo.scheme` | `blendipulse` | Deep-link scheme required for Google OAuth callback handling |
| `expo.userInterfaceStyle` | `dark` | Locks the app to a dark visual context aligned with the design system |

Additional configuration already present in the manifest:

- splash screen setup with Deep Plum background
- camera and photo-library permission descriptions
- adaptive icon setup on Android
- `expo-secure-store` plugin registration

`bundleIdentifier` for iOS and `package` name for Android are not configured yet. They remain pending because the final identifiers depend on confirmation of the Apple Developer Account and publication ownership.

---

## Technical Decisions

### Why Expo Managed Workflow Was Chosen

Expo managed workflow was chosen over bare workflow to minimize native setup complexity, speed up early iteration, and keep the team focused on application logic instead of native build plumbing. At this phase, the project benefits more from faster onboarding, Expo-integrated APIs, and easier local development than it would from direct native-code customization.

### Why MMKV Was Chosen Over AsyncStorage

MMKV was chosen because it is significantly faster, synchronous, and better suited for the app's local persistence needs. Since BLENDi Pulse depends on cached settings, local favorites, and lightweight offline data, MMKV gives lower overhead and better runtime characteristics than AsyncStorage.

### Why React Query Was Chosen Over Manual Cache Management

React Query was chosen because manual server-state caching quickly becomes error-prone once retries, invalidation, stale data windows, background refresh, and loading states are involved. React Query provides a standard model for those problems out of the box and keeps API-facing code more predictable as the app grows.

---

## Pending Items

`bundleIdentifier` and Android `package` name will be configured in Phase 4, once the Apple Developer Account and final publishing ownership are confirmed.

---

## Validation

This checkpoint can be validated with a simple startup check.

### 1. Start Expo

Run from repository root:

```bash
pnpm --filter @blendi/mobile start
```

Expected outcome:

- Expo starts without configuration errors
- the project opens in Expo Go, iOS Simulator, or Android Emulator

### 2. Confirm Font Bootstrap

When the app starts, `App.tsx` should keep the splash screen visible until the Syne, DM Sans, and DM Mono families are loaded.

Expected outcome:

- the app renders without font fallback flicker
- Syne and DM Sans are available for the interface immediately after startup
- the loading indicator uses shared design tokens during boot