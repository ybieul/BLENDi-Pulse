// CP-B2 — card da receita (Pulse AI e Pantry usam o mesmo RecipeCard):
// alerta explícito no topo quando o pedido foi ajustado ao copo
// (capacityNotice), acessível ao leitor de tela; linha curta quando a receita
// do Pantry usa água que não estava na foto; nada disso na prévia bloqueada.
import { render } from '@testing-library/react-native';
import type { PulseAiRecipe } from '@blendi/shared';

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

import { LockedRecipeCard, RecipeCard } from './RecipeCard';

const NOTICE = 'Você pediu 900 kcal, mas o copo do seu BLENDi Lite comporta até 400 ml; esta receita tem 610 kcal.';

const RECIPE: PulseAiRecipe = {
  title: 'Vitamina de Banana e Aveia',
  ingredients: [
    { name: 'Banana', amount: '1' },
    { name: 'Leite integral', amount: '250 ml' },
  ],
  macros: { protein: 20, carbs: 60, fat: 12, calories: 428 },
  prepTimeSeconds: 120,
  blendInstruction: 'Bata por 40 segundos.',
  hasSubstitutes: false,
};

function renderCard(recipe: PulseAiRecipe) {
  return render(<RecipeCard recipe={recipe} isFavorited={false} onStartBlend={jest.fn()} />);
}

describe('RecipeCard — capacityNotice (CP-B2)', () => {
  it('mostra o alerta no topo do card com título, texto e ícone', () => {
    const { getByTestId, getByText, toJSON } = renderCard({ ...RECIPE, capacityNotice: NOTICE });

    const alert = getByTestId('recipe-capacity-notice');
    expect(getByText('pulseAi.capacityNoticeTitle')).toBeTruthy();
    expect(getByText(NOTICE)).toBeTruthy();

    // Antes do título da receita na árvore (topo do card).
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf(NOTICE)).toBeLessThan(tree.indexOf(RECIPE.title));
    expect(alert).toBeTruthy();
  });

  it('é acessível: um só elemento de alerta, com título e texto no rótulo', () => {
    const { getByTestId } = renderCard({ ...RECIPE, capacityNotice: NOTICE });
    const alert = getByTestId('recipe-capacity-notice');

    expect(alert.props.accessible).toBe(true);
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert.props.accessibilityLabel).toBe(`pulseAi.capacityNoticeTitle. ${NOTICE}`);
  });

  it('sem capacityNotice (ou só espaços), nenhum alerta', () => {
    expect(renderCard(RECIPE).queryByTestId('recipe-capacity-notice')).toBeNull();
    expect(renderCard({ ...RECIPE, capacityNotice: '   ' }).queryByTestId('recipe-capacity-notice')).toBeNull();
  });

  it('a prévia bloqueada (só macros) nunca mostra o aviso, mesmo se o campo vazasse', () => {
    const leaky = { macros: RECIPE.macros, capacityNotice: NOTICE } as { macros: PulseAiRecipe['macros'] };
    const { queryByTestId, toJSON } = render(<LockedRecipeCard preview={leaky} onPress={jest.fn()} />);

    expect(queryByTestId('recipe-capacity-notice')).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain(NOTICE);
  });
});

describe('RecipeCard — água fora da foto no Pantry (CP-B2)', () => {
  it('com usesWaterNotInPhoto, mostra a linha curta', () => {
    const { getByTestId, getByText } = renderCard({
      ...RECIPE,
      ingredients: [...RECIPE.ingredients, { name: 'Água', amount: '100 ml' }],
      usesWaterNotInPhoto: true,
    });
    expect(getByTestId('recipe-water-not-in-photo')).toBeTruthy();
    expect(getByText('pulseAi.waterNotInPhoto')).toBeTruthy();
  });

  it('sem a marcação, nenhuma linha', () => {
    expect(renderCard(RECIPE).queryByTestId('recipe-water-not-in-photo')).toBeNull();
  });
});
