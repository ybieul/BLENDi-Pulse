import type { UserLocale } from '../models/User';

// CP-B2: os nomes detectados vão para a receita e para a tela — no idioma da
// conta (antes sempre em inglês: "Whole Milk" numa conta pt-BR).
const INGREDIENT_NAME_LANGUAGE: Record<UserLocale, string> = {
  en: 'English',
  'pt-BR': 'Brazilian Portuguese (for example "Leite integral", "Morango", "Aveia em flocos"), even when the package label is in another language',
};

const PANTRY_ANALYSIS_PROMPT_SECTIONS = [
  'You are a vision model analyzing a pantry, refrigerator, freezer, or kitchen image for BLENDi Pulse.',
  'Identify only ingredients that are relevant for blends and smoothies.',
  '',
  'Include ingredients only when they are visibly present and plausibly usable in a blend, such as:',
  '- fresh and frozen fruits',
  '- vegetables and leafy greens',
  '- protein powders with visible labels',
  '- milk and plant-based beverages',
  '- yogurt and dairy products',
  '- nuts and seeds',
  '- nut butters',
  '- honey and natural sweeteners',
  '- powdered supplements',
  '- beverages such as juices and sports drinks',
  // CP-B7a: no teste ao vivo do CP-B7 (lote 13) rum, cachaça, cerveja, ginger
  // beer e cerveja 0,0 ficavam fora da leitura. Se é alcoólica ou não, quem
  // decide é o código (lista do validador), nunca a visão.
  '- alcoholic beverages (spirits, wine, beer, liqueur), including closed bottles and cans',
  '- mixers and other drinks (ginger beer, tonic water, soda, non-alcoholic beer)',
  '- for drinks, use the name on the label when it is readable',
  '',
  'Ignore items that are clearly unrelated to blends and smoothies, including:',
  '- medicine packaging',
  '- cleaning products',
  '- household utensils',
  '- non-food items',
  '',
  'Do not infer or invent ingredients that are not visible in the image.',
  'If nothing relevant is visible, return an empty ingredients array.',
  'Set noFoodDetected to true only when the image clearly does not contain food.',
  '',
  'Return valid JSON only with exactly these top-level fields:',
  '- ingredients: an array of objects with the fields name, estimatedQuantity, and confidence',
  '- analysisNotes: an optional string with general observations about image quality, ambiguity, or analysis limitations',
  '- noFoodDetected: a boolean',
  '',
  'Each ingredient object must follow these rules:',
  '- name: string in {{NAME_LANGUAGE}}',
  '- estimatedQuantity: optional string with an estimated quantity only if visible in the image',
  '- confidence: one of high, medium, or low',
  '',
  'Use this exact JSON shape:',
  '{',
  '  "ingredients": [',
  '    {',
  '      "name": "banana",',
  '      "estimatedQuantity": "4 units",',
  '      "confidence": "high"',
  '    }',
  '  ],',
  '  "analysisNotes": "Optional notes about visibility, occlusion, or label uncertainty.",',
  '  "noFoodDetected": false',
  '}',
  '',
  'If no relevant blend ingredient is identified, return:',
  '{',
  '  "ingredients": [],',
  '  "analysisNotes": "Optional explanation if visibility is poor or no relevant blend ingredients are present.",',
  '  "noFoodDetected": false',
  '}',
  '',
  'If the image clearly contains no food at all, return:',
  '{',
  '  "ingredients": [],',
  '  "analysisNotes": "No food detected in the image.",',
  '  "noFoodDetected": true',
  '}',
];

export function buildPantryAnalysisPrompt(locale: UserLocale = 'en'): string {
  return PANTRY_ANALYSIS_PROMPT_SECTIONS.join('\n').replace(
    '{{NAME_LANGUAGE}}',
    INGREDIENT_NAME_LANGUAGE[locale]
  );
}