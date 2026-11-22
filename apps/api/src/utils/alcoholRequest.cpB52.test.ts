// CP-B5.2 — detecção mista do pedido de álcool (o código decide os casos
// óbvios; a IA só quando a mensagem tem apenas o nome de um drink) e
// ingredientes que definem um drink clássico.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CLASSIC_ALCOHOLIC_DRINKS,
  buildDrinkIngredientsRetryMessage,
  describeDrinkDefiningIngredients,
  detectAlcoholRequest,
  findMissingDrinkIngredients,
  type AlcoholRequestDecision,
} from './alcoholRequest.utils';

function expectAll(decision: AlcoholRequestDecision, messages: readonly string[]) {
  for (const message of messages) {
    assert.equal(detectAlcoholRequest(message), decision, message);
  }
}

describe('CP-B5.2 — detectAlcoholRequest: pedido explícito sem álcool → "no" (vence tudo)', () => {
  it('pt-BR', () => {
    expectAll('no', [
      'piña colada sem álcool',
      'caipirinha zero álcool',
      'mojito sem bebida alcoólica',
      'shake sem bebidas alcoólicas',
      'caipirinha virgem',
      'mocktail de maracujá',
      'drink não alcoólico',
      'piña colada livre de álcool',
      'caipirinha sem nenhum álcool',
      'nada de álcool, uma piña colada',
    ]);
  });

  it('en', () => {
    expectAll('no', [
      'virgin piña colada',
      'non-alcoholic mojito',
      'alcohol-free margarita',
      'margarita with no alcohol',
      'daiquiri without alcohol',
      'a strawberry mocktail',
      'zero alcohol caipirinha',
      'mojito without any alcohol',
    ]);
  });

  it('com destilado citado: o pedido sem álcool vence ("caipirinha sem cachaça", "mojito without rum")', () => {
    // Pela 4ª regra: só bebida negada, sem outra citada, é pedido da versão sem álcool.
    expectAll('no', ['caipirinha sem cachaça', 'mojito without rum', 'rum-free piña colada', 'caipirinha não quero cachaça']);
  });

  it('conflito ("vodka ... sem álcool") → no', () => {
    expectAll('no', ['shake com vodka sem álcool', 'vodka shake, alcohol-free', 'rum shake virgin']);
  });
});

describe('CP-B5.2 — detectAlcoholRequest: bebida alcoólica nomeada sem negação → "yes"', () => {
  it('pt-BR', () => {
    expectAll('yes', [
      'shake com rum',
      'mistura com vodka e alguma fruta',
      'smoothie com vinho',
      'cerveja',
      'shake de cerveja preta',
      'caipirinha de cachaça',
      'drink com gin',
      'shake com saquê',
      'licor de cacau no shake',
    ]);
  });

  it('en', () => {
    expectAll('yes', [
      'rum shake',
      'vodka shake with any fruit',
      'a smoothie with tequila',
      'whiskey sour',
      'wine spritzer',
      'piña colada with rum',
    ]);
  });

  it('troca de destilado: a negada ao lado de outra citada continua "yes"', () => {
    expectAll('yes', ['caipirinha com vodka em vez de cachaça', 'mojito with vodka instead of rum']);
  });
});

describe('CP-B5.2 — detectAlcoholRequest: pedido genérico de álcool → "yes"', () => {
  it('pt-BR e en', () => {
    expectAll('yes', [
      'um shake com álcool',
      'drink alcoólico de morango',
      'bebida alcoólica tropical',
      'shake batizado',
      'boozy smoothie',
      'spiked lemonade',
      'a smoothie with alcohol',
      'an alcoholic shake',
    ]);
  });
});

describe('CP-B5.2 — detectAlcoholRequest: só o nome do drink → "ai"', () => {
  it('drinks clássicos, com outras mudanças ("sem gelo", sabor)', () => {
    expectAll('ai', [
      'piña colada sem gelo',
      'piña colada without ice',
      'caipirinha de morango',
      'strawberry caipirinha',
      'mojito',
      'margarita',
      'daiquiri de morango',
      'sangria',
      'caipiroska de limão',
      'pina colada',
    ]);
  });

  it('drink negado sozinho não conta ("não quero caipirinha")', () => {
    expectAll('no', ['não quero caipirinha, quero um shake']);
  });
});

describe('CP-B5.2 — detectAlcoholRequest: nada disso → "no"', () => {
  it('pedidos comuns', () => {
    expectAll('no', ['um shake de banana', 'shake with banana', 'smoothie tropical', '', '   ']);
  });

  it('protocolo "Praia e Refrescos" / "Beach & Refreshers" (texto real da Home)', () => {
    expectAll('no', [
      'Crie um protocolo BLENDi Pulse de praia com blends tropicais para dias de calor, focados em hidratação e sabores frescos.',
      'Create a BLENDi Pulse beach protocol with tropical blends for hot days, focused on hydration and fresh flavors.',
    ]);
  });

  it('negação de bebida sem drink ("shake sem cachaça") → no', () => {
    expectAll('no', ['shake sem cachaça', 'smoothie without rum', 'não quero vinho']);
  });

  it('falsos amigos continuam fora', () => {
    expectAll('no', [
      'shake com essência de rum',
      'smoothie with rum extract',
      'cerveja sem álcool',
      'cerveja zero',
      'molho com vinagre de vinho',
      'shake de gengibre',
      'ginger smoothie',
      'for the sake of my protein goal, a shake',
      'shake com óleo de coco virgem',
      'smoothie with extra virgin olive oil',
    ]);
  });

  it('virgem de óleo não esconde o destilado pedido', () => {
    expectAll('yes', ['shake com óleo de coco virgem e rum']);
  });
});

describe('CP-B5.2 — ingredientes que definem o drink', () => {
  it('caipirinha sem limão: falta lime (pt-BR, caso do lote 10)', () => {
    assert.deepEqual(
      findMissingDrinkIngredients('caipirinha de morango', ['Morango', 'Cachaça', 'Açúcar', 'Gelo']),
      [{ drink: 'caipirinha', missing: ['lime'] }]
    );
  });

  it('sinônimos: limão, lima, lime, suco de limão; coco, leite/creme/água de coco; hortelã, menta, mint', () => {
    assert.deepEqual(findMissingDrinkIngredients('caipirinha', ['Suco de lima', 'Cachaça']), []);
    assert.deepEqual(findMissingDrinkIngredients('caipirinha', ['Limões', 'Cachaça']), []);
    assert.deepEqual(findMissingDrinkIngredients('strawberry caipirinha', ['lime juice', 'cachaça']), []);
    assert.deepEqual(findMissingDrinkIngredients('piña colada', ['Abacaxi', 'Creme de coco']), []);
    assert.deepEqual(findMissingDrinkIngredients('piña colada', ['pineapple', 'coconut milk']), []);
    assert.deepEqual(findMissingDrinkIngredients('mojito', ['Folhas de menta', 'Limão tahiti']), []);
    assert.deepEqual(findMissingDrinkIngredients('mojito', ['fresh mint', 'lime']), []);
  });

  it('piña colada com manga no lugar do abacaxi (lote 9)', () => {
    assert.deepEqual(
      findMissingDrinkIngredients('piña colada without ice', ['mango', 'coconut milk', 'white rum']),
      [{ drink: 'piña colada', missing: ['pineapple'] }]
    );
  });

  it('versão sem álcool também é cobrada', () => {
    assert.deepEqual(
      findMissingDrinkIngredients('virgin mojito', ['sparkling water', 'lime']),
      [{ drink: 'mojito', missing: ['mint'] }]
    );
  });

  it('ingrediente negado na mensagem não é cobrado ("caipirinha sem limão")', () => {
    assert.deepEqual(findMissingDrinkIngredients('caipirinha sem limão', ['Morango', 'Cachaça']), []);
    assert.deepEqual(
      findMissingDrinkIngredients('mojito without mint', ['lime', 'rum']),
      []
    );
  });

  it('sem drink da tabela, nada é cobrado', () => {
    assert.deepEqual(findMissingDrinkIngredients('shake com rum', ['Banana']), []);
    assert.deepEqual(findMissingDrinkIngredients('sangria', ['Uva']), []);
    assert.deepEqual(findMissingDrinkIngredients('não quero caipirinha', ['Banana']), []);
  });

  it('tabela: caipirinha/caipiroska, piña colada, mojito, margarita e daiquiri', () => {
    const defining = Object.fromEntries(
      CLASSIC_ALCOHOLIC_DRINKS.filter(drink => drink.defining.length > 0).map(drink => [drink.label, drink.defining])
    );
    assert.deepEqual(defining, {
      caipirinha: ['lime'],
      caipiroska: ['lime'],
      'piña colada': ['pineapple', 'coconut'],
      mojito: ['mint', 'lime'],
      margarita: ['lime'],
      daiquiri: ['lime'],
    });
  });

  it('mensagem da nova tentativa diz o que faltou e pede só a receita corrigida', () => {
    const message = buildDrinkIngredientsRetryMessage([{ drink: 'piña colada', missing: ['pineapple', 'coconut'] }]);
    assert.ok(message.includes('a piña colada needs pineapple and coconut'));
    assert.ok(message.includes('return only the corrected recipe as a single JSON object'));
  });

  it('linha do prompt gerada da mesma tabela', () => {
    const line = describeDrinkDefiningIngredients();
    assert.ok(line.includes('caipirinha: lime; caipiroska: lime; piña colada: pineapple and coconut; mojito: mint and lime; margarita: lime; daiquiri: lime'));
    assert.ok(line.includes('a strawberry caipirinha still has lime'));
    assert.ok(line.includes('"caipirinha without lime"'));
  });
});
