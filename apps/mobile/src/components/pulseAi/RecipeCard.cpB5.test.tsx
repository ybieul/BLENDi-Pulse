// CP-B5 — card da receita do Pulse AI: aviso curto quando a pessoa pediu um
// ingrediente fora da dieta, aviso de versão sem álcool, e o álcool junto
// dos macros só quando > 0 (en e pt-BR vêm das chaves).
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

describe('RecipeCard — avisos de pedido (CP-B5)', () => {
  it('sem os campos novos: nenhum aviso e nenhuma pílula de álcool', () => {
    const utils = renderCard(RECIPE);
    expect(utils.queryByTestId('recipe-diet-override-notice')).toBeNull();
    expect(utils.queryByTestId('recipe-alcohol-free-notice')).toBeNull();
    expect(utils.queryByTestId('macro-pill-alcohol')).toBeNull();
    expect(utils.getByTestId('macro-pill-calories')).toBeTruthy();
  });

  it('fora da dieta: aviso com os ingredientes no meio da frase, acessível', () => {
    const utils = renderCard({ ...RECIPE, dietOverrideIngredients: ['Proteína whey isolada', 'Mel'] });
    const notice = utils.getByTestId('recipe-diet-override-notice');
    const expected = 'pulseAi.dietOverrideNotice:{"items":"proteína whey isolada, mel"}';
    expect(notice.props.accessibilityLabel).toBe(expected);
    expect(utils.getByText(expected)).toBeTruthy();
  });

  it('versão sem álcool: aviso próprio', () => {
    const utils = renderCard({ ...RECIPE, alcoholFreeVersion: true });
    expect(utils.getByTestId('recipe-alcohol-free-notice')).toBeTruthy();
    expect(utils.getByText('pulseAi.alcoholFreeNotice')).toBeTruthy();
  });

  it('álcool > 0 aparece junto dos macros; 0 não aparece', () => {
    const withAlcohol = renderCard({ ...RECIPE, alcoholGrams: 16 });
    expect(withAlcohol.getByTestId('macro-pill-alcohol')).toBeTruthy();
    // Teste no build EAS (25-26/11): o chip mostra o número ("16 g") e o nome
    // visível embaixo (common.macroChips.alcohol), não mais "g de álcool".
    expect(withAlcohol.getByText('common.macroChips.alcohol')).toBeTruthy();
    expect(withAlcohol.getByText(/^16 /)).toBeTruthy();

    const zero = renderCard({ ...RECIPE, alcoholGrams: 0 });
    expect(zero.queryByTestId('macro-pill-alcohol')).toBeNull();
  });

  it('textos en e pt-BR', () => {
    expect(en.pulseAi.dietOverrideNotice).toBe('Includes {{items}}, outside your diet, as you asked.');
    expect(ptBR.pulseAi.dietOverrideNotice).toBe('Inclui {{items}}, fora da sua dieta, como você pediu.');
    expect(en.pulseAi.alcoholFreeNotice.length).toBeGreaterThan(0);
    expect(ptBR.pulseAi.alcoholFreeNotice.length).toBeGreaterThan(0);
    // Teste no build EAS (25-26/11): "g de álcool" virou o chip com rótulo
    // visível (common.macroChips.alcohol) e leitura completa no leitor de tela.
    expect(en.common.macroChips.alcohol).toBe('Alcohol');
    expect(ptBR.common.macroChips.alcohol).toBe('Álcool');
    expect(ptBR.common.macroChips.a11y.alcohol).toBe('{{value}} gramas de álcool');
  });
});
