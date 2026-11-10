// Paridade en/pt-BR das chaves novas do CP-1.1.1a e a correção de potência
// (Lite 70W, Pro+ 120W, Steel 180W — antes 500W/900W/1400W e badge "Starter").
import en from './en.json';
import ptBR from './pt-BR.json';

type Json = { [key: string]: Json | string };

function leafPaths(node: Json, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leafPaths(value, `${prefix}${key}.`)
  );
}

function get(node: Json, path: string): string {
  const value = path.split('.').reduce<Json | string>((current, key) => (current as Json)[key], node);
  if (typeof value !== 'string') throw new Error(`missing ${path}`);
  return value;
}

describe('locales — chaves novas existem nos dois idiomas, com texto', () => {
  const newKeys = [
    ...leafPaths((en as Json).onboarding as Json, 'onboarding.').filter(
      (path) => /\.(modelOther|modelNone|otherModelPlaceholder)/.test(`.${path.split('.').slice(1).join('.')}`) || path.startsWith('onboarding.diet.')
    ),
    ...leafPaths(((en as Json).me as Json).blenderOwnership as Json, 'me.blenderOwnership.'),
  ];

  it('cobre as chaves esperadas (cards novos, placeholder, tela de dieta e posse no Me)', () => {
    expect(newKeys).toEqual(
      expect.arrayContaining([
        'onboarding.modelOtherTitle',
        'onboarding.modelOtherDesc',
        'onboarding.modelNoneTitle',
        'onboarding.modelNoneDesc',
        'onboarding.otherModelPlaceholder',
        'onboarding.diet.title',
        'onboarding.diet.subtitle',
        'onboarding.diet.dairyFree',
        'onboarding.diet.vegan',
        'onboarding.diet.nutFree',
        'onboarding.diet.noAddedSugar',
        'onboarding.diet.disclaimer',
        'onboarding.diet.continueNoRestrictions',
        'me.blenderOwnership.other',
        'me.blenderOwnership.otherWithName',
        'me.blenderOwnership.none',
      ])
    );
  });

  it.each(newKeys)('%s tem texto em en e pt-BR', (path) => {
    expect(get(en as Json, path).trim().length).toBeGreaterThan(0);
    expect(get(ptBR as Json, path).trim().length).toBeGreaterThan(0);
  });

  it('o placeholder de "outro modelo" em pt-BR é "Ex.: BLENDi antigo, Ninja, NutriBullet"', () => {
    expect(get(ptBR as Json, 'onboarding.otherModelPlaceholder')).toContain('Ex.: BLENDi antigo, Ninja, NutriBullet');
  });

  it('textos de "sem restrições" e do alerta de alergia estão presentes', () => {
    expect(get(ptBR as Json, 'onboarding.diet.continueNoRestrictions')).toBe('Sem restrições');
    expect(get(ptBR as Json, 'onboarding.diet.disclaimer')).toBe(
      'São preferências, não uma garantia para alergias. Sempre confira os ingredientes.'
    );
    expect(get(en as Json, 'onboarding.diet.disclaimer')).toMatch(/not a guarantee for allergies/i);
  });

  it('{{name}} existe no texto do Me com nome nos dois idiomas', () => {
    expect(get(en as Json, 'me.blenderOwnership.otherWithName')).toContain('{{name}}');
    expect(get(ptBR as Json, 'me.blenderOwnership.otherWithName')).toContain('{{name}}');
  });
});

describe('locales — potência dos modelos', () => {
  const expected: Array<[string, string]> = [
    ['onboarding.modelLiteDesc', '70W'],
    ['onboarding.modelProDesc', '120W'],
    ['onboarding.modelSteelDesc', '180W'],
  ];

  it.each(expected)('%s começa com %s nos dois idiomas, mantendo o resto do texto', (path, watts) => {
    expect(get(en as Json, path).startsWith(`${watts} — `)).toBe(true);
    expect(get(ptBR as Json, path).startsWith(`${watts} — `)).toBe(true);
  });

  it('nenhum texto do app cita as potências antigas (500W/900W/1400W) nem "Starter"', () => {
    for (const locale of [en as Json, ptBR as Json]) {
      for (const path of leafPaths(locale)) {
        const text = get(locale, path);
        expect(text).not.toMatch(/\b(500|900|1400)\s?W\b/);
        expect(text).not.toMatch(/\bStarter\b/);
      }
    }
  });
});

// CP-1.1.1b, Tarefa 7 — a regra do prompt da Pulse AI proíbe QUALQUER laticínio
// (inclusive leite sem lactose), então o rótulo não pode sugerir que "sem
// lactose" basta. Só o pt-BR mudou; "Dairy-free" do en já estava certo.
describe('locales — dieta sem laticínios', () => {
  it('pt-BR: "Sem laticínios" (não mais "Sem lactose e laticínios")', () => {
    expect(get(ptBR as Json, 'onboarding.diet.dairyFree')).toBe('Sem laticínios');
    expect(JSON.stringify(ptBR)).not.toContain('Sem lactose');
  });

  it('en: continua "Dairy-free"', () => {
    expect(get(en as Json, 'onboarding.diet.dairyFree')).toBe('Dairy-free');
  });

  it('a descrição segue coerente com o rótulo: leite, iogurte, queijo e whey (sem ressalva de lactose)', () => {
    expect(get(ptBR as Json, 'onboarding.diet.dairyFreeDesc')).toBe('Sem leite, iogurte, queijo ou whey');
    expect(get(ptBR as Json, 'onboarding.diet.dairyFreeDesc')).not.toMatch(/lactose/i);
    expect(get(en as Json, 'onboarding.diet.dairyFreeDesc')).toBe('No milk, yogurt, cheese or whey');
  });
});

// CP-1.1.1b — as chaves das 4 linhas que saíram do Me não ficam órfãs, e as da
// tela "Minhas metas" existem nos dois idiomas com o mesmo conjunto de chaves.
describe('locales — Minhas metas', () => {
  it('en e pt-BR têm exatamente as mesmas chaves em nutritionGoals', () => {
    expect(leafPaths((ptBR as Json).nutritionGoals as Json).sort()).toEqual(
      leafPaths((en as Json).nutritionGoals as Json).sort()
    );
  });

  it('as chaves das linhas removidas do Me saíram dos dois idiomas', () => {
    for (const locale of [en as Json, ptBR as Json]) {
      const paths = leafPaths(locale);
      for (const orphan of [
        'me.settingCarbs',
        'me.edit.proteinTitle',
        'me.edit.carbsTitle',
        'me.edit.caloriesTitle',
        'me.edit.hydrationTitle',
        'profile.fields.protein_target',
        'profile.fields.calories_target',
      ]) {
        expect(paths).not.toContain(orphan);
      }
      // A gordura continua (linha comentada no Me, mas existente).
      expect(paths).toContain('me.edit.fatTitle');
      expect(paths).toContain('profile.fields.fat_target');
    }
  });

  it('nenhum texto novo é string vazia e os avisos não têm tom de alarme (sem "!")', () => {
    for (const locale of [en as Json, ptBR as Json]) {
      for (const path of leafPaths(locale.nutritionGoals as Json, 'nutritionGoals.')) {
        const text = get(locale, path);
        expect(text.trim().length).toBeGreaterThan(0);
        if (path.startsWith('nutritionGoals.warnings.')) {
          expect(text).not.toContain('!');
        }
      }
    }
  });
});
