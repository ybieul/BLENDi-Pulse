// CP-B4: textos com "BLENDi" têm variante neutra para quem não tem BLENDi
// ('other' / 'none'); 'blendi' ou ausente continuam com o texto atual. O erro
// de copo (pulseai_blender_limit_unmet) deixou de citar proteína para todos.
import type { BlendiOwnership } from '@blendi/shared';

import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';
import type { TranslationKey } from '../locales/i18n';
import {
  NEUTRAL_BLENDER_TEXT_KEYS,
  isGenericBlenderOwnership,
  resolveBlenderTextKey,
} from './blenderText.utils';

const LOCALES = { en, 'pt-BR': ptBR } as const;

function text(locale: keyof typeof LOCALES, key: TranslationKey): string {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (node as Record<string, unknown> | undefined)?.[part],
    LOCALES[locale]
  );
  if (typeof value !== 'string') throw new Error(`chave ausente em ${locale}: ${key}`);
  return value;
}

// Os textos listados no CP-B4 (a lista única é NEUTRAL_BLENDER_TEXT_KEYS).
const LISTED_KEYS: TranslationKey[] = [
  'errors.pulseai_blender_limit_unmet',
  'errors.pulseai_dietary_restriction_unmet',
  'errors.scanner_dietary_restriction_unmet',
  'errors.scanner_blender_limit_unmet',
  'pulseAi.goals.muscle.welcomeSubtitle',
  'pulseAi.goals.wellness.welcomeSubtitle',
  'pulseAi.goals.energy.welcomeSubtitle',
  'pulseAi.goals.weightLoss.welcomeSubtitle',
  'pulseAi.goals.recovery.welcomeSubtitle',
  'blend.cleanReminder',
  'profile.fields.model',
  'me.edit.modelTitle',
];

const BLENDI_OWNERS: Array<BlendiOwnership | undefined> = ['blendi', undefined];
const NON_OWNERS: BlendiOwnership[] = ['other', 'none'];

describe('resolveBlenderTextKey (CP-B4)', () => {
  it('a lista única cobre exatamente os textos do CP-B4', () => {
    expect(Object.keys(NEUTRAL_BLENDER_TEXT_KEYS).sort()).toEqual([...LISTED_KEYS].sort());
  });

  it('só other e none são contas sem BLENDi', () => {
    expect(isGenericBlenderOwnership('other')).toBe(true);
    expect(isGenericBlenderOwnership('none')).toBe(true);
    expect(isGenericBlenderOwnership('blendi')).toBe(false);
    expect(isGenericBlenderOwnership(undefined)).toBe(false);
    expect(isGenericBlenderOwnership(null)).toBe(false);
  });

  describe.each(LISTED_KEYS)('%s', (key) => {
    it.each(BLENDI_OWNERS)('blendi (%s) vê o texto atual, com "BLENDi"', (ownership) => {
      expect(resolveBlenderTextKey(key, ownership)).toBe(key);
      for (const locale of ['en', 'pt-BR'] as const) {
        expect(text(locale, resolveBlenderTextKey(key, ownership))).toContain('BLENDi');
      }
    });

    it.each(NON_OWNERS)('%s vê o texto neutro, sem "BLENDi", em en e pt-BR', (ownership) => {
      const resolved = resolveBlenderTextKey(key, ownership);
      expect(resolved).not.toBe(key);
      for (const locale of ['en', 'pt-BR'] as const) {
        expect(text(locale, resolved)).not.toMatch(/blendi/i);
        expect(text(locale, resolved).length).toBeGreaterThan(0);
      }
    });
  });

  it('chaves sem variante passam iguais para qualquer conta', () => {
    for (const ownership of [...BLENDI_OWNERS, ...NON_OWNERS]) {
      expect(resolveBlenderTextKey('errors.pulseai_unavailable', ownership)).toBe('errors.pulseai_unavailable');
      expect(resolveBlenderTextKey('me.edit.goalTitle', ownership)).toBe('me.edit.goalTitle');
    }
  });

  it('o texto neutro usa "liquidificador portátil" / "portable blender" nos erros e boas-vindas', () => {
    for (const key of LISTED_KEYS.filter(k => k !== 'profile.fields.model' && k !== 'me.edit.modelTitle')) {
      const neutral = resolveBlenderTextKey(key, 'none');
      expect(text('en', neutral)).toContain('portable blender');
      expect(text('pt-BR', neutral)).toContain('liquidificador portátil');
    }
    expect(text('en', resolveBlenderTextKey('profile.fields.model', 'other'))).toBe('My blender');
    expect(text('pt-BR', resolveBlenderTextKey('profile.fields.model', 'other'))).toBe('Meu liquidificador');
    expect(text('en', resolveBlenderTextKey('me.edit.modelTitle', 'none'))).toBe('Your Blender');
    expect(text('pt-BR', resolveBlenderTextKey('me.edit.modelTitle', 'none'))).toBe('Seu Liquidificador');
  });
});

describe('erro de copo sem proteína (CP-B4)', () => {
  const CUP_ERROR_KEYS: TranslationKey[] = [
    'errors.pulseai_blender_limit_unmet',
    'errors.scanner_blender_limit_unmet',
  ];

  it.each(CUP_ERROR_KEYS)('%s não cita proteína em nenhuma variante', (key) => {
    for (const ownership of [...BLENDI_OWNERS, ...NON_OWNERS]) {
      const resolved = resolveBlenderTextKey(key, ownership);
      expect(text('en', resolved)).not.toMatch(/protein/i);
      expect(text('pt-BR', resolved)).not.toMatch(/prote[ií]na/i);
    }
  });

  it('o motivo é o volume do copo, mantendo a sugestão de pedir de outro jeito', () => {
    expect(text('en', 'errors.pulseai_blender_limit_unmet')).toBe(
      "That recipe didn't fit your BLENDi's cup (more volume than it holds). Try asking for a smaller serving."
    );
    expect(text('pt-BR', 'errors.pulseai_blender_limit_unmet')).toBe(
      'Essa receita não coube no copo do seu BLENDi (volume acima do que ele comporta). Tente pedir uma porção menor.'
    );
  });
});
