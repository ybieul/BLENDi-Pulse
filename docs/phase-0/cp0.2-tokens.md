# CP0.2 — Design Tokens

This checkpoint creates the project's central design tokens file, which acts as the single source of truth for colors, fonts, spacing, border radius, and shadows. No other file in the project is allowed to declare color, typography, or spacing values directly. Every visual primitive must be imported from this shared token layer.

---

## Files Created

| File | Description |
|---|---|
| `packages/shared/src/tokens.ts` | Contains all design tokens exported as typed TypeScript constants using `as const` |
| `packages/shared/src/index.ts` | Re-exports the tokens so they can be consumed by other workspaces through `@blendi/shared` |

---

## Token Groups

### Colors

The `colors` group is the foundation of the BLENDi Pulse visual identity and is organized into semantic subgroups.

#### brand

Core brand colors used throughout the product:

| Token | Value | Purpose |
|---|---|---|
| `colors.brand.pulse` | `#9a4893` | Primary BLENDi Pulse accent used in CTAs, highlights, and Goal Rings |
| `colors.brand.plum` | `#2b1429` | Deep Plum base used as the primary app background |
| `colors.brand.light` | `#f4e9f3` | Light brand tint used for lighter surfaces, chips, and badges |

#### feedback

Semantic colors for success and error states:

| Token | Value | Purpose |
|---|---|---|
| `colors.feedback.success` | `#22c55e` | Success states, completed goals, and positive confirmations |
| `colors.feedback.warning` | `#f59e0b` | Warnings and attention-required states |
| `colors.feedback.error` | `#ef4444` | Errors, failed validation, and destructive actions |
| `colors.feedback.info` | `#3b82f6` | Informational hints and supportive callouts |

#### neutral

Gray scale used for borders, dividers, placeholders, and support surfaces. The scale follows `50` through `900`.

| Range | Purpose |
|---|---|
| `colors.neutral.50` to `colors.neutral.300` | Light neutrals for subtle separation and soft surfaces |
| `colors.neutral.400` to `colors.neutral.600` | Mid neutrals for placeholders, muted labels, and supporting UI |
| `colors.neutral.700` to `colors.neutral.900` | Deep neutrals for strong contrast elements and dark utility surfaces |

#### text

Text colors calibrated for dark backgrounds:

| Token | Value | Purpose |
|---|---|---|
| `colors.text.primary` | `#ffffff` | Headings, primary labels, and emphasized values |
| `colors.text.secondary` | `#e2d5e1` | Standard body text and descriptive copy |
| `colors.text.tertiary` | `#a888a5` | Metadata, placeholders, and de-emphasized labels |

#### background

Three layered dark surfaces representing depth in the UI:

| Token | Value | Purpose |
|---|---|---|
| `colors.background.primary` | `#2b1429` | Global app background |
| `colors.background.secondary` | `#3d1f3b` | Cards and raised panels |
| `colors.background.tertiary` | `#4f2a4d` | Inputs, modals, and bottom sheets |

### Fonts

The `fonts` group defines the three type families used across the product:

| Token | Value | Usage |
|---|---|---|
| `fonts.display` | `Syne` | Titles, badges, hero text, and brand-forward headlines |
| `fonts.body` | `DM Sans` | Body copy, labels, buttons, and most interface text |
| `fonts.mono` | `DM Mono` | Precision numeric values such as macros, timers, and technical measurements |

### Spacing

The `spacing` group follows a base unit of 4 points and scales outward with descriptive names. The file also includes a `px` token for 1-point separators and micro rules.

| Token | Value | Typical use |
|---|---|---|
| `spacing.xs` | `2` | Micro internal adjustments |
| `spacing.sm` | `4` | Small chip and badge padding |
| `spacing.md` | `8` | Inline gaps between nearby elements |
| `spacing.lg` | `12` | Small button padding |
| `spacing.xl` | `16` | Standard card and screen padding |
| `spacing.2xl` | `20` | Compact section gaps |
| `spacing.3xl` | `24` | Section padding |
| `spacing.4xl` | `32` | Large block separation |
| `spacing.5xl` | `40` | Spacious screen margins |
| `spacing.6xl` | `48` | Hero and onboarding layouts |
| `spacing.7xl` | `64` | Maximum layout spacing |

### Radius

The radius group is exported as `borderRadius`, mirroring React Native style prop naming.

| Token | Value | Usage |
|---|---|---|
| `borderRadius.sm` | `6` | Tags, badges, and chips |
| `borderRadius.md` | `12` | Buttons, inputs, and selects |
| `borderRadius.lg` | `20` | Cards, panels, and bottom sheets |
| `borderRadius.full` | `9999` | Pills, avatars, and fully rounded shapes |

### Shadows

The `shadows` group defines three elevation presets that work across both iOS and Android.

| Token | iOS values | Android value | Usage |
|---|---|---|---|
| `shadows.low` | `shadowColor: #000000`, `shadowOffset: { width: 0, height: 1 }`, `shadowOpacity: 0.18`, `shadowRadius: 3` | `elevation: 2` | Subtle resting cards |
| `shadows.medium` | `shadowColor: #000000`, `shadowOffset: { width: 0, height: 4 }`, `shadowOpacity: 0.24`, `shadowRadius: 8` | `elevation: 6` | Modals and bottom sheets |
| `shadows.high` | `shadowColor: #000000`, `shadowOffset: { width: 0, height: 8 }`, `shadowOpacity: 0.32`, `shadowRadius: 16` | `elevation: 12` | Floating overlays and menus |

### Additional Exported Groups

In addition to the core groups above, the checkpoint also exports supporting typography helpers and one unified aggregate object:

| Export | Purpose |
|---|---|
| `fontSizes` | Named typography scale from `xs` to `4xl` |
| `fontWeights` | Named numeric font-weight map from `light` to `extrabold` |
| `lineHeights` | Named line-height presets such as `tight`, `snug`, `normal`, and `relaxed` |
| `tokens` | Unified object that groups all token collections for one-shot imports |

---

## Technical Decisions

### Why `as const` Is Used

The token objects are exported with `as const` so TypeScript treats every token value as a literal instead of widening it to a generic `string` or `number`. That improves autocomplete precision and makes imported token paths fully type-safe. In practice, when a component imports `colors`, the editor can suggest exact paths such as `colors.brand.pulse` rather than exposing an untyped dictionary.

### Why Shadows Have Two Platform Models

React Native handles shadow rendering differently on iOS and Android.

- iOS uses `shadowColor`, `shadowOffset`, `shadowOpacity`, and `shadowRadius`
- Android uses `elevation`

The shadow tokens therefore include both sets of values in the same object so a single token can be spread into a cross-platform style without conditional logic in every component.

---

## Usage Pattern

Components should import only the token groups they need from `@blendi/shared` and reference values by object path. Hex colors, raw spacing numbers, and ad hoc font-family strings should never be written directly in component files.

Correct usage pattern:

```ts
import { colors, spacing, borderRadius, shadows, fonts } from '@blendi/shared';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.secondary,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.medium,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
  },
});
```

Incorrect pattern:

```ts
backgroundColor: '#9a4893';
padding: 16;
fontFamily: 'Syne';
```

The rule is simple: import the token and reference the token path. Never duplicate the underlying value.

---

## Pending Items

No items are pending for this checkpoint.

---

## Validation

This checkpoint can be validated directly in a React Native component or any other consumer workspace.

### 1. Import a Token Group From `@blendi/shared`

```ts
import { colors } from '@blendi/shared';
```

### 2. Confirm TypeScript Autocomplete

When typing `colors.brand.`, TypeScript should offer `pulse`, `plum`, and `light` as autocomplete suggestions. Selecting `colors.brand.pulse` should resolve to the literal value `#9a4893`.

Expected outcome:

- the import resolves without extra setup
- autocomplete is specific and accurate
- token values are consumed from the shared package rather than duplicated locally