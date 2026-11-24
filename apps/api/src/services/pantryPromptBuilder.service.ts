import type { UserLocale } from '../models/User';

// CP-B2: os nomes detectados vão para a receita e para a tela — no idioma da
// conta (antes sempre em inglês: "Whole Milk" numa conta pt-BR).
const INGREDIENT_NAME_LANGUAGE: Record<UserLocale, string> = {
  en: 'English',
  'pt-BR': 'Brazilian Portuguese (for example "Leite integral", "Morango", "Aveia em flocos"), even when the package label is in another language',
};

// CP-B7: a leitura lista TODO alimento e bebida visível (antes só o que
// servia para blend: queijo, ovo, picles e comida pronta sumiam sem a pessoa
// saber). Cada item diz se serve para shake/smoothie (blendSuitable); o que
// não serve vai para "Outros itens na foto", desmarcado. Se é alcoólico,
// quem decide é o código (lista do validador), nunca a visão.
const PANTRY_ANALYSIS_PROMPT_SECTIONS = [
  'You are a vision model analyzing a pantry, refrigerator, freezer, or kitchen image for BLENDi Pulse.',
  'List every food and every drink that is visible in the image, and say for each one whether it is suitable for blends and smoothies.',
  '',
  'Include every visible food and drink, for example:',
  '- fresh and frozen fruits',
  '- vegetables and leafy greens',
  '- protein powders with visible labels',
  '- milk and plant-based beverages',
  '- yogurt and dairy products, including cheese and butter',
  '- eggs',
  '- nuts and seeds',
  '- nut butters',
  '- honey and natural sweeteners',
  '- powdered supplements',
  '- beverages such as juices and sports drinks',
  // CP-B7a: no teste ao vivo do CP-B7 (lote 13) rum, cachaça, cerveja, ginger
  // beer e cerveja 0,0 ficavam fora da leitura.
  '- alcoholic beverages (spirits, wine, beer, liqueur), including closed bottles and cans',
  '- mixers and other drinks (ginger beer, tonic water, soda, non-alcoholic beer)',
  '- raw meat and fish, cold cuts, prepared meals and leftovers',
  '- condiments, sauces, pickles and savory seasonings',
  '- for drinks, use the name on the label when it is readable',
  '',
  'blendSuitable is true when the item can go into a blend or smoothie (fruits, vegetables and greens, milk and plant beverages, yogurt, kefir, protein powders, oats, nuts, seeds, nut butters, honey and sweeteners, cocoa, coffee, juices, and drinks, including alcoholic ones).',
  'blendSuitable is false when the item clearly does not belong in a blend or smoothie, for example raw meat or raw fish, cold cuts, prepared meals and leftovers, condiments and sauces (ketchup, mustard, mayonnaise, soy sauce), pickles, and savory seasonings.',
  '',
  'Ignore items that are not food or drink, including:',
  '- medicine packaging',
  '- cleaning products',
  '- household utensils',
  '- non-food items',
  '',
  'Do not infer or invent ingredients that are not visible in the image.',
  'If no food or drink is visible, return an empty ingredients array.',
  'Set noFoodDetected to true only when the image clearly does not contain food.',
  '',
  'Return valid JSON only with exactly these top-level fields:',
  '- ingredients: an array of objects with the fields name, estimatedQuantity, confidence, and blendSuitable',
  '- analysisNotes: an optional string with general observations about image quality, ambiguity, or analysis limitations',
  '- noFoodDetected: a boolean',
  '',
  'Each ingredient object must follow these rules:',
  '- name: string in {{NAME_LANGUAGE}}',
  '- estimatedQuantity: optional string with an estimated quantity only if visible in the image',
  '- confidence: one of high, medium, or low',
  '- blendSuitable: a boolean, as described above',
  '',
  'Use this exact JSON shape:',
  '{',
  '  "ingredients": [',
  '    {',
  '      "name": "banana",',
  '      "estimatedQuantity": "4 units",',
  '      "confidence": "high",',
  '      "blendSuitable": true',
  '    },',
  '    {',
  '      "name": "ketchup",',
  '      "confidence": "high",',
  '      "blendSuitable": false',
  '    }',
  '  ],',
  '  "analysisNotes": "Optional notes about visibility, occlusion, or label uncertainty.",',
  '  "noFoodDetected": false',
  '}',
  '',
  'If no food or drink is identified, return:',
  '{',
  '  "ingredients": [],',
  '  "analysisNotes": "Optional explanation if visibility is poor or no food or drink is visible.",',
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