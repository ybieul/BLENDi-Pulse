// CP-L1a — Anéis da Home para o leitor de tela: um elemento só por anel, com
// nome, valor, meta e unidade no formato do idioma, e "meta atingida" quando
// current >= target (target > 0). Textos reais de en.json / pt-BR.json.
import { render, screen } from '@testing-library/react-native';

import en from '../../locales/en.json';
import ptBR from '../../locales/pt-BR.json';

type Json = { [key: string]: Json | string };
let mockLocale: 'en' | 'pt-BR' = 'en';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => mockTranslate(key, options),
    locale: mockLocale,
  }),
}));
jest.mock('../../hooks/useUnits', () => ({
  useUnits: () => ({ displayHydration: (ml: number) => `${ml} ml` }),
}));
jest.mock('./StaleDataIndicator', () => ({ StaleDataIndicator: () => null }));

function mockTranslate(key: string, options?: Record<string, unknown>): string {
  const dictionary = (mockLocale === 'pt-BR' ? ptBR : en) as unknown as Json;
  const value = key.split('.').reduce<Json | string | undefined>(
    (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
    dictionary
  );
  if (typeof value !== 'string') return key;
  return value.replace(/\{\{(\w+)\}\}/g, (_whole, name: string) => {
    const option = options?.[name];
    return typeof option === 'string' || typeof option === 'number' ? String(option) : '';
  });
}

import { GoalRingsSection } from '../home/GoalRingsSection';
import { GoalRing } from './GoalRing';

function renderRings(protein: [number, number], carbs: [number, number], calories: [number, number]) {
  render(
    <GoalRingsSection
      proteinCurrent={protein[0]}
      proteinTarget={protein[1]}
      carbsCurrent={carbs[0]}
      carbsTarget={carbs[1]}
      caloriesCurrent={calories[0]}
      calorieTarget={calories[1]}
      hydrationCurrent={0}
      hydrationTarget={2500}
      dataUpdatedAt={0}
    />
  );
  return screen.getAllByTestId('goal-ring').map((ring) => ring.props as {
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityValue?: { min: number; max: number; now: number };
  });
}

describe('CP-L1a — anéis acessíveis', () => {
  afterEach(() => {
    mockLocale = 'en';
  });

  it('en: abaixo, igual e acima da meta', () => {
    const [protein, carbs, calories] = renderRings([80, 150], [200, 200], [2300, 2000]);
    expect(protein?.accessibilityLabel).toBe('Protein: 80 of 150 g');
    expect(carbs?.accessibilityLabel).toBe('Carbs: 200 of 200 g, goal reached');
    expect(calories?.accessibilityLabel).toBe('Calories: 2,300 of 2,000 kcal, goal reached');
    expect(protein?.accessible).toBe(true);
    expect(protein?.accessibilityRole).toBe('progressbar');
    expect(protein?.accessibilityValue).toEqual({ min: 0, max: 150, now: 80 });
    // Acima da meta: o valor do anel para no máximo (100%).
    expect(calories?.accessibilityValue).toEqual({ min: 0, max: 2000, now: 2000 });
  });

  it('pt-BR: "de", separador do idioma e "meta atingida"', () => {
    mockLocale = 'pt-BR';
    const [protein, carbs, calories] = renderRings([80.5, 150], [200, 200], [2300, 2000]);
    expect(protein?.accessibilityLabel).toBe('Proteína: 80,5 de 150 g');
    expect(carbs?.accessibilityLabel).toBe('Carboidratos: 200 de 200 g, meta atingida');
    expect(calories?.accessibilityLabel).toBe('Calorias: 2.300 de 2.000 kcal, meta atingida');
  });

  it('meta zero não conta como batida (e o anel não declara valor)', () => {
    const [protein] = renderRings([0, 0], [10, 200], [0, 2000]);
    expect(protein?.accessibilityLabel).toBe('Protein: 0 of 0 g');
    expect(protein?.accessibilityValue).toBeUndefined();
  });

  it('sem rótulo de quem usa: o anel continua como antes (sem texto fixo dentro)', () => {
    render(<GoalRing current={1} target={2} label="x" animate={false} />);
    const ring = screen.getByTestId('goal-ring').props as { accessible?: boolean; accessibilityLabel?: string };
    expect(ring.accessible).toBeUndefined();
    expect(ring.accessibilityLabel).toBeUndefined();
  });
});
