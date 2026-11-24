// CP-B5.4 — conferências do Pantry com a normalização do validador.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPantryAnalysisPrompt } from '../services/pantryPromptBuilder.service';
import {
  findMissingItems,
  findUnselectedItemsUsed,
  hasPhotoLiquid,
  identifyingTokens,
  isAlcoholicItemName,
} from './pantryRequest.utils';

const recipe = (...names: string[]) => ({ ingredients: names.map(name => ({ name, amount: '1' })) });

describe('pantryRequest.utils (CP-B5.4)', () => {
  it('bebida alcoólica pela lista do validador, com os falsos amigos', () => {
    for (const name of ['Rum', 'Cachaça 51', 'Vinho tinto', 'Vodka', 'Cerveja']) assert.equal(isAlcoholicItemName(name), true, name);
    for (const name of ['Ginger beer', 'Root beer', 'Cerveja sem álcool', 'Cerveja 0,0', 'Beer 0.0', 'Água tônica', 'Refrigerante de guaraná', 'Essência de rum', 'Gengibre', 'Vinagre de vinho']) {
      assert.equal(isAlcoholicItemName(name), false, name);
    }
  });

  it('líquido na foto: leite, suco, água, bebida vegetal; não iogurte, leite condensado nem destilado', () => {
    assert.equal(hasPhotoLiquid([{ name: 'Leite integral' }]), true);
    assert.equal(hasPhotoLiquid([{ name: 'Orange juice' }]), true);
    assert.equal(hasPhotoLiquid([{ name: 'Bebida vegetal de aveia' }]), true);
    assert.equal(hasPhotoLiquid([{ name: 'Água de coco' }]), true);
    assert.equal(hasPhotoLiquid([{ name: 'Iogurte grego' }, { name: 'Leite condensado' }, { name: 'Rum' }]), false);
    // CP-B7a: bebida com gás não é base de blend.
    assert.equal(
      hasPhotoLiquid([{ name: 'Água tônica' }, { name: 'Tonic water' }, { name: 'Ginger beer' }, { name: 'Refrigerante' }, { name: 'Cerveja sem álcool' }, { name: 'Cachaça' }]),
      false
    );
  });

  it('item presente: tokens do item sem número/unidade, singular/plural nos dois sentidos', () => {
    assert.deepEqual(identifyingTokens('2 colheres de pasta de amendoim'), ['pasta', 'amendoim']);
    assert.deepEqual(findMissingItems(recipe('Banana', 'Whey protein isolate'), ['bananas', 'whey']), []);
    assert.deepEqual(findMissingItems(recipe('Morangos', 'Pasta de amendoim'), ['Morango', 'peanut butter']), ['peanut butter']);
  });

  it('desmarcado: conta só quando o ingrediente não casa com algo permitido', () => {
    assert.deepEqual(findUnselectedItemsUsed(recipe('Leite de aveia'), ['Leite'], ['Leite de aveia']), []);
    assert.deepEqual(findUnselectedItemsUsed(recipe('Leite integral'), ['Leite'], ['Aveia']), ['Leite']);
  });

  it('CP-B7a: o prompt de visão pede bebidas (alcoólicas e misturadores), com o nome do rótulo', () => {
    for (const locale of ['en', 'pt-BR'] as const) {
      const prompt = buildPantryAnalysisPrompt(locale);
      assert.ok(prompt.includes('- alcoholic beverages (spirits, wine, beer, liqueur), including closed bottles and cans'));
      assert.ok(prompt.includes('- mixers and other drinks (ginger beer, tonic water, soda, non-alcoholic beer)'));
      assert.ok(prompt.includes('- for drinks, use the name on the label when it is readable'));
      // A visão não decide álcool: nenhum campo novo no JSON.
      assert.ok(!prompt.includes('isAlcoholic'));
    }
  });
});
