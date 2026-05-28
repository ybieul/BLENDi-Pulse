# CP1.5.1 — Unit System and Configurable AI Provider

This refinement added two independent but equally foundational systems before the team moved on from CP1.5 into CP1.6: a dual unit-system layer that lets American users work in lbs, ft/in, and fl oz while all persisted numeric data remains metric internally, and an AI provider abstraction layer that allows the backend to switch between OpenAI, Anthropic, and Google without changing application code, only environment variables.

## Unit System Design

The core rule is simple:

- the backend stores numeric body and hydration-related data in metric units,
- the frontend converts that stored data for display,
- user-entered imperial values are normalized back into metric before persistence.

The mobile conversion layer lives in [apps/mobile/src/hooks/useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts).

It exposes these fields and helpers:

- `displayWeight(valueInKg)`
- `displayHeight(valueInCm)`
- `displayVolume(valueInMl)`
- `displayHydration(valueInMl)`
- `toStorageWeight(value)`
- `toStorageHeight(value)`
- `weightUnit`
- `volumeUnit`
- `heightUnit`

The hook also returns `unitSystem` and `inputHeightUnit`, but the display/storage boundary is carried mainly by the functions above.

### Storage Boundary

[apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx) uses `toStorageWeight(...)` and `toStorageHeight(...)` before calling `/users/calculate-macros`, and it explicitly sends `unitSystem: 'metric'` in that request. That keeps backend macro calculation and user persistence on one canonical metric representation, even when the UI is collecting imperial input.

### Universal Nutrition Units

Protein, carbs, and calories are treated as universal display units:

- macros stay in grams
- calories stay in kcal

Those values are not converted for imperial users. This matches real-world nutrition labeling expectations, including U.S. FDA labels, which still express macro nutrients in grams.

## Imperial Conversion Table

The conversion constants used by the unit system are:

- `1 kg = 2.205 lbs`
- `1 cm = 0.3937 inches`
- `1 ml = 0.0338 fl oz`
- `1 cup = 240 ml`

The first three are either directly encoded or used through their inverse forms in [apps/mobile/src/hooks/useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts): pounds per kilogram, centimeters per inch, and milliliters per fluid ounce. The `1 cup = 240 ml` convention is not a storage conversion constant; it is part of the imperial recipe-language guidance used in Pulse AI prompts.

### Automatic Default Selection

Automatic unit-system preselection happens in [apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx) via Expo Localization:

- `en-US` preselects `imperial`
- every other locale falls back to `metric`

This is intentionally narrower than a generic “all English locales are imperial” rule.

## AI Provider Strategy Pattern

The backend provider abstraction lives in [apps/api/src/services/aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts).

Internally it defines three provider-specific implementations:

- `callOpenAI(...)`
- `callAnthropic(...)`
- `callGoogle(...)`

The public entry point is `callAi(...)`, which selects the provider branch by reading `env.AI_PROVIDER` from [apps/api/src/config/env.ts](../../apps/api/src/config/env.ts).

### Normalized API Differences

The abstraction hides real wire-level differences between providers:

- OpenAI uses `chat.completions.create(...)` with `response_format: { type: 'json_object' }`.
- Anthropic uses `messages.create(...)` with the `system` prompt separated from the user messages and an extra textual JSON-only instruction appended.
- Google uses `generateContent(...)` with `systemInstruction` and `generationConfig.responseMimeType = 'application/json'`.

All three branches normalize back into the same `AiProviderResponse` shape with `content`, `model`, `provider`, and `fromFallback`, and all provider requests are wrapped by the same 30-second timeout plus `AiProviderRequestError` surface.

## Environment Variables

[apps/api/src/config/env.ts](../../apps/api/src/config/env.ts) validates the AI configuration at process startup and terminates the server immediately if required values are missing or invalid.

The three relevant variables are:

- `AI_PROVIDER`: accepts `openai`, `anthropic`, or `google`
- `AI_MODEL`: free-form non-empty model string, with examples such as `gpt-4o-mini`, `claude-sonnet-4-6`, and `gemini-2.5-flash-lite`
- `AI_API_KEY`: provider-specific secret key matching the selected provider

Validation detail matters here:

- `AI_PROVIDER` is enum-validated by Zod
- `AI_MODEL` must be a non-empty string
- `AI_API_KEY` must be a non-empty string with at least 10 characters

That means the server fails fast if the provider is unsupported, the model name is blank, or the API key is absent or clearly malformed.

## GPT-4o-mini as Default

The original CP1.5.1 design decision was to prefer `gpt-4o-mini` over full `gpt-4o` as the OpenAI default because recipe generation did not need the more expensive flagship tier. The checkpoint rationale was that `gpt-4o-mini` was materially cheaper, faster, and still strong enough for structured blender-recipe generation, while full `gpt-4o` could remain available through `AI_MODEL` when later phases needed heavier prompts.

Current implementation note: the checked-in repository has already moved beyond an OpenAI-only default. The provider abstraction is now fully generalized, and [apps/api/.env.example](../../apps/api/.env.example) currently defaults to `AI_PROVIDER=google` with `AI_MODEL=gemini-2.5-flash-lite`. So the `gpt-4o-mini` decision is best understood as the historical CP1.5.1 baseline that the later abstraction preserved rather than the present checked-in runtime default.

## Unit System in Pulse AI Prompt

Unit-system context is injected into the system prompt in [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) through `UNIT_SYSTEM_CONTEXT`.

For `imperial`, the prompt instructs the model to use:

- cups
- tablespoons
- teaspoons
- ounces for solids
- fluid ounces or cups for liquids

For `metric`, the prompt instructs the model to use:

- grams
- milliliters
- liters

Each branch also includes an explicit example inside the system prompt:

- metric example: `90g oats, 240ml almond milk`
- imperial example: `1 cup oats, 1 cup almond milk`

This keeps the recipe payload aligned with the user-facing measurement system without changing how nutrition targets themselves are stored or computed.

## Pending Items

No pending items remain for this checkpoint. The unit-system layer and the configurable AI provider abstraction are complete and production-ready at the architectural level.