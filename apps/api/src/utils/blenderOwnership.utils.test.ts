// Onboarding Additions — validação dos 3 campos novos do usuário
// (blendiOwnership, otherBlenderModel, dietaryPreferences) no Zod
// (updateUserSchema) e no Mongoose (UserModel.validateSync, sem MongoDB), e
// as 3 regras de coerência de resolveBlenderOwnershipUpdates.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { updateUserSchema } from '@blendi/shared';

import { UserModel } from '../models/User';
import { resolveBlenderOwnershipUpdates } from './blenderOwnership.utils';

function buildValidUserDoc(overrides: Record<string, unknown> = {}) {
  return new UserModel({
    email: 'fields@example.com',
    name: 'Fields Test',
    blendiModel: 'Lite',
    goal: 'Wellness',
    weightGoal: 'maintain',
    dailyProteinTarget: 150,
    dailyCalorieTarget: 2000,
    birthDate: new Date('1990-01-01'),
    biologicalSex: 'male',
    activityLevel: 'moderatelyActive',
    ...overrides,
  });
}

describe('updateUserSchema — campos novos', () => {
  it('aceita os 3 valores de blendiOwnership e rejeita outro', () => {
    for (const value of ['blendi', 'other', 'none']) {
      assert.equal(updateUserSchema.safeParse({ blendiOwnership: value }).success, true);
    }

    const invalid = updateUserSchema.safeParse({ blendiOwnership: 'ninja' });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error?.issues[0]?.message, 'errors.validation.invalid_option');
  });

  it('otherBlenderModel: faz trim, aceita 60 caracteres e rejeita 61', () => {
    const trimmed = updateUserSchema.safeParse({ otherBlenderModel: '  Ninja BN401  ' });
    assert.equal(trimmed.success, true);
    assert.equal(trimmed.data?.otherBlenderModel, 'Ninja BN401');

    assert.equal(updateUserSchema.safeParse({ otherBlenderModel: 'a'.repeat(60) }).success, true);
    // Espaços nas pontas não contam para o limite (trim antes do max).
    assert.equal(updateUserSchema.safeParse({ otherBlenderModel: ` ${'a'.repeat(60)} ` }).success, true);

    const tooLong = updateUserSchema.safeParse({ otherBlenderModel: 'a'.repeat(61) });
    assert.equal(tooLong.success, false);
    assert.equal(tooLong.error?.issues[0]?.message, 'errors.validation.too_long');
  });

  it('dietaryPreferences: aceita lista vazia e todos os valores válidos', () => {
    const empty = updateUserSchema.safeParse({ dietaryPreferences: [] });
    assert.equal(empty.success, true);
    assert.deepEqual(empty.data?.dietaryPreferences, []);

    const all = updateUserSchema.safeParse({
      dietaryPreferences: ['dairy_free', 'vegan', 'nut_free', 'no_added_sugar'],
    });
    assert.equal(all.success, true);
    assert.deepEqual(all.data?.dietaryPreferences, ['dairy_free', 'vegan', 'nut_free', 'no_added_sugar']);
  });

  it('dietaryPreferences: rejeita valor fora da lista', () => {
    const invalid = updateUserSchema.safeParse({ dietaryPreferences: ['vegan', 'keto'] });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error?.issues[0]?.message, 'errors.validation.invalid_option');

    assert.equal(updateUserSchema.safeParse({ dietaryPreferences: 'vegan' }).success, false);
  });

  it('otherBlenderModel: caracteres de controle e bidi viram espaço; ZWJ de emoji composto é preservado (X01)', () => {
    const parsed = updateUserSchema.safeParse({ otherBlenderModel: 'A\u0000B\nC\t\u202Eevil  ' });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.otherBlenderModel, 'A B C evil');

    const emoji = updateUserSchema.safeParse({ otherBlenderModel: '👨\u200D👩\u200D👧 Ninja' });
    assert.equal(emoji.data?.otherBlenderModel, '👨\u200D👩\u200D👧 Ninja');

    // Só controle/espaço vira vazio (= "limpar"), não erro.
    assert.equal(updateUserSchema.safeParse({ otherBlenderModel: '\n\t ' }).data?.otherBlenderModel, '');
  });

  it('dietaryPreferences: teto de 16 itens, estourado gera 1 issue só (sem amplificação — D03)', () => {
    assert.equal(updateUserSchema.safeParse({ dietaryPreferences: Array(16).fill('vegan') }).success, true);

    const tooMany = updateUserSchema.safeParse({ dietaryPreferences: Array(17).fill('vegan') });
    assert.equal(tooMany.success, false);

    const huge = updateUserSchema.safeParse({ dietaryPreferences: Array(4000).fill('x') });
    assert.equal(huge.success, false);
    assert.equal(huge.error?.issues.length, 1);
    assert.equal(huge.error?.issues[0]?.message, 'errors.validation.invalid_option');
  });

  it('dietaryPreferences: remove duplicados mantendo a ordem', () => {
    const parsed = updateUserSchema.safeParse({
      dietaryPreferences: ['vegan', 'nut_free', 'vegan', 'nut_free'],
    });
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data?.dietaryPreferences, ['vegan', 'nut_free']);
  });
});

describe('UserModel — campos novos', () => {
  it('conta sem os campos lê os defaults (blendi, lista vazia, sem texto)', () => {
    const user = buildValidUserDoc();
    assert.equal(user.validateSync(), undefined);
    assert.equal(user.blendiOwnership, 'blendi');
    assert.deepEqual([...user.dietaryPreferences], []);
    assert.equal(user.otherBlenderModel, undefined);
  });

  it('rejeita blendiOwnership inválido', () => {
    const error = buildValidUserDoc({ blendiOwnership: 'ninja' }).validateSync();
    assert.ok(error?.errors.blendiOwnership);
  });

  it('otherBlenderModel: trim e limite de 60 caracteres', () => {
    const ok = buildValidUserDoc({ blendiOwnership: 'other', otherBlenderModel: `  ${'b'.repeat(60)}  ` });
    assert.equal(ok.validateSync(), undefined);
    assert.equal(ok.otherBlenderModel, 'b'.repeat(60));

    const tooLong = buildValidUserDoc({ otherBlenderModel: 'b'.repeat(61) }).validateSync();
    assert.equal(tooLong?.errors.otherBlenderModel?.message, 'errors.validation.too_long');
  });

  it('dietaryPreferences: rejeita valor inválido e duplicado', () => {
    const invalid = buildValidUserDoc({ dietaryPreferences: ['vegan', 'keto'] }).validateSync();
    assert.ok(invalid);

    const duplicated = buildValidUserDoc({ dietaryPreferences: ['vegan', 'vegan'] }).validateSync();
    assert.equal(duplicated?.errors.dietaryPreferences?.message, 'errors.validation.invalid_option');

    assert.equal(buildValidUserDoc({ dietaryPreferences: ['vegan', 'nut_free'] }).validateSync(), undefined);
  });
});

describe('resolveBlenderOwnershipUpdates — regras de coerência', () => {
  it('regra 1: posse "none" grava Lite mesmo com outro modelo no PATCH, e limpa o texto', () => {
    const result = resolveBlenderOwnershipUpdates(
      { blendiOwnership: 'none', blendiModel: 'Steel', otherBlenderModel: 'Ninja' },
      'blendi'
    );
    assert.deepEqual(result.set, { blendiOwnership: 'none', blendiModel: 'Lite' });
    assert.equal(result.unsetOtherBlenderModel, true);
  });

  it('regra 1: posse "other" grava Lite mesmo com outro modelo no PATCH, e guarda o texto', () => {
    const result = resolveBlenderOwnershipUpdates(
      { blendiOwnership: 'other', blendiModel: 'ProPlus', otherBlenderModel: '  NutriBullet  ' },
      'blendi'
    );
    assert.deepEqual(result.set, {
      blendiOwnership: 'other',
      blendiModel: 'Lite',
      otherBlenderModel: 'NutriBullet',
    });
    assert.equal(result.unsetOtherBlenderModel, false);
  });

  it('posse "other" sem texto mantém o texto salvo; com texto vazio, limpa', () => {
    const withoutText = resolveBlenderOwnershipUpdates({ blendiOwnership: 'other' }, 'other');
    assert.deepEqual(withoutText.set, { blendiOwnership: 'other', blendiModel: 'Lite' });
    assert.equal(withoutText.unsetOtherBlenderModel, false);

    const emptyText = resolveBlenderOwnershipUpdates(
      { blendiOwnership: 'other', otherBlenderModel: '   ' },
      'other'
    );
    assert.equal(emptyText.set.otherBlenderModel, undefined);
    assert.equal(emptyText.unsetOtherBlenderModel, true);
  });

  it('regra 2: posse "blendi" limpa otherBlenderModel, mesmo que venha texto', () => {
    const result = resolveBlenderOwnershipUpdates(
      { blendiOwnership: 'blendi', blendiModel: 'Steel', otherBlenderModel: 'Ninja' },
      'other'
    );
    assert.deepEqual(result.set, { blendiOwnership: 'blendi', blendiModel: 'Steel' });
    assert.equal(result.unsetOtherBlenderModel, true);
  });

  it('regra 3: só blendiModel no PATCH volta a posse para "blendi" e limpa o texto', () => {
    const result = resolveBlenderOwnershipUpdates({ blendiModel: 'ProPlus' }, 'none');
    assert.deepEqual(result.set, { blendiOwnership: 'blendi', blendiModel: 'ProPlus' });
    assert.equal(result.unsetOtherBlenderModel, true);
  });

  it('PATCH sem nenhum dos 3 campos não toca em nada', () => {
    const result = resolveBlenderOwnershipUpdates({}, 'other');
    assert.deepEqual(result.set, {});
    assert.equal(result.unsetOtherBlenderModel, false);
  });

  it('só otherBlenderModel: vira escrita condicional se a posse salva é "other", ignora caso contrário', () => {
    const asOther = resolveBlenderOwnershipUpdates({ otherBlenderModel: 'Oster' }, 'other');
    // Fora do $set principal: precisa de filtro atômico no banco (RACE01).
    assert.deepEqual(asOther.set, {});
    assert.deepEqual(asOther.onlyIfOwnershipIsOther, { otherBlenderModel: 'Oster' });

    const asBlendi = resolveBlenderOwnershipUpdates({ otherBlenderModel: 'Oster' }, 'blendi');
    assert.deepEqual(asBlendi.set, {});
    assert.equal(asBlendi.onlyIfOwnershipIsOther, undefined);
    assert.equal(asBlendi.unsetOtherBlenderModel, false);
  });
});

// ─── Verificação exaustiva (modelo do banco em memória) ──────────────────────
// Estados válidos × todos os PATCHes possíveis × todos os pares de requisições
// concorrentes × todos os intercalamentos das operações atômicas de cada uma.
// Cada requisição lê a posse ANTES (do estado inicial), como o controller faz.

type OwnershipState = { own: 'blendi' | 'other' | 'none'; model: 'Lite' | 'ProPlus' | 'Steel'; text?: string };
type PatchCase = Parameters<typeof resolveBlenderOwnershipUpdates>[0];
type AtomicOp = (state: OwnershipState) => OwnershipState;

function isValidState(state: OwnershipState): boolean {
  if ((state.own === 'other' || state.own === 'none') && state.model !== 'Lite') return false;
  if ((state.own === 'blendi' || state.own === 'none') && state.text !== undefined) return false;
  return true;
}

// Operações atômicas na ordem em que o controller as emite: (1) escrita
// condicional de texto-solo, se houver; (2) update principal ($set + $unset).
function toAtomicOps(patch: PatchCase, readOwnership: OwnershipState['own']): AtomicOp[] {
  const result = resolveBlenderOwnershipUpdates(patch, readOwnership);
  const ops: AtomicOp[] = [];

  if (result.onlyIfOwnershipIsOther) {
    const { otherBlenderModel } = result.onlyIfOwnershipIsOther;
    ops.push(state => (state.own === 'other' ? { ...state, text: otherBlenderModel } : state));
  }

  ops.push(state => {
    const next = { ...state };
    if (result.set.blendiOwnership !== undefined) next.own = result.set.blendiOwnership;
    if (result.set.blendiModel !== undefined) next.model = result.set.blendiModel;
    if (result.set.otherBlenderModel !== undefined) next.text = result.set.otherBlenderModel;
    if (result.unsetOtherBlenderModel) delete next.text;
    return next;
  });

  return ops;
}

function interleavings(a: AtomicOp[], b: AtomicOp[]): AtomicOp[][] {
  if (a.length === 0) return [b];
  if (b.length === 0) return [a];
  return [
    ...interleavings(a.slice(1), b).map(rest => [a[0] as AtomicOp, ...rest]),
    ...interleavings(a, b.slice(1)).map(rest => [b[0] as AtomicOp, ...rest]),
  ];
}

const VALID_STATES: OwnershipState[] = [
  { own: 'blendi', model: 'Lite' },
  { own: 'blendi', model: 'ProPlus' },
  { own: 'blendi', model: 'Steel' },
  { own: 'other', model: 'Lite' },
  { own: 'other', model: 'Lite', text: 'Ninja' },
  { own: 'none', model: 'Lite' },
];

const ALL_PATCHES: PatchCase[] = [];
for (const blendiModel of [undefined, 'Lite', 'ProPlus', 'Steel'] as const) {
  for (const blendiOwnership of [undefined, 'blendi', 'other', 'none'] as const) {
    for (const otherBlenderModel of [undefined, '', '   ', 'Oster'] as const) {
      ALL_PATCHES.push({
        ...(blendiModel && { blendiModel }),
        ...(blendiOwnership && { blendiOwnership }),
        ...(otherBlenderModel !== undefined && { otherBlenderModel }),
      });
    }
  }
}

describe('resolveBlenderOwnershipUpdates — verificação exaustiva', () => {
  it(`um PATCH isolado nunca deixa estado inválido (${VALID_STATES.length} estados × ${ALL_PATCHES.length} PATCHes)`, () => {
    for (const initial of VALID_STATES) {
      for (const patch of ALL_PATCHES) {
        const final = toAtomicOps(patch, initial.own).reduce((state, op) => op(state), initial);
        assert.ok(isValidState(final), `inválido: ${JSON.stringify({ initial, patch, final })}`);
      }
    }
  });

  it('nunca emite $set e $unset do mesmo campo (conflito no MongoDB)', () => {
    for (const own of ['blendi', 'other', 'none'] as const) {
      for (const patch of ALL_PATCHES) {
        const result = resolveBlenderOwnershipUpdates(patch, own);
        assert.ok(
          !(result.set.otherBlenderModel !== undefined && result.unsetOtherBlenderModel),
          `conflito: ${JSON.stringify({ own, patch })}`
        );
      }
    }
  });

  it('dois PATCHes concorrentes, em qualquer intercalamento, nunca deixam estado inválido (RACE01)', () => {
    let scenarios = 0;
    for (const initial of VALID_STATES) {
      for (const patchA of ALL_PATCHES) {
        for (const patchB of ALL_PATCHES) {
          const opsA = toAtomicOps(patchA, initial.own);
          const opsB = toAtomicOps(patchB, initial.own);
          for (const order of interleavings(opsA, opsB)) {
            const final = order.reduce((state, op) => op(state), initial);
            scenarios++;
            assert.ok(isValidState(final), `inválido: ${JSON.stringify({ initial, patchA, patchB, final })}`);
          }
        }
      }
    }
    assert.ok(scenarios > 10_000, `esperava >10k cenários, rodou ${scenarios}`);
  });

  it('o desenho antigo (texto-solo no $set principal) falharia: o modelo de teste detecta a corrida', () => {
    // Contra-prova: simula o comportamento ANTIGO e confirma que a verificação
    // acima teria pego o bug (estado 'none' com texto), em vez de passar em falso.
    const oldTextOnly: AtomicOp = state => ({ ...state, text: 'racer' });
    const switchToNone: AtomicOp = state => {
      const next = { ...state, own: 'none' as const, model: 'Lite' as const };
      delete next.text;
      return next;
    };
    const start: OwnershipState = { own: 'other', model: 'Lite', text: 'seed' };
    const bad = [switchToNone, oldTextOnly].reduce((state, op) => op(state), start);
    assert.equal(isValidState(bad), false);
  });
});
