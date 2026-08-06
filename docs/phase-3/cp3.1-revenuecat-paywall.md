# CP3.1 — RevenueCat + Paywall

This checkpoint closes the product's monetization loop. The free-versus-Pro differentiation was already built throughout Phases 1 and 2 — daily Pulse AI limits, Pantry Scanner monthly caps, the one-active-list Shopping List restriction — but the upgrade button behind all of it did not do anything real. CP3.1 implements the complete path from tapping that button to a confirmed payment, with every free-tier restriction lifting immediately once the purchase is verified. RevenueCat abstracts away the differences between iOS StoreKit 2 and Google Play Billing, so the mobile app talks to a single unified purchase API and the backend receives standardized webhooks regardless of which store processed the transaction.

## Files Created and Modified

### Backend

- [apps/api/src/config/pricing.config.ts](../../apps/api/src/config/pricing.config.ts): new file, the single source of truth for Pulse Pro pricing and RevenueCat product identifiers. It later became the home for `BLENDER_LIMITS` as well, but that table was added in CP3.3, not here.
- [apps/api/src/controllers/purchase.controller.ts](../../apps/api/src/controllers/purchase.controller.ts): new file, implements `verifyPurchase()`, the handler behind `POST /purchases/verify`.
- [apps/api/src/controllers/revenueCatWebhook.controller.ts](../../apps/api/src/controllers/revenueCatWebhook.controller.ts): new file, implements `handleRevenueCatWebhook()`, including inline HMAC signature verification — there is no separate webhook middleware file.
- [apps/api/src/services/revenueCat.service.ts](../../apps/api/src/services/revenueCat.service.ts): new file, wraps the RevenueCat REST API (`/receipts` and `/subscribers/{id}`) and extracts the active Pulse Pro entitlement from a RevenueCat customer-info response.
- [apps/api/src/routes/purchases.ts](../../apps/api/src/routes/purchases.ts): new file, exposes the authenticated `POST /purchases/verify` route.
- [apps/api/src/routes/webhooks.ts](../../apps/api/src/routes/webhooks.ts): new file, exposes the public `POST /webhooks/revenuecat` route.
- [apps/api/src/models/User.ts](../../apps/api/src/models/User.ts): extended with five subscription fields (`subscriptionId`, `subscriptionPlan`, `subscriptionExpiresAt`, `revenueCatCustomerId`, `subscriptionCancelRequestedAt`); `isPro` already existed from Phase 1.
- [apps/api/src/config/env.ts](../../apps/api/src/config/env.ts): added `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, and `REVENUECAT_APP_ID` as optional environment variables, plus the derived `paymentsConfig.isConfigured` flag.
- [apps/api/src/controllers/user.controller.ts](../../apps/api/src/controllers/user.controller.ts): `GET /users/me` now also returns the five new subscription fields.
- [apps/api/src/index.ts](../../apps/api/src/index.ts): mounts `/webhooks` with a raw body parser (`express.raw`) ahead of the global JSON parser so the webhook signature can be verified against the exact bytes received, mounts `/purchases`, and logs a boot warning when RevenueCat is not configured.

### Mobile

- [apps/mobile/src/config/pricing.config.ts](../../apps/mobile/src/config/pricing.config.ts): new file, mirrors the backend pricing constants for display purposes.
- [apps/mobile/src/config/revenuecat.config.ts](../../apps/mobile/src/config/revenuecat.config.ts): new file, resolves the platform-specific RevenueCat public SDK key from Expo config `extra` and exposes `isRevenueCatNativePlatform()`.
- [apps/mobile/src/services/purchase.service.ts](../../apps/mobile/src/services/purchase.service.ts): new file, wraps the `react-native-purchases` SDK — configuration, offering/package resolution, `purchasePlan()`, `restorePurchaseHistory()`, and backend verification.
- [apps/mobile/src/hooks/usePulseProPurchase.ts](../../apps/mobile/src/hooks/usePulseProPurchase.ts): new file, the screen-facing hook that runs the purchase/restore flow and propagates the resulting Pro state into the app.
- [apps/mobile/src/utils/pricing.utils.ts](../../apps/mobile/src/utils/pricing.utils.ts): new file, `formatUsdCurrency()` for locale-aware price display.
- [apps/mobile/src/screens/UpgradeScreen.tsx](../../apps/mobile/src/screens/UpgradeScreen.tsx): rebuilt as the full paywall screen described below.
- [apps/mobile/src/screens/MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx), [apps/mobile/src/screens/PantryScannerScreen.tsx](../../apps/mobile/src/screens/PantryScannerScreen.tsx), [apps/mobile/src/screens/ShoppingListsScreen.tsx](../../apps/mobile/src/screens/ShoppingListsScreen.tsx), [apps/mobile/src/components/pulseAi/ChatInput.tsx](../../apps/mobile/src/components/pulseAi/ChatInput.tsx): wired the four CP3.1 navigation entry points into `UpgradeScreen` (see below).
- [apps/mobile/src/store/auth.store.ts](../../apps/mobile/src/store/auth.store.ts) and [apps/mobile/src/services/auth.service.ts](../../apps/mobile/src/services/auth.service.ts): extended `AuthUser` with the five subscription fields so `setUser()` can carry Pro state end to end.
- [apps/mobile/App.tsx](../../apps/mobile/App.tsx): calls `initializePurchases()` on mount, fire-and-forget, to configure the RevenueCat SDK as early as possible.
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts): reads `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` and `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` and exposes them through `Constants.expoConfig.extra`.
- [apps/mobile/app.json](../../apps/mobile/app.json): added the `com.blendiblender.pulse` bundle identifier / package name required to register the app in RevenueCat and the stores.
- [apps/mobile/package.json](../../apps/mobile/package.json): added the `react-native-purchases` dependency.

## Pricing Configuration

All prices and product identifiers are centralized in one constants file per layer — [apps/api/src/config/pricing.config.ts](../../apps/api/src/config/pricing.config.ts) on the backend and [apps/mobile/src/config/pricing.config.ts](../../apps/mobile/src/config/pricing.config.ts) on mobile. Changing a price is a one-line edit in each file with no business-logic changes required anywhere else.

Both files export the same five constants:

- `PRO_MONTHLY_PRICE_USD`
- `PRO_ANNUAL_PRICE_USD`
- `PRO_ANNUAL_DISCOUNT_PERCENT`
- `REVENUECAT_PRODUCT_ID_MONTHLY`
- `REVENUECAT_PRODUCT_ID_ANNUAL`

`PRO_ANNUAL_DISCOUNT_PERCENT` is a plain constant, not a value derived from the two price constants at build or runtime. `UpgradeScreen` separately computes its own displayed savings percentage from `PRO_MONTHLY_PRICE_USD * 12` versus `PRO_ANNUAL_PRICE_USD`, so the two numbers can drift out of sync if only one of them is edited — that is the one place a price change needs a second look beyond the constants file.

The two `REVENUECAT_PRODUCT_ID_*` constants are plain string literals, not values sourced from environment variables. Swapping a product identifier in the RevenueCat dashboard still requires editing this constant in both files.

## Subscription Data Model

[apps/api/src/models/User.ts](../../apps/api/src/models/User.ts) carries `isPro: boolean`, in place since Phase 1, as the field every free/Pro gate in the codebase actually checks. CP3.1 adds five complementary fields that describe the subscription behind that flag but are never themselves used for gating:

| Field | Type | Notes |
|---|---|---|
| `subscriptionId` | `string`, optional | The active subscription's identifier at the payments provider |
| `subscriptionPlan` | `string`, optional | Enum of `monthly` or `annual` |
| `subscriptionExpiresAt` | `Date`, optional | When the current subscription period ends |
| `revenueCatCustomerId` | `string`, optional | The user's id in RevenueCat; usually equal to the MongoDB `_id` as a string, but kept as a separate field for flexibility if RevenueCat identity ever diverges from the internal id |
| `subscriptionCancelRequestedAt` | `Date`, optional | Set when RevenueCat reports the user turned off auto-renewal; cleared once the subscription is confirmed active again or expires |

Every write to these fields goes through [apps/api/src/services/revenueCat.service.ts](../../apps/api/src/services/revenueCat.service.ts) — the purchase verification and webhook handlers never set `isPro` or the subscription fields by hand, they always go through the same `extractActiveSubscriptionSnapshot()` logic that reads RevenueCat's own subscription state.

## Purchase Verification and Webhooks

### POST /purchases/verify

The mobile purchase flow, implemented in [apps/mobile/src/services/purchase.service.ts](../../apps/mobile/src/services/purchase.service.ts):

1. `purchasePlan(planId)` resolves the correct RevenueCat `PurchasesPackage` and calls `Purchases.purchasePackage(targetPackage)`. The native SDK handles the StoreKit 2 / Play Billing transaction directly and automatically reports the purchase to RevenueCat's servers as part of that call.
2. Once the SDK call resolves, mobile calls `POST /purchases/verify` with `{ platform, productId }` — no raw receipt is sent from the client, since RevenueCat already has the confirmed purchase by this point.
3. On the backend, [apps/api/src/controllers/purchase.controller.ts](../../apps/api/src/controllers/purchase.controller.ts) calls `getSubscriberCustomerInfo(userId)` in [apps/api/src/services/revenueCat.service.ts](../../apps/api/src/services/revenueCat.service.ts), which performs `GET https://api.revenuecat.com/v1/subscribers/{userId}` authenticated with `REVENUECAT_API_KEY`.
4. `extractActiveSubscriptionSnapshot()` inspects the returned subscriptions, keeps only the tracked monthly/annual product ids, and picks the one with the furthest-in-the-future expiration date. If none is active, the request fails with no update applied.
5. If an active entitlement is found, the backend updates the `User` document with `isPro: true` and the five subscription fields, then returns the updated profile.

The same controller also accepts an optional `receipt` field for a direct `POST /receipts` validation path, used when a raw store receipt needs to be validated without relying on RevenueCat's own record of the purchase — the current mobile client does not exercise this path for its main purchase flow, but the backend supports it.

If `REVENUECAT_API_KEY` is not configured, [apps/api/src/config/env.ts](../../apps/api/src/config/env.ts) still lets the server boot — `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, and `REVENUECAT_APP_ID` are all optional environment variables. [apps/api/src/index.ts](../../apps/api/src/index.ts) logs a startup warning instead of crashing, and `POST /purchases/verify` returns `503` at request time instead.

### POST /webhooks/revenuecat

[apps/api/src/controllers/revenueCatWebhook.controller.ts](../../apps/api/src/controllers/revenueCatWebhook.controller.ts) validates the `X-RevenueCat-Webhook-Signature` header — an HMAC-SHA256 signature over the raw request body — against `REVENUECAT_WEBHOOK_SECRET` before processing any event. The signature includes a timestamp with a 5-minute tolerance window. An invalid or missing signature returns `401` and the event is never processed.

Four event types are handled:

| Event | Action |
|---|---|
| `INITIAL_PURCHASE` | Resyncs the active subscription from RevenueCat and sets `isPro: true` along with the subscription fields |
| `RENEWAL` | Resyncs the same way as `INITIAL_PURCHASE` — in practice this refreshes `subscriptionExpiresAt` together with the rest of the snapshot, since RevenueCat is queried fresh rather than patched from the event payload alone |
| `CANCELLATION` | Attempts the same resync first; if RevenueCat still reports an active entitlement, nothing about `isPro` changes. If no active entitlement is found, the backend instead records `subscriptionCancelRequestedAt` without touching `isPro` — the user paid through the current period, so access stays on until it actually expires |
| `EXPIRATION` | Attempts the same resync first, in case a new subscription is already active; if none is found and the event's expiration timestamp has passed, sets `isPro: false` |

Every processed or intentionally ignored event returns `200 OK`, which prevents RevenueCat from retrying delivery.

## UpgradeScreen

[apps/mobile/src/screens/UpgradeScreen.tsx](../../apps/mobile/src/screens/UpgradeScreen.tsx) is reached from four navigation entry points introduced by CP3.1: the upgrade button on `MeScreen`, the Pantry Scanner monthly-limit screen, the Shopping List free-tier-limit flow, and the Pulse AI `ChatInput` when the daily free-tier limit is hit. A fifth entry point, the blurred Weekly Report preview, was added later by CP3.4 and reuses the same screen without further changes here.

Visually, the screen uses `AuroraBackground` at `intensity="full"`, a circular gold-gradient Pro badge, and five benefit rows (Pulse AI, Pantry Scanner, Shopping Lists, Weekly Report, and a general Pro badge item — the Weekly Report benefit line was added later alongside CP3.4, reusing the same benefits list). Two plan cards are shown side by side, with the annual plan pre-selected by default (`useState<PurchasePlanId>('annual')`) and its savings badge computed from the pricing constants as described above. The footer carries the three links required by both app stores: restore purchases, Terms of Use, and Privacy Policy.

When a purchase or restore completes, [apps/mobile/src/hooks/usePulseProPurchase.ts](../../apps/mobile/src/hooks/usePulseProPurchase.ts) propagates the confirmed Pro state through `useAuthStore.setUser()`, and additionally patches the React Query cache directly — `userProfile` is updated in place with the new subscription fields, and `shoppingLists` is patched to `canCreateMore: true` — before invalidating the `userProfile`, `shoppingLists`, and `shoppingListsArchived` queries. This combination is what makes every free-tier gate in the app disappear immediately after payment, without waiting for a full profile refetch.

## External Configuration Required

RevenueCat is partially configured: the account exists and the backend secret key (`REVENUECAT_API_KEY`) is available. Two pieces of external setup remain before either storefront can process real payments:

- **Apple Developer Account** — needed to create the iOS app inside RevenueCat, generate the in-app purchase P8 key in App Store Connect, and obtain the iOS Public API Key consumed by `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` on mobile.
- **Google Play Console** — needed to create the Android app inside RevenueCat and obtain the Android Public API Key consumed by `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` on mobile.

Until both are in place, `isRevenueCatNativePlatform()` and the `REVENUECAT_API_KEY` boot check keep the purchase flow disabled with a clear unavailable state instead of crashing the app or the server.
