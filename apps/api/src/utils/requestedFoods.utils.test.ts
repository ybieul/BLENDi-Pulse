// CP-B7 — alimentos pedidos: extração da mensagem atual (negação, categoria,
// sabor, álcool, gelo) e conferência pelo nome dos ingredientes.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  REQUESTED_ITEM_MAX_RETRIES,
  extractRequestedFoods,
  findMissingRequestedFoods,
  requiredRequestedFoods,
} from './requestedFoods.utils';

const ids = (text: string) => extractRequestedFoods(text).map(food => food.id);
const displays = (text: string) => extractRequestedFoods(text).map(food => food.display);

describe('CP-B7 — extração dos alimentos pedidos', () => {
  it('duas novas tentativas (constante única)', () => {
    assert.equal(REQUESTED_ITEM_MAX_RETRIES, 2);
  });

  it('pt-BR e en, plural, acento no aviso', () => {
    assert.deepEqual(displays('shake com banana e morangos'), ['banana', 'morango']);
    assert.deepEqual(displays('vitamina de mamão com maçã'), ['mamão', 'maçã']);
    assert.deepEqual(displays('banana shake with strawberries'), ['banana', 'strawberry']);
  });

  it('negado não conta: "sem banana", "no banana", "em vez de leite"', () => {
    assert.deepEqual(ids('shake de morango sem banana'), ['strawberry']);
    assert.deepEqual(ids('mango smoothie, no banana'), ['mango']);
    assert.deepEqual(ids('em vez de leite use água'), ['water']);
    assert.deepEqual(ids('não quero whey'), []);
  });

  it('categoria genérica não conta; "frutas vermelhas" vale como qualquer fruta vermelha', () => {
    assert.deepEqual(ids('com alguma fruta e verduras'), []);
    assert.deepEqual(ids('smoothie de frutas vermelhas'), ['red_fruits']);
    const [redFruits] = extractRequestedFoods('smoothie de frutas vermelhas');
    assert.deepEqual(findMissingRequestedFoods(['Mirtilo', 'Leite'], [redFruits]), []);
    assert.deepEqual(findMissingRequestedFoods(['Banana'], [redFruits]), [redFruits]);
  });

  it('"proteína" sozinha é nutriente, não ingrediente; whey e proteína em pó contam', () => {
    assert.deepEqual(ids('shake com 30 g de proteína'), []);
    assert.deepEqual(ids('shake proteico com whey'), ['whey']);
    assert.deepEqual(ids('com proteína em pó'), ['protein_powder']);
  });

  it('termo dentro de outro maior conta uma vez ("pasta de amendoim", "leite de coco")', () => {
    assert.deepEqual(ids('shake com pasta de amendoim'), ['nut_butter']);
    assert.deepEqual(ids('com leite de coco'), ['coconut']);
  });

  it('falsos amigos: "café da manhã", "couve-flor", "noz-moscada"', () => {
    assert.deepEqual(ids('shake para o café da manhã'), []);
    // CP-B8a: couve-flor e noz-moscada viraram itens próprios (não couve, não noz).
    assert.deepEqual(ids('com couve-flor'), ['cauliflower']);
    assert.deepEqual(ids('com noz-moscada'), ['nutmeg']);
  });

  it('sabor: baunilha atendida por extrato ou proteína sabor baunilha; chocolate por cacau', () => {
    const [vanilla] = extractRequestedFoods('shake sabor baunilha');
    assert.deepEqual(findMissingRequestedFoods(['Extrato de baunilha'], [vanilla]), []);
    assert.deepEqual(findMissingRequestedFoods(['Whey sabor baunilha'], [vanilla]), []);
    assert.deepEqual(findMissingRequestedFoods(['Banana'], [vanilla]), [vanilla]);
    const [chocolate] = extractRequestedFoods('shake de chocolate');
    assert.deepEqual(findMissingRequestedFoods(['Cacau em pó'], [chocolate]), []);
  });

  it('nome digitado entre parênteses conta; outro idioma conta pelo grupo', () => {
    const foods = extractRequestedFoods('banana shake with strawberries');
    assert.deepEqual(findMissingRequestedFoods(['Banana', 'Morango (strawberry)'], foods), []);
    assert.deepEqual(findMissingRequestedFoods(['Banana', 'Morango'], foods), []);
  });

  it('gelo só é cobrado fora do Lite; bebida alcoólica só com álcool permitido', () => {
    const iced = extractRequestedFoods('shake de banana com gelo');
    assert.deepEqual(requiredRequestedFoods(iced, { blendiModel: 'Lite', alcoholAllowed: false }).map(f => f.id), ['banana']);
    assert.deepEqual(requiredRequestedFoods(iced, { blendiModel: 'ProPlus', alcoholAllowed: false }).map(f => f.id), ['banana', 'ice']);

    const rum = extractRequestedFoods('piña colada com rum');
    assert.deepEqual(rum.map(f => f.id), ['alcohol:rum']);
    assert.deepEqual(requiredRequestedFoods(rum, { blendiModel: 'ProPlus', alcoholAllowed: false }), []);
    assert.equal(requiredRequestedFoods(rum, { blendiModel: 'ProPlus', alcoholAllowed: true }).length, 1);
    assert.deepEqual(findMissingRequestedFoods(['Rum branco', 'Abacaxi'], rum), []);
    // "essência de rum" não é rum (lista do validador).
    assert.deepEqual(findMissingRequestedFoods(['Essência de rum', 'Abacaxi'], rum), rum);
  });

  it('cachaça pedida, "pinga" na receita atende; "com álcool" genérico não é item', () => {
    const cachaca = extractRequestedFoods('caipirinha com cachaça');
    assert.deepEqual(cachaca.map(f => f.display), ['cachaça']);
    assert.deepEqual(findMissingRequestedFoods(['Pinga', 'Limão'], cachaca), []);
    assert.deepEqual(extractRequestedFoods('um shake com álcool'), []);
  });
});

describe('CP-B8a — vocabulário ampliado', () => {
  it('frutas, en e pt-BR, plural e acento', () => {
    assert.deepEqual(ids('shake com jabuticabas e acerolas'), ['jabuticaba', 'acerola']);
    assert.deepEqual(ids('com cupuaçu, pitaya e carambola'), ['cupuacu', 'dragon_fruit', 'star_fruit']);
    assert.deepEqual(ids('figos, caquis e lichias'), ['fig', 'persimmon', 'lychee']);
    assert.deepEqual(ids('graviola, ameixa, nectarina e damasco'), ['soursop', 'plum', 'nectarine', 'apricot']);
    assert.deepEqual(ids('romã com mexerica'), ['pomegranate', 'tangerine']);
    assert.deepEqual(ids('dragon fruit, persimmons and plums'), ['dragon_fruit', 'persimmon', 'plum']);
    assert.deepEqual(displays('vitamina de romã'), ['romã']);
  });

  it('verduras, grãos, sementes, laticínios e outros', () => {
    assert.deepEqual(ids('batata-doce e abobrinha'), ['sweet_potato', 'zucchini']);
    assert.deepEqual(ids('com mandioquinha e brócolis'), ['arracacha', 'broccoli']);
    assert.deepEqual(ids('quinoa com farelo de aveia'), ['quinoa', 'oat_bran']);
    assert.deepEqual(ids('sementes de abóbora e gergelim'), ['pumpkin_seed', 'sesame']);
    assert.deepEqual(ids('castanhas-do-pará e castanha de caju'), ['brazil_nut', 'cashew']);
    assert.deepEqual(ids('com cream cheese'), ['cheese']);
    assert.deepEqual(ids('doce de leite e melado'), ['dulce_de_leche', 'molasses']);
    assert.deepEqual(ids('uvas-passas e tâmaras'), ['raisin', 'date']);
    assert.deepEqual(ids('pumpkin seeds, sweet potato and hemp seeds'), ['pumpkin_seed', 'sweet_potato', 'hemp_seed']);
  });

  it('termo dentro de outro maior conta uma vez; falsos amigos ficam fora', () => {
    assert.deepEqual(ids('com maca peruana'), ['maca_root']);
    assert.deepEqual(ids('com leite condensado'), ['condensed_milk']);
    assert.deepEqual(ids('com noz-moscada'), ['nutmeg']);
    assert.deepEqual(ids('com couve-flor'), ['cauliflower']);
    assert.deepEqual(ids('cara, faz um shake de manga'), ['mango']);
    assert.deepEqual(ids('bata na panela'), []);
    assert.deepEqual(ids('com salsa'), []);
  });

  it('a conferência não confunde o item com o parecido', () => {
    const [cajuFruit] = extractRequestedFoods('suco de caju');
    assert.deepEqual(findMissingRequestedFoods(['Castanha de caju'], [cajuFruit]), [cajuFruit]);
    assert.deepEqual(findMissingRequestedFoods(['Caju'], [cajuFruit]), []);
    const [grape] = extractRequestedFoods('shake de uva');
    assert.deepEqual(findMissingRequestedFoods(['Uva-passa'], [grape]), [grape]);
    const [milk] = extractRequestedFoods('com leite');
    assert.deepEqual(findMissingRequestedFoods(['Leite condensado'], [milk]), [milk]);
    assert.deepEqual(findMissingRequestedFoods(['Leite de aveia'], [milk]), []);
    const [kale] = extractRequestedFoods('com couve');
    assert.deepEqual(findMissingRequestedFoods(['Couve-flor'], [kale]), [kale]);
  });

  it('frozen yogurt segue a regra do gelo (não cobrado no Lite)', () => {
    const foods = extractRequestedFoods('com frozen yogurt');
    assert.deepEqual(requiredRequestedFoods(foods, { blendiModel: 'Lite', alcoholAllowed: false }), []);
    assert.equal(requiredRequestedFoods(foods, { blendiModel: 'ProPlus', alcoholAllowed: false }).length, 1);
  });
});
