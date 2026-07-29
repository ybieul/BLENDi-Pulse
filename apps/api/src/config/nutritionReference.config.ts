// apps/api/src/config/nutritionReference.config.ts
// Fonte única de verdade para os valores nutricionais de referência injetados
// no system prompt do Pulse AI. Nunca duplicar esses valores inline no
// promptBuilder — sempre importar esta constante.
//
// Valores por 100g/100ml, aproximados a partir de referências nutricionais
// públicas (USDA-like). Servem como base para o modelo calcular macros a
// partir das quantidades reais de cada ingrediente, em vez de estimar.

export interface NutritionReferenceEntry {
  name: string;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  caloriesPer100g: number;
}

export const NUTRITION_REFERENCE_TABLE: readonly NutritionReferenceEntry[] = [
  { name: 'Whey protein isolate', proteinPer100g: 85, carbsPer100g: 4, fatPer100g: 1, caloriesPer100g: 370 },
  { name: 'Whey protein concentrate', proteinPer100g: 75, carbsPer100g: 8, fatPer100g: 5, caloriesPer100g: 380 },
  { name: 'Plant protein powder', proteinPer100g: 70, carbsPer100g: 9, fatPer100g: 6, caloriesPer100g: 375 },
  { name: 'Whole milk', proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 3.6, caloriesPer100g: 61 },
  { name: 'Skim milk', proteinPer100g: 3.4, carbsPer100g: 5, fatPer100g: 0.2, caloriesPer100g: 34 },
  { name: 'Unsweetened almond milk', proteinPer100g: 0.5, carbsPer100g: 0.3, fatPer100g: 1.2, caloriesPer100g: 13 },
  { name: 'Oat milk', proteinPer100g: 1, carbsPer100g: 6.5, fatPer100g: 1.5, caloriesPer100g: 45 },
  { name: 'Full-fat Greek yogurt', proteinPer100g: 9, carbsPer100g: 4, fatPer100g: 5, caloriesPer100g: 97 },
  { name: 'Nonfat Greek yogurt', proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, caloriesPer100g: 59 },
  { name: 'Ripe banana', proteinPer100g: 1.1, carbsPer100g: 23, fatPer100g: 0.3, caloriesPer100g: 89 },
  { name: 'Strawberry', proteinPer100g: 0.7, carbsPer100g: 7.7, fatPer100g: 0.3, caloriesPer100g: 32 },
  { name: 'Blueberry', proteinPer100g: 0.7, carbsPer100g: 14.5, fatPer100g: 0.3, caloriesPer100g: 57 },
  { name: 'Mango', proteinPer100g: 0.8, carbsPer100g: 15, fatPer100g: 0.4, caloriesPer100g: 60 },
  { name: 'Avocado', proteinPer100g: 2, carbsPer100g: 8.5, fatPer100g: 15, caloriesPer100g: 160 },
  { name: 'Raw spinach', proteinPer100g: 2.9, carbsPer100g: 3.6, fatPer100g: 0.4, caloriesPer100g: 23 },
  { name: 'Rolled oats', proteinPer100g: 13.5, carbsPer100g: 68, fatPer100g: 6.5, caloriesPer100g: 379 },
  { name: 'Peanut butter', proteinPer100g: 25, carbsPer100g: 20, fatPer100g: 50, caloriesPer100g: 588 },
  { name: 'Almonds', proteinPer100g: 21, carbsPer100g: 22, fatPer100g: 50, caloriesPer100g: 579 },
  { name: 'Honey', proteinPer100g: 0.3, carbsPer100g: 82, fatPer100g: 0, caloriesPer100g: 304 },
  { name: 'Egg white protein powder', proteinPer100g: 82, carbsPer100g: 4, fatPer100g: 1, caloriesPer100g: 355 },
] as const;
