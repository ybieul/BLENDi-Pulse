// packages/shared/src/recipeContent.ts
// CP-B2 — constantes únicas do conteúdo das receitas da IA (Pulse AI e
// Pantry Scanner): porção mínima, tamanho do aviso de capacidade e as
// palavras de tamanho proibidas no título. Usadas pelo prompt
// (apps/api/src/services/promptBuilder.service.ts), pelo schema da receita
// (schemas/pulseAi.ts) e pelos testes.

/**
 * Porção padrão quando a pessoa não pede tamanho nem valor: pelo menos isto
 * de volume e de calorias. Pedido de algo leve vale o pedido.
 */
export const RECIPE_MIN_SERVING_ML = 250;
export const RECIPE_MIN_SERVING_KCAL = 180;

/**
 * Tamanho máximo do `capacityNotice` (frase curta dizendo o que a pessoa
 * pediu, o que coube no copo e por quê).
 */
export const RECIPE_CAPACITY_NOTICE_MAX_LENGTH = 240;

/**
 * Palavras que descrevem tamanho/restrição e não podem aparecer no título
 * (no lote 1 da auditoria, 7 títulos traziam "Compact"/"Compacto").
 * Minúsculas e sem acento; comparadas como palavra inteira.
 */
export const RECIPE_TITLE_SIZE_WORDS = [
  // en
  'compact',
  'mini',
  'small',
  'tiny',
  'little',
  'reduced',
  'downsized',
  'petite',
  // pt-BR
  'compacto',
  'compacta',
  'pequeno',
  'pequena',
  'pequenino',
  'pequenina',
  'reduzido',
  'reduzida',
] as const;

// ─── CP-B5: pedido explícito, dieta furada e álcool ─────────────────────────

/** Calorias por grama de álcool puro (etanol), somadas à conferência de macros. */
export const ALCOHOL_KCAL_PER_GRAM = 7;

/**
 * Teto de álcool puro numa receita (g): duas doses-padrão americanas (14 g
 * cada), o equivalente a duas doses de destilado num drink. Acima disso a
 * receita é refeita (diretriz 1.4.3 da App Store: nada de incentivar consumo
 * excessivo).
 */
export const RECIPE_MAX_ALCOHOL_GRAMS = 28;

/** Idade mínima para receber receita com álcool (EUA). */
export const ALCOHOL_MIN_AGE_YEARS = 21;

/** Máximo de ingredientes listados no aviso de "fora da sua dieta". */
export const RECIPE_DIET_OVERRIDE_MAX_ITEMS = 5;
