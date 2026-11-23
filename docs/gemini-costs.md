# Gemini Cost Model For BLENDi Pulse

## Recommended model

Use the following backend configuration for Gemini in this codebase:

```env
AI_PROVIDER=google
AI_MODEL=gemini-3.5-flash-lite
AI_API_KEY=YOUR_GEMINI_API_KEY

VISION_PROVIDER=google
VISION_MODEL=gemini-3.5-flash-lite
VISION_API_KEY=YOUR_GEMINI_API_KEY
```

Why this model (see `apps/api/.env.example` for the project's own notes on this):

- `gemini-2.5-flash` and `gemini-2.5-pro` are deprecated for new API keys (`404`, "no longer available to new users") — not a safe choice for either `AI_MODEL` or `VISION_MODEL` today.
- `gemini-3.5-flash` (without `-lite`) has "thinking" enabled by default, which regularly blows past this app's 30s/45s request timeouts in real calls.
- `gemini-3.5-flash-lite` does not use thinking by default, responds in 1-3s, is multimodal (handles the Pantry Scanner's image input as well as Pulse AI's text), and works on the free tier — it is the model actually validated and configured in this codebase for both `AI_MODEL` and `VISION_MODEL`.
- `pro`-tier models (e.g. `gemini-3.1-pro-preview`) return `429` (quota `0`) on the free tier — not usable here regardless of cost.
- **Free-tier quota (measured 2026-11-18, CP-B5.1, batch 10):** `gemini-3.5-flash-lite` on the free tier allows **15 requests per minute** and **500 requests per day** (`generate_content_free_tier_requests`). Above that Gemini returns `429`, which the provider does not retry (only `500`/`503` are retried; `429` only goes to `AI_FALLBACK_MODEL` when set), so the user gets `503 pulseai/ai-unavailable` / `scanner/vision-unavailable` with the usage returned. A single Pulse AI recipe can take 2–3 calls (volume, macro or diet retries), so the free tier holds roughly 170–250 recipes per day for the whole app. In batch 10, 81 of 240 requests hit the per-minute limit and the daily limit stopped the second phase; the "Gemini overloaded" 503s of batch 9 were probably the same quota. **Production must run on a paid-tier key.**
- **Production key (found 2026-11-19, CP-B5.2):** the Gemini key configured in production is **the same key used by the tests and the live audits**, and it is on the **free tier** (15 requests/min, 500/day). Every audit batch spends the same daily quota as real users. The key, model and plan were not changed in CP-B5.2 (out of scope); this remains the main launch blocker on the AI side.
- **Telling quota apart in the logs (CP-B5.2):** the app still receives the same `503 pulseai/ai-unavailable` / `scanner/vision-unavailable` for quota and for overload. The provider log line (`[aiProvider] request failed` for text, `[aiProvider] vision request failed` for vision, used by both Pulse AI and the Pantry Scanner) now carries an internal `code`: `ai/quota-exceeded` when the provider answered `429`, `ai/unavailable` for everything else (overload `500`/`503` after the retries, timeout, network). The line has no prompt, message or recipe content. Search production logs for `ai/quota-exceeded` to see when the cause is quota.
- **Calls per Pulse AI recipe (CP-B5.2, CP-B5.3):** a drink named in the message (caipirinha, piña colada, mojito, margarita, daiquiri and, since CP-B5.3, quentão, moscow mule, cosmopolitan, mai tai, paloma, mint julep, tom collins, lemon drop, bloody mary, white russian, mudslide, espresso martini, mimosa, bellini) can take one extra call when the first recipe misses a defining ingredient. In the other direction, a message the backend already recognizes as an alcohol request from an account without a known age gets the age question (`428`) with **no** Gemini call; since CP-B5.3 that also covers a classic cocktail named on its own ("mojito").
- **Audit budget (CP-B5.3, batch 12, 2026-11-23):** capped at 90 calls; 82 were spent for 20 requests, 16 completed. About half the calls were Gemini `503` overload retries (30 transient retries, 1 per-minute `429`, no daily quota hit): with this key, a failed request costs ~3 calls.

Pricing source used for this document:

- Gemini Developer API pricing page (`ai.google.dev/gemini-api/docs/pricing`), paid tier, standard rate
- Page last updated by Google on 2026-10-27 UTC
- Rates used here for `gemini-3.5-flash-lite`:
  - Input: $0.30 per 1,000,000 tokens — the same rate applies to text, image, video, and audio input (Google does not price image input separately for this model)
  - Output (including thinking tokens): $2.50 per 1,000,000 tokens
  - Context caching: $0.03 per 1,000,000 tokens, plus $1.00 per 1,000,000 tokens per hour of storage (not used by this app's own cache — see "Cache behavior" below)

## Exact billing formula

For a single BLENDi Pulse request, the model cost is:

```text
cost_usd = ((input_tokens * 0.30) + (output_tokens * 2.50)) / 1,000,000
```

Where:

- `input_tokens` = system prompt + user message (+ image tokens, for the Pantry Scanner vision call — see its own section below) + any retry instruction sent back to Gemini
- `output_tokens` = the JSON payload returned by Gemini
- Google states that output pricing includes thinking tokens

Important consequence:

- The visible JSON is not always the full billing story, because output pricing can include thinking tokens.
- The backend currently caps Pulse AI's generated output with `maxOutputTokens: 800`, so 800 output tokens is the practical per-call ceiling for that specific call (see the Pantry Scanner section below for its own, different ceilings).

## How BLENDi Pulse currently consumes tokens (Pulse AI chat)

The current backend path for `POST /pulse-ai/chat` is simple and text-only:

1. The API builds one system prompt with user hardware, goal, weight goal, locale, unit system, macro targets, and up to 5 recent recipe names.
2. The API sends one user message.
3. Gemini returns one JSON recipe object.
4. If the first response is not valid JSON for the schema, the backend sends one retry call with this extra instruction: `Your previous response had an invalid format. Return only valid JSON.`
5. If Gemini answers `500`/`503` (overloaded), the same call is repeated up to 3 attempts in total, inside the same time window, and an optional `AI_FALLBACK_MODEL` may get one last attempt (CP-B1 — see *Overload retries and the fallback model* below).

Files that define this behavior:

- [apps/api/src/services/promptBuilder.service.ts](../apps/api/src/services/promptBuilder.service.ts)
- [apps/api/src/controllers/pulseAi.controller.ts](../apps/api/src/controllers/pulseAi.controller.ts)
- [apps/api/src/services/aiProvider.service.ts](../apps/api/src/services/aiProvider.service.ts)

What is **not** used in this specific chat path:

- No Google Search grounding
- No Google Maps grounding
- No URL context tool
- No file search tool
- No Batch API
- No explicit Gemini context caching (the app has its own separate MongoDB-level cache — see below)
- No multimodal image, audio, video, or PDF input — this is true for the Pulse AI chat path specifically; the Pantry Scanner path below does send image input

This matters because the Pulse AI chat bill is only token-based input/output billing for standard text generation.

## Cache behavior and real cost impact (Pulse AI chat only)

BLENDi Pulse already has its own application-level cache in MongoDB for Pulse AI chat responses.

The cache key includes:

- user id
- BLENDi model
- user goal
- language
- unit system
- AI provider
- AI model
- normalized user message

The cache TTL is 7 days.

That means:

- The first uncached successful request pays Gemini cost.
- A repeated identical request for the same user/context inside the cache window returns from MongoDB and does not call Gemini again.
- A cache hit still counts against the app usage policy, but it does not create new Gemini token charges.

Files involved:

- [apps/api/src/services/cache.service.ts](../apps/api/src/services/cache.service.ts)
- [apps/api/src/config/cache.config.ts](../apps/api/src/config/cache.config.ts)

The Pantry Scanner path (below) has **no equivalent cache** — every scan is a fresh billed call, which makes sense given each photo is effectively unique.

## Measured BLENDi Pulse baseline (Pulse AI chat)

To avoid using a generic guess, the current prompt builder was measured with a representative request:

- User context: `ProPlus`, `Muscle`, `en`, `metric`, 3 recent recipes
- User message: `I want a high-protein breakfast smoothie with banana and oats`
- Measured prompt size: 2143 characters
- Character-based estimate: about 536 input tokens

A representative JSON recipe payload in the current schema was also measured:

- Measured JSON size: 365 characters
- Character-based estimate: about 92 output tokens

These two measurements produce this uncached baseline estimate:

```text
per_request_baseline_usd = ((536 * 0.30) + (92 * 2.50)) / 1,000,000
per_request_baseline_usd = $0.0003908
```

Important accuracy note:

- This is the most honest estimate available without a live Gemini token count from the exact production prompt and response.
- Google tokenization is not exactly the same as `characters / 4`, so the table below is a measured estimate, not a billing export.
- For exact production accounting, capture Gemini usage metadata per request or call the token counting API before sending prompts.

## Cost table (Pulse AI chat)

The table below shows three useful views:

- `Measured baseline`: one uncached request using the measured BLENDi Pulse baseline above
- `High-output ceiling`: same measured input, but assuming the model consumes the full `maxOutputTokens: 800`
- `Retry worst case`: first call fails schema validation, then the backend retries once, and both calls reach the 800-token output ceiling

| Requests | Measured baseline (USD) | High-output ceiling (USD) | Retry worst case (USD) |
| --- | ---: | ---: | ---: |
| 10 | 0.003908 | 0.021608 | 0.043267 |
| 100 | 0.039080 | 0.216080 | 0.432670 |
| 200 | 0.078160 | 0.432160 | 0.865340 |
| 500 | 0.195400 | 1.080400 | 2.163350 |
| 1000 | 0.390800 | 2.160800 | 4.326700 |

## Pantry Scanner (Vision) cost

A single Pantry Scanner scan (`POST /pantry-scanner/analyze`) can make up to two separate billed Gemini calls, both using the same `gemini-3.5-flash-lite` model/rates as above (image input is priced at the same $0.30/1M rate as text — see "Recommended model"):

### Step 1 — ingredient detection (vision call, always happens)

- The mobile app resizes the photo so its largest dimension is capped at 1024px before upload (`MAX_IMAGE_DIMENSION`, JPEG quality 0.7 — [apps/mobile/src/services/pantryScanner.service.ts](../apps/mobile/src/services/pantryScanner.service.ts)).
- The fixed vision prompt (no per-user variables) is 2080 characters — a character-based estimate of about 520 input tokens ([apps/api/src/services/pantryPromptBuilder.service.ts](../apps/api/src/services/pantryPromptBuilder.service.ts)).
- Image input tokens: Google tokenizes images either as a flat 258 tokens (if both dimensions are ≤384px) or by tiling into 768×768px tiles at 258 tokens each. A photo resized to 1024px on its longest side (typical phone aspect ratio) lands at roughly 4 tiles — **about 1,032 image tokens** — but Google's own documentation does not state the exact rounding rule for partial tiles, and the worked example on their image-understanding page uses a different model (`gemini-3.8-flash`), not confirmed to tokenize identically for `gemini-3.5-flash-lite`. Treat this as an estimate, not a billing export, same spirit as the character-based token estimates elsewhere in this document.
- Output ceiling: `DEFAULT_VISION_MAX_TOKENS = 1000` ([apps/api/src/services/aiProvider.service.ts](../apps/api/src/services/aiProvider.service.ts)). No real captured response was measured for this call (unlike the Pulse AI baseline above), so the estimate below uses the full ceiling as a conservative upper bound — a real response listing a handful of ingredients is almost certainly a small fraction of 1000 tokens.
- No retry on invalid JSON for this call — an unparseable vision response fails the scan outright (`scanner/vision-parse-error`) instead of retrying.
- No cache applies (see above).

```text
vision_call_ceiling_usd = ((1552 * 0.30) + (1000 * 2.50)) / 1,000,000
vision_call_ceiling_usd = $0.0029656
```

(1552 = 520 prompt tokens + ~1032 image tokens.)

| Scans | Vision call, ceiling estimate (USD) |
| --- | ---: |
| 10 | 0.029656 |
| 100 | 0.296560 |
| 200 | 0.593120 |
| 500 | 1.482800 |
| 1000 | 2.965600 |

### Step 2 — recipe generation (text call, only when usable ingredients were found)

When Step 1 finds at least one usable ingredient, the backend makes a second, separate call through the same `callAi` abstraction used by Pulse AI chat, reusing `promptBuilder.service` with the detected ingredients added as context, and generates an array of 2 recipes at once with a much higher output ceiling (`PANTRY_RECIPE_MAX_TOKENS = 7000` — [apps/api/src/controllers/pantryScanner.controller.ts](../apps/api/src/controllers/pantryScanner.controller.ts)).

The prompt asks for 2 recipes and, since CP-B1, accepts 1 when the ingredients only make 1. If the generation answer is not valid JSON or matches no recipe schema, the backend sends **one format retry** with the same instruction as Pulse AI chat and the same 7000-token ceiling (CP-B1; before, an invalid answer was silently dropped).

On top of that, each recipe is independently checked against three safety layers (the physical blender limits — protein and volume —, macro-math consistency, and the diet/ice check); each check failing on a given recipe triggers its own extra retry call for that recipe (`maxTokens: 2000` each). Before CP-B1 the blender-limit and diet retries were always discarded (the Pantry prompt demands an array and the parser only read an object), so they cost tokens without ever helping; they now work. In the worst case this means up to 2 generation calls (7000-token ceiling each) plus up to 6 extra retry calls (2000-token ceiling each, 2 recipes × 3 layers) — a wide enough range, and dependent enough on the actual ingredients/recipes generated, that this document does not attempt a single worked number for it the way the sections above do. Apply the same `cost_usd` formula above with these real ceilings if an exact worst-case figure is needed; for exact production accounting, the same advice as the rest of this document applies — capture real Gemini usage metadata per call.

## Overload retries and the fallback model (CP-B1)

When Gemini answers `500` or `503` ("This model is currently experiencing high demand"), the backend repeats the same request up to 3 attempts in total, with waits of about 1 s and 3 s, all inside the original call window (30 s text, 45 s vision). This applies to every Gemini call: Pulse AI chat, the Pantry vision step, the Pantry generation and every retry call above. These errors return no generated content, so the repeated attempt is the one that produces the billable output; the extra attempts add latency, not output tokens. Confirm against real usage metadata before relying on this for accounting. `429` (quota) is not repeated on the same model.

`AI_FALLBACK_MODEL` is optional and has no default. When it is set, a text call whose primary model is exhausted by `429`/`500`/`503` gets one attempt on that model, which is then billed **at that model's price**. Choosing it is a cost decision: pick a model whose pricing has been checked like the ones in this document. It is never used for the vision step.

Each AI request also has a total time budget (55 s Pulse AI, 85 s Pantry). A call that would start with less than 5 s left is not sent at all, which caps the number of calls a single request can make under heavy overload.

## What can make the bill go up

- Longer user prompts
- More recent recipe names injected into the system prompt
- Longer JSON responses
- Hidden thinking tokens counted inside output pricing
- Retry calls caused by invalid JSON output (Pulse AI chat, and the Pantry Scanner format retry since CP-B1) and by the per-recipe guardrail retries (blender limits, macros, diet)
- A configured `AI_FALLBACK_MODEL` with a higher price than `AI_MODEL` (only used when the primary model is overloaded or out of quota)
- The Pulse AI locked preview (CP-1.1.4a): a free user who uses up the 3 daily messages can trigger **one more generation per day** (the 4th message). The AI runs normally, but only the macros are shown until the user subscribes. Worst case per free user, up to 4 Pulse AI generations a day instead of 3, plus retries. A preview served from the Mongo cache costs nothing, and a preview is not written to the cache. Unlocking after subscribing does not call the AI again
- Disabling or missing the app-level Mongo cache (Pulse AI chat only — the Pantry Scanner path has no cache to disable)
- Larger uploaded photos, or photos with an aspect ratio that tiles into more than ~4 tiles (Pantry Scanner)
- Future use of grounding, tools, Batch API, or additional multimodal inputs

## What keeps the bill low in the current implementation

- Only one user message is sent per Pulse AI chat generation
- The backend requests structured JSON directly
- The backend uses a small, low-cost model for both text and vision
- Pulse AI chat output is capped at 800 tokens; repeated identical chat requests can be served from the local cache for 7 days
- Photos are resized to a 1024px cap before upload, limiting image tokens
- Pantry Scanner only runs the (more expensive) recipe-generation step when ingredients were actually detected

## Bottom line

For the current BLENDi Pulse implementation, `gemini-3.5-flash-lite` is the right choice for both `AI_MODEL` and `VISION_MODEL` — it is the cheapest model confirmed to actually work (within timeouts, on the free tier, with non-deprecated API access) for this project's real calls.

**Pulse AI chat:** if requests stay close to the measured baseline, 1000 uncached requests are roughly $0.390800. If responses regularly approach the full 800-token cap, 1000 uncached requests are roughly $2.160800. If invalid JSON causes a retry and both calls are large, 1000 requests can reach roughly $4.326700.

**Pantry Scanner vision step:** 1000 scans at the conservative output ceiling cost roughly $2.9656 for ingredient detection alone — before the separate, more variable recipe-generation step described above.
