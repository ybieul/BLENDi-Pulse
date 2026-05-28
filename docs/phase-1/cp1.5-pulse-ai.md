# CP1.5 + CP1.5.1 — Pulse AI Chat

These two checkpoints implement the product's killer feature: an AI chat that generates personalized blend recipes with complete macros, a MongoDB-backed cache for near-zero cost on repeated queries, atomic daily rate limiting for the free tier, and an AI provider abstraction that can switch between OpenAI, Anthropic, and Google through environment variables. The original CP1.5 design was OpenAI-first, but the current Phase 1 codebase already generalizes the same flow behind a provider-agnostic adapter while preserving the same mobile and backend contract.

## Architecture Decision: No Redis

The cache for Pulse AI was intentionally implemented on top of MongoDB instead of Redis.

The original reasoning was pragmatic:

- A GPT-4o request adds roughly 2 to 4 seconds of latency, so a MongoDB cache read in the 20 to 50 ms range is effectively invisible to the user.
- Free-tier volume is deliberately low at 3 queries per day per user, so the concurrency pressure is tiny and the system does not need a dedicated distributed coordination layer just to protect usage counters.
- MongoDB was already part of the infrastructure, which kept Phase 1 simpler by avoiding an extra operational dependency.

That decision still maps cleanly to the current implementation in [apps/api/src/models/AiCache.ts](../../apps/api/src/models/AiCache.ts) and [apps/api/src/services/cache.service.ts](../../apps/api/src/services/cache.service.ts): the cache lives in the `ai_cache` collection, uses a unique index on `cacheKey`, and expires automatically through a TTL index on `expiresAt`.

### Cache Key Design

The original CP1.5 checkpoint defined the cache identity around six business fields:

1. `userId`
2. `model`
3. `goal`
4. `language`
5. `messageHash`
6. `dietaryFlags`

The `messageHash` is the SHA-256 of the normalized message after converting to lowercase, removing punctuation, collapsing whitespace, and trimming the result.

The current implementation keeps that core idea but hardens the key further to prevent false hits across unit-system and provider changes. In [apps/api/src/services/cache.service.ts](../../apps/api/src/services/cache.service.ts), the materialized key is:

```text
userId:model:goal:language:unitSystem:aiProvider:aiModel:messageHash:dietaryFlagsHash
```

This is a stricter superset of the original six-field design, not a different caching strategy.

## AI Provider Abstraction

The provider abstraction is defined in [apps/api/src/services/aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts) and configured through three required environment variables validated by [apps/api/src/config/env.ts](../../apps/api/src/config/env.ts):

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | Selects the active provider. Valid values are `openai`, `anthropic`, and `google`. |
| `AI_MODEL` | Selects the concrete model identifier used by the chosen provider. |
| `AI_API_KEY` | Supplies the provider credential used to execute the request. |

The public adapter surface is intentionally normalized through `callAi(...)`, which accepts `AiProviderRequest` and returns `AiProviderResponse`.

### Public Interface

`AiProviderRequest` contains:

- `systemPrompt`
- `messages`
- `maxTokens`

`AiProviderResponse` returns:

- `content`
- `model`
- `provider`
- `fromFallback`

That means the controller can stay ignorant of provider-specific request shapes and only care about structured JSON output plus provider/model metadata.

### Provider Differences Normalized By The Adapter

| Provider | API detail hidden by adapter |
|---|---|
| OpenAI | Uses `response_format: { type: 'json_object' }` and sends the system prompt as a standard `system` message. |
| Anthropic | Uses a separate `system` parameter and appends an explicit textual JSON-only instruction because the API shape differs from OpenAI. |
| Google | Uses `systemInstruction` plus `generationConfig.responseMimeType = 'application/json'` in the Gemini SDK. |

The current project state uses `AI_PROVIDER=google` with Gemini, but the controller contract stays the same because the adapter hides these wire-level differences.

## Rate Limiting Atomicity

Free-tier usage is limited to 3 Pulse AI requests per day. The atomic reservation lives in `reservePulseAiUsage(...)` inside [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts).

The architectural pattern is a single conditional update guarded by `$lt`:

```text
filter: { _id: userId, isPro: false, dailyAiUsage: { $lt: 3 } }
update: { $inc: { dailyAiUsage: 1 } }
```

The original checkpoint description framed this as an `updateOne(...)` followed by checking `modifiedCount === 0`. The current code uses `findOneAndUpdate(...)` with the same atomic filter-and-increment semantics instead. In practice, the guarantee is identical:

- If a matching free user exists and has remaining quota, the increment happens atomically.
- If no document is returned, the limit was already exhausted for that free user.
- Because the read condition and increment happen in the same database operation, simultaneous requests cannot overshoot the daily limit.

The controller also rolls the reservation back on provider failure or invalid AI response through `rollbackPulseAiUsageReservation(...)`, so failed generations do not permanently burn a free-tier attempt.

## Language Priority

The language-priority bug fixed later in CP1.9 is already reflected in the current codebase.

The important rule is:

- `language` in the body of POST /pulse-ai/chat has priority.
- `preferredLanguage` from the database is only a fallback.

On mobile, [apps/mobile/src/services/pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts) sends the current `i18n.language` on every request when it is `en` or `pt-BR`.

On the backend, [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts) resolves:

```text
effectiveLanguage = requestedLanguage ?? currentUser.locale
```

Then [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) repeats the same precedence rule when building the final system prompt. This ensures that changing the app language at runtime immediately affects the next Pulse AI response, without waiting for a profile update.

## Navigation Decision

The authenticated bottom tab navigator in [apps/mobile/src/navigation/AppNavigator.tsx](../../apps/mobile/src/navigation/AppNavigator.tsx) gives the second slot to `PulseAI` instead of a generic `Recipes` destination, while `Blend` occupies the emphasized center position.

That decision reflects product hierarchy rather than alphabetical navigation:

- Pulse AI is the killer feature and deserves maximum visibility in the primary tab bar.
- Blend is a punctual, high-intent action, which justifies the elevated center treatment with the larger circular icon shell.
- The current iconography reinforces that split: Pulse AI uses the chatbubble icon family, while Blend uses the flash icon family.

In practice, this makes the app's differentiator permanently discoverable without burying the hardware action.

## Unit System Integration

The unit system now flows from the user profile into the AI prompt builder so the recipe payload matches the user's measurement system.

### Prompt Injection

The original CP1.5.1 goal was to inject unit-system context into GPT-4o prompts. In the current provider-agnostic implementation, the same instruction is injected in [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) regardless of whether the active runtime provider is OpenAI, Anthropic, or Google.

`UNIT_SYSTEM_CONTEXT` defines two branches:

- `metric`: instructs the model to return grams, milliliters, and liters.
- `imperial`: instructs the model to return cups, tablespoons, teaspoons, ounces for solids, and fluid ounces or cups for liquids.

That context is interpolated directly into the system prompt together with an explicit example, so the provider receives both the label and the formatting rule before generating the JSON recipe.

### `useUnits` Hook

The mobile conversion helper lives in [apps/mobile/src/hooks/useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts) and exposes both display helpers and storage normalization helpers.

It returns these fields and functions:

- `unitSystem`
- `weightUnit`
- `volumeUnit`
- `heightUnit`
- `inputHeightUnit`
- `displayWeight(valueInKg)`
- `displayHeight(valueInCm)`
- `displayVolume(valueInMl)`
- `displayHydration(valueInMl)`
- `toStorageWeight(value)`
- `toStorageHeight(value)`

The conversion constants currently used are:

- `2.205` pounds per kilogram
- `2.54` centimeters per inch
- `29.574` milliliters per fluid ounce

This split keeps the responsibilities clean:

- backend prompt generation decides how ingredients should be described by the AI,
- mobile display helpers decide how saved numeric values are shown back to the user,
- storage helpers normalize imperial input back into metric persistence when needed.

## Pending Items

| Item | Status |
|---|---|
| Persistent conversation history between sessions | Deferred to Phase 3. The current chat history in [apps/mobile/src/screens/PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx) is local screen state only, and the history header button remains a placeholder. |
| Semantic cache with Atlas Vector Search | Deferred to the Phase 5 backlog. The current cache is exact-match and key-based through MongoDB only. |
| Biometric prompt integration | Deferred to Phase 3. The prompt currently uses model, goal, locale, unit system, daily targets, and recent blend names, but not biometric sync inputs yet. |