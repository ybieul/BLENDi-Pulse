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
