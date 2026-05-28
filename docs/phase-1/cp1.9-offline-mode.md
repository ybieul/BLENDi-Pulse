# CP1.9 — Offline Mode and Language Fix

This checkpoint implements the app's full offline-resilience layer and fixes a critical Pulse AI language bug. The offline mode makes the app meaningfully usable without connectivity, degrades gracefully for network-dependent actions, and automatically resynchronizes critical state after reconnection. The language bug happened because the Pulse AI prompt builder was using the persisted profile language from the database instead of the app's currently active runtime language.

## Language Bug Root Cause

The root problem was that the app had two different language concepts that could diverge over time.

- `preferredLanguage` persisted in MongoDB represented the profile language known by the backend.
- The active app language lived in local storage through the mobile i18n layer and could change immediately in settings without waiting for a backend roundtrip.

That meant a user could switch the app language locally, see the rest of the UI update, and still receive Pulse AI responses in the older backend language.

### Solution

The fix is the optional `language` field in the body of POST /pulse-ai/chat.

On mobile, [apps/mobile/src/services/pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts) sends the current `i18n.language` when it is one of the supported locales.

On the backend, [apps/api/src/services/promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) resolves language with strict priority:

1. `language` from the request body
2. persisted `preferredLanguage` / `locale` from the database as fallback

That restores consistency between the visible app language and the language used in the Pulse AI prompt.

## Network State Architecture

The global connectivity source of truth lives in [apps/mobile/src/store/network.store.ts](../../apps/mobile/src/store/network.store.ts).

### Store Fields

The store tracks four public state fields:

- `isConnected`
- `isInternetReachable`
- `connectionType`
- `wasOffline`

### Why `isConnected` And `isInternetReachable` Both Matter

The distinction is critical.

- A device can be connected to Wi-Fi or another network transport and still have no real internet access.
- `isConnected` only answers whether a network transport exists.
- `isInternetReachable` answers whether that transport can actually reach the internet.

The app treats either failure mode as effectively offline.

### Single Subscription Point

The hook [apps/mobile/src/hooks/useNetworkStatus.ts](../../apps/mobile/src/hooks/useNetworkStatus.ts) is instantiated only once in [apps/mobile/App.tsx](../../apps/mobile/App.tsx).

It uses `NetInfo.addEventListener(...)` plus an initial `NetInfo.fetch()` call, updates the Zustand store through `setConnectionState(...)`, and triggers reconnect sync only when the app was previously offline and now regained a usable connection.

## Offline Banner

The connectivity banner is implemented in [apps/mobile/src/components/ui/OfflineBanner.tsx](../../apps/mobile/src/components/ui/OfflineBanner.tsx).

### Visual States

It has two visible states:

- offline: background `rgba(239,68,68,0.95)`
- online-restored: background `rgba(34,197,94,0.95)`

The restored state stays visible for 2.5 seconds before animating away.

### Layout Behavior

The banner uses:

- `position: 'absolute'`
- `zIndex: 999`
- `pointerEvents: 'none'`

That combination keeps it visually prominent without blocking taps or interfering with the rest of the app while it is shown.

## Pending Blend Queue

Offline queuing is intentionally implemented only for blends, because blend completion is the one user action in Phase 1 that is both high-value and hard to recreate accurately after the fact.

The queue lives in [apps/mobile/src/utils/pendingBlends.utils.ts](../../apps/mobile/src/utils/pendingBlends.utils.ts) and is persisted in MMKV under the storage key `pending_blend_logs`.

### Queue Item Shape

Each queued item stores the original blend log payload plus:

- `localId`
- `queuedAt`
- `attemptCount`

### Why Only Blends Are Queued

Other write actions such as favorites or hydration taps are lower risk and easy for the user to retry manually. Blend completion, by contrast, is the end of a real timer-driven action and should not disappear just because connectivity dropped during logging.

## Per-Feature Offline Behavior

The offline strategy is intentionally feature-specific rather than uniform.

### Home

Home can render from persisted query data, especially `userProfile` and `blendLogsToday`, and surfaces data age through `StaleDataIndicator` in its summary widgets. Network-dependent quick actions degrade gracefully instead of crashing.

### Pulse AI

Pulse AI disables the chat input when offline. [apps/mobile/src/components/pulseAi/ChatInput.tsx](../../apps/mobile/src/components/pulseAi/ChatInput.tsx) reduces input opacity, swaps the send icon for an offline cloud icon, and uses the offline placeholder text instead of allowing a request that cannot succeed.

### Blend Timer

The timer itself works fully offline because its countdown state is local to the device. If the final blend log cannot be sent, [apps/mobile/src/screens/BlendScreen.tsx](../../apps/mobile/src/screens/BlendScreen.tsx) stores it in the pending blend queue so the completion event is not lost.

### Track

Track reads from cached hydration and supplement data. Hydration quick-log explicitly blocks offline with a toast, and supplement progress does not have a durable offline queue, so write attempts degrade back to cached state rather than persisting offline mutations.

### Favorites

Favorites reading works offline from the persisted React Query cache. Add and remove operations are intentionally blocked when offline and show a toast instead of entering a deferred queue.

### Profile

Profile reading works offline from the persisted `userProfile` query and the auth store snapshot. Profile edits still depend on live API writes and therefore are not treated as offline-first mutations.

## Stale Data Indicator

The stale-data label is implemented in [apps/mobile/src/components/ui/StaleDataIndicator.tsx](../../apps/mobile/src/components/ui/StaleDataIndicator.tsx).

It uses simple time thresholds based on `dataUpdatedAt`:

- below 1 hour: invisible
- between 1 and 24 hours: white text with 40% opacity
- above 24 hours: warning text in `rgba(245,158,11,0.60)`

This gives the app a lightweight way to expose cached-data age without alarming the user for short normal offline windows.

## Auto-Sync on Reconnect

Reconnect sync is orchestrated by [apps/mobile/src/hooks/useNetworkStatus.ts](../../apps/mobile/src/hooks/useNetworkStatus.ts) and [apps/mobile/src/utils/reconnectSync.utils.ts](../../apps/mobile/src/utils/reconnectSync.utils.ts).

### Sequence

When the app was offline and regains a usable connection, it runs this sequence:

1. process the pending blend queue sequentially
2. increment `attemptCount` on failures and keep retryable items in the queue
3. after 3 failed attempts, show a persistent toast with a Retry action
4. invalidate critical queries through `queryClient.invalidateQueries(...)`
5. clear the `wasOffline` flag with `markSyncCompleted()`
6. let the reconnection banner remain visible for 2.5 seconds

The critical invalidations currently include:

- `blendLogsToday`
- `blendHistory`
- `userProfile`
- `hydrationToday`
- `supplementStack`

This keeps the reconnect flow best-effort but still practical: first recover the one critical queued write path, then refresh the cache-backed surfaces the user is most likely to revisit next.