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

/**
 * CP-B7a: itens pedidos (adicionados à mão no Pantry) que a receita não
 * conseguiu incluir — no máximo um por item adicionado.
 */
export const RECIPE_MISSING_REQUEST_MAX_ITEMS = 10;

// ─── CP-B7: valores pedidos (proteína, carboidrato, gordura, calorias) ──────

/** Nutrientes que a pessoa pode pedir com valor ("30 g de proteína", "400 kcal"). */
export const recipeTargetNutrientValues = ['protein', 'carbs', 'fat', 'calories'] as const;
export type RecipeTargetNutrient = (typeof recipeTargetNutrientValues)[number];

/**
 * Tipo do pedido: exato ("30 g"), mínimo ("pelo menos 30 g"), máximo ("até
 * 300 kcal") ou faixa ("entre 20 e 30 g").
 */
export const recipeTargetKindValues = ['exact', 'min', 'max', 'range'] as const;
export type RecipeTargetKind = (typeof recipeTargetKindValues)[number];

/**
 * Sugestão simples do Pantry Scanner quando o valor pedido não foi atingido
 * por falta de ingrediente ("Adicionar whey ou proteína em pó ajudaria").
 * Escolhida pelo backend respeitando a dieta; o app só traduz.
 */
export const recipeTargetSuggestionValues = [
  'whey_or_protein_powder',
  'plant_protein_powder',
  'oats_or_banana',
  'peanut_butter',
  'avocado_or_chia',
  'oats_or_peanut_butter',
] as const;
export type RecipeTargetSuggestion = (typeof recipeTargetSuggestionValues)[number];

/** No máximo um aviso por nutriente. */
export const RECIPE_UNMET_TARGETS_MAX_ITEMS = recipeTargetNutrientValues.length;

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
