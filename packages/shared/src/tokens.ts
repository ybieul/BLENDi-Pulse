// ─── Design Tokens BLENDi Pulse ──────────────────────────────────────────────

export const colors = {
  primary: '#9a4893',
  primaryDark: '#2b1429',
  white: '#ffffff',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray800: '#1f2937',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

export const typography = {
  fontDisplay: 'Syne',
  fontBody: 'DM Sans',
  fontMono: 'DM Mono',
  sizeXs: 12,
  sizeSm: 14,
  sizeMd: 16,
  sizeLg: 18,
  sizeXl: 24,
  size2xl: 32,
  size3xl: 40,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export type Colors = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
