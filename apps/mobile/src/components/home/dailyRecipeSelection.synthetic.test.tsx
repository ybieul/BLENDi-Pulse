// CP-1.1.9 — casos que as 100 receitas reais não exercitam: receita com gelo
// (fora do Lite só) e nenhuma receita compatível (atalho para a Pulse AI).
// Os dados são substituídos por um conjunto pequeno e sintético.
import { fireEvent, render } from '@testing-library/react-native';

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

jest.mock('./dailyRecipes.data', () => {
  const recipe = (name: string, contains: string[]) => ({
    nameKey: name,
    protein: 20,
    carbs: 20,
    fat: 5,
    calories: 200,
    durationMinutes: 3,
    contains,
    ingredients: [],
    steps: [],
  });
  return {
    DAILY_RECIPE_BLEND_INSTRUCTION_KEY: 'home.dailyRecipeBlendInstruction',
    DAILY_RECIPES: {
      Muscle: [recipe('muscle-ice', ['ice']), recipe('muscle-dairy', ['dairy'])],
      Wellness: [recipe('wellness-dairy-ice', ['dairy', 'ice'])],
      Energy: [recipe('energy-nuts', ['nuts'])],
      Recovery: [recipe('recovery-sugar', ['added_sugar'])],
      WeightLoss: [recipe('weightloss-animal', ['animal'])],
    },
  };
});

import { DailyRecipeCard } from './DailyRecipeCard';
import { getDailyRecipePool } from './dailyRecipeSelection';

describe('receita do dia — gelo no Lite', () => {
  it('Lite nunca recebe receita com gelo; Pro+ e Steel recebem', () => {
    expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: [], blendiModel: 'Lite' })?.recipes.map((r) => r.nameKey)).toEqual(['muscle-dairy']);
    expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: [], blendiModel: 'ProPlus' })?.recipes.map((r) => r.nameKey)).toEqual(['muscle-ice', 'muscle-dairy']);
    expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: [], blendiModel: 'Steel' })?.recipes).toHaveLength(2);
  });

  it('Lite + dairy_free esvazia o Muscle e cai para os outros goals sem gelo nem laticínio', () => {
    expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: ['dairy_free'], blendiModel: 'Lite' })).toEqual({
      recipes: [
        expect.objectContaining({ nameKey: 'energy-nuts' }),
        expect.objectContaining({ nameKey: 'recovery-sugar' }),
        expect.objectContaining({ nameKey: 'weightloss-animal' }),
      ],
      source: 'otherGoals',
    });
  });
});

describe('receita do dia — nenhuma compatível: atalho para a Pulse AI', () => {
  const emptyingDiets = ['vegan', 'nut_free', 'no_added_sugar'] as const;

  it('a combinação que esvazia todos os goals devolve null', () => {
    expect(getDailyRecipePool({ goal: 'Muscle', dietaryPreferences: [...emptyingDiets], blendiModel: 'Lite' })).toBeNull();
  });

  it('o card da receita some e aparece o atalho, que pede a receita à Pulse AI', () => {
    const onAskPulseAi = jest.fn();
    const onStartBlend = jest.fn();
    const { getByText, queryByText, getByRole } = render(
      <DailyRecipeCard
        goal="Muscle"
        dietaryPreferences={[...emptyingDiets]}
        blendiModel="Lite"
        onStartBlend={onStartBlend}
        onAskPulseAi={onAskPulseAi}
      />
    );

    expect(getByText('home.dailyRecipeUnavailable')).toBeTruthy();
    expect(queryByText('home.startBlend')).toBeNull();
    expect(queryByText('home.recipeMacros')).toBeNull();

    fireEvent.press(getByRole('button'));

    expect(onAskPulseAi).toHaveBeenCalledWith('home.dailyRecipeAskPulseAiPrompt');
    expect(onStartBlend).not.toHaveBeenCalled();
  });
});
