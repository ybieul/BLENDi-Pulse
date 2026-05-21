import type { PulseAiChatInput } from '@blendi/shared';

import type { BlendiModel, UserGoal, UserLocale, UserUnitSystem } from '../models/User';

type PulseAiApiMessageRole = 'user' | 'assistant';

interface PulseAiModelContext {
  displayName: string;
  wattage: number;
  hardwareGuidance: string;
}

export interface PulseAiPromptUserContext {
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  recentBlendRecipeNames?: string[];
}

const UNIT_SYSTEM_CONTEXT: Record<
  UserUnitSystem,
  {
    label: string;
    instruction: string;
    example: string;
  }
> = {
  metric: {
    label: 'Metric',
    instruction:
      'Express ingredient quantities using metric units such as grams, milliliters, and liters.',
    example: 'Use metric units: 90g oats, 240ml almond milk.',
  },
  imperial: {
    label: 'Imperial',
    instruction:
      'Express ingredient quantities using American units such as cups, tablespoons, teaspoons, ounces for solids, and fluid ounces or cups for liquids.',
    example: 'Use imperial units: 1 cup oats, 1 cup almond milk.',
  },
};

export interface BuildPulseAiPromptInput extends PulseAiPromptUserContext {
  message: PulseAiChatInput['message'];
  language?: PulseAiChatInput['language'];
}

export interface PulseAiApiMessage {
  role: PulseAiApiMessageRole;
  content: string;
}

export interface BuildPulseAiPromptResult {
  systemPrompt: string;
  messages: PulseAiApiMessage[];
}

const MODEL_CONTEXT: Record<BlendiModel, PulseAiModelContext> = {
  Lite: {
    displayName: 'BLENDi Lite',
    wattage: 60,
    hardwareGuidance:
      'Use softer fruit, liquids, yogurt, oats, and similar easy-to-blend ingredients. Avoid recommending ice, whole nuts, or dense raw fibrous ingredients unless they are softened first.',
  },
  ProPlus: {
    displayName: 'BLENDi Pro+',
    wattage: 120,
    hardwareGuidance:
      'Can process frozen fruit and tougher fiber with confidence. Moderate-density ingredients are acceptable when liquid balance is adequate.',
  },
  Steel: {
    displayName: 'BLENDi Steel',
    wattage: 180,
    hardwareGuidance:
      'Can crush ice, whole nuts, and denser ingredients. You may recommend more demanding textures while still keeping the recipe practical and repeatable.',
  },
};

const GOAL_CONTEXT: Record<UserGoal, string> = {
  Muscle: 'prioritize muscle gain, strength support, recovery, and higher protein density',
  Wellness: 'prioritize balanced nutrition, satiety, micronutrient density, and daily consistency',
  Energy: 'prioritize steady energy, performance support, and practical pre/post-activity fueling',
  Recovery: 'prioritize recovery, inflammation-aware ingredient choices, and easy digestion',
};

const LANGUAGE_CONTEXT: Record<UserLocale, string> = {
  en: 'English',
  'pt-BR': 'Brazilian Portuguese',
};

function normalizeRecentRecipeNames(recipeNames: string[] | undefined): string[] {
  if (!recipeNames) {
    return [];
  }

  const uniqueNames = new Set<string>();

  for (const recipeName of recipeNames) {
    const normalizedName = recipeName.trim();

    if (!normalizedName) {
      continue;
    }

    uniqueNames.add(normalizedName);

    if (uniqueNames.size === 5) {
      break;
    }
  }

  return [...uniqueNames];
}

function buildRecentRecipesSection(recipeNames: string[]): string {
  if (recipeNames.length === 0) {
    return '';
  }

  return [
    'Avoid repeating these recent recipes:',
    ...recipeNames.map((recipeName, index) => `${index + 1}. ${recipeName}`),
  ].join('\n');
}

function buildSystemPrompt({
  blendiModel,
  goal,
  language,
  locale,
  unitSystem,
  dailyProteinTarget,
  dailyCarbTarget,
  dailyCalorieTarget,
  recentBlendRecipeNames,
}: PulseAiPromptUserContext & {
  language?: PulseAiChatInput['language'];
}): string {
  const modelContext = MODEL_CONTEXT[blendiModel];
  // Priority: explicit request language from the active app session, then the
  // persisted profile locale as a backward-compatible fallback.
  const responseLocale: UserLocale = language ?? locale;
  const responseLanguage = LANGUAGE_CONTEXT[responseLocale];
  const unitSystemContext = UNIT_SYSTEM_CONTEXT[unitSystem];
  const recentRecipesSection = buildRecentRecipesSection(
    normalizeRecentRecipeNames(recentBlendRecipeNames)
  );

  const sections = [
    'You are BLENDi Pulse AI, a nutritionist specialized in sports nutrition and performance with deep knowledge of BLENDi hardware.',
    '',
    'Behavior requirements:',
    `- Always respond in ${responseLanguage}.`,
    '- Always return a valid JSON object and nothing else. Do not include markdown, code fences, explanations, or text before or after the JSON.',
    '- The JSON must follow this exact structure: {"title": string, "ingredients": [{"name": string, "amount": string}], "macros": {"protein": number, "carbs": number, "fat": number, "calories": number}, "prepTimeSeconds": integer, "blendInstruction": string, "tip": string (optional), "hasSubstitutes": boolean}.',
    '- All macro fields must be numeric values, not strings.',
    '- Personalize the blendInstruction for the user hardware and ingredient difficulty.',
    '- Calibrate the recipe macros so the suggestion fits the user daily targets and goal context. Keep the serving practical instead of arbitrarily oversized.',
    '- Prioritize common, accessible, supermarket-friendly ingredients.',
    `- ${unitSystemContext.instruction}`,
    `- ${unitSystemContext.example}`,
    "- If the user says they are missing an ingredient using phrases like 'sem', 'without', 'don't have', 'nao tenho', 'não tenho', or equivalent, you must include substitution suggestions inside the optional tip field and set hasSubstitutes to true.",
    '- If no substitutions are needed, set hasSubstitutes to false and omit the tip field unless it adds useful nutritional value.',
    '',
    'User context:',
    `- BLENDi model: ${modelContext.displayName} (${modelContext.wattage}W).`,
    `- Hardware guidance: ${modelContext.hardwareGuidance}`,
    `- Goal: ${goal} (${GOAL_CONTEXT[goal]}).`,
    `- Unit system: ${unitSystemContext.label}.`,
    `- Daily protein target: ${dailyProteinTarget} g.`,
    `- Daily carbs target: ${dailyCarbTarget} g.`,
    `- Daily calories target: ${dailyCalorieTarget} kcal.`,
    `- Expected response language: ${responseLanguage}.`,
  ];

  if (recentRecipesSection) {
    sections.push('', recentRecipesSection);
  }

  return sections.join('\n');
}

export function buildPulseAiPrompt({
  message,
  ...userContext
}: BuildPulseAiPromptInput): BuildPulseAiPromptResult {
  return {
    systemPrompt: buildSystemPrompt(userContext),
    messages: [
      {
        role: 'user',
        content: message.trim(),
      },
    ],
  };
}