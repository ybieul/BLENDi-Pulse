// Onboarding Additions — a dieta do usuário faz parte da chave do cache da
// Pulse AI: mudar a dieta não pode devolver uma receita gerada antes.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateCacheKey, type CacheKeyInput } from './cache.service';

const BASE_INPUT: CacheKeyInput = {
  userId: 'user-1',
  model: 'Lite',
  goal: 'Muscle',
  language: 'en',
  unitSystem: 'metric',
  weightGoal: 'maintain',
  aiProvider: 'anthropic',
  aiModel: 'test-model',
  rawMessage: 'High protein banana shake',
};

describe('generateCacheKey — dieta', () => {
  it('duas dietas diferentes geram chaves diferentes para a mesma mensagem', () => {
    const vegan = generateCacheKey({ ...BASE_INPUT, dietaryFlags: ['vegan'] });
    const nutFree = generateCacheKey({ ...BASE_INPUT, dietaryFlags: ['nut_free'] });
    const none = generateCacheKey({ ...BASE_INPUT, dietaryFlags: [] });

    assert.notEqual(vegan, nutFree);
    assert.notEqual(vegan, none);
    assert.notEqual(nutFree, none);
  });

  it('a ordem das preferências não muda a chave', () => {
    assert.equal(
      generateCacheKey({ ...BASE_INPUT, dietaryFlags: ['vegan', 'nut_free'] }),
      generateCacheKey({ ...BASE_INPUT, dietaryFlags: ['nut_free', 'vegan'] })
    );
  });

  it('lista vazia gera a mesma chave de antes (sem dieta)', () => {
    assert.equal(
      generateCacheKey({ ...BASE_INPUT, dietaryFlags: [] }),
      generateCacheKey(BASE_INPUT)
    );
  });
});

// CP-B5: o prompt muda para quem tem 21+ confirmado (álcool só se pedido).
describe('generateCacheKey — nível de idade para álcool', () => {
  it('21+ e não-21+ geram chaves diferentes para a mesma mensagem', () => {
    const ofAge = generateCacheKey({ ...BASE_INPUT, alcoholTier: 'of-age' });
    const notOfAge = generateCacheKey({ ...BASE_INPUT, alcoholTier: 'not-of-age' });

    assert.notEqual(ofAge, notOfAge);
    assert.ok(ofAge.endsWith(':alcohol21'));
    assert.ok(notOfAge.endsWith(':noalcohol'));
    // O hash da mensagem continua na posição 8 (o controller confere).
    assert.equal(ofAge.split(':')[8], notOfAge.split(':')[8]);
  });

  it('com o nível, a chave nunca coincide com a de antes do CP-B5 (entradas antigas deixam de ser lidas)', () => {
    assert.notEqual(generateCacheKey({ ...BASE_INPUT, alcoholTier: 'not-of-age' }), generateCacheKey(BASE_INPUT));
  });
});
