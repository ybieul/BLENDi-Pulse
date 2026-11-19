// Protocolo rápido "Praia e Refrescos" / "Beach & Refreshers" (pós CP-B5):
// regra do Gabriel, o app nunca sugere álcool. O nome, o texto enviado ao
// Pulse AI e o ícone do card não podem remeter a bebida alcoólica. A chave
// beach_cocktails continua (id interno).
import { render } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import en from '../../locales/en.json';
import ptBR from '../../locales/pt-BR.json';

const mockLocales = { en, 'pt-BR': ptBR } as const;
type LocaleName = keyof typeof mockLocales;

let mockLocale: LocaleName = 'en';

function mockResolveKey(locale: LocaleName, key: string): string {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    mockLocales[locale]
  );
  return typeof value === 'string' ? value : key;
}

jest.mock('../../hooks/useColors', () => ({
  useColors: () => ({
    overlay: { plum: { 4: '#000', 7: '#000', 10: '#000' } },
    text: { primary: '#000' },
  }),
}));

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string) => mockResolveKey(mockLocale, key),
  }),
}));

import { QuickProtocolCards, type QuickProtocol } from './QuickProtocolCards';

// Palavras que remetem a bebida alcoólica (en e pt-BR).
const ALCOHOL_WORDS =
  /drink|cocktail|coquetel|mocktail|alco|álcool|bebida|rum\b|vodka|\bgin\b|cacha|wine|vinho|beer|cerveja|caipirinha|mojito|colada|tequila|whisk|happy hour|bar\b|brinde|toast/i;

describe('protocolo rápido Praia e Refrescos', () => {
  it.each([
    ['en', 'Beach & Refreshers'],
    ['pt-BR', 'Praia e Refrescos'],
  ] as const)('%s: nome novo e texto do protocolo sem palavra de bebida alcoólica', (locale, name) => {
    const home = mockLocales[locale].home;

    expect(home.protocols.beach_cocktails.name).toBe(name);
    expect(home.protocols.beach_cocktails.name).not.toMatch(ALCOHOL_WORDS);
    expect(home.protocolPrompts.beach_cocktails).not.toMatch(ALCOHOL_WORDS);
    // Mesmo tom dos outros protocolos: começa como eles e cita os temas.
    expect(home.protocolPrompts.beach_cocktails.split(' ').slice(0, 3)).toEqual(
      home.protocolPrompts.travel.split(' ').slice(0, 3)
    );
  });

  it.each(['en', 'pt-BR'] as const)('%s: nenhum protocolo da Home cita bebida alcoólica', locale => {
    const home = mockLocales[locale].home;
    const texts = [
      ...Object.values(home.protocols).map(protocol => protocol.name),
      ...Object.values(home.protocolPrompts),
    ];

    for (const text of texts) {
      expect(text).not.toMatch(ALCOHOL_WORDS);
    }
  });

  it.each(['en', 'pt-BR'] as const)('%s: o card usa o texto novo e não usa ícone de taça', locale => {
    mockLocale = locale;
    const { UNSAFE_getByType } = render(<QuickProtocolCards onProtocolSelect={jest.fn()} />);
    // A FlatList renderiza só os 2 primeiros cards de início: confere pelos dados.
    const protocols = UNSAFE_getByType(FlatList).props.data as QuickProtocol[];
    const beach = protocols.find(protocol => protocol.id === 'cocktail-beach');

    expect(beach?.title).toBe(mockLocales[locale].home.protocols.beach_cocktails.name);
    expect(beach?.prompt).toBe(mockLocales[locale].home.protocolPrompts.beach_cocktails);
    expect(beach?.icon).toBe('sunny-outline');
    for (const protocol of protocols) {
      expect(protocol.icon).not.toMatch(/wine|beer|^bar-|cafe/);
    }
  });
});
