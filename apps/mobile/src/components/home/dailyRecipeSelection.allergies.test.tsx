// CP-B6 — receita do dia × alergias: a receita com alérgeno cadastrado não
// aparece (alergia comum pela marcação; item livre pelos nomes en/pt-BR), com
// o mesmo fallback da dieta.
import { ALLERGY_CODE_VALUES, ALLERGY_FORBIDDEN_CONTENTS, USER_GOAL_VALUES } from '@blendi/shared';

import en from '../../locales/en.json';
import ptBR from '../../locales/pt-BR.json';
import { DAILY_RECIPES, type DailyRecipe } from './dailyRecipes.data';
import { getDailyRecipePool, selectDailyRecipe } from './dailyRecipeSelection';

function lookup(resources: unknown, key: string): string {
  return String(key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], resources));
}

const namesOf = (recipe: DailyRecipe) =>
  recipe.ingredients.flatMap((ingredient) => [lookup(en, ingredient.nameKey), lookup(ptBR, ingredient.nameKey)]);

describe('receita do dia — alergias (CP-B6)', () => {
  it('nunca escolhe receita com alergia comum, em todo goal × alergia × 30 dias, e sempre há receita', () => {
    for (const goal of USER_GOAL_VALUES) {
      for (const code of ALLERGY_CODE_VALUES) {
        for (let day = 0; day < 30; day += 1) {
          const recipe = selectDailyRecipe(
            { goal, dietaryPreferences: [], blendiModel: 'ProPlus', allergies: { common: [code], custom: [] }, ingredientNamesOf: namesOf },
            day,
          );
          expect(recipe).not.toBeNull();
          expect(recipe?.contains.some((content) => ALLERGY_FORBIDDEN_CONTENTS[code].includes(content))).toBe(false);
        }
      }
    }
  });

  it('item do campo livre esconde pelo nome (en ou pt-BR)', () => {
    const pool = getDailyRecipePool({
      goal: 'Muscle',
      dietaryPreferences: [],
      blendiModel: 'ProPlus',
      allergies: { common: [], custom: ['banana'] },
      ingredientNamesOf: namesOf,
    });
    expect(pool).not.toBeNull();
    for (const recipe of pool?.recipes ?? []) {
      expect(namesOf(recipe).some((name) => /banana/i.test(name))).toBe(false);
    }
    expect(pool?.recipes.length).toBeLessThan(DAILY_RECIPES.Muscle.length);
  });

  it('sem alergia, o pool é o mesmo de antes', () => {
    const before = getDailyRecipePool({ goal: 'Energy', dietaryPreferences: [], blendiModel: 'ProPlus' });
    const now = getDailyRecipePool({
      goal: 'Energy',
      dietaryPreferences: [],
      blendiModel: 'ProPlus',
      allergies: { common: [], custom: [] },
      ingredientNamesOf: namesOf,
    });
    expect(now).toEqual(before);
  });
});
