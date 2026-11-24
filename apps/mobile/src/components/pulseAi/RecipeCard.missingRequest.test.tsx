// CP-B7a — card da receita: item adicionado à mão que a receita não
// conseguiu incluir vira aviso visível ("Não conseguimos incluir: X"); en e
// pt-BR vêm das chaves.
import { render } from '@testing-library/react-native';
import type { PulseAiRecipe } from '@blendi/shared';

import en from '../../locales/en.json';
import ptBR from '../../locales/pt-BR.json';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

jest.mock('../../hooks/useFormatNumbers', () => ({
  useFormatNumbers: () => ({ formatDecimal: (value: number) => String(value) }),
}));

jest.mock('../../hooks/useFavorites', () => ({
  useAddFavorite: () => ({ isPending: false, mutate: jest.fn() }),
  useRemoveFavorite: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ user: null }),
}));
jest.mock('../../utils/shareCard.utils', () => ({ generateAndShare: jest.fn() }));
jest.mock('../../utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../shareCards/RecipeShareCard', () => ({ RecipeShareCard: () => null }));
jest.mock('../shareCards/ShareFormatSheet', () => ({ ShareFormatSheet: () => null }));
jest.mock('../shoppingList/AddToListSheet', () => ({ AddToListSheet: () => null }));
jest.mock('../ui/AuthButton', () => ({ AuthButton: () => null }));

import { RecipeCard } from './RecipeCard';

const RECIPE: PulseAiRecipe = {
  title: 'Shake de banana',
  ingredients: [
    { name: 'Proteína whey isolada', amount: '30 g' },
    { name: 'Banana', amount: '1' },
  ],
  macros: { protein: 28, carbs: 30, fat: 2, calories: 250 },
  prepTimeSeconds: 120,
  blendInstruction: 'Bata por 40 segundos.',
  hasSubstitutes: false,
};

function renderCard(recipe: PulseAiRecipe) {
  return render(<RecipeCard recipe={recipe} isFavorited={false} onStartBlend={jest.fn()} />);
}

describe('RecipeCard — item pedido que faltou (CP-B7a)', () => {
  it('sem o campo: nenhum aviso', () => {
    const utils = renderCard(RECIPE);
    expect(utils.queryByTestId('recipe-missing-request-notice')).toBeNull();
  });

  it('com o campo: aviso visível com os itens', () => {
    const utils = renderCard({ ...RECIPE, missingRequestedIngredients: ['peanut butter', 'canela'] });
    expect(utils.getByTestId('recipe-missing-request-notice')).toBeTruthy();
    expect(utils.getByText('pulseAi.missingRequestedNotice:{"items":"peanut butter, canela"}')).toBeTruthy();
  });

  it('texto nas duas línguas', () => {
    expect(ptBR.pulseAi.missingRequestedNotice).toBe('Não conseguimos incluir: {{items}}.');
    expect(en.pulseAi.missingRequestedNotice).toBe("We couldn't include: {{items}}.");
  });
});
