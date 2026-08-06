# CP3.3 — Pulse AI Avançado: Histórico e Refinamento de Qualidade

This checkpoint attacks two unrelated problems that both lived inside Pulse AI chat. First, conversations had no persistence: closing the app or navigating away lost the entire exchange, so every session restarted from zero with no memory of what the user had already asked. Second, the AI's macro math was unreliable — the model tended to estimate protein, carbs, fat, and calories as plausible-looking numbers instead of actually calculating them from the real quantities of the ingredients it had just listed, which meant the displayed macros could silently disagree with the recipe they described. Neither problem changed anything about the chat's visuals or existing components — both are backend persistence and prompt-system work sitting underneath the same screen.

## Files Created and Modified

### Backend

- [apps/api/src/models/Conversation.ts](../../apps/api/src/models/Conversation.ts): new file, the `conversations` collection.
- [apps/api/src/config/nutritionReference.config.ts](../../apps/api/src/config/nutritionReference.config.ts): new file, a 20-ingredient nutrition table as a typed TypeScript constant.
- [apps/api/src/utils/macroValidation.utils.ts](../../apps/api/src/utils/macroValidation.utils.ts): new file, `validateMacroConsistency()` — labeled "Camada 3" in its own source comments.
- [apps/api/src/utils/blenderGuardrail.utils.ts](../../apps/api/src/utils/blenderGuardrail.utils.ts): new file, `validateProteinGuardrail()` — labeled "Camada 2" in its own source comments; not part of the original file inventory for this checkpoint, but it is where the protein limit is actually enforced in code.
- [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts): extended with five new system-prompt section builders (detailed below).
- [apps/api/src/config/pricing.config.ts](../../apps/api/src/config/pricing.config.ts): extended with the `BLENDER_LIMITS` table and the `BlenderLimit` interface.
- [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts): the `chat` handler extended with conversation persistence, conversation-context injection, and the two validation-and-retry passes.
- [apps/api/src/controllers/conversation.controller.ts](../../apps/api/src/controllers/conversation.controller.ts): new file, `getConversations()` and `getConversationById()`.
- [apps/api/src/routes/conversations.ts](../../apps/api/src/routes/conversations.ts): new file, exposes `GET /conversations` and `GET /conversations/:id`.
- [apps/api/src/index.ts](../../apps/api/src/index.ts): mounted `/conversations`.
- [packages/shared/src/schemas/pulseAi.ts](../../packages/shared/src/schemas/pulseAi.ts): `PulseAiRecipe` and `pulseAiRecipeSchema` extended with an optional `macrosValidated` boolean, defaulting to `true`.

### Mobile

- [apps/mobile/src/services/conversation.service.ts](../../apps/mobile/src/services/conversation.service.ts): new file, thin wrappers around `GET /conversations` and `GET /conversations/:id`.
- [apps/mobile/src/screens/ConversationHistoryScreen.tsx](../../apps/mobile/src/screens/ConversationHistoryScreen.tsx): new file.
- [apps/mobile/src/screens/PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx): extended with automatic same-day continuity, the two new header icons, and the history-reading banner.
- [apps/mobile/src/navigation/PulseAINavigator.tsx](../../apps/mobile/src/navigation/PulseAINavigator.tsx) and [apps/mobile/src/navigation/types.ts](../../apps/mobile/src/navigation/types.ts): registered the `ConversationHistory` route and the `conversation` param accepted by `PulseAIChat`.

## Conversation Model and History Continuity

[apps/api/src/models/Conversation.ts](../../apps/api/src/models/Conversation.ts) defines the `conversations` collection:

| Field | Notes |
|---|---|
| `userId` | Indexed |
| `messages` | Array of subdocuments: `role` (`user` or `assistant`), `content` (a plain string for `user` messages, a full `PulseAiRecipe` object for `assistant` messages), `timestamp` |
| `lastRecipeName` | Stored as its own top-level field so the conversation list endpoint never has to walk the `messages` array just to show a title |
| `createdAt` | TTL index at 90 days (`7_776_000` seconds) |

There is also a compound index on `userId` + `createdAt` descending, used by both the listing endpoint and the reuse lookup below.

When a chat message comes in, [apps/api/src/controllers/pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts) looks for the user's most recent conversation created within the last 24 hours. If one exists, it is reused — the new exchange is appended to it. If none exists, a new conversation document is created. This is what makes same-day messages feel like one continuous chat while naturally starting a fresh conversation the next day, without any explicit "new conversation" action from the user.

The last 6 message exchanges (12 individual messages: `CONVERSATION_HISTORY_MESSAGE_LIMIT`) from the active conversation are injected into the AI's context on every new message, so the model can refer back to what was already discussed. That limit is a deliberate balance between giving the model useful continuity and keeping the per-request token cost bounded. When a prior assistant message is serialized into that context, it is represented only by its recipe's `title` — never the full `PulseAiRecipe` object — which keeps the context compact even after several recipe exchanges.

## Quality Refinement — Layer 1: Prompt Enrichment

[apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) gained five new system-prompt sections, all appended to every Pulse AI request:

1. **Macro calculation instruction** — tells the model to calculate protein, carbs, fat, and calories from the real quantity of each ingredient instead of estimating, and that the total must equal the sum of each ingredient's contribution.
2. **Nutrition reference table** — [apps/api/src/config/nutritionReference.config.ts](../../apps/api/src/config/nutritionReference.config.ts)'s 20 common ingredients (whey isolate, whole milk, banana, oats, peanut butter, and so on), each with protein/carbs/fat/calories per 100g or 100ml, rendered directly into the prompt so the model has concrete numbers to scale instead of guessing.
3. **Calorie equation self-check** — asks the model to verify, before responding, that `(protein × 4) + (carbs × 4) + (fat × 9)` is within 10% of the declared total calories, and to recalculate if it is not.
4. **Recipe scope instruction** — the shake is one of several meals in the user's day, not their entire daily nutrition; unless the user explicitly asks for their full daily target in one shake, the recipe should cover roughly 25–40% of the user's daily protein target, never the whole target by default.
5. **Physical blender guardrails** — states the user's blender model's maximum combined ingredient volume (in ml or oz depending on `unitSystem`) and maximum recipe protein, and instructs the model never to suggest a combination exceeding either.

All five are prompt-level instructions: they shape what the model is asked to do, but nothing in this layer inspects or corrects the model's actual response. That happens in the next two layers — and, notably, only the protein half of guardrail #5 gets a backend check; the volume half does not (see below).

## Quality Refinement — Layer 2: Protein Guardrail Validation and Retry

[apps/api/src/utils/blenderGuardrail.utils.ts](../../apps/api/src/utils/blenderGuardrail.utils.ts) backs the physical guardrail described in the prompt with an actual backend check. After a recipe comes back, `validateProteinGuardrail()` compares its declared protein against the user's blender model limit, sourced from `BLENDER_LIMITS` in [apps/api/src/config/pricing.config.ts](../../apps/api/src/config/pricing.config.ts):

| Model | Max volume | Max protein |
|---|---|---|
| Lite | 400ml / 17.5oz | 35g |
| ProPlus | 400ml / 17.5oz | 45g |
| Steel | 600ml / 21oz | 55g |

If the recipe's protein exceeds the model's limit, the handler sends one retry call to the AI provider with a message stating the exact violation (declared protein vs. the maximum allowed) and asking for a corrected recipe. This retry exists specifically because the prompt instruction alone is not always enough — under an adversarial request like "give me the maximum protein possible," the model can ignore it.

Volume is deliberately **not** validated here. Each ingredient's `amount` is free-form text (`"30g"`, `"1 cup"`, `"240ml"`), and there is no reliable way to parse and sum that into a comparable total without a dedicated unit-conversion parser — out of scope for this checkpoint. The 400ml/600ml limits reach the model only through the Layer 1 prompt instruction; there is no backend enforcement or retry for volume specifically.

## Quality Refinement — Layer 3: Macro Consistency Validation and Retry

[apps/api/src/utils/macroValidation.utils.ts](../../apps/api/src/utils/macroValidation.utils.ts)'s `validateMacroConsistency()` runs after the protein guardrail check and compares the recipe's declared calories against calories derived mathematically from its own macros (`protein × 4 + carbs × 4 + fat × 9`).

If the difference exceeds 15% (`MACRO_CALORIE_TOLERANCE_PERCENT`), the handler sends a second retry call to the AI provider, explaining the exact numeric inconsistency and asking for corrected macros. If that retry also fails to produce a consistent recipe, the handler gives up and returns the best available response with `macrosValidated: false` set on the `PulseAiRecipe` — the recipe is still returned, just flagged as having failed the math check.

The 15% tolerance is deliberately looser than the 10% self-check the model is asked to perform in the Layer 1 prompt: this is the backend's independent safety net, not a restatement of the model's own self-grading, and it needs enough slack to absorb real-world macro variance across brands and ingredient ripeness without flagging every reasonable recipe as inconsistent.

Because Layer 2 and Layer 3 run in sequence on the same recipe, a single chat request can trigger up to two extra AI calls in the worst case — one to fix a protein violation, one to fix a macro inconsistency — before the final response is returned.

## PulseAIScreen Changes

On mount, [apps/mobile/src/screens/PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx) calls `GET /conversations` and checks whether the most recent conversation has `daysAgo === 0`. If it does, the screen fetches that conversation's full history through `GET /conversations/:id` and loads it into the chat — the same automatic same-day continuity described above, now surfaced in the UI. Conversations from earlier days are left alone; the screen opens with its normal welcome state instead.

Two icons were added to the header:

- `add-circle-outline` starts a new conversation by clearing the screen's local message state — it does not delete or otherwise touch the previous conversation in the database, which simply stops being the "active" one once a new message is sent.
- `time-outline` opens `ConversationHistoryScreen`. This finalizes an icon that had existed as a non-functional placeholder since CP1.5.

`ConversationHistoryScreen` lists the user's conversations using `lastRecipeName` (falling back to a generic label when absent) and a relative time built from the backend's `daysAgo` field — today's time, "yesterday," or "N days ago." Tapping a conversation navigates back into the chat screen with that conversation's full messages, which puts `PulseAIScreen` into a read/reload mode: an informational banner appears explaining that a past conversation was loaded, with a one-tap action to start a new conversation from there.
