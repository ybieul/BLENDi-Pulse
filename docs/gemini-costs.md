# Gemini Cost Model For BLENDi Pulse

## Recommended model

Use the following backend configuration for Gemini in this codebase:

```env
AI_PROVIDER=google
AI_MODEL=gemini-2.5-flash-lite
AI_API_KEY=YOUR_GEMINI_API_KEY
```

Why this model:

- `gemini-2.5-flash-lite` is the cheapest current stable Gemini text model on the Gemini Developer API pricing page.
- Google also lists `gemini-2.0-flash-lite` at a lower price, but it is deprecated and scheduled for shutdown on 2026-06-01, so it is not a safe production choice.

Pricing source used for this document:

- Gemini Developer API pricing page, paid tier
- Google pricing page last updated by Google on 2026-05-16 UTC
- Rates used here for `gemini-2.5-flash-lite`:
  - Input: $0.10 per 1,000,000 tokens
  - Output: $0.40 per 1,000,000 tokens

## Exact billing formula

For the current BLENDi Pulse request path, the model cost is:

```text
cost_usd = ((input_tokens * 0.10) + (output_tokens * 0.40)) / 1,000,000
```

Where:

- `input_tokens` = system prompt + user message + any retry instruction sent back to Gemini
- `output_tokens` = the JSON recipe returned by Gemini
- Google states that output pricing includes thinking tokens

Important consequence:

- The visible JSON is not always the full billing story, because output pricing can include thinking tokens.
- The backend currently caps generated output with `maxOutputTokens: 800`, so 800 output tokens is the practical per-call ceiling in the current implementation.

## How BLENDi Pulse currently consumes tokens

The current backend path is simple and text-only:

1. The API builds one system prompt with user hardware, goal, locale, unit system, macro targets, and up to 5 recent recipe names.
2. The API sends one user message.
3. Gemini returns one JSON recipe object.
4. If the first response is not valid JSON for the schema, the backend sends one retry call with this extra instruction: `Your previous response had an invalid format. Return only valid JSON.`

Files that define this behavior:

- [apps/api/src/services/promptBuilder.service.ts](apps/api/src/services/promptBuilder.service.ts)
- [apps/api/src/controllers/pulseAi.controller.ts](apps/api/src/controllers/pulseAi.controller.ts)
- [apps/api/src/services/aiProvider.service.ts](apps/api/src/services/aiProvider.service.ts)

What is not used in the current BLENDi Pulse path:

- No Google Search grounding
- No Google Maps grounding
- No URL context tool
- No file search tool
- No Batch API
- No explicit Gemini context caching
- No multimodal image, audio, video, or PDF input

This matters because the current Google bill is only token-based input/output billing for standard text generation.

## Cache behavior and real cost impact

BLENDi Pulse already has its own application-level cache in MongoDB.

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

- [apps/api/src/services/cache.service.ts](apps/api/src/services/cache.service.ts)
- [apps/api/src/config/cache.config.ts](apps/api/src/config/cache.config.ts)

## Measured BLENDi Pulse baseline

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
per_request_baseline_usd = ((536 * 0.10) + (92 * 0.40)) / 1,000,000
per_request_baseline_usd = $0.0000904
```

Important accuracy note:

- This is the most honest estimate available without a live Gemini token count from the exact production prompt and response.
- Google tokenization is not exactly the same as `characters / 4`, so the table below is a measured estimate, not a billing export.
- For exact production accounting, capture Gemini usage metadata per request or call the token counting API before sending prompts.

## Cost table

The table below shows three useful views:

- `Measured baseline`: one uncached request using the measured BLENDi Pulse baseline above
- `High-output ceiling`: same measured input, but assuming the model consumes the full `maxOutputTokens: 800`
- `Retry worst case`: first call fails schema validation, then the backend retries once, and both calls reach the 800-token output ceiling

| Requests | Measured baseline (USD) | High-output ceiling (USD) | Retry worst case (USD) |
| --- | ---: | ---: | ---: |
| 10 | 0.000904 | 0.003736 | 0.007489 |
| 100 | 0.009040 | 0.037360 | 0.074890 |
| 200 | 0.018080 | 0.074720 | 0.149780 |
| 500 | 0.045200 | 0.186800 | 0.374450 |
| 1000 | 0.090400 | 0.373600 | 0.748900 |

## What can make the bill go up

- Longer user prompts
- More recent recipe names injected into the system prompt
- Longer JSON responses
- Hidden thinking tokens counted inside output pricing
- Retry calls caused by invalid JSON output
- Disabling or missing the app-level Mongo cache
- Future use of grounding, tools, Batch API, or multimodal inputs

## What keeps the bill low in the current implementation

- Only one user message is sent per generation
- The backend requests structured JSON directly
- The backend uses a small, low-cost model
- The current flow is text-only
- Output is capped at 800 tokens
- Repeated identical requests can be served from the local cache for 7 days

## Bottom line

For the current BLENDi Pulse implementation, `gemini-2.5-flash-lite` is the right low-cost choice.

If requests stay close to the measured baseline, 1000 uncached requests are roughly $0.090400.

If responses regularly approach the full 800-token cap, 1000 uncached requests are roughly $0.373600.

If invalid JSON causes a retry and both calls are large, 1000 requests can reach roughly $0.748900.