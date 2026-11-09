// As 5 opções de liquidificador (onboarding + troca de modelo no Me), a
// resolução opção -> { blendiModel, blendiOwnership } e o texto da linha
// "Meu BLENDi" do Me para cada posse.
import {
  BLENDER_OPTIONS,
  getBlenderOptionKey,
  getModelDisplay,
  isBlenderOptionKey,
  resolveBlenderOption,
} from './blenderOwnership.utils';

describe('BLENDER_OPTIONS', () => {
  it('tem as 5 opções, nesta ordem, e só os BLENDi atuais têm badge de potência', () => {
    expect(BLENDER_OPTIONS.map((option) => option.key)).toEqual(['Lite', 'ProPlus', 'Steel', 'other', 'none']);
    expect(BLENDER_OPTIONS.map((option) => option.badge)).toEqual(['70W', '120W', '180W', undefined, undefined]);
  });

  it('usa as chaves de i18n do onboarding (inclusive as duas novas)', () => {
    expect(BLENDER_OPTIONS.map((option) => option.titleKey)).toEqual([
      'onboarding.model.lite.name',
      'onboarding.model.pro_plus.name',
      'onboarding.model.steel.name',
      'onboarding.modelOtherTitle',
      'onboarding.modelNoneTitle',
    ]);
  });
});

describe('resolveBlenderOption', () => {
  it.each([
    ['Lite', { blendiModel: 'Lite', blendiOwnership: 'blendi' }],
    ['ProPlus', { blendiModel: 'ProPlus', blendiOwnership: 'blendi' }],
    ['Steel', { blendiModel: 'Steel', blendiOwnership: 'blendi' }],
    ['other', { blendiModel: 'Lite', blendiOwnership: 'other' }],
    ['none', { blendiModel: 'Lite', blendiOwnership: 'none' }],
  ] as const)('%s', (key, expected) => {
    expect(resolveBlenderOption(key)).toEqual(expected);
  });
});

describe('getBlenderOptionKey', () => {
  it('posse other/none vence o modelo; conta antiga (sem posse) conta como blendi', () => {
    expect(getBlenderOptionKey('Lite', 'other')).toBe('other');
    expect(getBlenderOptionKey('Lite', 'none')).toBe('none');
    expect(getBlenderOptionKey('Steel', 'blendi')).toBe('Steel');
    expect(getBlenderOptionKey('ProPlus', undefined)).toBe('ProPlus');
  });

  it('é o inverso de resolveBlenderOption', () => {
    for (const { key } of BLENDER_OPTIONS) {
      const { blendiModel, blendiOwnership } = resolveBlenderOption(key);
      expect(getBlenderOptionKey(blendiModel, blendiOwnership)).toBe(key);
    }
  });
});

describe('isBlenderOptionKey', () => {
  it('aceita só as 5 chaves', () => {
    expect(isBlenderOptionKey('other')).toBe(true);
    expect(isBlenderOptionKey('none')).toBe(true);
    expect(isBlenderOptionKey('Steel')).toBe(true);
    expect(isBlenderOptionKey('steel')).toBe(false);
    expect(isBlenderOptionKey('')).toBe(false);
    expect(isBlenderOptionKey('blendi')).toBe(false);
  });
});

describe('getModelDisplay (linha "Meu BLENDi" do Me)', () => {
  it('blendi: nome do modelo', () => {
    expect(getModelDisplay('Lite', 'blendi', null)).toEqual({ key: 'onboarding.model.lite.name' });
    expect(getModelDisplay('ProPlus', 'blendi', null)).toEqual({ key: 'onboarding.model.pro_plus.name' });
    expect(getModelDisplay('Steel', 'blendi', null)).toEqual({ key: 'onboarding.model.steel.name' });
  });

  it('conta antiga sem posse mostra o modelo, ignorando texto solto', () => {
    expect(getModelDisplay('Steel', undefined, 'Ninja')).toEqual({ key: 'onboarding.model.steel.name' });
    expect(getModelDisplay('Steel', 'blendi', 'Ninja')).toEqual({ key: 'onboarding.model.steel.name' });
  });

  it('other: "Outro modelo" + texto digitado quando houver', () => {
    expect(getModelDisplay('Lite', 'other', 'Ninja BN401')).toEqual({
      key: 'me.blenderOwnership.otherWithName',
      options: { name: 'Ninja BN401' },
    });
    expect(getModelDisplay('Lite', 'other', '  NutriBullet  ')).toEqual({
      key: 'me.blenderOwnership.otherWithName',
      options: { name: 'NutriBullet' },
    });
  });

  it('other sem texto (ausente, null ou em branco): só "Outro modelo"', () => {
    for (const text of [null, undefined, '', '   ']) {
      expect(getModelDisplay('Lite', 'other', text)).toEqual({ key: 'me.blenderOwnership.other' });
    }
  });

  it('none: "Ainda não tenho um BLENDi", mesmo com texto antigo', () => {
    expect(getModelDisplay('Lite', 'none', null)).toEqual({ key: 'me.blenderOwnership.none' });
    expect(getModelDisplay('Lite', 'none', 'Ninja')).toEqual({ key: 'me.blenderOwnership.none' });
  });
});
