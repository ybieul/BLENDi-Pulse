// CP-B5.3 — coquetéis que sempre levam álcool decididos pelo código ('yes'),
// nomes ambíguos com a IA ('ai'), drinks famosos sem álcool nunca 'yes' e
// tabela ampliada de ingredientes que definem o drink.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UserLocale } from '../models/User';
import { findAlcoholMentions, validateRecipeRestrictions } from './recipeRestrictions.utils';
import {
  ALWAYS_ALCOHOLIC_COCKTAILS,
  describeDrinkDefiningIngredients,
  detectAlcoholRequest,
  findMissingDrinkIngredients,
  type AlcoholRequestDecision,
} from './alcoholRequest.utils';

function expectAll(decision: AlcoholRequestDecision, messages: readonly string[], language?: UserLocale) {
  for (const message of messages) {
    assert.equal(detectAlcoholRequest(message, language), decision, `${language ?? '-'}: ${message}`);
  }
}

// Nomes de risco (palavra comum, lugar, nome de pessoa, outra comida): só
// 'yes' com contexto de bebida; sozinhos, 'ai'.
const RISKY = ['paloma', 'lemon drop', 'mudslide', 'mimosa', 'old fashioned', 'manhattan', 'long island', 'spritz', 'hurricane', 'painkiller', 'sidecar'];

const SAFE = [
  'caipirinha', 'caipiroska', 'caipivodka', 'quentão', 'margarita', 'mojito', 'daiquiri', 'piña colada',
  'moscow mule', 'cosmopolitan', 'martini', 'espresso martini', 'negroni', 'mai tai', 'long island iced tea',
  'white russian', 'bloody mary', 'bellini', 'aperol spritz', 'sangria', 'cuba libre', 'mint julep',
  'tom collins', 'gin fizz', 'sex on the beach', 'michelada',
];

describe('CP-B5.3 — coquetéis que sempre levam álcool → "yes" pelo código', () => {
  it('cada coquetel, sozinho e com sabor, em pt-BR e en', () => {
    for (const name of SAFE) {
      expectAll('yes', [name, `${name} de morango`, `quero um ${name} sem gelo`], 'pt-BR');
      expectAll('yes', [name, `strawberry ${name}`, `a ${name} without ice, please`], 'en');
    }
  });

  it('nomes de risco com contexto de bebida → "yes"', () => {
    for (const name of RISKY) {
      expectAll('yes', [`drink de ${name}`, `um coquetel ${name}`, `drinque ${name} de verão`], 'pt-BR');
      expectAll('yes', [`${name} cocktail`, `a frozen ${name}`, `${name} drink with fruit`], 'en');
    }
  });

  it('nomes de risco sozinhos → "ai" (na dúvida, a IA decide)', () => {
    for (const name of RISKY) {
      expectAll('ai', [name], 'pt-BR');
      expectAll('ai', [name], 'en');
    }
  });

  it('casos do lote 11 e pedidos do enunciado', () => {
    expectAll('yes', ['piña colada sem gelo', 'mojito', 'caipirinha de morango'], 'pt-BR');
    expectAll('yes', ['piña colada without ice', 'strawberry margarita', 'frozen margarita'], 'en');
  });

  it('grafias e plurais (acentos, maiúsculas, "piña"/"pina", hífen/espaço)', () => {
    expectAll('yes', [
      'PIÑA COLADA',
      'pina colada',
      'pinacolada',
      'piña-colada',
      'piñas coladas',
      'caipirinhas de limão',
      'caipirosca',
      'Quentão',
      'quentao',
      'margaritas',
      'daiquirís',
      'moscow-mule',
      'mai tais',
      'bloody marys',
      'cuba-libre',
      'long island ice tea',
      'expresso martini',
    ], 'pt-BR');
    expectAll('yes', ['Mojitos', 'Frozen Margaritas', 'two negronis', 'old-fashioned cocktail', 'Long Island Iced Tea'], 'en');
  });

  it('sem idioma informado, comporta-se como pt-BR (só muda "drink" e o "no" puro)', () => {
    expectAll('yes', ['mojito', 'piña colada sem gelo']);
  });

  it('com idade desconhecida, o "yes" do coquetel pergunta a idade antes da IA (mesmo caminho do destilado)', () => {
    // O controller pergunta (428) sempre que a decisão é 'yes'; ver pulseAi.cpB5.test.ts.
    assert.equal(detectAlcoholRequest('mojito', 'pt-BR'), detectAlcoholRequest('shake com rum', 'pt-BR'));
  });
});

describe('CP-B5.3 — a versão sem álcool vence o coquetel', () => {
  it('pt-BR e en', () => {
    expectAll('no', ['mojito sem álcool', 'piña colada sem álcool', 'mocktail de moscow mule', 'caipirinha virgem', 'margarita zero álcool'], 'pt-BR');
    expectAll('no', ['virgin mojito', 'non-alcoholic piña colada', 'alcohol-free moscow mule', 'espresso martini mocktail', 'virgin frozen margarita'], 'en');
  });

  it('destilado negado sem outro citado é a versão sem álcool ("caipirinha sem cachaça")', () => {
    expectAll('no', ['caipirinha sem cachaça', 'cosmopolitan sem vodka'], 'pt-BR');
    expectAll('no', ['mojito without rum', 'moscow mule without vodka'], 'en');
  });

  it('coquetel negado não conta', () => {
    expectAll('no', ['não quero caipirinha, quero um shake', 'nada de mojito'], 'pt-BR');
    expectAll('no', ['no mojito, just a banana smoothie', 'without margarita'], 'en');
  });

  it('"no" puro em pt-BR é contração, não negação ("mais hortelã no mojito")', () => {
    expectAll('yes', ['mais hortelã no mojito'], 'pt-BR');
  });

  it('troca de destilado continua "yes"', () => {
    expectAll('yes', ['caipirinha com vodka em vez de cachaça'], 'pt-BR');
    expectAll('yes', ['mojito with vodka instead of rum'], 'en');
  });
});

describe('CP-B5.3 — nomes ambíguos → "ai"', () => {
  it('pt-BR: drink/drinque, batida, ponche, coquetel', () => {
    expectAll('ai', ['drink de morango', 'um drinque tropical', 'batida de coco', 'ponche de frutas', 'coquetel de frutas'], 'pt-BR');
  });

  it('en: eggnog, punch, cocktail, irish coffee', () => {
    expectAll('ai', ['eggnog', 'holiday punch', 'a tropical cocktail', 'irish coffee'], 'en');
  });

  it('com destilado nomeado → "yes"', () => {
    expectAll('yes', ['drink de morango com vodka', 'batida de coco com cachaça', 'ponche com rum'], 'pt-BR');
    expectAll('yes', ['eggnog with bourbon', 'rum punch'], 'en');
  });

  it('em inglês "drink" continua fora ("protein drink", "drink within 30 minutes")', () => {
    expectAll('no', ['protein drink', 'drink within 30 minutes', 'a green drink for breakfast', 'Drink within 30 minutes of blending for the best texture and nutrition.'], 'en');
  });

  it('"fruit cocktail" / "shrimp cocktail" são comida', () => {
    expectAll('no', ['fruit cocktail smoothie', 'shrimp cocktail'], 'en');
  });
});

describe('CP-B5.3 — drinks famosos sem álcool nunca "yes" por si', () => {
  it('sem outro sinal → "no" (inclusive com "drink" em pt-BR)', () => {
    expectAll('no', ['shirley temple', 'arnold palmer', 'roy rogers', 'virgin mary'], 'en');
    expectAll('no', ['limonada suíça', 'shirley temple', 'drink shirley temple', 'drink arnold palmer'], 'pt-BR');
  });

  it('com destilado ou coquetel na mensagem vale o outro sinal', () => {
    expectAll('yes', ['shirley temple com vodka', 'limonada suíça com cachaça'], 'pt-BR');
    expectAll('yes', ['arnold palmer with bourbon'], 'en');
  });
});

describe('CP-B5.3 — falsos positivos não viram "yes"', () => {
  it('lugares, nomes, outras comidas', () => {
    expectAll('ai', ['smoothie para levar a Manhattan', 'smoothie pós-treino da Paloma', 'vitamina de mimosa'], 'pt-BR');
    expectAll('ai', ['a natural painkiller smoothie', 'hurricane season smoothie', 'old-fashioned milkshake', 'mudslide smoothie'], 'en');
    expectAll('no', ['shake de pizza margarita', 'smoothie sabor margarita pizza'], 'pt-BR');
    expectAll('no', ['old fashioned oats smoothie', 'old-fashioned rolled oats', 'spritz cookies shake'], 'en');
  });

  it('"old fashioned frozen yogurt" não é coquetel ("frozen" só vale antes do nome)', () => {
    expectAll('ai', ['old fashioned frozen yogurt'], 'en');
  });
});

describe('CP-B5.3 — protocolo da Home e pedidos comuns continuam "no"', () => {
  it('"Praia e Refrescos" / "Beach & Refreshers"', () => {
    expectAll('no', ['Crie um protocolo BLENDi Pulse de praia com blends tropicais para dias de calor, focados em hidratação e sabores frescos.'], 'pt-BR');
    expectAll('no', ['Create a BLENDi Pulse beach protocol with tropical blends for hot days, focused on hydration and fresh flavors.'], 'en');
  });

  it('shakes comuns', () => {
    expectAll('no', ['um shake de banana', 'shake de gengibre'], 'pt-BR');
    expectAll('no', ['banana shake', 'ginger smoothie'], 'en');
  });

  it('efeito conhecido: "batida" como particípio também vai para a IA (nunca "yes")', () => {
    expectAll('ai', ['vitamina de morango bem batida'], 'pt-BR');
  });
});

describe('CP-B5.3 — tabela ampliada de ingredientes que definem o drink', () => {
  it('tabela completa (os 6 do CP-B5.2 primeiro)', () => {
    const defining = ALWAYS_ALCOHOLIC_COCKTAILS.filter(drink => drink.defining.length > 0).map(drink => [drink.label, [...drink.defining]]);
    assert.deepEqual(defining, [
      ['caipirinha', ['lime']],
      ['caipiroska', ['lime']],
      ['piña colada', ['pineapple', 'coconut']],
      ['mojito', ['mint', 'lime']],
      ['margarita', ['lime']],
      ['daiquiri', ['lime']],
      ['quentão', ['ginger']],
      ['moscow mule', ['lime', 'ginger']],
      ['cosmopolitan', ['cranberry', 'lime']],
      ['mai tai', ['lime']],
      ['paloma', ['grapefruit']],
      ['mint julep', ['mint']],
      ['tom collins', ['lemon']],
      ['lemon drop', ['lemon']],
      ['bloody mary', ['tomato']],
      ['white russian', ['coffee', 'milk']],
      ['mudslide', ['coffee', 'milk']],
      ['espresso martini', ['coffee']],
      ['mimosa', ['orange']],
      ['bellini', ['peach']],
    ]);
  });

  it('cada drink cobra o seu ingrediente', () => {
    const cases: Array<[string, string[], Array<{ drink: string; missing: string[] }>]> = [
      ['moscow mule', ['vodka', 'soda water'], [{ drink: 'moscow mule', missing: ['lime', 'ginger'] }]],
      ['cosmopolitan', ['vodka', 'orange liqueur'], [{ drink: 'cosmopolitan', missing: ['cranberry', 'lime'] }]],
      ['mai tai', ['rum', 'pineapple'], [{ drink: 'mai tai', missing: ['lime'] }]],
      ['drink de paloma', ['Tequila', 'Água com gás'], [{ drink: 'paloma', missing: ['grapefruit'] }]],
      ['mint julep', ['bourbon', 'sugar'], [{ drink: 'mint julep', missing: ['mint'] }]],
      ['tom collins', ['gin', 'soda'], [{ drink: 'tom collins', missing: ['lemon'] }]],
      ['lemon drop cocktail', ['vodka', 'sugar'], [{ drink: 'lemon drop', missing: ['lemon'] }]],
      ['bloody mary', ['vodka', 'celery'], [{ drink: 'bloody mary', missing: ['tomato'] }]],
      ['white russian', ['vodka'], [{ drink: 'white russian', missing: ['coffee', 'milk'] }]],
      ['mudslide cocktail', ['vodka', 'ice cream'], [{ drink: 'mudslide', missing: ['coffee', 'milk'] }]],
      ['espresso martini', ['vodka', 'sugar syrup'], [{ drink: 'espresso martini', missing: ['coffee'] }]],
      ['drink de mimosa', ['Espumante'], [{ drink: 'mimosa', missing: ['orange'] }]],
      ['bellini', ['prosecco'], [{ drink: 'bellini', missing: ['peach'] }]],
      ['quentão', ['Cachaça', 'Cravo', 'Canela'], [{ drink: 'quentão', missing: ['ginger'] }]],
    ];
    for (const [message, ingredients, expected] of cases) {
      assert.deepEqual(findMissingDrinkIngredients(message, ingredients), expected, message);
    }
  });

  it('sinônimos en/pt-BR', () => {
    const complete: Array<[string, string[]]> = [
      ['moscow mule', ['vodka', 'ginger beer', 'lime juice']],
      ['moscow mule', ['Vodka', 'Gengibre fresco', 'Limão']],
      ['moscow mule', ['vodka', 'ginger ale', 'lemon']],
      ['cosmopolitan', ['Vodka', 'Suco de cranberry', 'Limão']],
      ['cosmopolitan', ['vodka', 'cranberries', 'lime']],
      ['drink de paloma', ['Tequila', 'Suco de toranja']],
      ['paloma cocktail', ['tequila', 'pink grapefruit']],
      ['mint julep', ['bourbon', 'Hortelã']],
      ['tom collins', ['gin', 'lemon juice']],
      ['tom collins', ['Gin', 'Limão siciliano']],
      ['lemon drop cocktail', ['vodka', 'lime']],
      ['bloody mary', ['Vodka', 'Suco de tomate']],
      ['bloody mary', ['vodka', 'tomatoes']],
      ['white russian', ['vodka', 'coffee liqueur', 'heavy cream']],
      ['white russian', ['Vodka', 'Licor de café', 'Leite']],
      ['white russian', ['vodka', 'cold brew', 'half and half']],
      ['mudslide cocktail', ['vodka', 'espresso', 'milk']],
      ['espresso martini', ['vodka', 'espresso shot']],
      ['espresso martini', ['Vodka', 'Café expresso']],
      ['drink de mimosa', ['Espumante', 'Suco de laranja']],
      ['bellini', ['Prosecco', 'Pêssegos']],
      ['bellini', ['prosecco', 'peach purée']],
      ['quentão', ['Cachaça', 'Gengibre']],
    ];
    for (const [message, ingredients] of complete) {
      assert.deepEqual(findMissingDrinkIngredients(message, ingredients), [], `${message}: ${ingredients.join(', ')}`);
    }
  });

  it('ingrediente negado na mensagem não é cobrado', () => {
    assert.deepEqual(findMissingDrinkIngredients('moscow mule sem gengibre', ['vodka', 'limão']), []);
    assert.deepEqual(findMissingDrinkIngredients('bloody mary without tomato', ['vodka', 'celery']), []);
    assert.deepEqual(findMissingDrinkIngredients('white russian sem leite', ['vodka', 'licor de café']), []);
    assert.deepEqual(
      findMissingDrinkIngredients('cosmopolitan sem cranberry', ['vodka']),
      [{ drink: 'cosmopolitan', missing: ['lime'] }]
    );
  });

  it('versão sem álcool também é cobrada; coquetel negado ou nome de risco sozinho não', () => {
    assert.deepEqual(
      findMissingDrinkIngredients('virgin moscow mule', ['soda water', 'lime']),
      [{ drink: 'moscow mule', missing: ['ginger'] }]
    );
    assert.deepEqual(findMissingDrinkIngredients('não quero bloody mary', ['Banana']), []);
    assert.deepEqual(findMissingDrinkIngredients('mimosa', ['Banana']), []);
    assert.deepEqual(findMissingDrinkIngredients('smoothie para levar a Manhattan', ['Banana']), []);
  });

  it('linha do prompt gerada da mesma tabela', () => {
    const line = describeDrinkDefiningIngredients();
    assert.ok(line.includes('caipirinha: lime; caipiroska: lime; piña colada: pineapple and coconut; mojito: mint and lime; margarita: lime; daiquiri: lime; quentão: ginger; moscow mule: lime and ginger; cosmopolitan: cranberry and lime;'));
    assert.ok(line.includes('white russian: coffee and milk or cream'));
    assert.ok(line.includes('bellini: peach.'));
    assert.ok(!line.includes('sangria'));
  });
});

describe('CP-B5.3a — refrigerantes com "beer" no nome não são álcool (mesma lista nos dois usos)', () => {
  it('findAlcoholMentions: ginger/root/birch beer e "cerveja de gengibre" → vazio; ginger ale também', () => {
    for (const text of ['ginger beer', '120 ml ginger beer', 'Ginger-Beers', 'root beer', '100 ml root beer', 'birch beer', 'cerveja de gengibre', 'ginger ale']) {
      assert.deepEqual(findAlcoholMentions(text), [], text);
    }
  });

  it('findAlcoholMentions: "beer", "cerveja", "craft beer" continuam álcool', () => {
    assert.deepEqual(findAlcoholMentions('beer'), [{ term: 'beer', negated: false }]);
    assert.deepEqual(findAlcoholMentions('cerveja'), [{ term: 'cerveja', negated: false }]);
    assert.deepEqual(findAlcoholMentions('craft beer'), [{ term: 'beer', negated: false }]);
  });

  it('detectAlcoholRequest', () => {
    expectAll('no', ['shake de root beer', 'shake de cerveja de gengibre'], 'pt-BR');
    expectAll('no', ['root beer float shake', 'ginger beer smoothie'], 'en');
    expectAll('yes', ['moscow mule', 'ginger beer com vodka', 'shake de cerveja'], 'pt-BR');
    expectAll('yes', ['ginger beer with rum', 'beer shake'], 'en');
  });

  it('validador (rede no_alcohol): "ginger beer" passa para menor; "cerveja" continua barrada', () => {
    const recipe = (names: string[]) => ({
      ingredients: names.map(name => ({ name, amount: '120 ml' })),
      blendInstruction: 'Bata por 30 segundos.',
    });
    assert.deepEqual(
      validateRecipeRestrictions(recipe(['Suco de limão', 'Ginger beer', 'Água com gás']), [], 'ProPlus', { alcohol: 'forbidden' }),
      { compliant: true }
    );
    assert.deepEqual(
      validateRecipeRestrictions(recipe(['lime juice', 'root beer']), [], 'ProPlus', { alcohol: 'forbidden' }),
      { compliant: true }
    );
    assert.equal(
      validateRecipeRestrictions(recipe(['Suco de limão', 'Cerveja']), [], 'ProPlus', { alcohol: 'forbidden' }).compliant,
      false
    );
  });
});
