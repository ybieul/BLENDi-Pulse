// apps/mobile/src/utils/nutritionGoals.utils.ts
// Regras puras da tela "Minhas metas" (NutritionGoalsScreen): limites de
// validação, leitura do que a pessoa digitou, montagem do PATCH só com o que
// mudou e tradução dos avisos de meta devolvidos pelo backend.
//
// Nada aqui calcula meta nem decide o que é "alto" ou "baixo": os limites de
// validação vêm de @blendi/shared e as regras dos avisos são do backend
// (evaluateManualMacroEditWarnings, apps/api/src/utils/macroCalculation.utils.ts)
// — o app só lê o `code` de cada aviso e mostra o texto correspondente.
//
// Unidades: o backend guarda tudo na unidade de armazenamento (g, kcal e ml).
// Só a hidratação de quem usa o sistema imperial é exibida e digitada em fl oz,
// com uma casa decimal (mesmo arredondamento do displayVolume do useUnits);
// todo o resto, e a hidratação no métrico, é inteiro. "Mudou ou não mudou" é
// decidido na unidade exibida, e o PATCH sempre leva o valor de armazenamento.

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
import { flOzToMl, mlToFlOz } from './volumeUnits';

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

/** Sistema de unidades do usuário (mesmo valor de AuthUser['unitSystem']). */
export type GoalUnitSystem = 'metric' | 'imperial';

/** Limites na unidade exibida (para a hidratação imperial, em fl oz). */
export interface GoalDisplayLimits {
  min: number;
  max: number;
}

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

// ─── Hidratação em fl oz (só sistema imperial) ────────────────────────────────

/** Este campo, nesta unidade, é digitado em fl oz com uma casa decimal? */
export function isGoalFieldInFlOz(field: GoalField, unitSystem: GoalUnitSystem): boolean {
  return field === 'dailyHydrationTarget' && unitSystem === 'imperial';
}

// Valores em fl oz são tratados em DÉCIMOS inteiros (84.5 -> 845): comparação
// e checagem de faixa ficam exatas, sem ruído de ponto flutuante.
const TENTHS_PER_UNIT = 10;

function toTenths(value: number): number {
  return Math.round(value * TENTHS_PER_UNIT);
}

/** ml salvo -> fl oz exibido, com o mesmo arredondamento do displayVolume. */
function mlToDisplayedFlOzTenths(valueInMl: number): number {
  return toTenths(mlToFlOz(valueInMl));
}

/**
 * Faixa em fl oz derivada da faixa em ml do shared: o menor valor com uma casa
 * decimal cuja conversão não fica abaixo do mínimo em ml e o maior cuja
 * conversão não passa do máximo (hoje 17.0 e 270.5). Assim, todo valor aceito
 * vira, depois de arredondado para ml inteiro, um valor que o backend aceita.
 */
export const HYDRATION_FL_OZ_LIMITS: Readonly<GoalDisplayLimits> = {
  min: Math.ceil(mlToFlOz(DAILY_HYDRATION_TARGET_MIN) * TENTHS_PER_UNIT) / TENTHS_PER_UNIT,
  max: Math.floor(mlToFlOz(DAILY_HYDRATION_TARGET_MAX) * TENTHS_PER_UNIT) / TENTHS_PER_UNIT,
};

/**
 * Texto em fl oz -> décimos. Aceita só dígitos ASCII com no máximo uma casa
 * decimal, separada por ponto ou vírgula ("84", "84.5", "84,5"; "84." no meio
 * da digitação vale 84.0). Sem sinal, sem notação científica, sem ".5".
 */
function parseFlOzTextToTenths(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d?))?$/.exec(text.trim());
  if (!match) {
    return null;
  }

  const [, integerPart, decimalPart] = match;
  const tenths = Number(integerPart) * TENTHS_PER_UNIT + Number(decimalPart || '0');
  return Number.isSafeInteger(tenths) ? tenths : null;
}

// ─── Leitura e validação do que foi digitado ──────────────────────────────────

/** Inteiro positivo ou zero; qualquer outra coisa (vazio, "1,5", "12abc", "-3") vira null. */
export function parseGoalText(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Lê o texto do campo NA UNIDADE EXIBIDA: inteiro em todos os campos, exceto a
 * hidratação imperial (fl oz, uma casa decimal). null = texto inválido.
 */
export function parseGoalDraftText(
  field: GoalField,
  text: string,
  unitSystem: GoalUnitSystem = 'metric',
): number | null {
  if (!isGoalFieldInFlOz(field, unitSystem)) {
    return parseGoalText(text);
  }

  const tenths = parseFlOzTextToTenths(text);
  return tenths === null ? null : tenths / TENTHS_PER_UNIT;
}

/** Valor salvo -> valor exibido no campo (fl oz com uma casa, ou o próprio valor). */
export function toGoalDisplayValue(
  field: GoalField,
  storedValue: number,
  unitSystem: GoalUnitSystem = 'metric',
): number {
  return isGoalFieldInFlOz(field, unitSystem)
    ? mlToDisplayedFlOzTenths(storedValue) / TENTHS_PER_UNIT
    : storedValue;
}

/** Texto inicial do campo: "84.5" na hidratação imperial (igual à Home), "2500" no resto. */
export function formatGoalDisplayValue(
  field: GoalField,
  storedValue: number,
  unitSystem: GoalUnitSystem = 'metric',
): string {
  return isGoalFieldInFlOz(field, unitSystem)
    ? toGoalDisplayValue(field, storedValue, unitSystem).toFixed(1)
    : String(storedValue);
}

/** Faixa na unidade exibida (para a mensagem de erro e a validação). */
export function getGoalDisplayLimits(
  field: GoalField,
  unitSystem: GoalUnitSystem = 'metric',
): GoalDisplayLimits {
  return isGoalFieldInFlOz(field, unitSystem) ? HYDRATION_FL_OZ_LIMITS : GOAL_LIMITS[field];
}

/** Limite para o texto de erro: "17.0" em fl oz; nos demais, o próprio número (como antes). */
export function formatGoalLimit(
  field: GoalField,
  value: number,
  unitSystem: GoalUnitSystem = 'metric',
): string | number {
  return isGoalFieldInFlOz(field, unitSystem) ? value.toFixed(1) : value;
}

/** Valor exibido -> valor de armazenamento (fl oz -> ml inteiro, arredondado). */
export function toGoalStoredValue(
  field: GoalField,
  displayValue: number,
  unitSystem: GoalUnitSystem = 'metric',
): number {
  return isGoalFieldInFlOz(field, unitSystem) ? Math.round(flOzToMl(displayValue)) : displayValue;
}

/** Faixa em unidade de armazenamento (ml, g, kcal) — a do backend. */
export function isGoalValueInRange(field: GoalField, value: number): boolean {
  const { min, max } = GOAL_LIMITS[field];
  return value >= min && value <= max;
}

function isDisplayValueInRange(field: GoalField, value: number, unitSystem: GoalUnitSystem): boolean {
  if (!isGoalFieldInFlOz(field, unitSystem)) {
    return isGoalValueInRange(field, value);
  }

  const tenths = toTenths(value);
  return (
    tenths >= toTenths(HYDRATION_FL_OZ_LIMITS.min) && tenths <= toTenths(HYDRATION_FL_OZ_LIMITS.max)
  );
}

/** Os dois valores (na unidade exibida) são o mesmo número que a tela mostra? */
function isSameDisplayValue(field: GoalField, a: number, b: number, unitSystem: GoalUnitSystem): boolean {
  return isGoalFieldInFlOz(field, unitSystem) ? toTenths(a) === toTenths(b) : a === b;
}

/**
 * O texto digitado pode ser salvo. Na hidratação imperial, digitar de volta o
 * valor exibido também vale, mesmo fora da faixa em fl oz: 500 a 502 ml
 * aparecem como 16.9 (abaixo de 17.0), e esse valor já está salvo — não pode
 * virar erro nem travar o "Salvar" dos outros campos (e não entra no PATCH).
 */
export function isGoalTextValid(
  field: GoalField,
  text: string,
  unitSystem: GoalUnitSystem = 'metric',
  baseline?: GoalsValues,
): boolean {
  const value = parseGoalDraftText(field, text, unitSystem);
  if (value === null) {
    return false;
  }

  if (isDisplayValueInRange(field, value, unitSystem)) {
    return true;
  }

  return (
    baseline !== undefined &&
    isGoalFieldInFlOz(field, unitSystem) &&
    isSameDisplayValue(field, value, toGoalDisplayValue(field, baseline[field], unitSystem), unitSystem)
  );
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
 * Um campo conta como alterado se a pessoa mexeu nele e o texto não é o valor
 * exibido — inclusive texto inválido ou vazio, que ainda é uma alteração não
 * salva (pede confirmação ao sair), embora não dê para salvar. A comparação é
 * na unidade exibida: na hidratação imperial, "84.5" (ou "84,5") contra os
 * 2500 ml salvos não é mudança.
 */
export function isGoalFieldChanged(
  field: GoalField,
  draft: GoalsTextDraft,
  baseline: GoalsValues,
  unitSystem: GoalUnitSystem = 'metric',
): boolean {
  const text = draft[field];
  if (text === undefined) {
    return false;
  }

  const value = parseGoalDraftText(field, text, unitSystem);
  return (
    value === null ||
    !isSameDisplayValue(field, value, toGoalDisplayValue(field, baseline[field], unitSystem), unitSystem)
  );
}

export function hasUnsavedGoalChanges(
  baseline: GoalsValues,
  draft: GoalsTextDraft,
  diet: readonly DietaryPreference[] | null,
  unitSystem: GoalUnitSystem = 'metric',
): boolean {
  return (
    GOAL_FIELDS.some((field) => isGoalFieldChanged(field, draft, baseline, unitSystem)) ||
    (diet !== null && !isSameDietSelection(diet, baseline.dietaryPreferences))
  );
}

/**
 * Dá para salvar: nenhum campo digitado está inválido. (Sem mudança = nada a
 * salvar, ver buildGoalsPatch.) `baseline` permite redigitar o valor exibido
 * da hidratação imperial mesmo fora da faixa em fl oz (ver isGoalTextValid).
 */
export function areGoalDraftsValid(
  draft: GoalsTextDraft,
  unitSystem: GoalUnitSystem = 'metric',
  baseline?: GoalsValues,
): boolean {
  return GOAL_FIELDS.every((field) => {
    const text = draft[field];
    return text === undefined || isGoalTextValid(field, text, unitSystem, baseline);
  });
}

/**
 * PATCH só com os campos que de fato mudaram (na unidade exibida) em relação ao
 * que está salvo, já convertidos para a unidade de armazenamento (hidratação
 * imperial: fl oz -> ml inteiro). Defesa em profundidade: um valor fora da
 * faixa do shared NUNCA entra aqui — nem na unidade exibida nem já convertido
 * em ml —, mesmo que quem chama esqueça de checar `areGoalDraftsValid` (o
 * backend o rejeitaria com 400, e o PATCH inteiro cairia junto).
 */
export function buildGoalsPatch(
  baseline: GoalsValues,
  draft: GoalsTextDraft,
  diet: readonly DietaryPreference[] | null,
  unitSystem: GoalUnitSystem = 'metric',
): GoalsPatch {
  const patch: GoalsPatch = {};

  for (const field of GOAL_FIELDS) {
    const text = draft[field];
    if (text === undefined || !isGoalFieldChanged(field, draft, baseline, unitSystem)) {
      continue;
    }

    const displayValue = parseGoalDraftText(field, text, unitSystem);
    if (displayValue === null || !isDisplayValueInRange(field, displayValue, unitSystem)) {
      continue;
    }

    const storedValue = toGoalStoredValue(field, displayValue, unitSystem);
    if (
      Number.isSafeInteger(storedValue) &&
      isGoalValueInRange(field, storedValue) &&
      storedValue !== baseline[field]
    ) {
      patch[field] = storedValue;
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
