// apps/mobile/src/utils/nutritionGoals.utils.ts
// Regras puras da tela "Minhas metas" (NutritionGoalsScreen): limites de
// validação, leitura do que a pessoa digitou, montagem do PATCH só com o que
// mudou e tradução dos avisos de meta devolvidos pelo backend.
//
// Nada aqui calcula meta nem decide o que é "alto" ou "baixo": os limites de
// validação vêm de @blendi/shared e as regras dos avisos são do backend
// (evaluateManualMacroEditWarnings, apps/api/src/utils/macroCalculation.utils.ts)
// — o app só lê o `code` de cada aviso e mostra o texto correspondente.

import {
  DAILY_CALORIE_TARGET_MAX,
  DAILY_CALORIE_TARGET_MIN,
  DAILY_CARB_TARGET_MAX,
  DAILY_CARB_TARGET_MIN,
  DAILY_HYDRATION_TARGET_MAX,
  DAILY_HYDRATION_TARGET_MIN,
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,
  DIETARY_PREFERENCE_VALUES,
  type DietaryPreference,
} from '@blendi/shared';

import type { TranslationKey } from '../locales/i18n';

// ─── Campos e limites ─────────────────────────────────────────────────────────

/** Os 4 campos numéricos da tela, com os nomes que o PATCH /users/me usa. */
export type GoalField =
  | 'dailyProteinTarget'
  | 'dailyCarbTarget'
  | 'dailyCalorieTarget'
  | 'dailyHydrationTarget';

/** Ordem em que os campos aparecem (e em que o teclado avança). */
export const GOAL_FIELDS: readonly GoalField[] = [
  'dailyProteinTarget',
  'dailyCarbTarget',
  'dailyCalorieTarget',
  'dailyHydrationTarget',
];

export const GOAL_LIMITS: Readonly<Record<GoalField, { min: number; max: number }>> = {
  dailyProteinTarget: {
    min: DAILY_PROTEIN_TARGET_VALIDATION_MIN,
    max: DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  },
  dailyCarbTarget: { min: DAILY_CARB_TARGET_MIN, max: DAILY_CARB_TARGET_MAX },
  dailyCalorieTarget: { min: DAILY_CALORIE_TARGET_MIN, max: DAILY_CALORIE_TARGET_MAX },
  dailyHydrationTarget: { min: DAILY_HYDRATION_TARGET_MIN, max: DAILY_HYDRATION_TARGET_MAX },
};

/** O que a tela edita, já salvo (perfil) ou prestes a ser salvo. */
export interface GoalsValues {
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  dailyHydrationTarget: number;
  dietaryPreferences: DietaryPreference[];
}

/** Texto digitado por campo; campo ausente = a pessoa ainda não mexeu nele. */
export type GoalsTextDraft = Partial<Record<GoalField, string>>;

/** Corpo do PATCH /users/me desta tela: só os campos que mudaram. */
export type GoalsPatch = Partial<GoalsValues>;

// ─── Leitura e validação do que foi digitado ──────────────────────────────────

/** Inteiro positivo ou zero; qualquer outra coisa (vazio, "1,5", "12abc", "-3") vira null. */
export function parseGoalText(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function isGoalValueInRange(field: GoalField, value: number): boolean {
  const { min, max } = GOAL_LIMITS[field];
  return value >= min && value <= max;
}

export function isGoalTextValid(field: GoalField, text: string): boolean {
  const value = parseGoalText(text);
  return value !== null && isGoalValueInRange(field, value);
}

// ─── Dieta ────────────────────────────────────────────────────────────────────

export function isSameDietSelection(
  a: readonly DietaryPreference[],
  b: readonly DietaryPreference[],
): boolean {
  return a.length === b.length && a.every((preference) => b.includes(preference));
}

/** Alterna uma restrição e devolve a lista na ordem canônica do shared. */
export function toggleDietPreference(
  current: readonly DietaryPreference[],
  preference: DietaryPreference,
): DietaryPreference[] {
  const next = current.includes(preference)
    ? current.filter((item) => item !== preference)
    : [...current, preference];

  return DIETARY_PREFERENCE_VALUES.filter((value) => next.includes(value));
}

// ─── Mudanças e PATCH ─────────────────────────────────────────────────────────

/**
 * Um campo conta como alterado se a pessoa mexeu nele e o texto não é
 * exatamente o valor salvo — inclusive texto inválido ou vazio, que ainda é
 * uma alteração não salva (pede confirmação ao sair), embora não dê para salvar.
 */
export function isGoalFieldChanged(
  field: GoalField,
  draft: GoalsTextDraft,
  baseline: GoalsValues,
): boolean {
  const text = draft[field];
  if (text === undefined) {
    return false;
  }

  const value = parseGoalText(text);
  return value === null || value !== baseline[field];
}

export function hasUnsavedGoalChanges(
  baseline: GoalsValues,
  draft: GoalsTextDraft,
  diet: readonly DietaryPreference[] | null,
): boolean {
  return (
    GOAL_FIELDS.some((field) => isGoalFieldChanged(field, draft, baseline)) ||
    (diet !== null && !isSameDietSelection(diet, baseline.dietaryPreferences))
  );
}

/** Dá para salvar: nenhum campo digitado está inválido. (Sem mudança = nada a salvar, ver buildGoalsPatch.) */
export function areGoalDraftsValid(draft: GoalsTextDraft): boolean {
  return GOAL_FIELDS.every((field) => {
    const text = draft[field];
    return text === undefined || isGoalTextValid(field, text);
  });
}

/**
 * PATCH só com os campos que de fato mudaram em relação ao que está salvo.
 * Defesa em profundidade: um valor fora da faixa do shared NUNCA entra aqui,
 * mesmo que quem chama esqueça de checar `areGoalDraftsValid` (o backend o
 * rejeitaria com 400, e o PATCH inteiro cairia junto).
 */
export function buildGoalsPatch(
  baseline: GoalsValues,
  draft: GoalsTextDraft,
  diet: readonly DietaryPreference[] | null,
): GoalsPatch {
  const patch: GoalsPatch = {};

  for (const field of GOAL_FIELDS) {
    const text = draft[field];
    if (text === undefined) {
      continue;
    }

    const value = parseGoalText(text);
    if (value !== null && isGoalValueInRange(field, value) && value !== baseline[field]) {
      patch[field] = value;
    }
  }

  if (diet !== null && !isSameDietSelection(diet, baseline.dietaryPreferences)) {
    patch.dietaryPreferences = DIETARY_PREFERENCE_VALUES.filter((value) => diet.includes(value));
  }

  return patch;
}

// ─── Avisos de meta devolvidos pelo backend ───────────────────────────────────

export type GoalWarnings = Partial<Record<GoalField, TranslationKey[]>>;

interface GoalWarningEntry {
  field: GoalField;
  key: TranslationKey;
}

// code do backend -> campo onde o aviso aparece + texto. Mapa tipado: uma
// chave que não exista em en.json é erro de compilação (sem cast). Os dois
// codes de gordura (macros/fat-below-range e macros/fat-above-range) ficam de
// fora de propósito: a meta de gordura está desativada no app, então nada a
// mostrar. Qualquer outro code desconhecido também é ignorado.
const GOAL_WARNING_BY_CODE: ReadonlyMap<string, GoalWarningEntry> = new Map<string, GoalWarningEntry>([
  ['macros/protein-below-range', { field: 'dailyProteinTarget', key: 'nutritionGoals.warnings.proteinBelowRange' }],
  ['macros/protein-above-range', { field: 'dailyProteinTarget', key: 'nutritionGoals.warnings.proteinAboveRange' }],
  ['macros/calories-below-bmr', { field: 'dailyCalorieTarget', key: 'nutritionGoals.warnings.caloriesBelowBmr' }],
  ['macros/calories-above-tdee', { field: 'dailyCalorieTarget', key: 'nutritionGoals.warnings.caloriesAboveTdee' }],
  ['macros/carb-below-range', { field: 'dailyCarbTarget', key: 'nutritionGoals.warnings.carbBelowRange' }],
  ['macros/carb-above-range', { field: 'dailyCarbTarget', key: 'nutritionGoals.warnings.carbAboveRange' }],
]);

/**
 * Lê a lista `warnings` de `data.user` (PATCH /users/me) e agrupa por campo.
 * O texto vem do `code` — a string `message` do backend nunca é usada. Ignora,
 * sem quebrar: lista ausente ou malformada, itens malformados, codes
 * desconhecidos e aviso cujo `field` não é o campo que o code descreve.
 */
export function parseGoalWarnings(rawWarnings: unknown): GoalWarnings {
  const result: GoalWarnings = {};

  if (!Array.isArray(rawWarnings)) {
    return result;
  }

  for (const item of rawWarnings as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const { field, code } = item as { field?: unknown; code?: unknown };
    if (typeof code !== 'string') {
      continue;
    }

    const entry = GOAL_WARNING_BY_CODE.get(code);
    if (!entry || field !== entry.field) {
      continue;
    }

    const keys = result[entry.field] ?? [];
    if (!keys.includes(entry.key)) {
      keys.push(entry.key);
    }
    result[entry.field] = keys;
  }

  return result;
}

/**
 * Lê `data.user.warnings` de uma resposta de PATCH /users/me SEM presumir que o
 * corpo tem o formato esperado (corpo vazio, nulo, string de gateway...). Um 2xx
 * significa que o servidor salvou; uma resposta estranha não pode virar um erro
 * falso na tela nem impedir a sincronização do resto do app.
 */
export function parsePatchResponseWarnings(body: unknown): GoalWarnings {
  if (typeof body !== 'object' || body === null) {
    return {};
  }

  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return {};
  }

  const user = (data as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) {
    return {};
  }

  return parseGoalWarnings((user as { warnings?: unknown }).warnings);
}
