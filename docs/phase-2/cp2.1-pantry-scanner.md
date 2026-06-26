# CP2.1 — Pantry Scanner

This checkpoint implements the product's second killer feature: the user photographs a pantry, refrigerator, freezer, or kitchen shelf, the app identifies blend-relevant ingredients through Vision AI, and then generates blend recipes based on what is actually available at home. The user-facing problem it solves is practical and immediate: “I want to make a shake, but I do not know what I have available right now.”

## Files Created

### Backend

- [apps/api/src/config/env.ts](../../apps/api/src/config/env.ts): updated the environment validation layer to require `VISION_PROVIDER`, `VISION_MODEL`, and `VISION_API_KEY` separately from the existing `AI_*` variables used by Pulse AI chat.
- [apps/api/src/services/pantryPromptBuilder.service.ts](../../apps/api/src/services/pantryPromptBuilder.service.ts): added `buildPantryAnalysisPrompt()` as the dedicated prompt builder for Vision AI pantry analysis.
- [apps/api/src/services/aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts): extended the provider adapter with `VisionProviderRequest`, `VisionProviderResponse`, `callVisionAi()`, and the three provider-specific implementations `callOpenAIVision()`, `callAnthropicVision()`, and `callGoogleVision()`.
- [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts): implemented the `analyzePantry` handler, including image validation, monthly free-tier scan control, Vision AI parsing, confidence filtering, and follow-up recipe generation.
- [apps/api/src/routes/pantryScanner.ts](../../apps/api/src/routes/pantryScanner.ts): exposed the protected `POST /pantry-scanner/analyze` route.

### Shared

- [packages/shared/src/schemas/pantryScanner.ts](../../packages/shared/src/schemas/pantryScanner.ts): added `pantryScanSchema`, `pantryIngredientSchema`, `PantryIngredient`, `pantryAnalysisResultSchema`, and `PantryAnalysisResult` as the shared contract between API and mobile.

### Mobile

- [apps/mobile/src/services/pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts): added `compressAndEncodeImage()` for client-side image preparation and `analyzePantry()` for the API request.
- [apps/mobile/src/components/pantryScanner/IngredientCheckItem.tsx](../../apps/mobile/src/components/pantryScanner/IngredientCheckItem.tsx): introduced the animated checklist row used to confirm or deselect detected ingredients before recipe viewing.
- [apps/mobile/src/screens/PantryScannerScreen.tsx](../../apps/mobile/src/screens/PantryScannerScreen.tsx): implemented the full five-step mobile flow from permission and capture to ingredient confirmation and recipe consumption.

## Vision AI Provider Abstraction

The Pantry Scanner does not call provider SDKs directly from the controller. Instead, [apps/api/src/services/aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts) extends the same provider-agnostic pattern already used by Pulse AI chat and exposes a normalized `callVisionAi()` surface.

### Public Interface

`VisionProviderRequest` contains:

- `imageBase64`
- `mimeType`
- `prompt`
- `maxTokens`

`callVisionAi()` returns a normalized `VisionProviderResponse` with:

- `content`
- `model`
- `provider`
- `processingTimeMs`

This keeps [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) focused on business rules instead of wire-format differences across providers.

### Provider Differences Normalized By The Adapter

| Provider | Normalized implementation detail |
|---|---|
| OpenAI | Sends a single `user` message whose content array contains `image_url` using the `data:{mimeType};base64,{imageBase64}` format plus a text prompt, and requests JSON through `response_format: { type: 'json_object' }`. |
| Anthropic | Sends an image block with `source: { type: 'base64', media_type, data }` and appends an explicit JSON-only instruction to the text prompt because the response contract differs from OpenAI. |
| Google | Sends `inlineData: { mimeType, data }` in the Gemini payload and requests JSON through `generationConfig.responseMimeType = 'application/json'`. |

### Timeout And Observability

Vision requests run with a dedicated 45-second timeout through `Promise.race(...)` in `withTimeout(...)`. This is intentionally longer than the 30-second text-generation timeout because image analysis is materially slower than regular Pulse AI recipe generation.

On every successful or failed request, the adapter logs:

- provider
- model
- image size in KB
- processing time in milliseconds

Those logs are emitted from [apps/api/src/services/aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts) specifically to make production cost monitoring and provider behavior analysis possible without changing controller code.

## Billing Cycle Design

The most important architecture decision in Pantry Scanner is that the free-tier scan reset is anchored to the account creation cycle, not to the first day of the calendar month. In the email/password registration flow, [apps/api/src/controllers/auth.controller.ts](../../apps/api/src/controllers/auth.controller.ts) initializes `scanResetDate` as `addMonths(user.createdAt ?? new Date(), 1)`, and in the first Google-login account creation flow [apps/api/src/controllers/google.controller.ts](../../apps/api/src/controllers/google.controller.ts) initializes it as `addMonths(new Date(), 1)`. After that, [apps/api/src/controllers/pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) never recalculates from “now”; it advances the previous anchor with `addMonths(previousScanResetDate, 1)` inside `getNextScanResetDate(...)`. That distinction is critical: a user who created an account on the 25th keeps a 25-to-25 billing cycle forever, regardless of whether they reopen the app on the exact reset day or several days later. The month-length edge case is delegated to `date-fns/addMonths`, so users anchored on the 31st automatically roll to the last valid day of shorter months. Pro users bypass all limit and reset gating entirely. Implementation note: the current controller still increments `scanCount` for Pro users as bookkeeping, but Pro users are never blocked by `scanCount` and never participate in the monthly reset logic.

## Scan Consumption Rules

The scan is deliberately not consumed in three situations:

1. When `noFoodDetected: true`, meaning the Vision AI response determined that the image clearly does not contain food.
2. When the detected ingredient list becomes empty after confidence filtering to only `high` and `medium`, in which case the response returns `noUsableIngredients: true`.
3. When any error happens before the controller reaches `incrementPantryScanCount(...)`, including validation errors, provider failures, and invalid JSON coming back from the Vision provider.

This means `scanCount` is incremented only after the body has been validated, the user has passed the free-tier limit gate, the Vision AI response has been parsed successfully, and at least one ingredient survived the confidence filter. In the current implementation, the increment happens only after the `noFoodDetected` and `noUsableIngredients` early-return branches have already been ruled out.

## Pantry Prompt Strategy

[apps/api/src/services/pantryPromptBuilder.service.ts](../../apps/api/src/services/pantryPromptBuilder.service.ts) is intentionally separate from [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts). The Vision prompt has a different responsibility from Pulse AI recipe generation, so it lives in its own service to preserve single responsibility and avoid coupling image-analysis rules to the chat recipe prompt.

The pantry-analysis prompt is always written in English, independent of the user's locale. This is an explicit implementation choice: the Vision models are instructed to return ingredient names in English because the current prompt assumes better visual-model consistency in English than in localized prompt variants.

The accepted ingredient categories in the current prompt are:

- fresh and frozen fruits
- vegetables and leafy greens
- protein powders with visible labels
- milk and plant-based beverages
- yogurt and dairy products
- nuts and seeds
- nut butters
- honey and natural sweeteners
- powdered supplements
- beverages such as juices and sports drinks

The rejected categories are explicit as well:

- medicine packaging
- cleaning products
- household utensils
- non-food items

The response contract always includes `noFoodDetected`, which is the model-side mechanism used to distinguish “this image clearly does not contain food” from “food exists, but there are no usable blend ingredients after filtering.”

## Mobile Flow

[apps/mobile/src/screens/PantryScannerScreen.tsx](../../apps/mobile/src/screens/PantryScannerScreen.tsx) implements the feature as a five-step flow.

### 1. `permission`

The screen checks camera permission on mount with `Camera.getCameraPermissionsAsync()` and, when needed, requests it through `Camera.requestCameraPermissionsAsync()`. If access is denied, the screen stays in the permission state and shows the warning copy instead of the camera view.

### 2. `capture`

The capture step renders a native `CameraView` with:

- a close button
- a capture button
- a gallery picker button via `expo-image-picker`

For free-tier users, the capture header also shows the remaining scan pill plus the number of days until reset.

### 3. `analyzing`

The analyzing step is entered only after `compressAndEncodeImage()` succeeds and `capturedBase64` has been stored locally. The client-side preprocessing happens in [apps/mobile/src/services/pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts) through `expo-image-manipulator`:

- reads the original image dimensions with `Image.getSize(...)`
- rescales the largest dimension to a maximum of 1024 px while preserving aspect ratio
- encodes the result as JPEG with quality `0.7`
- sends the payload with `mimeType = 'image/jpeg'`

This keeps uploads lightweight for the Vision API call. Important implementation detail: the current code is optimized toward a compact upload footprint, but it does not enforce a hard byte-level 1 MB cap in a retry loop; the concrete behavior is max-dimension resize plus JPEG 0.7 compression.

### 4. `ingredients`

When analysis succeeds, every returned ingredient with `high` or `medium` confidence is inserted as a checked row by default. The ingredient confirmation screen then lets the user:

- uncheck any detected item through `IngredientCheckItem`
- keep medium-confidence items visible through the warning dot
- append a manual ingredient through the text input

If `noFoodDetected` or `noUsableIngredients` comes back from the API, the screen never reaches this step; it returns to capture and shows a toast.

### 5. `recipes`

The final step displays two complete `RecipeCard` instances backed by the pantry-selected ingredients. Both primary actions are already wired:

- `Start Blend` navigates to the Blend tab with the recipe payload.
- favorite state works through the existing favorites system by mapping recipe content to `favoriteId` via `getRecipeFavoriteKey(...)` and `useFavorites()`.

The screen also exposes `Scan Again` to reset local state and return to capture.

## Navigator Integration

The Pantry Scanner is integrated into [apps/mobile/src/navigation/PulseAINavigator.tsx](../../apps/mobile/src/navigation/PulseAINavigator.tsx) as the third stack route, after `PulseAIChat` and `Favorites`.

From the user perspective, the entry point lives in the header of [apps/mobile/src/screens/PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx). The right-side action cluster renders:

1. the Pantry Scanner trigger with the `scan-outline` icon
2. the Favorites trigger with the `heart-outline` icon

That means the scanner icon appears directly beside the favorites icon and is currently positioned before it in the header actions.

The remaining-scan badge is shown only for non-Pro users. The current screen computes this through `isPro = (authUser?.blendiModel ?? 'Lite') !== 'Lite'` and renders the scan badge only when `!isPro`. The scan quota state is stored under `QUERY_KEYS.pantryScans`, and [apps/mobile/src/config/cache.config.ts](../../apps/mobile/src/config/cache.config.ts) explicitly keeps that query key out of MMKV persistence because the quota is treated as sensitive session state.

## Pending Items

The current codebase already reflects later integrations that did not belong to the original CP2.1 delivery slice:

- Pantry Scanner XP (`pantryScanner`, 5 XP per successful scan) was integrated later in CP2.3-A through `triggerPantryScannerXP(...)` and the shared `XP_EVENTS.pantryScanner` constant.
- The daily mission hook for `scanPantry` was integrated later in CP2.3-C through `triggerPantryScannerMissionProgress(...)` and the mission-progress service.

In other words, CP2.1 established the scanner, Vision pipeline, quota rules, and mobile flow; XP and daily-mission progression were layered on top in the later gamification checkpoints.