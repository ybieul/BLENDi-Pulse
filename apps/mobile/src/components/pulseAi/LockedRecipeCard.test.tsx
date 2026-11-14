// CP-1.1.4a — card de prévia bloqueada do Pulse AI: nome e macros visíveis,
// nenhum texto de ingrediente/passo na árvore, linhas falsas escondidas do
// leitor de tela, rótulo de acessibilidade e toque.
import { fireEvent, render } from '@testing-library/react-native';

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

// Dependências pesadas do RecipeCard completo, que mora no mesmo arquivo.
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

import { LockedRecipeCard } from './RecipeCard';

const PREVIEW = {
  macros: { protein: 12, carbs: 30, fat: 6, calories: 222 },
};

// Se o backend vazasse campos escondidos (inclusive o título), o card ainda
// não os renderizaria.
const LEAKY_PREVIEW = {
  ...PREVIEW,
  title: '137 g Frozen dragonfruit, 213 ml kefir',
  ingredients: [{ name: 'Frozen dragonfruit', amount: '137 g' }],
  blendInstruction: 'Pulse 7 times',
  tip: 'add 11 g of chia',
  steps: [{ text: 'Secret step one' }],
} as typeof PREVIEW;

describe('LockedRecipeCard', () => {
  it('mostra título genérico e macros, e nenhum texto da receita (nem o título real)', () => {
    const { getByText, queryByText, toJSON } = render(
      <LockedRecipeCard preview={LEAKY_PREVIEW} onPress={jest.fn()} />,
    );

    expect(getByText('pulseAi.lockedPreview.genericTitle')).toBeTruthy();
    for (const value of ['12', '30', '6', '222']) {
      expect(getByText(value)).toBeTruthy();
    }
    expect(getByText('pulseAi.lockedPreview.unlockCta')).toBeTruthy();

    const tree = JSON.stringify(toJSON());
    for (const secret of ['213 ml kefir', 'Frozen dragonfruit', '137 g', 'Pulse 7 times', 'add 11 g of chia', 'Secret step one']) {
      expect(tree).not.toContain(secret);
    }
    expect(queryByText('pulseAi.ingredients')).toBeNull();
    expect(queryByText('pulseAi.howToBlend')).toBeNull();
  });

  it('é um botão com o rótulo de receita bloqueada e as linhas falsas ficam fora do leitor de tela', () => {
    const { getByTestId, queryByTestId } = render(
      <LockedRecipeCard preview={PREVIEW} onPress={jest.fn()} />,
    );

    const card = getByTestId('locked-recipe-card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe(
      'pulseAi.lockedPreview.a11yLabel',
    );

    // Escondido da árvore de acessibilidade: a consulta padrão nem o encontra.
    expect(queryByTestId('locked-recipe-placeholder')).toBeNull();
    const placeholder = getByTestId('locked-recipe-placeholder', { includeHiddenElements: true });
    expect(placeholder.props.accessibilityElementsHidden).toBe(true);
    expect(placeholder.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('o toque chama onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<LockedRecipeCard preview={PREVIEW} onPress={onPress} />);

    fireEvent.press(getByTestId('locked-recipe-card'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('expirada: aviso calmo e sem ação', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <LockedRecipeCard preview={PREVIEW} expired onPress={onPress} />,
    );

    expect(getByText('pulseAi.lockedPreview.expired')).toBeTruthy();
    fireEvent.press(getByTestId('locked-recipe-card'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
