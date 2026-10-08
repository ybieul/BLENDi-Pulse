// =============================================================================
// BLENDi Pulse — Design Tokens
// Fonte única da verdade para cores, fontes, espaçamentos, raios e sombras.
// NENHUM outro arquivo do projeto pode declarar valores de cor, fonte ou
// espaçamento diretamente. Tudo deve ser importado daqui.
// =============================================================================

// ─── Cores ───────────────────────────────────────────────────────────────────

/**
 * Cores da marca BLENDi Pulse.
 * O app usa fundo manila (#f5ede4) como base — texto e superfícies foram
 * calibrados para este contexto.
 */
const brand = {
  pulse: '#9a4893',   // Roxo vibrante — CTA, acentos, Goal Rings
  plum: '#2b1429',    // Deep Plum — texto principal, ícone/splash/share cards (mantidos escuros)
  light: '#f4e9f3',   // Lilac Mist — backgrounds claros, chips, badges
} as const;

/** Cores semânticas de feedback ao usuário. */
const feedback = {
  success: '#22c55e', // Verde — metas atingidas, confirmações
  warning: '#f59e0b', // Âmbar — alertas, atenção
  error: '#ef4444',   // Vermelho — erros, falhas de validação
  info: '#3b82f6',    // Azul — dicas, tooltips informativos
} as const;

/**
 * Escala de neutros seguindo convenção Tailwind (50–900).
 * Use para borders, dividers, placeholders e backgrounds secundários.
 */
const neutral = {
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
} as const;

/**
 * Cores de texto otimizadas para o fundo manila (#f5ede4).
 * primary → titulos e labels principais
 * secondary → corpo de texto, descrições
 * tertiary → metadados, timestamps, labels desabilitados
 */
const text = {
  primary: '#2b1429',   // Deep Plum — headings, valores em destaque
  secondary: '#6b4a67', // Plum suave — corpo de texto
  tertiary: '#9a4893',  // Pulse Purple — metadados, placeholders
  inverse: '#ffffff',   // Texto/ícone sobre superfícies escuras ou coloridas sólidas (botão roxo, toast, badges) — oposto de primary
} as const;

/**
 * Níveis de superfície do app (fundo manila layered).
 * primary → tela de fundo (Manila)
 * secondary → cards e painéis elevados
 * tertiary → inputs, modais e sheets
 */
const background = {
  primary: '#f5ede4',   // Manila — fundo base
  secondary: '#efe4d8', // Manila Mid — cards, listas
  tertiary: '#e8dbc9',  // Manila Deep — inputs, bottom sheets
} as const;

/**
 * Overlays translúcidos — fundo/borda de cards, inputs, badges, pills e
 * backdrops. Cada família é uma cor base em várias opacidades; a chave é a
 * opacidade em porcentagem inteira (6 = 6%, 55 = 55%...).
 * NENHUM componente deve escrever rgba(...)/hex solto — sempre usar uma
 * chave daqui. Se faltar um nível, adicione a chave aqui, nunca como
 * literal solto no componente.
 */
const overlay = {
  /** Base Deep Plum (texto escuro) — overlay sobre o fundo claro. */
  plum: {
    3: 'rgba(43,20,41,0.03)',
    4: 'rgba(43,20,41,0.04)',
    5: 'rgba(43,20,41,0.05)',
    6: 'rgba(43,20,41,0.06)',
    7: 'rgba(43,20,41,0.07)',
    8: 'rgba(43,20,41,0.08)',
    10: 'rgba(43,20,41,0.1)',
    12: 'rgba(43,20,41,0.12)',
    14: 'rgba(43,20,41,0.14)',
    15: 'rgba(43,20,41,0.15)',
    16: 'rgba(43,20,41,0.16)',
    18: 'rgba(43,20,41,0.18)',
    20: 'rgba(43,20,41,0.2)',
    22: 'rgba(43,20,41,0.22)',
    24: 'rgba(43,20,41,0.24)',
    25: 'rgba(43,20,41,0.25)',
    26: 'rgba(43,20,41,0.26)',
    28: 'rgba(43,20,41,0.28)',
    30: 'rgba(43,20,41,0.3)',
    35: 'rgba(43,20,41,0.35)',
    40: 'rgba(43,20,41,0.4)',
    45: 'rgba(43,20,41,0.45)',
    50: 'rgba(43,20,41,0.5)',
    55: 'rgba(43,20,41,0.55)',
    60: 'rgba(43,20,41,0.6)',
    65: 'rgba(43,20,41,0.65)',
    70: 'rgba(43,20,41,0.7)',
    72: 'rgba(43,20,41,0.72)',
    80: 'rgba(43,20,41,0.8)',
    82: 'rgba(43,20,41,0.82)',
    90: 'rgba(43,20,41,0.9)',
    92: 'rgba(43,20,41,0.92)',
    95: 'rgba(43,20,41,0.95)',
  },
  /** Base branco — legítimo sobre superfícies que continuam escuras (barras de câmera, cards de compartilhamento, celebração de nível). */
  white: {
    4: 'rgba(255,255,255,0.04)',
    5: 'rgba(255,255,255,0.05)',
    6: 'rgba(255,255,255,0.06)',
    7: 'rgba(255,255,255,0.07)',
    8: 'rgba(255,255,255,0.08)',
    10: 'rgba(255,255,255,0.1)',
    12: 'rgba(255,255,255,0.12)',
    14: 'rgba(255,255,255,0.14)',
    15: 'rgba(255,255,255,0.15)',
    16: 'rgba(255,255,255,0.16)',
    20: 'rgba(255,255,255,0.2)',
    22: 'rgba(255,255,255,0.22)',
    25: 'rgba(255,255,255,0.25)',
    26: 'rgba(255,255,255,0.26)',
    35: 'rgba(255,255,255,0.35)',
    40: 'rgba(255,255,255,0.4)',
    50: 'rgba(255,255,255,0.5)',
    55: 'rgba(255,255,255,0.55)',
    60: 'rgba(255,255,255,0.6)',
    70: 'rgba(255,255,255,0.7)',
    72: 'rgba(255,255,255,0.72)',
    78: 'rgba(255,255,255,0.78)',
  },
  /** Base Pulse Purple — badges, chips, bordas de destaque roxas. */
  pulse: {
    10: 'rgba(154,72,147,0.1)',
    12: 'rgba(154,72,147,0.12)',
    15: 'rgba(154,72,147,0.15)',
    18: 'rgba(154,72,147,0.18)',
    20: 'rgba(154,72,147,0.2)',
    22: 'rgba(154,72,147,0.22)',
    25: 'rgba(154,72,147,0.25)',
    30: 'rgba(154,72,147,0.3)',
    35: 'rgba(154,72,147,0.35)',
    40: 'rgba(154,72,147,0.4)',
    42: 'rgba(154,72,147,0.42)',
    50: 'rgba(154,72,147,0.5)',
    55: 'rgba(154,72,147,0.55)',
    65: 'rgba(154,72,147,0.65)',
    75: 'rgba(154,72,147,0.75)',
    92: 'rgba(154,72,147,0.92)',
  },
  /** Base feedback.warning (âmbar) — alertas e acentos de aviso translúcidos. */
  warning: {
    8: 'rgba(245,158,11,0.08)',
    10: 'rgba(245,158,11,0.1)',
    12: 'rgba(245,158,11,0.12)',
    14: 'rgba(245,158,11,0.14)',
    15: 'rgba(245,158,11,0.15)',
    16: 'rgba(245,158,11,0.16)',
    18: 'rgba(245,158,11,0.18)',
    25: 'rgba(245,158,11,0.25)',
    34: 'rgba(245,158,11,0.34)',
    42: 'rgba(245,158,11,0.42)',
    45: 'rgba(245,158,11,0.45)',
    60: 'rgba(245,158,11,0.6)',
    70: 'rgba(245,158,11,0.7)',
    85: 'rgba(245,158,11,0.85)',
    90: 'rgba(245,158,11,0.9)',
    95: 'rgba(245,158,11,0.95)',
  },
  /** Base feedback.success (verde) — confirmações e acentos de sucesso translúcidos. */
  success: {
    10: 'rgba(34,197,94,0.1)',
    25: 'rgba(34,197,94,0.25)',
    30: 'rgba(34,197,94,0.3)',
    70: 'rgba(34,197,94,0.7)',
    75: 'rgba(34,197,94,0.75)',
    80: 'rgba(34,197,94,0.8)',
    90: 'rgba(34,197,94,0.9)',
    92: 'rgba(34,197,94,0.92)',
    95: 'rgba(34,197,94,0.95)',
  },
  /** Base feedback.error (vermelho) — erros e acentos de erro translúcidos. */
  error: {
    6: 'rgba(239,68,68,0.06)',
    12: 'rgba(239,68,68,0.12)',
    18: 'rgba(239,68,68,0.18)',
    20: 'rgba(239,68,68,0.2)',
    25: 'rgba(239,68,68,0.25)',
    40: 'rgba(239,68,68,0.4)',
    65: 'rgba(239,68,68,0.65)',
    70: 'rgba(239,68,68,0.7)',
    95: 'rgba(239,68,68,0.95)',
  },
  /** Base feedback.info / hidratação (azul) — acentos informativos translúcidos. */
  info: {
    8: 'rgba(59,130,246,0.08)',
    15: 'rgba(59,130,246,0.15)',
    60: 'rgba(59,130,246,0.6)',
    70: 'rgba(59,130,246,0.7)',
    80: 'rgba(59,130,246,0.8)',
  },
  /** Preto — backdrops de modal, escurecimento de imagem/câmera, sombra sólida (100). */
  black: {
    30: 'rgba(0,0,0,0.3)',
    32: 'rgba(0,0,0,0.32)',
    45: 'rgba(0,0,0,0.45)',
    55: 'rgba(0,0,0,0.55)',
    82: 'rgba(0,0,0,0.82)',
    100: 'rgba(0,0,0,1)',
  },
  /** Cinza neutro — macro "gordura", badge BLENDi Lite. */
  neutralGray: {
    25: 'rgba(107,114,128,0.25)',
    35: 'rgba(107,114,128,0.35)',
    90: 'rgba(107,114,128,0.9)',
  },
  /** Rosa decorativo — brilho de hero nos cards de conquista/upgrade. */
  pink: {
    10: 'rgba(236,72,153,0.1)',
    12: 'rgba(236,72,153,0.12)',
    14: 'rgba(236,72,153,0.14)',
  },
} as const;

/** Brilho de borda por tier de conquista (bronze/prata/ouro) nos cards de badge. */
const badgeTier = {
  bronzeGlow: 'rgba(205,127,50,0.40)',
  bronzeIcon: 'rgba(205,127,50,0.90)',
  silverGlow: 'rgba(192,192,192,0.40)',
  silverIcon: 'rgba(192,192,192,0.90)',
  goldGlow: 'rgba(255,215,0,0.40)',
  goldIcon: 'rgba(255,215,0,0.90)',
} as const;

/**
 * Paleta "premium" (tela de upgrade, paywall do relatório semanal) — é uma
 * identidade visual separada do tema principal do app, não acompanha a
 * troca de tema claro/escuro.
 */
const premium = {
  amber: '#F59E0B',       // mesmo valor de feedback.warning; mantido à parte por ser identidade premium, não semântica de alerta
  amberDeep: '#F97316',
  amberPale: '#FDE68A',
  gold: '#FACC15',
  goldPale: '#FFE7A6',
  textOnGold: '#2D1600',
} as const;

/** Estrela de avaliação (RatingBottomSheet, BlendLogItem). */
const rating = {
  starFilled: '#facc15',
} as const;

/** Cores de marca de terceiros — fixas por exigência externa, não acompanham o tema do app. */
const thirdParty = {
  google: '#4285F4', // azul oficial do botão "Entrar com Google"
} as const;

/**
 * Acentos decorativos de uso único — efeitos visuais específicos de um
 * componente (aurora, confete de level-up, balão de erro do chat, toast).
 */
const decorative = {
  toastBorder: 'rgba(255,107,107,0.22)',   // ToastViewport (iOS) — mesmo estilo pra todo toast, não só erro
  toastBackground: 'rgba(60,24,24,0.94)',
  shareSheetBackground: 'rgba(21,10,20,0.98)', // ShareFormatSheet — sempre escuro, como os share cards
  auroraGlow2: 'rgba(120,40,120,0.12)',        // AuroraBackground — 2ª luz do efeito aurora
  auroraGlow3: 'rgba(80,20,90,0.15)',          // AuroraBackground — 3ª luz do efeito aurora
  auroraDeep: '#1a0d1a',                        // AuroraBackground — stop do meio do gradiente escuro fixo (share cards)
  errorBubbleBackground: 'rgba(220,60,60,0.12)',
  errorBubbleBorder: 'rgba(220,80,80,0.28)',
  errorBubbleIcon: 'rgba(255,100,100,0.9)',
  levelUpCardBorder: 'rgba(211,120,203,1)',
  heatmapMissed: 'rgba(248,113,113,0.88)', // SupplementHeatmap — dia de suplemento perdido
} as const;

export const colors = {
  brand,
  feedback,
  neutral,
  text,
  background,
  overlay,
  badgeTier,
  premium,
  rating,
  thirdParty,
  decorative,
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
  lg: 14,     // Cards, painéis, bottom sheets — alinhado com auth components
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
