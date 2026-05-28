# CP1.10 — Complete History Dashboard

This checkpoint implements the dedicated HistoryScreen accessed from TrackScreen, combining three visualization sections for nutrition, hydration, and supplements with summary stat cards and a paginated blend history list powered by `useInfiniteQuery`. The original checkpoint goal was a fully SVG-based dashboard without external chart libraries; in the current implementation, nutrition and hydration use `react-native-svg`, while supplements are rendered as a custom heatmap grid without any charting library dependency.

## Files Created

- [apps/mobile/src/components/history/PeriodSelector.tsx](../../apps/mobile/src/components/history/PeriodSelector.tsx)
- [apps/mobile/src/components/history/StatCard.tsx](../../apps/mobile/src/components/history/StatCard.tsx)
- [apps/mobile/src/components/history/MacroBarChart.tsx](../../apps/mobile/src/components/history/MacroBarChart.tsx)
- [apps/mobile/src/components/history/HydrationBarChart.tsx](../../apps/mobile/src/components/history/HydrationBarChart.tsx)
- [apps/mobile/src/components/history/SupplementHeatmap.tsx](../../apps/mobile/src/components/history/SupplementHeatmap.tsx)
- [apps/mobile/src/components/history/BlendLogItem.tsx](../../apps/mobile/src/components/history/BlendLogItem.tsx)
- [apps/mobile/src/hooks/useHistoryData.ts](../../apps/mobile/src/hooks/useHistoryData.ts)
- [apps/mobile/src/screens/HistoryScreen.tsx](../../apps/mobile/src/screens/HistoryScreen.tsx)
- Updated [apps/mobile/src/navigation/TrackNavigator.tsx](../../apps/mobile/src/navigation/TrackNavigator.tsx) to register the `History` route
- Updated [apps/mobile/src/screens/TrackScreen.tsx](../../apps/mobile/src/screens/TrackScreen.tsx) to add the history access button

## Chart Architecture

This checkpoint keeps the charting layer fully custom instead of adopting a third-party graph library. [apps/mobile/src/components/history/MacroBarChart.tsx](../../apps/mobile/src/components/history/MacroBarChart.tsx) and [apps/mobile/src/components/history/HydrationBarChart.tsx](../../apps/mobile/src/components/history/HydrationBarChart.tsx) use `react-native-svg` primitives such as `Svg`, `G`, `Rect`, and `Line` for bars, hit areas, and target guides, while labels and tooltips are composed with React Native text and views around the SVG canvas. That approach gives direct control over animation timing, tooltip placement, spacing, target-line styling, and placeholder states.

For both SVG bar charts, width is calculated dynamically with `Dimensions.get('window').width - 48`, which corresponds to the horizontal gutters used by the screen layout.

Current implementation note: [apps/mobile/src/components/history/SupplementHeatmap.tsx](../../apps/mobile/src/components/history/SupplementHeatmap.tsx) follows the same no-library philosophy but does not currently use SVG primitives. The supplement view is implemented as a responsive grid of pressable circles plus a bottom sheet drill-down.

## Data Grouping Strategy

[apps/mobile/src/hooks/useHistoryData.ts](../../apps/mobile/src/hooks/useHistoryData.ts) builds an inclusive timezone-aware range for 7, 30, or 90 days, then the visualization layer transforms the returned daily data according to the selected period.

### 7 Days

- Nutrition renders one bar per day.
- Hydration renders one bar per day.
- Supplements render one circle per day.

### 30 Days

- Nutrition keeps one bar per day, but each slot becomes narrower because the same SVG width now holds 30 entries.
- Hydration does the same.
- Day labels are suppressed for most entries; the bar charts only show short date markers on Sundays, which works as a weekly guide without overcrowding the axis.
- Supplements still render daily entries, now with smaller circles.

### 90 Days

- [apps/mobile/src/components/history/MacroBarChart.tsx](../../apps/mobile/src/components/history/MacroBarChart.tsx) chunks the last 90 daily entries into up to 13 week slices and sums weekly protein, carbs, fat, and calories.
- [apps/mobile/src/components/history/HydrationBarChart.tsx](../../apps/mobile/src/components/history/HydrationBarChart.tsx) chunks the same window into weekly slices and plots the average daily `totalMl` for each week.
- The original checkpoint spec called for supplements to use weekly average adherence in the 90-day view as well. The current [apps/mobile/src/components/history/SupplementHeatmap.tsx](../../apps/mobile/src/components/history/SupplementHeatmap.tsx) implementation does not aggregate into weeks; it sorts the returned history, slices the last 90 days, and renders 90 individual circles.

## Infinite Scroll Implementation

[apps/mobile/src/hooks/useHistoryData.ts](../../apps/mobile/src/hooks/useHistoryData.ts) uses `useInfiniteQuery` for blend history with these rules:

- `initialPageParam` starts at `1`
- `queryFn` forwards `pageParam` to `getBlendHistory(from, to, pageParam)`
- `getNextPageParam` returns `lastPage.page + 1` while `lastPage.page < lastPage.totalPages`
- when the last page is reached, `getNextPageParam` returns `undefined`

On the screen side, [apps/mobile/src/screens/HistoryScreen.tsx](../../apps/mobile/src/screens/HistoryScreen.tsx) flattens `blendInfiniteData.pages` into a single list and uses an explicit `Load more` button instead of scroll-triggered pagination. This avoids gesture and virtualization conflicts with the parent `ScrollView`, keeps the pagination point obvious, and prevents nested auto-fetch behavior from fighting the rest of the dashboard layout.

## Lazy Loading Strategy

[apps/mobile/src/screens/HistoryScreen.tsx](../../apps/mobile/src/screens/HistoryScreen.tsx) tracks three booleans:

- `nutritionVisible`
- `hydrationVisible`
- `supplementsVisible`

These flags are toggled from `onScroll` using estimated section offsets:

- nutrition after `y > 0`
- hydration after `y > 450`
- supplements after `y > 850`

The bar-chart components interpret `animate={false}` as “render at the final height immediately,” because their internal effect sets animation progress directly to `1` when the section is still outside the initial viewport. This prevents off-screen charts from spending work on entrance animations before the user reaches them.

Current implementation note: `nutritionVisible` and `hydrationVisible` are actively consumed by [apps/mobile/src/components/history/MacroBarChart.tsx](../../apps/mobile/src/components/history/MacroBarChart.tsx) and [apps/mobile/src/components/history/HydrationBarChart.tsx](../../apps/mobile/src/components/history/HydrationBarChart.tsx). `supplementsVisible` is already tracked by the screen, but [apps/mobile/src/components/history/SupplementHeatmap.tsx](../../apps/mobile/src/components/history/SupplementHeatmap.tsx) does not yet expose an animation prop, so the supplement section is currently static.

## Supplement Heatmap

[apps/mobile/src/components/history/SupplementHeatmap.tsx](../../apps/mobile/src/components/history/SupplementHeatmap.tsx) visualizes supplement adherence as colored circles with a tap-to-open details sheet. The intended semantic palette is:

- no data: `rgba(255,255,255,0.06)`
- below 50%: `rgba(245,158,11,0.45)`
- between 50% and 99%: `rgba(154,72,147,0.50)`
- 100%: `rgba(34,197,94,0.70)`

Circle size changes with the selected period:

- `34px` for 7 days
- `24px` for 30 days
- `16px` for 90 days

Current implementation note: the component compares `adherenceRate` against `0.5` and `1`, which indicates that the visual thresholds were designed for normalized values in the `0..1` range. The backend history endpoint in [apps/api/src/controllers/supplementLog.controller.ts](../../apps/api/src/controllers/supplementLog.controller.ts) currently computes `adherenceRate` as a percentage-like value, so the color semantics above describe the design intent more accurately than the raw runtime comparison does today.

## Pending Items

- Exporting history data as CSV or PDF is deferred to Phase 5.
- Sharing the charts as an image is deferred to Phase 5.