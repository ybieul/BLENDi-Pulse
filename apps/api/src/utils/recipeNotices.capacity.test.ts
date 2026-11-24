// CP-B8a — o capacityNotice da IA só vale quando o volume estimado confirma
// (perto do limite do copo). Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPACITY_NOTICE_MIN_VOLUME_PERCENT,
  CAPACITY_NOTICE_MIN_VOLUME_PERCENT_WITH_UNMEASURED,
  checkCapacityNotice,
} from './recipeNotices.utils';

const NOTICE = 'Não coube no copo.';
const recipe = (ingredients: Array<[string, string]>, capacityNotice: string | undefined = NOTICE) => ({
  ingredients: ingredients.map(([name, amount]) => ({ name, amount })),
  capacityNotice,
});

describe('CP-B8a — checkCapacityNotice', () => {
  it('constantes únicas: 85% e 75% com item sem medida', () => {
    assert.equal(CAPACITY_NOTICE_MIN_VOLUME_PERCENT, 85);
    assert.equal(CAPACITY_NOTICE_MIN_VOLUME_PERCENT_WITH_UNMEASURED, 75);
  });

  it('copo de 400 ml: 340 ml (85%) vale; 336 ml (84%) não; 200 ml (50%) não', () => {
    assert.deepEqual(checkCapacityNotice(recipe([['Leite', '340 ml']]), 'ProPlus'), { legitimate: true, volumePercent: 85, unmeasured: 0 });
    assert.equal(checkCapacityNotice(recipe([['Leite', '336 ml']]), 'ProPlus').legitimate, false);
    assert.equal(checkCapacityNotice(recipe([['Leite', '200 ml']]), 'Lite').volumePercent, 50);
  });

  it('o limite é o do modelo: 400 ml é 100% no ProPlus e 67% no Steel (600 ml)', () => {
    assert.equal(checkCapacityNotice(recipe([['Leite', '400 ml']]), 'ProPlus').legitimate, true);
    assert.deepEqual(checkCapacityNotice(recipe([['Leite', '400 ml']]), 'Steel'), { legitimate: false, volumePercent: 67, unmeasured: 0 });
  });

  it('com item sem medida o patamar cai para 75%; abaixo dele, não vale', () => {
    assert.deepEqual(checkCapacityNotice(recipe([['Leite', '300 ml'], ['Canela', 'a gosto']]), 'ProPlus'), { legitimate: true, volumePercent: 75, unmeasured: 1 });
    assert.equal(checkCapacityNotice(recipe([['Leite', '200 ml'], ['Canela', 'a gosto']]), 'ProPlus').legitimate, false);
  });

  it('sem aviso: nunca legítimo (não há o que conferir)', () => {
    assert.equal(checkCapacityNotice({ ingredients: [{ name: 'Leite', amount: '400 ml' }] }, 'ProPlus').legitimate, false);
    assert.equal(checkCapacityNotice(recipe([['Leite', '400 ml']], '  '), 'ProPlus').legitimate, false);
  });
});
