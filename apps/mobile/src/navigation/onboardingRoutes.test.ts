// Guarda de fiação do onboarding (ordem final: Model, Goal, Diet, Body, Macros):
// rota registrada no navigator e nos tipos, e instrumentada pelo listener de
// screen_viewed do App.tsx. Lê o código-fonte porque o navigator real exige
// NavigationContainer + native-stack, e a regressão que interessa aqui é
// "esqueci de registrar a rota nova", não o comportamento do React Navigation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string) => readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

const EXPECTED_ORDER = ['OnboardingModel', 'OnboardingGoal', 'OnboardingDiet', 'OnboardingBody', 'OnboardingMacros'];

describe('rotas do onboarding', () => {
  it('OnboardingNavigator registra as 5 telas na ordem Model, Goal, Diet, Body, Macros', () => {
    const source = read('src/navigation/OnboardingNavigator.tsx');
    const registered = [...source.matchAll(/<Stack\.Screen name="(\w+)"/g)].map((match) => match[1]);
    expect(registered).toEqual(EXPECTED_ORDER);
  });

  it('OnboardingStackParamList tem as 5 rotas', () => {
    const source = read('src/navigation/types.ts');
    const block = /export type OnboardingStackParamList = \{([^}]*)\}/.exec(source)?.[1] ?? '';
    const declared = [...block.matchAll(/(\w+): undefined/g)].map((match) => match[1]);
    expect(declared).toEqual(EXPECTED_ORDER);
  });

  it('App.tsx: as 5 rotas de onboarding estão em TRACKED_SCREEN_NAMES (screen_viewed)', () => {
    const source = read('App.tsx');
    const block = /const TRACKED_SCREEN_NAMES = new Set\(\[([^\]]*)\]\)/.exec(source)?.[1] ?? '';
    const tracked = [...block.matchAll(/'(\w+)'/g)].map((match) => match[1]);
    expect(tracked.filter((name) => name?.startsWith('Onboarding'))).toEqual(EXPECTED_ORDER);
  });

  it('cada tela de onboarding usa o passo certo no OnboardingLayout', () => {
    const steps: Array<[string, number]> = [
      ['OnboardingModelScreen', 1],
      ['OnboardingGoalScreen', 2],
      ['OnboardingDietScreen', 3],
      ['OnboardingBodyScreen', 4],
      ['OnboardingMacrosScreen', 5],
    ];
    for (const [screen, step] of steps) {
      expect(read(`src/screens/onboarding/${screen}.tsx`)).toContain(`step={${step}}`);
    }
  });

  it('o goal navega para a dieta e a dieta para o corpo', () => {
    expect(read('src/screens/onboarding/OnboardingGoalScreen.tsx')).toContain("navigation.navigate('OnboardingDiet')");
    expect(read('src/screens/onboarding/OnboardingDietScreen.tsx')).toContain("navigation.navigate('OnboardingBody')");
  });
});
