// Estado temporário do onboarding: posse do liquidificador, texto de "outro
// modelo" e a lista de restrições alimentares (toggle + reset).
import { useOnboardingStore } from './onboarding.store';

const store = () => useOnboardingStore.getState();

beforeEach(() => {
  store().resetOnboarding();
});

describe('onboarding.store — liquidificador', () => {
  it('estado inicial: sem modelo, posse "blendi", sem texto', () => {
    expect(store().selectedModel).toBeNull();
    expect(store().blendiOwnership).toBe('blendi');
    expect(store().otherBlenderModel).toBe('');
  });

  it('setModel sem posse volta para "blendi" (escolher um BLENDi real)', () => {
    store().setModel('Lite', 'none');
    store().setModel('Steel');
    expect(store().selectedModel).toBe('Steel');
    expect(store().blendiOwnership).toBe('blendi');
  });

  it('setModel("Lite", "other"/"none") guarda modelo Lite e a posse', () => {
    store().setModel('Lite', 'other');
    expect(store().selectedModel).toBe('Lite');
    expect(store().blendiOwnership).toBe('other');

    store().setModel('Lite', 'none');
    expect(store().blendiOwnership).toBe('none');
  });

  it('setOtherBlenderModel guarda o texto sem mexer em modelo/posse', () => {
    store().setModel('Lite', 'other');
    store().setOtherBlenderModel('Ninja BN401');
    expect(store().otherBlenderModel).toBe('Ninja BN401');
    expect(store().selectedModel).toBe('Lite');
    expect(store().blendiOwnership).toBe('other');
  });
});

describe('onboarding.store — dieta', () => {
  it('começa vazia', () => {
    expect(store().dietaryPreferences).toEqual([]);
  });

  it('toggleDietaryPreference marca e desmarca, sem duplicar', () => {
    store().toggleDietaryPreference('vegan');
    store().toggleDietaryPreference('nut_free');
    expect(store().dietaryPreferences).toEqual(['vegan', 'nut_free']);

    store().toggleDietaryPreference('vegan');
    expect(store().dietaryPreferences).toEqual(['nut_free']);

    store().toggleDietaryPreference('vegan');
    store().toggleDietaryPreference('vegan');
    store().toggleDietaryPreference('vegan');
    expect(store().dietaryPreferences.filter((preference) => preference === 'vegan')).toHaveLength(1);
  });

  it('cada toggle devolve um array novo (a tela re-renderiza)', () => {
    const before = store().dietaryPreferences;
    store().toggleDietaryPreference('dairy_free');
    expect(store().dietaryPreferences).not.toBe(before);
    expect(before).toEqual([]);
  });
});

describe('onboarding.store — reset', () => {
  it('resetOnboarding limpa posse, texto e dieta junto com o resto', () => {
    store().setModel('Lite', 'other');
    store().setOtherBlenderModel('Oster');
    store().toggleDietaryPreference('vegan');
    store().setGoal('Muscle');

    store().resetOnboarding();

    expect(store().selectedModel).toBeNull();
    expect(store().blendiOwnership).toBe('blendi');
    expect(store().otherBlenderModel).toBe('');
    expect(store().dietaryPreferences).toEqual([]);
    expect(store().selectedGoal).toBeNull();
  });
});
