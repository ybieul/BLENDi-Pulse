// Tabela de casos do validador determinístico de restrições (CP-1.1.1c).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BlendiModel, DietaryPreference } from '../models/User';
import {
  buildRecipeRestrictionRetryMessage,
  getActiveRecipeRestrictions,
  summarizeRestrictionViolations,
  validateRecipeRestrictions,
  type RecipeRestriction,
  type RestrictedRecipe,
} from './recipeRestrictions.utils';

function recipeWithIngredient(name: string): RestrictedRecipe {
  return {
    ingredients: [
      { name: 'Banana', amount: '1' },
      { name, amount: '100 g' },
    ],
    blendInstruction: 'Blend on high for 45 seconds.',
  };
}

function check(
  name: string,
  diet: DietaryPreference[],
  model: BlendiModel = 'ProPlus'
) {
  return validateRecipeRestrictions(recipeWithIngredient(name), diet, model);
}

function violatedRestrictions(name: string, diet: DietaryPreference[], model: BlendiModel = 'ProPlus'): RecipeRestriction[] {
  const result = check(name, diet, model);
  return result.compliant ? [] : [...new Set(result.violations.map(v => v.restriction))];
}

type Case = [ingredient: string, expectedViolation: boolean];

function runTable(restriction: DietaryPreference, cases: Case[]) {
  for (const [ingredient, shouldViolate] of cases) {
    it(`${shouldViolate ? 'barra' : 'permite'} "${ingredient}"`, () => {
      const violated = violatedRestrictions(ingredient, [restriction]).includes(restriction);
      assert.equal(violated, shouldViolate, `${restriction}: "${ingredient}"`);
    });
  }
}

describe('validateRecipeRestrictions — dairy_free', () => {
  runTable('dairy_free', [
    // Positivos (en)
    ['Whole milk', true],
    ['Skim milk', true],
    ['Greek yogurt', true],
    ['Strawberry yogurt', true],
    ['Butter', true],
    ['Heavy cream', true],
    ['Sour cream', true],
    ['Cream cheese', true],
    ['Vanilla ice cream', true],
    ['Ice cream', true],
    ['Kefir', true],
    ['Whey protein isolate', true],
    ['Micellar casein', true],
    ['Ghee', true],
    ['Lactose-free milk', true],
    ['Milk chocolate', true],
    ['Chocolate milk', true],
    ['Your favorite milk', true],
    // Positivos (pt)
    ['Leite integral', true],
    ['Leite desnatado', true],
    ['Leite sem lactose', true],
    ['Leite em pó', true],
    ['Iogurte natural', true],
    ['Iogurtes gregos', true],
    ['Manteiga', true],
    ['Creme de leite', true],
    ['Queijo cottage', true],
    ['Requeijão', true],
    ['Sorvete de creme', true],
    ['Sorvete de coco', true],
    ['Chocolate ao leite', true],
    ['Leite condensado', true],
    ['Doce de leite', true],
    ['Caseína micelar', true],
    ['Nata', true],
    // Exceções (en)
    ['Oat milk', false],
    ['Unsweetened almond milk', false],
    ['Soy milk', false],
    ['Coconut milk', false],
    ['Rice milk', false],
    ['Plant-based milk', false],
    ['Coconut cream', false],
    ['Cream of coconut', false],
    ['Cocoa butter', false],
    ['Peanut butter', false],
    ['Almond butter', false],
    ['Coconut yogurt', false],
    ['Dairy-free yogurt', false],
    ['Non-dairy creamer', false],
    ['Vegan ice cream', false],
    ['Water kefir', false],
    ['Cream of tartar', false],
    // Exceções (pt)
    ['Leite de aveia', false],
    ['Leite de soja', false],
    ['Leite de coco', false],
    ['Leite de amêndoas', false],
    ['Leite de arroz', false],
    ['Leite vegetal', false],
    ['Leite vegetal de aveia sem açúcar', false],
    ['Manteiga de cacau', false],
    ['Pasta de amendoim', false],
    ['Manteiga de amendoim', false],
    ['Creme de coco', false],
    ['Iogurte de coco', false],
    ['Iogurte vegetal', false],
    ['Sorvete vegano', false],
    ['Kefir de água', false],
    // Não-laticínios que poderiam confundir
    ['Banana congelada', false],
    ['Água de coco', false],
    ['Aveia em flocos', false],
  ]);
});

describe('validateRecipeRestrictions — nut_free', () => {
  runTable('nut_free', [
    // Positivos (en)
    ['Peanut butter', true],
    ['Almond milk', true],
    ['Unsweetened almond milk', true],
    ['Almonds', true],
    ['Cashews', true],
    ['Walnuts', true],
    ['Pecans', true],
    ['Hazelnut spread', true],
    ['Pistachio', true],
    ['Macadamia nuts', true],
    ['Brazil nuts', true],
    ['Mixed nuts', true],
    ['Pine nuts', true],
    ['Nut butter', true],
    ['Almond extract', true],
    ['Nutella', true],
    ['Praline', true],
    ['Trail mix', true],
    ['Chestnut', true],
    // Positivos (pt)
    ['Pasta de amendoim', true],
    ['Amendoins torrados', true],
    ['Leite de amêndoas', true],
    ['Castanha de caju', true],
    ['Castanhas-do-pará', true],
    ['Nozes', true],
    ['Noz-pecã', true],
    ['Avelã', true],
    ['Pistache', true],
    ['Macadâmia', true],
    ['Farinha de amêndoa', true],
    ['Paçoca', true],
    ['Mix de oleaginosas', true],
    // Exceções
    ['Nutmeg', false],
    ['Pinch of nutmeg', false],
    ['Noz-moscada', false],
    ['Noz moscada ralada', false],
    ['Suco de caju', false],
    ['Polpa de caju', false],
    ['Caju', false],
    ['Cashew fruit juice', false],
    ['Nut-free protein powder', false],
    ['Granola sem castanhas', false],
    // Granola (CP-1.1.1d): barrada, a não ser que o nome diga que não tem castanhas
    ['Granola', true],
    ['Homemade granola', true],
    ['Granola caseira', true],
    ['Granola com mel', true],
    ['Honey granola clusters', true],
    // "sem amendoim"/"peanut-free" não diz nada sobre castanhas
    ['Peanut-free granola', true],
    ['Granola sem amendoim', true],
    ['Nut-free granola', false],
    ['Tree-nut-free granola', false],
    ['Granola (nut-free)', false],
    ['Granola without nuts', false],
    ['Granola sem castanhas e sem amendoim', false],
    ['Granola sem oleaginosas', false],
    ['Granola sem nozes', false],
    ['Granola livre de castanhas', false],
    // Coco: decisão documentada — não é oleaginosa
    ['Coconut milk', false],
    ['Coco ralado', false],
    ['Noz-de-coco', false],
    // Palavra inteira
    ['Butternut squash', false],
    ['Nutritional yeast', false],
    ['Doughnut peach', false],
  ]);
});

describe('validateRecipeRestrictions — vegan', () => {
  runTable('vegan', [
    // Tudo de dairy_free
    ['Whole milk', true],
    ['Greek yogurt', true],
    ['Whey protein', true],
    ['Casein', true],
    ['Leite integral', true],
    ['Vanilla ice cream', true],
    // Específicos de vegan (en)
    ['Egg', true],
    ['Eggs', true],
    ['Egg white protein powder', true],
    ['Egg whites', true],
    ['Honey', true],
    ['Collagen peptides', true],
    ['Gelatin', true],
    ['Bee pollen', true],
    // Específicos de vegan (pt)
    ['Ovo', true],
    ['Ovos cozidos', true],
    ['Clara de ovo', true],
    ['Claras', true],
    ['Mel', true],
    ['Colágeno hidrolisado', true],
    ['Gelatina incolor', true],
    ['Albumina', true],
    // Proteína em pó sem origem vegetal declarada (CP-1.1.1d)
    ['Protein powder', true],
    ['Vanilla protein powder', true],
    ['Chocolate protein powders', true],
    ['Protein isolate', true],
    ['Unflavored protein powder', true],
    ['Proteína em pó', true],
    ['Proteína em pó sabor baunilha', true],
    ['Pó de proteína', true],
    ['Proteína isolada', true],
    // conjunção: o qualificador do item vizinho não vale
    ['Soy milk and protein powder', true],
    ['Leite de soja e proteína em pó', true],
    // Com qualificador vegetal: permitidos
    ['Plant protein powder', false],
    ['Plant-based protein powder', false],
    ['Pea protein powder', false],
    ['Soy protein isolate', false],
    ['Rice protein powder', false],
    ['Hemp protein powder', false],
    ['Vegan protein powder', false],
    ['Vegan vanilla protein powder', false],
    ['Pea vanilla protein powder', false],
    ['Protein powder (pea)', false],
    ['Proteína em pó vegetal', false],
    ['Proteína vegetal em pó', false],
    ['Proteína em pó de ervilha', false],
    ['Proteína de ervilha em pó', false],
    ['Proteína em pó de soja', false],
    ['Proteína em pó de arroz', false],
    ['Proteína isolada de soja', false],
    ['Pó de proteína vegana', false],
    // Permitidos
    ['Pea protein', false],
    ['Proteína vegetal', false],
    ['Proteína de ervilha', false],
    ['Oat milk', false],
    ['Leite de aveia', false],
    ['Agave', false],
    ['Mel de agave', false],
    // Palavra inteira: mel ≠ caramelo, melão, melancia, honeydew
    ['Caramelo', false],
    ['Melão', false],
    ['Melancia', false],
    ['Honeydew melon', false],
    ['Eggplant', false],
  ]);
});

describe('validateRecipeRestrictions — no_added_sugar', () => {
  runTable('no_added_sugar', [
    // Positivos (en)
    ['Sugar', true],
    ['Brown sugar', true],
    ['Honey', true],
    ['Maple syrup', true],
    ['Agave nectar', true],
    ['Chocolate syrup', true],
    ['Date syrup', true],
    ['Stevia', true],
    ['Sweetener', true],
    ['Monk fruit sweetener', true],
    ['Sweetened vanilla yogurt', true],
    ['Sweetened almond milk', true],
    ['Sweetened condensed milk', true],
    ['Molasses', true],
    // Positivos (pt)
    ['Açúcar', true],
    ['Açúcar mascavo', true],
    ['Açúcares', true],
    ['Mel', true],
    ['Xarope de bordo', true],
    ['Calda de chocolate', true],
    ['Adoçante', true],
    ['Iogurte adoçado', true],
    ['Leite de amêndoas adoçado', true],
    ['Leite condensado', true],
    ['Doce de leite', true],
    ['Melado', true],
    ['Rapadura', true],
    ['Achocolatado', true],
    // Negação / permitidos
    ['Unsweetened almond milk', false],
    ['Sugar-free cocoa powder', false],
    ['Cocoa powder (no added sugar)', false],
    ['No sugar added applesauce', false],
    ['Leite de amêndoas sem açúcar', false],
    ['Iogurte natural sem açúcar', false],
    ['Iogurte sem adição de açúcar', false],
    ['Pasta de amendoim sem adoçar', false],
    ['Iogurte não adoçado', false],
    ['Zero açúcar', false],
    // Fruta inteira é permitida
    ['Banana', false],
    ['Tâmaras', false],
    ['Medjool dates', false],
    ['Mango', false],
    ['Melão', false],
    ['Honeydew melon', false],
    ['Caramelo', false],
  ]);
});

describe('validateRecipeRestrictions — gelo no Lite', () => {
  const liteCases: Case[] = [
    ['Ice', true],
    ['Ice cubes', true],
    ['1 cup crushed ice', true],
    ['Shaved ice', true],
    ['Ice water', true],
    ['Coffee ice cubes', true],
    ['Gelo', true],
    ['Cubos de gelo', true],
    ['Gelo picado', true],
    ['Pedras de gelo', true],
    ['Água com gelo', true],
    ['Gelo de café', true],
    // Não é gelo
    ['Vanilla ice cream', false],
    ['Sorvete de creme', false],
    ['Frozen banana', false],
    ['Frozen mixed berries', false],
    ['Banana congelada', false],
    ['Morangos congelados', false],
    ['Iced coffee', false],
    ['Iced green tea', false],
    ['Café gelado', false],
    ['Água gelada', false],
    ['Ice-cold water', false],
    ['Rice milk', false],
    ['Rice', false],
    ['Licorice', false],
    ['Geleia de morango', false],
    ['Spiced chai', false],
  ];

  for (const [ingredient, shouldViolate] of liteCases) {
    it(`Lite ${shouldViolate ? 'barra' : 'permite'} "${ingredient}"`, () => {
      const violated = violatedRestrictions(ingredient, [], 'Lite').includes('lite_no_ice');
      assert.equal(violated, shouldViolate, `Lite: "${ingredient}"`);
    });
  }

  for (const model of ['ProPlus', 'Steel'] as const) {
    it(`${model} permite gelo`, () => {
      assert.deepEqual(check('Ice cubes', [], model), { compliant: true });
      assert.deepEqual(check('Gelo picado', [], model), { compliant: true });
    });
  }

  it('Lite: negação nos passos ("no ice needed", "sem gelo") não é violação', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Frozen banana', amount: '1' }],
      blendInstruction: 'Blend for 40 seconds. No ice needed.',
      steps: [
        { text: 'Add the frozen banana — no ice needed.' },
        { text: 'Bata sem gelo, a banana congelada já gela.' },
        { text: 'Gelo não é necessário.' },
        { text: 'Ice is not needed here.' },
      ],
    };
    assert.deepEqual(validateRecipeRestrictions(recipe, [], 'Lite'), { compliant: true });
  });

  it('Lite: explicação da troca na blendInstruction não é violação', () => {
    const explanations = [
      'Substituímos o gelo por banana congelada para proteger o motor de 70W.',
      'Como o BLENDi Lite não tritura gelo, use morangos congelados.',
      'Em vez do gelo, use fruta congelada.',
      'Evite gelo: o motor de 70W não foi feito para isso.',
      'We replaced the ice with frozen banana to protect the 70W motor.',
      'The BLENDi Lite cannot crush ice, so frozen fruit keeps it cold.',
      'Avoid ice; use frozen strawberries instead of ice.',
      'Swap the ice for frozen mango.',
    ];
    for (const blendInstruction of explanations) {
      const recipe: RestrictedRecipe = {
        ingredients: [{ name: 'Frozen banana', amount: '1' }],
        blendInstruction,
      };
      assert.deepEqual(validateRecipeRestrictions(recipe, [], 'Lite'), { compliant: true }, blendInstruction);
    }
  });

  it('Lite: texto real do teste ao vivo (explicação na blendInstruction) não é violação', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [
        { name: 'Morango', amount: '150 g' },
        { name: 'Iogurte grego desnatado', amount: '100 g' },
      ],
      blendInstruction:
        'Como o seu BLENDi Lite tem potência de 70W e não deve ser usado com gelo, esta receita utiliza frutas congeladas para garantir a cremosidade e o efeito gelado sem sobrecarregar o motor.',
    };
    assert.deepEqual(validateRecipeRestrictions(recipe, [], 'Lite'), { compliant: true });
  });

  it('Lite: passos que mandam usar gelo continuam barrados (passos são estritos)', () => {
    const instructions = [
      'Não esqueça de adicionar gelo no final.',
      'Adicione o gelo por último e bata.',
      'Troque a água por gelo para ficar mais gelado.',
      'Serve over ice.',
      'Replace the water with ice for a thicker texture.',
      "Don't forget the ice.",
    ];
    for (const text of instructions) {
      const recipe: RestrictedRecipe = {
        ingredients: [{ name: 'Banana', amount: '1' }],
        blendInstruction: 'Blend for 40 seconds.',
        steps: [{ text }],
      };
      assert.equal(validateRecipeRestrictions(recipe, [], 'Lite').compliant, false, text);
    }
  });

  it('Lite: blendInstruction sem negação na frase continua barrada', () => {
    const instructions = [
      'Adicione o gelo por último e bata.',
      'Troque a água por gelo para ficar mais gelado.',
      'Add the ice last and pulse 5 times.',
      'Serve over ice.',
    ];
    for (const blendInstruction of instructions) {
      const recipe: RestrictedRecipe = {
        ingredients: [{ name: 'Banana', amount: '1' }],
        blendInstruction,
      };
      assert.equal(validateRecipeRestrictions(recipe, [], 'Lite').compliant, false, blendInstruction);
    }
  });

  it('blendInstruction: negação em outra frase não protege o termo', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Não encha demais o copo. Adicione o gelo por último.',
    };
    assert.equal(validateRecipeRestrictions(recipe, [], 'Lite').compliant, false);
  });

  it('Lite: "no gelo" em pt não vira negação (é contração)', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Bata por 40 segundos.',
      steps: [{ text: 'Sirva no gelo.' }],
    };
    assert.equal(validateRecipeRestrictions(recipe, [], 'Lite').compliant, false);
  });
});

describe('validateRecipeRestrictions — onde confere', () => {
  it('confere o texto dos passos', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Blend for 40 seconds.',
      steps: [
        { text: 'Add the banana.' },
        { text: 'Finish with a drizzle of honey.', pulseCount: 2 },
      ],
    };
    const result = validateRecipeRestrictions(recipe, ['vegan'], 'ProPlus');
    assert.deepEqual(result, {
      compliant: false,
      violations: [{ restriction: 'vegan', term: 'honey', field: 'step', index: 1 }],
    });
  });

  it('confere a blendInstruction (gelo no Lite)', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Adicione o gelo por último e bata por 40 segundos.',
    };
    const result = validateRecipeRestrictions(recipe, [], 'Lite');
    assert.deepEqual(result, {
      compliant: false,
      violations: [{ restriction: 'lite_no_ice', term: 'gelo', field: 'blendInstruction' }],
    });
  });

  it('ignora tip e title', () => {
    const recipe = {
      title: 'Peanut butter-free honey ice smoothie',
      tip: 'Troquei a pasta de amendoim e o leite por sementes de girassol; sem mel e sem gelo.',
      ingredients: [{ name: 'Sunflower seeds', amount: '20 g' }],
      blendInstruction: 'Blend for 40 seconds.',
    };
    assert.deepEqual(
      validateRecipeRestrictions(recipe, ['nut_free', 'vegan', 'dairy_free', 'no_added_sugar'], 'Lite'),
      { compliant: true }
    );
  });

  it('não vaza qualificador entre itens separados por vírgula', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Blend.',
      steps: [{ text: 'Adicione a aveia, leite e banana.' }],
    };
    assert.equal(validateRecipeRestrictions(recipe, ['dairy_free'], 'ProPlus').compliant, false);
  });

  it('acumula violações de várias restrições e campos', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [
        { name: 'Almond milk', amount: '240 ml' },
        { name: 'Honey', amount: '1 tbsp' },
        { name: 'Ice cubes', amount: '4' },
      ],
      blendInstruction: 'Blend for 45 seconds.',
    };
    const result = validateRecipeRestrictions(recipe, ['nut_free', 'vegan', 'no_added_sugar'], 'Lite');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    assert.deepEqual(
      summarizeRestrictionViolations(result.violations),
      [
        { restriction: 'nut_free', term: 'almond', field: 'ingredient' },
        { restriction: 'vegan', term: 'honey', field: 'ingredient' },
        { restriction: 'no_added_sugar', term: 'honey', field: 'ingredient' },
        { restriction: 'lite_no_ice', term: 'ice', field: 'ingredient' },
      ]
    );
  });
});

describe('validateRecipeRestrictions — sem restrição', () => {
  const nastyRecipe: RestrictedRecipe = {
    ingredients: [
      { name: 'Peanut butter', amount: '2 tbsp' },
      { name: 'Whole milk', amount: '240 ml' },
      { name: 'Honey', amount: '1 tbsp' },
      { name: 'Ice cubes', amount: '4' },
      { name: 'Egg', amount: '1' },
    ],
    blendInstruction: 'Add ice and blend.',
    steps: [{ text: 'Top with sugar and nuts.' }],
  };

  for (const model of ['ProPlus', 'Steel'] as const) {
    it(`sem dieta e ${model}: sempre conforme`, () => {
      assert.deepEqual(validateRecipeRestrictions(nastyRecipe, [], model), { compliant: true });
      assert.deepEqual(getActiveRecipeRestrictions([], model), []);
    });
  }

  it('Lite sem dieta só aplica o gelo', () => {
    assert.deepEqual(getActiveRecipeRestrictions([], 'Lite'), ['lite_no_ice']);
    const result = validateRecipeRestrictions(nastyRecipe, [], 'Lite');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    assert.ok(result.violations.every(v => v.restriction === 'lite_no_ice'));
  });

  it('ordem fixa das restrições ativas (nut_free primeiro)', () => {
    assert.deepEqual(
      getActiveRecipeRestrictions(['no_added_sugar', 'dairy_free', 'vegan', 'nut_free'], 'Lite'),
      ['nut_free', 'vegan', 'dairy_free', 'no_added_sugar', 'lite_no_ice']
    );
  });
});

describe('buildRecipeRestrictionRetryMessage', () => {
  it('cita o ingrediente, o termo e a restrição, e pede um objeto JSON', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Leite de amêndoas', amount: '200 ml' }],
      blendInstruction: 'Bata.',
      steps: [{ text: 'Adicione gelo.' }],
    };
    const result = validateRecipeRestrictions(recipe, ['nut_free'], 'Lite');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.match(message, /the ingredient "Leite de amêndoas" uses "amendoa", which violates the nut-free restriction/);
    assert.match(message, /step 1 uses "gelo", which violates the no ice/);
    assert.match(message, /single JSON object/);
  });

  it('proteína em pó genérica (vegan): pede a origem vegetal da proteína', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Proteína em pó sabor baunilha', amount: '30 g' }],
      blendInstruction: 'Bata.',
    };
    const result = validateRecipeRestrictions(recipe, ['vegan'], 'ProPlus');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.match(message, /uses "proteina em po", which violates the vegan restriction/);
    assert.match(message, /protein powder must name its plant source/);
    assert.match(message, /pea protein powder/);
    assert.doesNotMatch(message, /nut-free granola/);
  });

  it('granola comum (nut_free): pede granola sem castanhas', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Granola', amount: '30 g' }],
      blendInstruction: 'Blend.',
    };
    const result = validateRecipeRestrictions(recipe, ['nut_free'], 'ProPlus');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.match(message, /uses "granola", which violates the nut-free restriction/);
    assert.match(message, /nut-free granola/);
    assert.match(message, /granola sem castanhas/);
    assert.doesNotMatch(message, /plant source/);
  });

  it('sem proteína em pó nem granola: mensagem sem orientação extra', () => {
    const recipe: RestrictedRecipe = {
      ingredients: [{ name: 'Honey', amount: '1 tbsp' }],
      blendInstruction: 'Blend.',
    };
    const result = validateRecipeRestrictions(recipe, ['vegan'], 'ProPlus');
    assert.equal(result.compliant, false);
    if (result.compliant) return;
    const message = buildRecipeRestrictionRetryMessage(recipe, result.violations);
    assert.doesNotMatch(message, /plant source|nut-free granola/);
  });
});

describe('validateRecipeRestrictions — proteína em pó e granola nos passos', () => {
  it('vegan: passo com proteína em pó genérica é barrado; com origem vegetal passa', () => {
    const base: RestrictedRecipe = {
      ingredients: [{ name: 'Banana', amount: '1' }],
      blendInstruction: 'Blend.',
    };
    const generic = validateRecipeRestrictions(
      { ...base, steps: [{ text: 'Add one scoop of protein powder.' }] },
      ['vegan'],
      'ProPlus'
    );
    assert.equal(generic.compliant, false);

    const plant = validateRecipeRestrictions(
      { ...base, steps: [{ text: 'Adicione um scoop de proteína em pó de ervilha.' }] },
      ['vegan'],
      'ProPlus'
    );
    assert.equal(plant.compliant, true);
  });

  it('dairy_free e nut_free não barram proteína em pó genérica (só vegan)', () => {
    assert.deepEqual(violatedRestrictions('Protein powder', ['dairy_free', 'nut_free']), []);
  });

  it('granola só é barrada para nut_free', () => {
    assert.deepEqual(violatedRestrictions('Granola', ['vegan', 'dairy_free']), []);
  });
});
