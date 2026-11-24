// CP-B7 — card da receita: valor pedido não atingido vira aviso visível
// ("Chegamos a 19,8 g de proteína (você pediu 30 g)."), com a sugestão do
// Pantry quando houver; en e pt-BR vêm das chaves.
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

function noticeText(utils: ReturnType<typeof renderCard>, nutrient: string): string {
  return (utils.getByTestId(`recipe-unmet-target-notice-${nutrient}`).props as { accessibilityLabel: string }).accessibilityLabel;
}

describe('RecipeCard — valor pedido não atingido (CP-B7)', () => {
  it('sem o campo: nenhum aviso', () => {
    const utils = renderCard(RECIPE);
    expect(utils.queryByTestId('recipe-unmet-target-notice-protein')).toBeNull();
  });

  it('exato (Pulse AI): entregue × pedido, sem sugestão; acessível pelo rótulo', () => {
    const utils = renderCard({
      ...RECIPE,
      unmetTargets: [{ nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8 }],
    });
    expect(noticeText(utils, 'protein')).toBe(
      'pulseAi.unmetTarget.protein:{"delivered":"19.8 common.units.grams","asked":"pulseAi.unmetTargetAsked.exact:{\\"value\\":\\"30 common.units.grams\\"}"}'
    );
  });

  it('máximo e faixa; calorias em kcal', () => {
    const utils = renderCard({
      ...RECIPE,
      unmetTargets: [
        { nutrient: 'calories', kind: 'max', requested: 250, delivered: 320 },
        { nutrient: 'carbs', kind: 'range', requested: 20, requestedMax: 30, delivered: 45 },
      ],
    });
    expect(noticeText(utils, 'calories')).toContain('pulseAi.unmetTargetAsked.max');
    expect(noticeText(utils, 'calories')).toContain('320 common.units.kilocalories');
    expect(noticeText(utils, 'carbs')).toContain('pulseAi.unmetTargetAsked.range');
  });

  it('Pantry: sugestão traduzida ("Adicionar … ajudaria.")', () => {
    const utils = renderCard({
      ...RECIPE,
      unmetTargets: [{ nutrient: 'protein', kind: 'exact', requested: 30, delivered: 19.8, suggestion: 'plant_protein_powder' }],
    });
    expect(noticeText(utils, 'protein')).toContain(
      'pulseAi.unmetTargetSuggestion:{"item":"pulseAi.unmetTargetSuggestionItem.plantProteinPowder"}'
    );
  });

  it('texto nas duas línguas', () => {
    expect(ptBR.pulseAi.unmetTarget.protein).toBe('Chegamos a {{delivered}} de proteína ({{asked}}).');
    expect(ptBR.pulseAi.unmetTargetAsked.exact).toBe('você pediu {{value}}');
    expect(ptBR.pulseAi.unmetTargetSuggestion).toBe('Adicionar {{item}} ajudaria.');
    expect(ptBR.pulseAi.unmetTargetSuggestionItem.wheyOrProteinPowder).toBe('whey ou proteína em pó');
    expect(en.pulseAi.unmetTarget.protein).toBe('We reached {{delivered}} of protein ({{asked}}).');
    expect(en.pulseAi.unmetTargetAsked.exact).toBe('you asked for {{value}}');
    expect(ptBR.pantryScanner.otherItemsTitle).toBe('Outros itens na foto ({{count}})');
    expect(en.pantryScanner.otherItemsTitle).toBe('Other items in the photo ({{count}})');
  });
});
