// CP-B6 — famílias de alérgenos: cada código em en e pt-BR, leite × lactose,
// bebidas vegetais, coco, noz-moscada, aveia (não bloqueada + aviso), campo
// livre (vocabulário e texto próprio), o que NOMEIA × o que só IMPLICA
// (prato) e a negação ("sem amendoim").
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALLERGY_CODE_VALUES, type AllergyCode, type UserAllergies } from '@blendi/shared';

import {
  ALLERGEN_DISHES,
  allergyCacheParts,
  buildAllergyRestrictions,
  findAllergensInName,
  findImpliedAllergenDish,
  findNamedAllergens,
  needsGlutenFreeOatsNotice,
  resolveAllergyRequest,
} from './allergyFamilies.utils';
import { summarizeRestrictionViolations, validateRecipeRestrictions } from './recipeRestrictions.utils';

const ALL: UserAllergies = { common: [...ALLERGY_CODE_VALUES], custom: [] };

function codesIn(name: string, profile: UserAllergies = ALL): AllergyCode[] {
  return findAllergensInName(name, profile).common;
}

function blocks(name: string, code: AllergyCode): boolean {
  return codesIn(name, { common: [code], custom: [] }).includes(code);
}

function table(code: AllergyCode, cases: Array<[string, boolean]>) {
  for (const [name, expected] of cases) {
    it(`${expected ? 'barra' : 'permite'} "${name}"`, () => {
      assert.equal(blocks(name, code), expected, `${code}: "${name}"`);
    });
  }
}

describe('CP-B6 — famílias, código a código (en e pt-BR)', () => {
  describe('peanut', () => table('peanut', [
    ['Pasta de amendoim', true],
    ['Peanut butter', true],
    ['Amendoins torrados', true],
    ['Paçoca', true],
    ['Óleo de amendoim', true],
    ['Mixed nuts', true],
    ['Granola', true],
    ['Granola sem amendoim', false],
    ['Pasta de semente de girassol', false],
    ['Leite de amêndoas', false],
  ]));

  describe('tree_nuts', () => table('tree_nuts', [
    ['Leite de amêndoas', true],
    ['Almond butter', true],
    ['Castanha de caju', true],
    ['Castanha-do-pará', true],
    ['Nozes', true],
    ['Noz-pecã', true],
    ['Avelã', true],
    ['Pistachios', true],
    ['Macadâmia', true],
    ['Baru', true],
    ['Creme de avelã', true],
    ['Pesto', true],
    ['Granola', true],
    ['Nut-free granola', false],
    // Falsos amigos: coco, noz-moscada, caju (fruta), castanha-d'água.
    ['Leite de coco', false],
    ['Coconut cream', false],
    ['Coco ralado', false],
    ['Noz-de-coco', false],
    ['Noz-moscada', false],
    ['Nutmeg', false],
    ['Suco de caju', false],
    ['Water chestnut', false],
    ['Pasta de amendoim', false],
  ]));

  describe('milk (alergia à proteína: "sem lactose" ainda é leite)', () => table('milk', [
    ['Leite integral', true],
    ['Leite sem lactose', true],
    ['Lactose-free milk', true],
    ['Whey protein isolate', true],
    ['Whey concentrado', true],
    ['Caseína', true],
    ['Iogurte grego', true],
    ['Queijo parmesão', true],
    ['Requeijão', true],
    ['Manteiga', true],
    ['Ghee', true],
    ['Creme de leite', true],
    ['Nata', true],
    ['Chantilly', true],
    ['Sorvete de creme', true],
    ['Doce de leite', true],
    ['Leite condensado', true],
    ['Leite em pó', true],
    ['Kefir', true],
    ['Proteína em pó', true],
    // Bebidas vegetais e "manteiga" vegetal não são leite.
    ['Leite de aveia', false],
    ['Leite de amêndoas', false],
    ['Leite de coco', false],
    ['Leite de soja', false],
    ['Bebida vegetal de arroz', false],
    ['Oat milk', false],
    ['Manteiga de cacau', false],
    ['Pasta de amendoim', false],
    ['Kefir de água', false],
    ['Sorvete vegano', false],
    ['Proteína vegetal de ervilha', false],
    ['Egg white protein powder', false],
  ]));

  describe('lactose (lista documentada)', () => table('lactose', [
    ['Leite integral', true],
    ['Iogurte natural', true],
    ['Sorvete', true],
    ['Ricota', true],
    ['Cottage', true],
    ['Cream cheese', true],
    ['Requeijão', true],
    ['Creme de leite', true],
    ['Doce de leite', true],
    ['Leite condensado', true],
    ['Leite em pó', true],
    ['Whey concentrado', true],
    ['Queijo', true],
    // Liberados.
    ['Leite sem lactose', false],
    ['Leite zero lactose', false],
    ['Lactose-free milk', false],
    ['Iogurte grego zero lactose', false],
    ['Leite em pó desnatado sem lactose', false],
    ['Whey protein isolate', false],
    ['Proteína whey isolada', false],
    ['Queijo parmesão', false],
    ['Parmesan cheese', false],
    ['Manteiga', false],
    ['Ghee', false],
    ['Leite de aveia', false],
    // "e" separa os itens: o "sem lactose" do iogurte não libera o leite.
    ['Leite integral e iogurte sem lactose', true],
  ]));

  describe('soy', () => table('soy', [
    ['Leite de soja', true],
    ['Bebida de soja', true],
    ['Tofu', true],
    ['Proteína de soja', true],
    ['Edamame', true],
    ['Missô', true],
    ['Soy lecithin', true],
    ['Shoyu', true],
    ['Leite de aveia', false],
    ['Proteína de ervilha', false],
  ]));

  describe('wheat_gluten (aveia NÃO bloqueia)', () => table('wheat_gluten', [
    ['Farinha de trigo', true],
    ['Farelo de trigo', true],
    ['Gérmen de trigo', true],
    ['Wheat germ', true],
    ['Cevada', true],
    ['Centeio', true],
    ['Malte', true],
    ['Granola', true],
    ['Cereal matinal', true],
    ['Corn flakes', true],
    ['Flocos de milho', true],
    ['Muesli', true],
    ['Cuscuz marroquino', true],
    ['Biscoito maisena', true],
    ['Pão', true],
    ['Granola sem glúten', false],
    ['Cereal matinal sem glúten', false],
    ['Pão de queijo', false],
    ['Aveia em flocos', false],
    ['Farelo de aveia', false],
    ['Farinha de aveia', false],
    ['Oat milk', false],
    ['Trigo sarraceno', false],
    ['Buckwheat', false],
    ['Farinha de arroz', false],
  ]));

  describe('sesame', () => table('sesame', [
    ['Gergelim', true],
    ['Tahine', true],
    ['Tahini', true],
    ['Óleo de gergelim', true],
    ['Sesame seeds', true],
    ['Halva', true],
    ['Chia', false],
    ['Semente de girassol', false],
  ]));

  describe('egg', () => table('egg', [
    ['Ovo', true],
    ['Clara de ovo', true],
    ['Gema', true],
    ['Egg white', true],
    ['Eggnog', true],
    ['Merengue', true],
    ['Albumina', true],
    ['Eggplant', false],
    ['Colágeno', false],
  ]));
});

describe('CP-B6 — campo livre', () => {
  it('item do vocabulário: sinônimos en/pt e plural ("morango" pega "Strawberries")', () => {
    const profile: UserAllergies = { common: [], custom: ['morango'] };
    assert.deepEqual(findAllergensInName('Strawberries', profile).custom, ['morango']);
    assert.deepEqual(findAllergensInName('Morangos frescos', profile).custom, ['morango']);
    assert.deepEqual(findAllergensInName('Banana', profile).custom, []);
  });

  it('"kiwi" bloqueia kiwi/kiwis em qualquer idioma', () => {
    const profile: UserAllergies = { common: [], custom: ['kiwi'] };
    assert.deepEqual(findAllergensInName('2 kiwis', profile).custom, ['kiwi']);
    assert.deepEqual(findAllergensInName('Kiwifruit', profile).custom, ['kiwi']);
  });

  it('fora do vocabulário: o próprio texto normalizado (acento e plural)', () => {
    const profile: UserAllergies = { common: [], custom: ['camarão'] };
    assert.deepEqual(findAllergensInName('Camarões cozidos', profile).custom, ['camarão']);
    assert.deepEqual(findAllergensInName('Camarao', profile).custom, ['camarão']);
  });

  it('o grupo respeita os "não é ele": alergia a caju (fruta) não pega castanha de caju', () => {
    const profile: UserAllergies = { common: [], custom: ['caju'] };
    assert.deepEqual(findAllergensInName('Suco de caju', profile).custom, ['caju']);
    assert.deepEqual(findAllergensInName('Castanha de caju', profile).custom, []);
  });
});

describe('CP-B6 — o que a mensagem nomeia × o que só implica', () => {
  it('nomeia: termo da família sem negação; "sem amendoim" não conta', () => {
    assert.deepEqual(findNamedAllergens('shake com amendoim', ALL).named.common, ['peanut']);
    assert.deepEqual(findNamedAllergens('shake sem amendoim', ALL).named.common, []);
    assert.deepEqual(findNamedAllergens('shake sem amendoim', ALL).negated.common, ['peanut']);
    assert.deepEqual(findNamedAllergens('peanut-free shake', ALL).named.common, []);
    assert.deepEqual(findNamedAllergens('smoothie com leite de aveia', ALL).named.common, []);
  });

  it('prato não nomeia: "paçoca", "doce de leite", "creme de avelã" e "tahine" são implícitos', () => {
    for (const message of ['shake de paçoca', 'shake de doce de leite', 'smoothie com creme de avelã', 'shake de tahine']) {
      assert.deepEqual(findNamedAllergens(message, ALL).named, { common: [], custom: [] }, message);
    }
    const empty = { common: [], custom: [] };
    assert.deepEqual(findImpliedAllergenDish('shake de paçoca', ALL, empty, 'pt-BR'), { dish: 'Paçoca', allergens: ['peanut'] });
    assert.deepEqual(findImpliedAllergenDish('hazelnut spread smoothie', ALL, empty, 'en'), {
      dish: 'Hazelnut spread',
      allergens: ['tree_nuts', 'milk'],
    });
    assert.deepEqual(findImpliedAllergenDish('shake de tahine', ALL, empty, 'pt-BR'), { dish: 'Tahine', allergens: ['sesame'] });
    assert.deepEqual(findImpliedAllergenDish('eggnog shake', ALL, empty, 'en'), { dish: 'Eggnog', allergens: ['egg'] });
  });

  it('sem sugestão quando o alérgeno foi nomeado, negado ou não está cadastrado', () => {
    assert.equal(resolveAllergyRequest({ profile: ALL, text: 'paçoca sem amendoim', language: 'pt-BR' }).suggestion, null);
    assert.equal(
      resolveAllergyRequest({ profile: { common: ['milk'], custom: [] }, text: 'shake de paçoca', language: 'pt-BR' }).suggestion,
      null
    );
  });

  it('granola só bloqueia: não nomeia nem implica', () => {
    const resolution = resolveAllergyRequest({ profile: ALL, text: 'shake com granola', language: 'pt-BR' });
    assert.deepEqual(resolution.unresolved, { common: [], custom: [] });
    assert.equal(resolution.suggestion, null);
  });

  it('a tabela de pratos só usa códigos válidos e cada prato está na família dos seus alérgenos', () => {
    for (const dish of ALLERGEN_DISHES) {
      for (const code of dish.allergens) {
        assert.ok(ALLERGY_CODE_VALUES.includes(code));
        assert.ok(blocks(dish.phrases[0], code), `${dish.phrases[0]} × ${code}`);
      }
    }
  });
});

describe('CP-B6 — resolução do pedido', () => {
  const PEANUT: UserAllergies = { common: ['peanut'], custom: [] };

  it('só confirma o que foi citado E está cadastrado', () => {
    const resolution = resolveAllergyRequest({
      profile: { common: ['peanut', 'egg'], custom: [] },
      text: 'shake com amendoim',
      override: { common: ['peanut', 'egg', 'soy'], custom: ['kiwi'] },
      language: 'pt-BR',
    });
    assert.deepEqual(resolution.confirmed, { common: ['peanut'], custom: [] });
    assert.deepEqual(resolution.unresolved, { common: [], custom: [] });
    const overridden = resolution.restrictions.filter(restriction => restriction.overridden).map(restriction => restriction.key);
    assert.deepEqual(overridden, ['peanut']);
  });

  it('recusado: sai da pendência e fica proibido', () => {
    const resolution = resolveAllergyRequest({
      profile: PEANUT,
      text: 'shake com amendoim',
      declined: { common: ['peanut'], custom: [] },
      language: 'pt-BR',
    });
    assert.deepEqual(resolution.unresolved, { common: [], custom: [] });
    assert.deepEqual(resolution.declined, { common: ['peanut'], custom: [] });
    assert.equal(resolution.restrictions[0].overridden, false);
  });

  it('item escolhido (Pantry) pode ser confirmado; sem confirmação fica pendente', () => {
    const chosen = { common: ['peanut' as const], custom: [] };
    assert.deepEqual(resolveAllergyRequest({ profile: PEANUT, text: '', chosen, language: 'en' }).unresolved, chosen);
    assert.deepEqual(
      resolveAllergyRequest({ profile: PEANUT, text: '', chosen, override: chosen, language: 'en' }).confirmed,
      chosen
    );
  });

  it('a chave do cache muda com a resposta da folha e com as alergias; vazia sem alergia', () => {
    const empty = { common: [], custom: [] };
    assert.deepEqual(allergyCacheParts({ profile: empty, confirmed: empty, declined: empty }), []);
    const base = allergyCacheParts({ profile: PEANUT, confirmed: empty, declined: empty });
    const confirmed = allergyCacheParts({ profile: PEANUT, confirmed: PEANUT, declined: empty });
    const declined = allergyCacheParts({ profile: PEANUT, confirmed: empty, declined: PEANUT });
    assert.notDeepEqual(base, confirmed);
    assert.notDeepEqual(base, declined);
    assert.notDeepEqual(confirmed, declined);
  });
});

describe('CP-B6 — validador', () => {
  const recipe = (names: string[], extra: Record<string, string> = {}) => ({
    ingredients: names.map(name => ({ name, amount: '1' })),
    steps: [{ text: 'Bata tudo.' }],
    blendInstruction: 'Bata por 30 segundos.',
    ...extra,
  });

  it('alérgeno é proibido e NÃO furável pelo explicitRequest', () => {
    const result = validateRecipeRestrictions(recipe(['Pasta de amendoim']), [], 'ProPlus', {
      explicitRequest: 'shake com pasta de amendoim',
      allergies: buildAllergyRestrictions({ common: ['peanut'], custom: [] }),
    });
    assert.equal(result.compliant, false);
  });

  it('só a confirmação libera, e devolve o alérgeno que de fato entrou', () => {
    const result = validateRecipeRestrictions(recipe(['Banana', 'Pasta de amendoim']), [], 'ProPlus', {
      allergies: buildAllergyRestrictions({ common: ['peanut', 'egg'], custom: [] }, { common: ['peanut'], custom: [] }),
    });
    assert.deepEqual(result, { compliant: true, allergyOverrideKeys: ['peanut'] });
  });

  it('a dica e os passos também são conferidos (com negação por frase na dica)', () => {
    const allergies = buildAllergyRestrictions({ common: ['peanut'], custom: [] });
    assert.equal(
      validateRecipeRestrictions(recipe(['Banana'], { tip: 'Adicione pasta de amendoim.' }), [], 'ProPlus', { allergies }).compliant,
      false
    );
    assert.equal(
      validateRecipeRestrictions(recipe(['Banana'], { tip: 'Usei girassol em vez de amendoim.' }), [], 'ProPlus', { allergies }).compliant,
      true
    );
  });

  it('o resumo para log da violação de alergia não leva o termo', () => {
    const result = validateRecipeRestrictions(recipe(['Pasta de amendoim']), [], 'ProPlus', {
      allergies: buildAllergyRestrictions({ common: ['peanut'], custom: ['kiwi'] }),
    });
    assert.equal(result.compliant, false);
    if (!result.compliant) {
      const summary = JSON.stringify(summarizeRestrictionViolations(result.violations));
      assert.doesNotMatch(summary, /amendoim|peanut|kiwi/);
      assert.match(summary, /"allergy"/);
    }
  });

  it('aveia com alergia a trigo/glúten: permitida, com o aviso', () => {
    const profile: UserAllergies = { common: ['wheat_gluten'], custom: [] };
    const allergies = buildAllergyRestrictions(profile);
    assert.equal(validateRecipeRestrictions(recipe(['Aveia em flocos', 'Banana']), [], 'ProPlus', { allergies }).compliant, true);
    assert.equal(needsGlutenFreeOatsNotice(recipe(['Aveia em flocos']), profile), true);
    assert.equal(needsGlutenFreeOatsNotice(recipe(['Farelo de aveia']), profile), true);
    assert.equal(needsGlutenFreeOatsNotice(recipe(['Banana']), profile), false);
    assert.equal(needsGlutenFreeOatsNotice(recipe(['Aveia em flocos']), { common: ['milk'], custom: [] }), false);
  });
});

describe('CP-B6 — chocolate × leite e lactose (correção antes do commit)', () => {
  const BLOCKED = [
    'Chocolate', 'Chocolate em pó', 'Chocolate powder', 'Milk chocolate', 'Chocolate ao leite',
    'Chocolate branco', 'White chocolate', 'Achocolatado', 'Hot chocolate mix', 'Chocolate drink mix',
    'Hot cocoa mix', 'Gotas de chocolate', 'Chocolate chips', 'Calda de chocolate', 'Chocolate syrup',
    'Chocolate meio amargo', 'Semisweet chocolate', 'Nescau', 'Bombom', 'Trufa de chocolate', 'Ganache',
  ];
  const FREE = [
    'Cacau', 'Cacau em pó', 'Cacao', 'Cocoa powder', 'Nibs de cacau', 'Cacao nibs', 'Chocolate amargo',
    'Dark chocolate', 'Chocolate 70%', 'Chocolate 85% cacau', '70% dark chocolate', 'Chocolate vegano',
    'Vegan chocolate', 'Chocolate sem leite', 'Dairy-free chocolate', 'Unsweetened chocolate',
  ];

  for (const code of ['milk', 'lactose'] as const) {
    it(`${code}: chocolate com leite provável bloqueia`, () => {
      assert.deepEqual(BLOCKED.filter(name => !blocks(name, code)), []);
    });
    it(`${code}: cacau, amargo, ≥ 70%, vegano e sem leite não bloqueiam`, () => {
      assert.deepEqual(FREE.filter(name => blocks(name, code)), []);
    });
  }

  it('"sem lactose" libera só a lactose', () => {
    assert.equal(blocks('Chocolate sem lactose', 'lactose'), false);
    assert.equal(blocks('Lactose-free chocolate', 'lactose'), false);
    assert.equal(blocks('Chocolate sem lactose', 'milk'), true);
  });

  it('chocolate não nomeia nem implica o alérgeno (sem confirmação, sem sugestão); "leite"/"milk" nomeiam', () => {
    const milk: UserAllergies = { common: ['milk'], custom: [] };
    const resolution = resolveAllergyRequest({ profile: milk, text: 'shake sabor chocolate', language: 'pt-BR' });
    assert.deepEqual(resolution.unresolved, { common: [], custom: [] });
    assert.equal(resolution.suggestion, null);
    assert.deepEqual(findNamedAllergens('shake com chocolate ao leite', milk).named.common, ['milk']);
    assert.deepEqual(findNamedAllergens('milk chocolate shake', milk).named.common, ['milk']);
  });

  it('título "Shake de chocolate" passa; ingrediente "Chocolate" não', () => {
    const allergies = buildAllergyRestrictions({ common: ['milk'], custom: [] });
    const base = { steps: [{ text: 'Bata tudo.' }], blendInstruction: 'Bata por 30 segundos.', title: 'Shake de chocolate' };
    assert.equal(validateRecipeRestrictions({ ...base, ingredients: [{ name: 'Cacau em pó', amount: '1 colher' }] }, [], 'ProPlus', { allergies }).compliant, true);
    assert.equal(validateRecipeRestrictions({ ...base, ingredients: [{ name: 'Chocolate', amount: '20 g' }] }, [], 'ProPlus', { allergies }).compliant, false);
  });

  // CP-B6b mudou de propósito a parte das preferências: vegan e dairy_free
  // também barram "Chocolate" (testes em recipeRestrictions.cpB6b.test.ts).
  it('sem alergia nem preferência, nada muda', () => {
    const recipe = { ingredients: [{ name: 'Chocolate', amount: '20 g' }], steps: [], blendInstruction: 'Bata.' };
    assert.equal(validateRecipeRestrictions(recipe, [], 'ProPlus').compliant, true);
    assert.equal(validateRecipeRestrictions(recipe, ['nut_free', 'no_added_sugar'], 'ProPlus').compliant, true);
  });
});
