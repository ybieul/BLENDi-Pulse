// CP-B6 — card da receita × alergias: aviso forte (lido como alerta) quando a
// receita tem alérgeno confirmado; sugestão do prato feito sem o alérgeno
// com o botão "Quero com X"; aviso da aveia certificada; textos en/pt-BR.
import { fireEvent, render } from '@testing-library/react-native';
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


describe('RecipeCard — alergias (CP-B6)', () => {
  it('sem os campos: nenhum aviso de alergia', () => {
    const utils = renderCard(RECIPE);
    expect(utils.queryByTestId('recipe-allergy-override-notice')).toBeNull();
    expect(utils.queryByTestId('recipe-allergy-suggestion')).toBeNull();
    expect(utils.queryByTestId('recipe-gluten-free-oats-notice')).toBeNull();
  });

  it('alérgeno confirmado: aviso forte, lido como alerta, com o alérgeno e o item livre', () => {
    const utils = renderCard({ ...RECIPE, allergyOverride: { common: ['peanut'], custom: ['kiwi'] } });
    const notice = utils.getByTestId('recipe-allergy-override-notice');

    expect(notice.props.accessibilityRole).toBe('alert');
    expect(notice.props.accessibilityLabel).toContain('allergies.card.override');
    expect(notice.props.accessibilityLabel).toContain('allergies.inSentence.peanut');
    expect(notice.props.accessibilityLabel).toContain('kiwi');
    expect(notice.props.accessibilityLabel).toContain('"count":2');
  });

  it('sugestão: texto com o prato e botão que chama quem pede de novo', () => {
    const onPress = jest.fn();
    const recipe: PulseAiRecipe = { ...RECIPE, allergySuggestion: { dish: 'Paçoca', allergens: ['peanut'] } };
    const utils = render(
      <RecipeCard recipe={recipe} isFavorited={false} onStartBlend={jest.fn()} onAllergySuggestionPress={onPress} />,
    );

    expect(utils.getByText(/allergies\.card\.suggestion:.*Paçoca/)).toBeTruthy();
    fireEvent.press(utils.getByTestId('recipe-allergy-suggestion-button'));
    expect(onPress).toHaveBeenCalledWith(recipe);
  });

  it('sugestão sem quem peça de novo (ex.: Pantry): só o texto, sem botão', () => {
    const utils = renderCard({ ...RECIPE, allergySuggestion: { dish: 'Paçoca', allergens: ['peanut'] } });
    expect(utils.getByTestId('recipe-allergy-suggestion')).toBeTruthy();
    expect(utils.queryByTestId('recipe-allergy-suggestion-button')).toBeNull();
  });

  it('aveia com alergia a trigo/glúten: "Use aveia certificada sem glúten"', () => {
    const utils = renderCard({ ...RECIPE, glutenFreeOatsNotice: true });
    expect(utils.getByTestId('recipe-gluten-free-oats-notice')).toBeTruthy();
    expect(utils.getByText('allergies.card.oats')).toBeTruthy();
  });

  it('textos em en e pt-BR', () => {
    expect(ptBR.allergies.card.override_one).toBe('⚠️ Contém {{items}}, item que você cadastrou como alergia.');
    expect(en.allergies.card.override_one).toBe('⚠️ Contains {{items}}, which you listed as an allergy.');
    expect(ptBR.allergies.card.suggestion).toBe('{{dish}} leva {{items}}, que você cadastrou como alergia. Fiz sem {{items}}. Quer com {{items}}?');
    expect(ptBR.allergies.card.oats).toBe('Use aveia certificada sem glúten.');
    expect(en.allergies.card.oats).toBe('Use certified gluten-free oats.');
    expect(ptBR.allergies.confirm.body).toBe('Você cadastrou alergia a {{items}}. Essa receita vai levar {{items}}. Continuar?');
    expect(ptBR.allergies.picker.honesty).toBe(
      'O app confere pelo nome do ingrediente. Ele não sabe o que há dentro de produtos industrializados (whey saborizado, granola, proteína vegetal) nem se houve contaminação cruzada. Sempre confira os rótulos.',
    );
  });
});
