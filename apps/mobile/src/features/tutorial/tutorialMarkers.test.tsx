// CP-C2a — Marcadores preenchidos na hora de mostrar a etapa: copo de água
// pela unidade da conta com o MESMO formatador do botão (useUnits), números
// pela fonte única; sobra de marcador nunca aparece crua.
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  DAILY_MISSIONS_PER_DAY,
  FREE_PANTRY_SCANS_PER_MONTH,
  FREE_PULSE_AI_MESSAGES_PER_DAY,
  QUICK_WATER_GLASS_ML,
  TUTORIAL_CONTENT,
  parseTutorialContent,
  type TutorialContent,
} from '@blendi/shared';

let mockUnitSystem: 'metric' | 'imperial' = 'metric';
let mockLocale: 'en' | 'pt-BR' = 'en';
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { unitSystem: mockUnitSystem } }),
}));
jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key, locale: mockLocale }),
}));

import { useUnits } from '../../hooks/useUnits';
import { isKnownTutorialAnchor } from './tutorialAnchors';
import { buildTutorialMarkerValues } from './tutorialMarkers';
import { planTutorial } from './tutorialPlanner';
import { isTutorialScreen } from './tutorialScreens';

const support = { isScreenSupported: isTutorialScreen, isAnchorSupported: isKnownTutorialAnchor };
const content = parseTutorialContent(TUTORIAL_CONTENT) as TutorialContent;

function WaterGlass() {
  const { displayVolume } = useUnits();
  return <Text testID="glass">{displayVolume(QUICK_WATER_GLASS_ML)}</Text>;
}

function waterGlassFor(unitSystem: 'metric' | 'imperial', locale: 'en' | 'pt-BR'): string {
  mockUnitSystem = unitSystem;
  mockLocale = locale;
  const { getByTestId, unmount } = render(<WaterGlass />);
  const value = String(getByTestId('glass').props.children);
  unmount();
  return value;
}

function bodyOf(id: string, unitSystem: 'metric' | 'imperial', locale: 'en' | 'pt-BR'): string {
  const markers = buildTutorialMarkerValues(waterGlassFor(unitSystem, locale));
  const plan = planTutorial(content, { isPro: false }, locale, support, markers);
  const step = plan.steps.find((item) => item.id === id);
  if (!step) throw new Error(`etapa ${id} fora do plano`);
  return step.body;
}

describe('CP-C2a — marcadores no app', () => {
  it('copo de água: 250 ml no métrico e fl oz no imperial, em en e pt-BR (mesmo formatador do botão)', () => {
    expect(bodyOf('home.logWater', 'metric', 'en')).toContain('one 250 ml glass');
    expect(bodyOf('home.logWater', 'metric', 'pt-BR')).toContain('copo de 250 ml');
    expect(bodyOf('home.logWater', 'imperial', 'en')).toContain('one 8.5 fl oz glass');
    expect(bodyOf('home.logWater', 'imperial', 'pt-BR')).toContain('copo de 8.5 fl oz');
  });

  it('números pela fonte única', () => {
    expect(bodyOf('pulseAi.usage', 'metric', 'en')).toContain(`includes ${FREE_PULSE_AI_MESSAGES_PER_DAY} Pulse AI recipes`);
    expect(bodyOf('pulseAi.pantry', 'metric', 'pt-BR')).toContain(`inclui ${FREE_PANTRY_SCANS_PER_MONTH} leituras`);
    expect(bodyOf('home.missions', 'metric', 'en').startsWith(`${DAILY_MISSIONS_PER_DAY} new missions`)).toBe(true);
  });

  it('nenhuma etapa do roteiro real mostra "{{" depois de preenchida, em nenhuma combinação', () => {
    for (const unitSystem of ['metric', 'imperial'] as const) {
      for (const locale of ['en', 'pt-BR'] as const) {
        for (const isPro of [false, true]) {
          const markers = buildTutorialMarkerValues(waterGlassFor(unitSystem, locale));
          const plan = planTutorial(content, { isPro }, locale, support, markers);
          for (const step of plan.steps) {
            expect(`${step.title} ${step.body}`).not.toMatch(/\{\{|\}\}/);
          }
          expect(plan.unavailable.filter((item) => item.reason === 'invalidText')).toEqual([]);
        }
      }
    }
  });

  it('marcador sem valor (roteiro que escapou do schema): a etapa sai, nunca aparece crua', () => {
    const broken = {
      ...content,
      steps: [
        { ...content.steps[0], id: 'test.raw', text: { en: { title: 'Raw', body: 'You have {{freeBlendsPerWeek}} blends.' }, 'pt-BR': { title: 'Cru', body: 'Você tem {{freeBlendsPerWeek}} blends.' } } },
      ],
    } as TutorialContent;
    const plan = planTutorial(broken, { isPro: false }, 'en', support, buildTutorialMarkerValues('250 ml'));
    expect(plan.steps).toEqual([]);
    expect(plan.unavailable).toEqual([{ id: 'test.raw', reason: 'invalidText' }]);
  });
});
