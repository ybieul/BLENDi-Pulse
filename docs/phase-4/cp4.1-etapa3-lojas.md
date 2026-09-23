# CP4.1 — Etapa 3: Store Presence and Subscription Products

Reference sheet for filling in App Store Connect and Google Play Console by hand. Every value below was checked against the project code on 2026-09-21. Where a value is a suggestion (not taken from code) it is marked **[SUGGESTION]**. Decisions already made by Gabriel/Jon are marked **[DECIDED]**.

## Confirmed values

| Item | Value | Source |
|---|---|---|
| App name | `BLENDi Pulse` | [apps/mobile/app.json](../../apps/mobile/app.json) (`expo.name`) |
| iOS bundle identifier | `com.blendi.pulse` | `expo.ios.bundleIdentifier`, locked in CP4.1 Etapa 1 |
| Android package name | `com.blendi.pulse` | `expo.android.package`, locked in CP4.1 Etapa 1 |
| Apple team | Katz enterprises llc, `49SM6447X6` | CP4.1 Etapa 2 |
| Monthly product ID | `pulse_pro_monthly` | [apps/mobile/src/config/pricing.config.ts:8](../../apps/mobile/src/config/pricing.config.ts#L8), [apps/api/src/config/pricing.config.ts:10](../../apps/api/src/config/pricing.config.ts#L10) |
| Annual product ID | `pulse_pro_annual` | [apps/mobile/src/config/pricing.config.ts:9](../../apps/mobile/src/config/pricing.config.ts#L9), [apps/api/src/config/pricing.config.ts:11](../../apps/api/src/config/pricing.config.ts#L11) |
| Monthly price | **$6.99 USD** | Confirmed by Gabriel/Jon; code updated to match (see section 3) |
| Annual price | **$39.99 USD** | Confirmed by Gabriel/Jon; code updated to match (see section 3) |

## Before you start

- **Bundle ID in RevenueCat.** CP3.1 registered `com.blendiblender.pulse`. Jon/Gabriel will update the RevenueCat apps (iOS and Android) to `com.blendi.pulse` before mapping products.
- **Apple:** the Paid Apps Agreement, banking and tax forms must be active in App Store Connect, or subscription products cannot be created. The App ID `com.blendi.pulse` should already exist in the Developer Portal (created by EAS in Etapa 2), so pick it from the Bundle ID dropdown instead of creating a new one.
- **Google Play:** subscription products can only be created after the app has an uploaded build (an AAB on at least the internal testing track). Until the first build exists, the Subscriptions page is locked. Plan the product creation for after the first `eas build` (Etapa 6).

---

## 1. App Store Connect

### App record

| Field | Value |
|---|---|
| Name | `BLENDi Pulse` |
| Bundle ID | `com.blendi.pulse` (choose the existing one from the dropdown) |
| Primary language | English (U.S.) **[SUGGESTION]**: the app ships with i18n, confirm the primary locale |
| SKU | `blendi-pulse` **[SUGGESTION]**: free-form and permanent, matches the Expo slug |
| Primary category | **Health & Fitness** **[SUGGESTION]** |
| Secondary category | Food & Drink **[SUGGESTION]** |

**Why Health & Fitness as primary:** the app's core loop is nutrition tracking: macros, goals, streaks, XP and weekly reports, with recipes as the means. Users looking for this find it under Health & Fitness. Food & Drink fits a pure recipe catalogue, which understates what the app does, so it works better as the secondary category. Health & Fitness gets closer review of health claims, which is another reason to follow the wording reminder at the end of this document.

### Subscription group

| Field | Value |
|---|---|
| Group reference name | `BLENDi Pulse Pro` **[DECIDED]**. No group name exists in the code; this one was chosen by Gabriel/Jon. The reference name is internal, but the group's localized display name is shown to users in subscription management. |

Both products go in this **one** group so a user can only hold one of them at a time and can switch between monthly and annual as an upgrade/downgrade.

### Products

| | Monthly | Annual |
|---|---|---|
| Product ID | `pulse_pro_monthly` | `pulse_pro_annual` |
| Reference name (internal) | `Pulse Pro Monthly` **[SUGGESTION]** | `Pulse Pro Annual` **[SUGGESTION]** |
| Display name (user-facing) | `Pulse Pro Monthly` **[SUGGESTION]** | `Pulse Pro Annual` **[SUGGESTION]** |
| Subscription duration | 1 Month | 1 Year |
| Price (USD, U.S. storefront) | **$6.99** | **$39.99** |
| Group | `BLENDi Pulse Pro` | `BLENDi Pulse Pro` |

Notes:
- The product ID cannot be changed or reused after creation, even if the product is deleted.
- Set the U.S. price to $6.99 / $39.99 and let Apple generate the other storefronts, then review the equalized prices.
- Each product needs a localization (display name and description) and a review screenshot of the paywall before it can be submitted.
- The first subscriptions must be attached to an app version submitted for review. They cannot be approved on their own the first time.

---

## 2. Google Play Console

### App

| Field | Value |
|---|---|
| App name | `BLENDi Pulse` |
| Package name | `com.blendi.pulse` (permanent once the first build is uploaded) |
| Category | **Health & Fitness** **[SUGGESTION]** (Play allows one category; same reasoning as on the App Store) |
| App or game | App |
| Free or paid | Free (Pro is an in-app subscription) |

### Subscriptions

Google splits a subscription into a **subscription** (product ID) and one or more **base plans** (each with a billing period and price).

| | Monthly | Annual |
|---|---|---|
| Subscription (product) ID | `pulse_pro_monthly` | `pulse_pro_annual` |
| Name | `Pulse Pro Monthly` **[SUGGESTION]** | `Pulse Pro Annual` **[SUGGESTION]** |
| Base plan ID | `monthly` **[DECIDED]** | `annual` **[DECIDED]** |
| Billing period | `P1M` (every month) | `P1Y` (every year) |
| Renewal type | Auto-renewing | Auto-renewing |
| Price (USD) | **$6.99** | **$39.99** |

Notes:
- Product IDs must start with a lowercase letter or number and may contain only lowercase letters, numbers, underscores and periods, so both IDs are valid. Base plan IDs allow lowercase letters, numbers and hyphens.
- Set the base plan price in USD for the United States and let Play convert the other regions, then review them.
- Activate each base plan after saving, since drafts are not purchasable.

### Risk to check: how RevenueCat reports Google Play product identifiers

On Android, RevenueCat identifies a subscription with a base plan as `subscriptionId:basePlanId` (for example `pulse_pro_monthly:monthly`), not as the bare subscription ID. The app compares identifiers with exact string equality against the bare IDs in `pricing.config.ts`:

- [purchase.service.ts:165-170](../../apps/mobile/src/services/purchase.service.ts#L165-L170): fallback match on `pkg.product.identifier` (the primary path uses `offering.monthly` / `offering.annual`, which does not depend on the string).
- [purchase.service.ts:276-277](../../apps/mobile/src/services/purchase.service.ts#L276-L277) and [purchase.service.ts:423-426](../../apps/mobile/src/services/purchase.service.ts#L423-L426): `activeSubscriptions.includes(...)`.
- [revenueCat.service.ts:80-93](../../apps/api/src/services/revenueCat.service.ts#L80-L93): backend `isTrackedProductId` / `mapProductIdToPlan`.

If RevenueCat returns `pulse_pro_monthly:monthly` on Android, these checks would not match and an Android purchase would not unlock Pro. This is not confirmed for this setup, and the code was not changed for it. It has to be verified with a real Android sandbox purchase in the internal-testing phase, before any Play release. Also check what the iOS side returns, which should be the bare ID.

---

## 3. Cross-check against the code

### Product IDs: match

| Product | Code (mobile) | Code (api) | To register (App Store) | To register (Google Play) | Result |
|---|---|---|---|---|---|
| Monthly | `pulse_pro_monthly` | `pulse_pro_monthly` | `pulse_pro_monthly` | `pulse_pro_monthly` | Identical, character by character (17 chars) |
| Annual | `pulse_pro_annual` | `pulse_pro_annual` | `pulse_pro_annual` | `pulse_pro_annual` | Identical, character by character (16 chars) |

Copy the IDs from this table instead of retyping them. Both are lowercase with underscores and no spaces.

### Prices and discount: code updated to match

The code held the old prices ($4.99 / $49.99 / 17%). It was updated after Gabriel/Jon confirmed $6.99 / $39.99:

| Item | Before | Now | Location |
|---|---|---|---|
| `PRO_MONTHLY_PRICE_USD` | 4.99 | **6.99** | [apps/mobile/src/config/pricing.config.ts:4](../../apps/mobile/src/config/pricing.config.ts#L4), [apps/api/src/config/pricing.config.ts:6](../../apps/api/src/config/pricing.config.ts#L6) |
| `PRO_ANNUAL_PRICE_USD` | 49.99 | **39.99** | mobile line 5, api line 7 |
| `PRO_ANNUAL_DISCOUNT_PERCENT` | 17 | **52** | mobile line 6, api line 8 |

- Annual saving: $6.99 × 12 = $83.88 versus $39.99, so $43.89 saved, which is 52.3% (rounds to 52).
- `PRO_ANNUAL_DISCOUNT_PERCENT` is exported but not read anywhere else in `apps/` or `packages/`. It is a plain constant, so it must be kept in sync by hand if prices change again.
- [UpgradeScreen.tsx:80-90](../../apps/mobile/src/screens/UpgradeScreen.tsx#L80-L90) computes its fallback savings percentage from the two price constants, so it shows 52% without further edits. When the RevenueCat offering loads, the screen uses the store's real prices.
- The annual "per month" figure on the paywall fallback is `39.99 / 12`, shown as $3.33.
- No other hardcoded price or discount string exists in `apps/mobile/src` or `apps/api/src`, including the locale files (the "Save {{percent}}%" text takes its number from code).

### Not defined in code
- **Subscription Group name:** not in code or docs. Decided as `BLENDi Pulse Pro`; it lives only in App Store Connect.
- **RevenueCat entitlement identifier:** the code does not use one; it matches on product IDs. Docs only mention the "Pulse Pro entitlement". Confirm the exact name in the RevenueCat dashboard when attaching the two products to it.

---

## Reminder: product descriptions and health claims

Keep any product description, display name, promotional text and screenshot caption factual and about features (for example "unlimited Pulse AI recipes", "weekly reports"). Do not promise specific health outcomes: no weight loss, muscle gain, disease prevention or treatment, or medical benefits. The app deals with nutrition, and both Apple and Google review that kind of claim closely. Phrases like "lose 5 kg" or "boost your immunity" are a common reason for rejection.
