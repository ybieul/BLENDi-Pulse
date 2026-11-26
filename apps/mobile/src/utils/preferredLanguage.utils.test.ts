// Teste no build EAS (25-26/11): idioma mandado nos cadastros Apple/Google.
import { toPreferredLanguage } from './preferredLanguage.utils';

describe('toPreferredLanguage', () => {
  it.each([
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['es', 'en'],
    ['fr-FR', 'en'],
    [undefined, 'en'],
    ['', 'en'],
  ])('%s → %s', (input, expected) => {
    expect(toPreferredLanguage(input)).toBe(expected);
  });
});
