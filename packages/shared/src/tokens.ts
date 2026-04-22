// =============================================================================
// BLENDi Pulse — Design Tokens
// Fonte única da verdade para cores, fontes, espaçamentos, raios e sombras.
// NENHUM outro arquivo do projeto pode declarar valores de cor, fonte ou
// espaçamento diretamente. Tudo deve ser importado daqui.
// =============================================================================

// ─── Cores ───────────────────────────────────────────────────────────────────

export const colors = {
  /**
   * Cores da marca BLENDi Pulse.
   * O app usa Deep Plum (#2b1429) como fundo principal — todo o
   * sistema de texto e superfícies foi calibrado para este contexto.
   */
  brand: {
    pulse: '#9a4893',   // Roxo vibrante — CTA, acentos, Goal Rings
    plum: '#2b1429',    // Deep Plum — fundo primário do app
    light: '#f4e9f3',   // Lilac Mist — backgrounds claros, chips, badges
  },

  /** Cores semânticas de feedback ao usuário. */
  feedback: {
    success: '#22c55e', // Verde — metas atingidas, confirmações
    warning: '#f59e0b', // Âmbar — alertas, atenção
    error: '#ef4444',   // Vermelho — erros, falhas de validação
    info: '#3b82f6',    // Azul — dicas, tooltips informativos
  },

  /**
   * Escala de neutros seguindo convenção Tailwind (50–900).
   * Use para borders, dividers, placeholders e backgrounds secundários.
   */
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },

  /**
   * Cores de texto otimizadas para o fundo Deep Plum (#2b1429).
   * primary → titulos e labels principais
   * secondary → corpo de texto, descrições
   * tertiary → metadados, timestamps, labels desabilitados
   */
  text: {
    primary: '#ffffff',   // Branco puro — headings, valores em destaque
    secondary: '#e2d5e1', // Lavender Mist — corpo de texto
    tertiary: '#a888a5',  // Muted Plum — metadados, placeholders
  },

  /**
   * Níveis de superfície do app (fundo escuro layered).
   * primary → tela de fundo (Deep Plum)
   * secondary → cards e painéis elevados
   * tertiary → inputs, modais e sheets
   */
  background: {
    primary: '#2b1429',   // Deep Plum — fundo base
    secondary: '#3d1f3b', // Plum Mid — cards, listas
    tertiary: '#4f2a4d',  // Plum Light — inputs, bottom sheets
  },
} as const;

// ─── Fontes ──────────────────────────────────────────────────────────────────

export const fonts = {
  display: 'Syne',   // Pesos: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold)
  body: 'DM Sans',   // Pesos: 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold)
  mono: 'DM Mono',   // Pesos: 300 (Light), 400 (Regular), 500 (Medium) — macros, timers, dados numéricos
} as const;

export const fontSizes = {
  xs: 11,   // Labels minúsculos, badges de unidade
  sm: 13,   // Captions, metadados, timestamps
  md: 15,   // Corpo de texto padrão
  lg: 17,   // Subtítulos, botões, itens de lista
  xl: 20,   // Títulos de seção, títulos de card
  '2xl': 24, // Títulos de tela
  '3xl': 32, // Display — valores de macro grandes, hero
  '4xl': 40, // Super display — onboarding, splash
} as const;

export const fontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const lineHeights = {
  tight: 1.2,   // Títulos e displays
  snug: 1.35,   // Subtítulos
  normal: 1.5,  // Corpo de texto
  relaxed: 1.7, // Texto longo, descrições de receita
} as const;

// ─── Espaçamentos ────────────────────────────────────────────────────────────
// Base: 1 unidade = 4pt. Escala em múltiplos de 4.

export const spacing = {
  px: 1,    // 1pt  — borders pontilhadas, separadores finos
  xs: 2,    // 2pt  — micro ajustes internos
  sm: 4,    // 4pt  — padding interno de badges e chips
  md: 8,    // 8pt  — gaps entre elementos inline
  lg: 12,   // 12pt — padding de botões pequenos
  xl: 16,   // 16pt — padding padrão de cards e telas
  '2xl': 20, // 20pt — gap entre seções compactas
  '3xl': 24, // 24pt — padding de seções
  '4xl': 32, // 32pt — gap entre blocos maiores
  '5xl': 40, // 40pt — margens de telas grandes
  '6xl': 48, // 48pt — espaçamento de hero/onboarding
  '7xl': 64, // 64pt — espaçamento máximo de layout
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const borderRadius = {
  sm: 6,      // Tags, badges, chips
  md: 12,     // Botões, inputs, selects
  lg: 20,     // Cards, painéis, bottom sheets
  full: 9999, // Pills, avatares, Goal Rings
} as const;

// ─── Sombras ─────────────────────────────────────────────────────────────────
// Compatível com React Native (iOS: shadow* props | Android: elevation).

export const shadows = {
  /** Sombra sutil para cards em repouso */
  low: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Sombra média para modais e bottom sheets */
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 6,
  },
  /** Sombra forte para overlays e menus flutuantes */
  high: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// ─── Objeto unificado ─────────────────────────────────────────────────────────
// Use quando for mais conveniente importar tudo de uma vez:
// import { tokens } from '@blendi/shared';

export const tokens = {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  spacing,
  borderRadius,
  shadows,
} as const;

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type Colors = typeof colors;
export type Fonts = typeof fonts;
export type FontSizes = typeof fontSizes;
export type FontWeights = typeof fontWeights;
export type LineHeights = typeof lineHeights;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Tokens = typeof tokens;
