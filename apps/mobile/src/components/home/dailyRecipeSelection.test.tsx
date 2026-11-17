// CP-1.1.9 — filtro da receita do dia da Home por dieta e por modelo, com os
// dados reais das 100 receitas: nenhuma receita que viole a dieta, fallback
// para os outros goals, rotação determinística sobre a lista filtrada, troca
// de dieta refletindo no card e o botão de preparar inalterado.
// (Gelo no Lite e o atalho da Pulse AI precisam de dados sintéticos — ver
// dailyRecipeSelection.synthetic.test.tsx.)
import { fireEvent, render } from '@testing-library/react-native';
import {
  DIETARY_PREFERENCE_VALUES,
  USER_GOAL_VALUES,
  getForbiddenHomeRecipeContents,
  type DietaryPreference,
  type PulseAiRecipe,
  type UserGoal,
} from '@blendi/shared';

jest.mock('../../hooks/useColors', () => ({
  useColors: () => ({
    overlay: { plum: { 7: '#000', 10: '#000' } },
    brand: { pulse: '#000' },
    text: { primary: '#000' },
  }),
}));

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

import { DailyRecipeCard, getLocalDayIndex } from './DailyRecipeCard';
import { DAILY_RECIPES, type DailyRecipe } from './dailyRecipes.data';
import { getDailyRecipePool, pickForDay, selectDailyRecipe } from './dailyRecipeSelection';

const MS_PER_DAY = 86400000;

/** Todas as combinações de dieta (16, incluindo "sem dieta"). */
const DIET_COMBINATIONS: DietaryPreference[][] = DIETARY_PREFERENCE_VALUES.reduce<DietaryPreference[][]>(
  (combinations, diet) => [...combinations, ...combinations.map((combination) => [...combination, diet])],
  [[]]
);

function violates(recipe: DailyRecipe, diets: readonly DietaryPreference[], blendiModel: 'Lite' | 'ProPlus'): boolean {
  const forbidden = getForbiddenHomeRecipeContents(diets, blendiModel);
  return recipe.contains.some((content) => forbidden.has(content));
}

function renderCard(props: { goal: UserGoal; dietaryPreferences: DietaryPreference[]; blendiModel?: 'Lite' | 'ProPlus' | 'Steel' }) {
  const onStartBlend = jest.fn<void, [PulseAiRecipe]>();
  const onAskPulseAi = jest.fn<void, [string]>();
  const utils = render(
    <DailyRecipeCard
      goal={props.goal}
      dietaryPreferences={props.dietaryPreferences}
      blendiModel={props.blendiModel ?? 'ProPlus'}
      onStartBlend={onStartBlend}
      onAskPulseAi={onAskPulseAi}
    />
  );
  return { ...utils, onStartBlend, onAskPulseAi };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('receita do dia — nunca viola a dieta nem o modelo', () => {
  it('em todo goal × combinação de dieta × modelo × 30 dias, a receita escolhida é compatível', () => {
    for (const goal of USER_GOAL_VALUES) {
      for (const diets of DIET_COMBINATIONS) {
        for (const blendiModel of ['Lite', 'ProPlus'] as const) {
          for (let day = 0; day < 30; day += 1) {
            const recipe = selectDailyRecipe({ goal, dietaryPreferences: diets, blendiModel }, 20000 + day);
            // Com as 100 receitas atuais sempre existe alguma compatível.
            expect(recipe).not.toBeNull();
            expect(violates(recipe as DailyRecipe, diets, blendiModel)).toBe(false);
          }
        }
      }
    }
  });

  it('sem dieta e fora do Lite, o pool é o do goal inteiro na mesma ordem (rotação igual à de antes)', () => {
    for (const goal of USER_GOAL_VALUES) {
      expect(getDailyRecipePool({ goal, dietaryPreferences: [], blendiModel: 'ProPlus' })).toEqual({
        recipes: DAILY_RECIPES[goal],
        source: 'goal',
      });
    }
  });

  // CP-B2: o teto de proteína por modelo saiu (o único limite físico é o
  // volume). Antes, o Lite perdia as Muscle 01, 02, 09 e 18 (36-38 g).
  it('Lite: a Home não esconde mais as receitas Muscle de 36-38 g de proteína; o pool é o do goal inteiro', () => {
    const highProtein = DAILY_RECIPES.Muscle.filter((recipe) => recipe.protein > 35).map((recipe) => recipe.nameKey);
    expect(highProtein).toEqual([
      'home.goalMuscleRecipe',
      'home.dailyRecipeMuscle02Name',
      'home.dailyRecipeMuscle09Name',
      'home.dailyRecipeMuscle18Name',
    ]);
    for (const goal of USER_GOAL_VALUES) {
      // Hoje nenhuma receita tem gelo: o pool do Lite é o do goal inteiro, na mesma ordem.
      expect(getDailyRecipePool({ goal, dietaryPreferences: [], blendiModel: 'Lite' })?.recipes).toEqual(
        DAILY_RECIPES[goal]
      );
    }
    for (const blendiModel of ['Lite', 'ProPlus', 'Steel'] as const) {
      expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: [], blendiModel })?.recipes).toHaveLength(20);
    }
  });

  it('vegana nunca vê whey, iogurte, leite ou mel (Muscle)', () => {
    const pool = getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: ['vegan'], blendiModel: 'ProPlus' });
    expect(pool?.source).toBe('goal');
    for (const recipe of pool?.recipes ?? []) {
      expect(recipe.contains).not.toContain('dairy');
      expect(recipe.contains).not.toContain('animal');
    }
    expect(pool?.recipes.map((recipe) => recipe.nameKey)).toEqual([
      'home.dailyRecipeMuscle08Name',
      'home.dailyRecipeMuscle13Name',
      'home.dailyRecipeMuscle19Name',
    ]);
  });
});

describe('receita do dia — fallback para os outros goals', () => {
  it('Recovery não tem receita vegana: usa as veganas dos outros goals, na ordem dos goals', () => {
    const pool = getDailyRecipePool({ goal: 'Recovery', dietaryPreferences: ['vegan'], blendiModel: 'ProPlus' });
    expect(pool?.source).toBe('otherGoals');
    const expected = USER_GOAL_VALUES.filter((goal) => goal !== 'Recovery')
      .flatMap((goal) => DAILY_RECIPES[goal])
      .filter((recipe) => !violates(recipe, ['vegan'], 'ProPlus'));
    expect(pool?.recipes).toEqual(expected);
    expect(pool?.recipes.length).toBeGreaterThan(0);
  });
});

describe('receita do dia — rotação determinística sobre a lista filtrada', () => {
  it('Muscle + vegan percorre as 3 compatíveis em ordem e volta ao início', () => {
    const input = { goal: 'Muscle' as const, dietaryPreferences: ['vegan'] as DietaryPreference[], blendiModel: 'ProPlus' as const };
    const pool = getDailyRecipePool(input)?.recipes ?? [];
    const base = 20001; // 20001 % 3 = 0
    expect(base % pool.length).toBe(0);
    expect([0, 1, 2, 3].map((offset) => selectDailyRecipe(input, base + offset))).toEqual([pool[0], pool[1], pool[2], pool[0]]);
    // Mesmo dia → mesma receita.
    expect(selectDailyRecipe(input, base + 1)).toBe(selectDailyRecipe(input, base + 1));
  });

  it('pickForDay usa módulo não-negativo', () => {
    expect(pickForDay(['a', 'b', 'c'], -1)).toBe('c');
    expect(pickForDay(['a', 'b', 'c'], 4)).toBe('b');
  });

  it('o card mostra a receita da lista filtrada do dia local', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const input = { goal: 'Energy' as const, dietaryPreferences: ['dairy_free', 'nut_free'] as DietaryPreference[] };
    const expected = selectDailyRecipe({ ...input, blendiModel: 'ProPlus' }, getLocalDayIndex(new Date(now)));

    const { getByText } = renderCard(input);

    expect(getByText((expected as DailyRecipe).nameKey)).toBeTruthy();
  });
});

describe('receita do dia — troca de dieta reflete sem reiniciar', () => {
  it('re-renderizar o card com a dieta nova troca a receita para uma compatível', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const dayIndex = getLocalDayIndex(new Date(now));
    const withoutDiet = selectDailyRecipe({ goal: 'Muscle', dietaryPreferences: [], blendiModel: 'ProPlus' }, dayIndex) as DailyRecipe;
    const withVegan = selectDailyRecipe({ goal: 'Muscle', dietaryPreferences: ['vegan'], blendiModel: 'ProPlus' }, dayIndex) as DailyRecipe;

    const { getByText, rerender } = renderCard({ goal: 'Muscle', dietaryPreferences: [] });
    expect(getByText(withoutDiet.nameKey)).toBeTruthy();

    rerender(
      <DailyRecipeCard
        goal="Muscle"
        dietaryPreferences={['vegan']}
        blendiModel="ProPlus"
        onStartBlend={jest.fn()}
        onAskPulseAi={jest.fn()}
      />
    );

    expect(getByText(withVegan.nameKey)).toBeTruthy();
    expect(violates(withVegan, ['vegan'], 'ProPlus')).toBe(false);
  });
});

describe('receita do dia — botão de preparar continua igual', () => {
  it('envia a receita filtrada no mesmo formato de PulseAiRecipe', () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const recipe = selectDailyRecipe(
      { goal: 'WeightLoss', dietaryPreferences: ['vegan'], blendiModel: 'Lite' },
      getLocalDayIndex(new Date(now))
    ) as DailyRecipe;

    const { getByRole, onStartBlend } = renderCard({ goal: 'WeightLoss', dietaryPreferences: ['vegan'], blendiModel: 'Lite' });
    fireEvent.press(getByRole('button'));

    expect(onStartBlend).toHaveBeenCalledWith({
      title: recipe.nameKey,
      ingredients: recipe.ingredients.map((ingredient) => ({ name: ingredient.nameKey, amount: ingredient.amountKey })),
      macros: { protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat, calories: recipe.calories },
      prepTimeSeconds: recipe.durationMinutes * 60,
      blendInstruction: 'home.dailyRecipeBlendInstruction',
      tip: 'home.dailyRecipeTip',
      hasSubstitutes: false,
      steps: recipe.steps.map((step) => ({ text: step.textKey, pulseCount: step.pulseCount })),
    });
  });

  it('a rotação de um dia para o outro avança uma receita', () => {
    const now = Date.now();
    const input = { goal: 'WeightLoss' as const, dietaryPreferences: [] as DietaryPreference[], blendiModel: 'ProPlus' as const };
    const pool = getDailyRecipePool(input)?.recipes ?? [];
    const today = getLocalDayIndex(new Date(now));
    const tomorrow = getLocalDayIndex(new Date(now + MS_PER_DAY));
    expect(pool.indexOf(selectDailyRecipe(input, tomorrow) as DailyRecipe)).toBe(
      (pool.indexOf(selectDailyRecipe(input, today) as DailyRecipe) + 1) % pool.length
    );
  });
});
