# CP0.5 — SkeletonLoader Component

This checkpoint creates the skeleton screen component that will be used across all screens with asynchronous operations. The guiding principle is that the user should never see a blank screen or a generic spinner. Instead, the app always shows an animated placeholder shaped like the incoming content, preserving perceived speed even on slower connections.

---

## Files Created

| File | Description |
|---|---|
| `apps/mobile/src/components/ui/SkeletonLoader.tsx` | Base skeleton component plus three pre-built compositions for recipes, chat messages, and profile loading states |
| `apps/mobile/src/components/ui/index.ts` | Barrel export file for the UI design system components, including SkeletonLoader exports |

---

## Base Component

The base component is `SkeletonLoader`, implemented as a variant-driven React Native component.

### Props

| Prop | Type | Variants | Description |
|---|---|---|---|
| `variant` | `'line' | 'card' | 'circle' | 'input'` | All | Selects the visual skeleton shape |
| `width` | `number | \`${number}%\`` | `line` | Custom width for line skeletons; defaults to `100%` |
| `height` | `number` | `line` | Custom height for line skeletons; defaults to `14` |
| `size` | `number` | `circle` | Circle diameter; defaults to `40` |
| `accessibilityLabel` | `string` | All | Optional override for the default loading label |
| `style` | `ViewStyle` | All | Additional container styling |

### Default Behavior Per Variant

| Variant | Default dimensions | Notes |
|---|---|---|
| `line` | `width: 100%`, `height: 14` | Used for text-like placeholder rows |
| `card` | `width: 100%`, `height: 200` | Used for large content blocks such as recipe cards |
| `circle` | `size: 40` | Used for avatars, icons, and circular media placeholders |
| `input` | `width: 100%`, `height: 48` | Used for buttons, text inputs, and action blocks |

The component also applies shape-appropriate border radius using the shared design tokens:

- `line` uses `borderRadius.sm`
- `card` uses `borderRadius.lg`
- `circle` derives radius from `size / 2`
- `input` uses `borderRadius.md`

---

## Animation

The shimmer effect is implemented through `Animated.loop` with an opacity pulse rather than a moving gradient.

### Behavior

- The animation alternates opacity between `0.3` and `1`
- One full cycle lasts `1200ms`
- The animation runs indefinitely through `Animated.loop`
- `useNativeDriver: true` is enabled on each timing segment so the animation runs on the UI thread and stays smooth on slower devices

### Visual Treatment

The animated fill uses `colors.background.secondary` from the design token system. In the current implementation, the shimmer is achieved by changing opacity over that shared surface color, which lets it sit naturally on darker layered backgrounds such as `background.primary` and `background.tertiary` without introducing hardcoded placeholder colors.

---

## Pre-built Compositions

Three ready-made compositions are exported for common loading states.

### RecipeCardSkeleton

Mimics a full recipe card layout.

Structure:

- one full-width card block for image or header area
- one title line at `65%` width and `18` height
- three ingredient lines with varied widths of `80%`, `60%`, and `72%`
- one input-shaped action block with `44` height

This composition should be used while recipe content or Pulse AI results are still loading.

### ChatMessageSkeleton

Mimics a Pulse AI chat response.

Structure:

- one circular avatar placeholder with `size: 32`
- one full-width text line
- one secondary text line at `70%` width

This composition is intended for conversational loading states where the assistant is generating a response.

### ProfileSkeleton

Mimics the user profile header.

Structure:

- one large centered circular avatar placeholder with `size: 80`
- one centered name line with `50%` width and `20` height
- one centered subtitle line with `38%` width and `14` height

This composition is intended for profile or account bootstrapping states.

---

## Accessibility

The component is configured so assistive technologies do not mistake skeleton placeholders for real content.

Current accessibility behavior:

- default `accessibilityLabel` comes from the i18n key path `common.states.loading`
- the label can be overridden through the `accessibilityLabel` prop when needed
- `accessibilityRole` is set to `none`

This makes the skeleton discoverable as a loading state when needed, while avoiding semantic confusion with actual interactive or readable UI content.

---

## Usage Pattern

The correct usage pattern is to switch between the skeleton state and the real content based on an asynchronous loading flag such as `isLoading` from an API call.

Preferred pattern:

- use a pre-built composition whenever the layout matches one of the common loading states
- use the base `SkeletonLoader` directly only when a custom placeholder shape is required

Example:

```tsx
if (isLoading) {
  return <RecipeCardSkeleton />;
}

return <RecipeCard recipe={recipe} />;
```

Custom pattern:

```tsx
return isLoading ? (
  <SkeletonLoader variant="line" width="70%" height={16} />
) : (
  <Text>{title}</Text>
);
```

The rule is to match the skeleton to the real layout as closely as possible so the loading state feels like a preview of the final UI, not a generic waiting indicator.

---

## Technical Decisions

### Why Native Animation Driver Is Required

The native animation driver is mandatory here because skeleton loaders are displayed exactly when the user is already waiting on latency. If the placeholder animation itself stutters, the app feels slower rather than faster. Running the animation on the UI thread through `useNativeDriver: true` keeps the shimmer smooth and reduces JavaScript-thread contention during concurrent network and render work.

### Why Colors Come From Tokens

Skeleton colors come from the shared design tokens instead of hardcoded values so the loading states remain visually consistent with the rest of the design system. This also preserves the single-source-of-truth rule for theming and prevents placeholder styling from drifting away from the app's layered dark surface model.

---

## Pending Items

New skeleton compositions will be added as new screens are created in Phase 1, following the same pattern established by the base component and the three initial compositions.