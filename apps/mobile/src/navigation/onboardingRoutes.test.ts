// Guarda de fiação do onboarding (ordem final: Model, Goal, Diet, Body, Macros,
// e depois a tela "Montando seu plano", fora do indicador de 5 passos):
// rota registrada no navigator e nos tipos, e instrumentada pelo listener de
// screen_viewed do App.tsx. Lê o código-fonte porque o navigator real exige
// NavigationContainer + native-stack, e a regressão que interessa aqui é
// "esqueci de registrar a rota nova", não o comportamento do React Navigation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string) => readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

const STEP_ROUTES = ['OnboardingModel', 'OnboardingGoal', 'OnboardingDiet', 'OnboardingBody', 'OnboardingMacros'];
const EXPECTED_ORDER = [...STEP_ROUTES, 'OnboardingBuildingPlan'];

describe('rotas do onboarding', () => {
  it('OnboardingNavigator registra as 5 telas na ordem Model, Goal, Diet, Body, Macros e depois BuildingPlan', () => {
    const source = read('src/navigation/OnboardingNavigator.tsx');
    const registered = [...source.matchAll(/<Stack\.Screen\s+name="(\w+)"/g)].map((match) => match[1]);
    expect(registered).toEqual(EXPECTED_ORDER);
  });

  it('OnboardingStackParamList tem as 6 rotas (BuildingPlan com parâmetros)', () => {
    const source = read('src/navigation/types.ts');
    const block = /export type OnboardingStackParamList = \{([^}]*)\}/.exec(source)?.[1] ?? '';
    const declared = [...block.matchAll(/(\w+): (?:undefined|OnboardingBuildingPlanParams)/g)].map((match) => match[1]);
    expect(declared).toEqual(EXPECTED_ORDER);
  });

  it('BuildingPlan: sem gesto de voltar no iOS', () => {
    const source = read('src/navigation/OnboardingNavigator.tsx');
    expect(source).toMatch(/name="OnboardingBuildingPlan"[\s\S]*?gestureEnabled: false/);
  });

  it('App.tsx: as rotas de onboarding estão em TRACKED_SCREEN_NAMES (screen_viewed)', () => {
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

  it('BuildingPlan não entra no indicador de passos (não usa OnboardingLayout, que continua com 5)', () => {
    expect(read('src/screens/onboarding/OnboardingBuildingPlanScreen.tsx')).not.toContain('OnboardingLayout');
    expect(read('src/components/ui/OnboardingLayout.tsx')).toContain('const TOTAL_STEPS = 5;');
  });

  it('o goal navega para a dieta e a dieta para o corpo', () => {
    expect(read('src/screens/onboarding/OnboardingGoalScreen.tsx')).toContain("navigation.navigate('OnboardingDiet')");
    expect(read('src/screens/onboarding/OnboardingDietScreen.tsx')).toContain("navigation.navigate('OnboardingBody')");
  });
});
