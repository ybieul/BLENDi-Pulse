// Regras puras da tela "Minhas metas": limites do shared, leitura do texto
// digitado, PATCH só com o que mudou e tradução dos avisos do backend.
import {
  DAILY_CALORIE_TARGET_MAX,
  DAILY_CALORIE_TARGET_MIN,
  DAILY_CARB_TARGET_MAX,
  DAILY_CARB_TARGET_MIN,
  DAILY_HYDRATION_TARGET_MAX,
  DAILY_HYDRATION_TARGET_MIN,
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,
} from '@blendi/shared';

import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';
import {
  GOAL_FIELDS,
  GOAL_LIMITS,
  areGoalDraftsValid,
  buildGoalsPatch,
  hasUnsavedGoalChanges,
  isGoalTextValid,
  isSameDietSelection,
  parseGoalText,
  parseGoalWarnings,
  toggleDietPreference,
  type GoalsValues,
} from './nutritionGoals.utils';

const BASELINE: GoalsValues = {
  dailyProteinTarget: 150,
  dailyCarbTarget: 200,
  dailyCalorieTarget: 2000,
  dailyHydrationTarget: 2500,
  dietaryPreferences: ['vegan'],
};

describe('limites de validação (vêm do packages/shared)', () => {
  it('cada campo usa as constantes exportadas pelo shared', () => {
    expect(GOAL_LIMITS).toEqual({
      dailyProteinTarget: { min: DAILY_PROTEIN_TARGET_VALIDATION_MIN, max: DAILY_PROTEIN_TARGET_VALIDATION_MAX },
      dailyCarbTarget: { min: DAILY_CARB_TARGET_MIN, max: DAILY_CARB_TARGET_MAX },
      dailyCalorieTarget: { min: DAILY_CALORIE_TARGET_MIN, max: DAILY_CALORIE_TARGET_MAX },
      dailyHydrationTarget: { min: DAILY_HYDRATION_TARGET_MIN, max: DAILY_HYDRATION_TARGET_MAX },
    });
  });

  it('valores reais que o backend aplica hoje: 10-800g, 0-1.500g, 300-15.000 kcal, 500-8.000 ml', () => {
    expect(GOAL_LIMITS.dailyProteinTarget).toEqual({ min: 10, max: 800 });
    expect(GOAL_LIMITS.dailyCarbTarget).toEqual({ min: 0, max: 1500 });
    expect(GOAL_LIMITS.dailyCalorieTarget).toEqual({ min: 300, max: 15000 });
    expect(GOAL_LIMITS.dailyHydrationTarget).toEqual({ min: 500, max: 8000 });
  });

  it.each([
    ['dailyProteinTarget', '10', true],
    ['dailyProteinTarget', '9', false],
    ['dailyProteinTarget', '800', true],
    ['dailyProteinTarget', '801', false],
    ['dailyCarbTarget', '0', true],
    ['dailyCarbTarget', '1500', true],
    ['dailyCarbTarget', '1501', false],
    ['dailyCalorieTarget', '300', true],
    ['dailyCalorieTarget', '299', false],
    ['dailyCalorieTarget', '15000', true],
    ['dailyCalorieTarget', '15001', false],
    ['dailyHydrationTarget', '500', true],
    ['dailyHydrationTarget', '499', false],
    ['dailyHydrationTarget', '8000', true],
    ['dailyHydrationTarget', '8001', false],
  ] as const)('%s com "%s" -> válido: %s', (field, text, expected) => {
    expect(isGoalTextValid(field, text)).toBe(expected);
  });
});

describe('parseGoalText', () => {
  it('aceita só inteiros (espaços nas pontas são ignorados)', () => {
    expect(parseGoalText('150')).toBe(150);
    expect(parseGoalText(' 150 ')).toBe(150);
    expect(parseGoalText('0')).toBe(0);
    expect(parseGoalText('007')).toBe(7);
  });

  it.each(['', '   ', '12abc', '1,5', '1.5', '-3', '+3', 'abc', '1e3'])('"%s" não é um número válido', (text) => {
    expect(parseGoalText(text)).toBeNull();
  });
});

describe('buildGoalsPatch / hasUnsavedGoalChanges', () => {
  it('sem mexer em nada: PATCH vazio e nenhuma alteração', () => {
    expect(buildGoalsPatch(BASELINE, {}, null)).toEqual({});
    expect(hasUnsavedGoalChanges(BASELINE, {}, null)).toBe(false);
  });

  it('digitar o mesmo valor que já está salvo não conta como mudança', () => {
    const draft = { dailyProteinTarget: '150', dailyCalorieTarget: ' 2000 ' };

    expect(buildGoalsPatch(BASELINE, draft, null)).toEqual({});
    expect(hasUnsavedGoalChanges(BASELINE, draft, null)).toBe(false);
  });

  it('envia só os campos que mudaram', () => {
    const draft = { dailyProteinTarget: '180', dailyCarbTarget: '200', dailyHydrationTarget: '3000' };

    expect(buildGoalsPatch(BASELINE, draft, null)).toEqual({
      dailyProteinTarget: 180,
      dailyHydrationTarget: 3000,
    });
  });

  it('dieta: só vai quando muda, na ordem canônica, ignorando a ordem em que foi marcada', () => {
    expect(buildGoalsPatch(BASELINE, {}, ['vegan'])).toEqual({});
    expect(buildGoalsPatch(BASELINE, {}, ['no_added_sugar', 'vegan'])).toEqual({
      dietaryPreferences: ['vegan', 'no_added_sugar'],
    });
    expect(buildGoalsPatch(BASELINE, {}, [])).toEqual({ dietaryPreferences: [] });
  });

  it('valor numérico mas FORA da faixa nunca entra no PATCH (defesa em profundidade)', () => {
    expect(buildGoalsPatch(BASELINE, { dailyProteinTarget: '801' }, null)).toEqual({});
    expect(buildGoalsPatch(BASELINE, { dailyProteinTarget: '9' }, null)).toEqual({});
    expect(buildGoalsPatch(BASELINE, { dailyHydrationTarget: '8001', dailyCalorieTarget: '2200' }, null)).toEqual({
      dailyCalorieTarget: 2200,
    });
  });

  it('texto inválido ou vazio é alteração não salva, mas nunca entra no PATCH', () => {
    for (const text of ['', '9', '12abc']) {
      const draft = { dailyProteinTarget: text };

      expect(hasUnsavedGoalChanges(BASELINE, draft, null)).toBe(true);
      expect(areGoalDraftsValid(draft)).toBe(false);
    }
    // '9' está fora da faixa mas é numérico: tampouco vai no PATCH (o botão fica bloqueado antes).
    expect(buildGoalsPatch(BASELINE, { dailyProteinTarget: '' }, null)).toEqual({});
  });

  it('areGoalDraftsValid: campo não tocado não conta; todos os tocados precisam estar na faixa', () => {
    expect(areGoalDraftsValid({})).toBe(true);
    expect(areGoalDraftsValid({ dailyProteinTarget: '180', dailyCarbTarget: '0' })).toBe(true);
    expect(areGoalDraftsValid({ dailyProteinTarget: '180', dailyCarbTarget: '1501' })).toBe(false);
  });
});

describe('dieta', () => {
  it('isSameDietSelection ignora a ordem', () => {
    expect(isSameDietSelection(['vegan', 'nut_free'], ['nut_free', 'vegan'])).toBe(true);
    expect(isSameDietSelection(['vegan'], ['vegan', 'nut_free'])).toBe(false);
    expect(isSameDietSelection([], [])).toBe(true);
  });

  it('toggleDietPreference marca e desmarca, sempre na ordem canônica', () => {
    expect(toggleDietPreference([], 'no_added_sugar')).toEqual(['no_added_sugar']);
    expect(toggleDietPreference(['no_added_sugar'], 'dairy_free')).toEqual(['dairy_free', 'no_added_sugar']);
    expect(toggleDietPreference(['dairy_free', 'no_added_sugar'], 'dairy_free')).toEqual(['no_added_sugar']);
  });
});

describe('parseGoalWarnings — tradução por code, nunca pela message do backend', () => {
  const EXPECTED = [
    ['macros/protein-below-range', 'dailyProteinTarget', 'nutritionGoals.warnings.proteinBelowRange'],
    ['macros/protein-above-range', 'dailyProteinTarget', 'nutritionGoals.warnings.proteinAboveRange'],
    ['macros/calories-below-bmr', 'dailyCalorieTarget', 'nutritionGoals.warnings.caloriesBelowBmr'],
    ['macros/calories-above-tdee', 'dailyCalorieTarget', 'nutritionGoals.warnings.caloriesAboveTdee'],
    ['macros/carb-below-range', 'dailyCarbTarget', 'nutritionGoals.warnings.carbBelowRange'],
    ['macros/carb-above-range', 'dailyCarbTarget', 'nutritionGoals.warnings.carbAboveRange'],
  ] as const;

  it.each(EXPECTED)('%s (%s) -> %s', (code, field, key) => {
    expect(parseGoalWarnings([{ field, code, message: 'warnings.manualMacroEdit.qualquerCoisa' }])).toEqual({
      [field]: [key],
    });
  });

  it('agrupa por campo e preserva todos os avisos conhecidos', () => {
    expect(
      parseGoalWarnings([
        { field: 'dailyProteinTarget', code: 'macros/protein-above-range', message: 'x' },
        { field: 'dailyCalorieTarget', code: 'macros/calories-below-bmr', message: 'y' },
      ]),
    ).toEqual({
      dailyProteinTarget: ['nutritionGoals.warnings.proteinAboveRange'],
      dailyCalorieTarget: ['nutritionGoals.warnings.caloriesBelowBmr'],
    });
  });

  it('ignora, sem quebrar: code desconhecido, gordura, code herdado do Object, aviso no campo errado e itens malformados', () => {
    expect(
      parseGoalWarnings([
        { field: 'dailyProteinTarget', code: 'macros/algo-que-nao-existe', message: 'x' },
        { field: 'dailyFatTarget', code: 'macros/fat-above-range', message: 'x' },
        { field: 'dailyFatTarget', code: 'macros/fat-below-range', message: 'x' },
        { field: 'dailyProteinTarget', code: 'constructor', message: 'x' },
        { field: 'dailyProteinTarget', code: '__proto__', message: 'x' },
        // code de proteína apontando para o campo de carboidrato: não é o que o code descreve.
        { field: 'dailyCarbTarget', code: 'macros/protein-above-range', message: 'x' },
        { field: 'dailyProteinTarget', message: 'sem code' },
        { code: 'macros/protein-above-range' },
        { field: 'dailyProteinTarget', code: 42 },
        null,
        'texto solto',
        7,
      ]),
    ).toEqual({});
  });

  it.each([undefined, null, 'x', 5, {}, { length: 1 }])('lista ausente/malformada (%p) vira "sem avisos"', (raw) => {
    expect(parseGoalWarnings(raw)).toEqual({});
  });

  it('não repete o mesmo aviso duas vezes no mesmo campo', () => {
    const warning = { field: 'dailyProteinTarget', code: 'macros/protein-above-range', message: 'x' };

    expect(parseGoalWarnings([warning, warning])).toEqual({
      dailyProteinTarget: ['nutritionGoals.warnings.proteinAboveRange'],
    });
  });
});

describe('textos de aviso e de tela em en e pt-BR', () => {
  type Json = { [key: string]: Json | string };
  const resolve = (tree: Json, path: string): string => {
    const value = path.split('.').reduce<Json | string | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      tree,
    );
    return typeof value === 'string' ? value : '';
  };

  it.each(EXPECTED_KEYS())('%s existe nos dois idiomas, com texto', (path) => {
    expect(resolve(en as Json, path).trim().length).toBeGreaterThan(0);
    expect(resolve(ptBR as Json, path).trim().length).toBeGreaterThan(0);
  });

  it('todos os avisos dizem que a meta foi salva (en e pt-BR)', () => {
    for (const path of EXPECTED_KEYS().filter((key) => key.startsWith('nutritionGoals.warnings.'))) {
      expect(resolve(en as Json, path)).toMatch(/was saved/i);
      expect(resolve(ptBR as Json, path)).toMatch(/foi salva/i);
    }
  });

  it('os 4 campos aparecem na ordem proteína, carbo, kcal, hidratação', () => {
    expect(GOAL_FIELDS).toEqual(['dailyProteinTarget', 'dailyCarbTarget', 'dailyCalorieTarget', 'dailyHydrationTarget']);
  });
});

function EXPECTED_KEYS(): string[] {
  return [
    'nutritionGoals.rowLabel',
    'nutritionGoals.title',
    'nutritionGoals.subtitle',
    'nutritionGoals.hydrationLabel',
    'nutritionGoals.recalcNotice',
    'nutritionGoals.dietTitle',
    'nutritionGoals.saved',
    'nutritionGoals.next',
    'nutritionGoals.done',
    'nutritionGoals.discard.title',
    'nutritionGoals.discard.message',
    'nutritionGoals.discard.keepEditing',
    'nutritionGoals.discard.confirm',
    'nutritionGoals.warnings.proteinBelowRange',
    'nutritionGoals.warnings.proteinAboveRange',
    'nutritionGoals.warnings.caloriesBelowBmr',
    'nutritionGoals.warnings.caloriesAboveTdee',
    'nutritionGoals.warnings.carbBelowRange',
    'nutritionGoals.warnings.carbAboveRange',
  ];
}
