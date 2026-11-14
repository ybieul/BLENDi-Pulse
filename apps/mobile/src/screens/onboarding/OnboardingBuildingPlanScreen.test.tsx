// Tela "Montando seu plano" (depois do "Finish setup"): passos com os dados
// salvos, fatos do BLENDi em ordem, saída única no fim dos 6 s, "reduzir
// movimento" e o botão voltar do Android. Timers falsos do Jest.
import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, BackHandler } from 'react-native';

import type { OnboardingBuildingPlanParams } from '../../navigation/types';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- require lazy dentro da factory (hoisting do jest.mock)
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- ver acima
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    locale: 'en',
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('../../components/ui/AuroraBackground', () => ({
  AuroraBackground: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockImpactAsync = jest.fn(() => Promise.resolve());
jest.mock('expo-haptics', () => ({
  impactAsync: () => mockImpactAsync(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockCompleteOnboarding = jest.fn(() => Promise.resolve());
jest.mock('../../store/auth.store', () => ({
  useAuthStore: { getState: () => ({ completeOnboarding: mockCompleteOnboarding }) },
}));

const mockResetOnboarding = jest.fn();
jest.mock('../../store/onboarding.store', () => ({
  useOnboardingStore: { getState: () => ({ resetOnboarding: mockResetOnboarding }) },
}));

import {
  BLENDI_FACT_KEYS,
  BUILDING_PLAN_DURATION_MS,
  FACT_FADE_MS,
  FACT_ROTATION_MS,
  OnboardingBuildingPlanScreen,
} from './OnboardingBuildingPlanScreen';

const BASE_PARAMS: OnboardingBuildingPlanParams = {
  blendiModel: 'Lite',
  blendiOwnership: 'blendi',
  goal: 'Muscle',
  dailyProteinTarget: 150,
  dailyCalorieTarget: 2300,
  dailyCarbTarget: 250,
  dietaryPreferences: ['dairy_free', 'vegan'],
};

let reduceMotionEnabled = false;
let backHandlers: Array<() => boolean | null | undefined> = [];
const mockRemoveBackHandler = jest.fn();

async function renderScreen(params: Partial<OnboardingBuildingPlanParams> = {}) {
  const utils = render(
    // @ts-expect-error -- só route.params é usado pelo componente
    <OnboardingBuildingPlanScreen route={{ params: { ...BASE_PARAMS, ...params } }} />
  );
  // isReduceMotionEnabled() é assíncrono: os timers só começam depois dele.
  await act(async () => { await Promise.resolve(); });
  return utils;
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

function percentShown(utils: Awaited<ReturnType<typeof renderScreen>>) {
  const ring = utils.getByTestId('building-plan-ring');
  return (ring.props.accessibilityValue as { now: number }).now;
}

beforeEach(() => {
  jest.useFakeTimers();
  reduceMotionEnabled = false;
  backHandlers = [];
  mockCompleteOnboarding.mockClear();
  mockResetOnboarding.mockClear();
  mockImpactAsync.mockClear();
  mockRemoveBackHandler.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotionEnabled));
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return { remove: mockRemoveBackHandler };
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('OnboardingBuildingPlanScreen — passos com os dados salvos', () => {
  it('mostra modelo, goal, metas (g/kcal), dieta e "pronto", nesta ordem', async () => {
    const utils = await renderScreen();

    expect(utils.getByText('onboarding.buildingPlan.title')).toBeTruthy();
    expect(utils.getByText('onboarding.buildingPlan.stepModel:{"model":"onboarding.model.lite.name"}')).toBeTruthy();
    expect(utils.getByText('onboarding.buildingPlan.stepGoal:{"goal":"onboarding.goalMuscle"}')).toBeTruthy();
    expect(utils.getByText('onboarding.buildingPlan.stepTargets:{"protein":"150","calories":"2,300","carbs":"250"}')).toBeTruthy();
    expect(utils.getByText('onboarding.buildingPlan.stepDiet:{"diets":"onboarding.diet.dairyfree, onboarding.diet.vegan"}')).toBeTruthy();
    expect(utils.getByText('onboarding.buildingPlan.stepReady')).toBeTruthy();

    const order = utils.getAllByTestId(/^building-plan-step-\w+$/).map((node) => node.props.testID as string);
    expect(order).toEqual([
      'building-plan-step-model',
      'building-plan-step-goal',
      'building-plan-step-targets',
      'building-plan-step-diet',
      'building-plan-step-ready',
    ]);
  });

  it('usa o nome do modelo escolhido (Pro+, Steel)', async () => {
    const proPlus = await renderScreen({ blendiModel: 'ProPlus' });
    expect(proPlus.getByText('onboarding.buildingPlan.stepModel:{"model":"onboarding.model.pro_plus.name"}')).toBeTruthy();
    proPlus.unmount();

    const steel = await renderScreen({ blendiModel: 'Steel' });
    expect(steel.getByText('onboarding.buildingPlan.stepModel:{"model":"onboarding.model.steel.name"}')).toBeTruthy();
  });

  it('sem dieta, o passo da dieta não aparece', async () => {
    const utils = await renderScreen({ dietaryPreferences: [] });

    expect(utils.queryByTestId('building-plan-step-diet')).toBeNull();
    expect(utils.queryByText(/stepDiet/)).toBeNull();
    expect(utils.getAllByTestId(/^building-plan-step-\w+$/)).toHaveLength(4);
  });

  it.each(['other', 'none'] as const)('posse "%s" usa o texto neutro, sem citar modelo', async (ownership) => {
    const utils = await renderScreen({ blendiModel: 'Lite', blendiOwnership: ownership });

    expect(utils.getByText('onboarding.buildingPlan.stepModelNeutral')).toBeTruthy();
    expect(utils.queryByText(/onboarding\.model\./)).toBeNull();
  });

  it('os passos vão sendo marcados conforme o anel avança', async () => {
    const utils = await renderScreen({ dietaryPreferences: [] });
    const done = () => utils.queryAllByTestId(/^building-plan-step-\w+-done$/).length;

    expect(percentShown(utils)).toBe(0);
    expect(done()).toBe(0);

    advance(1400); // 1400 / 5400 ≈ 26% → 1 de 4
    expect(done()).toBe(1);

    advance(2800); // 4200 / 5400 ≈ 78% → 3 de 4
    expect(done()).toBe(3);

    advance(1200); // 5400 → 100%
    expect(percentShown(utils)).toBe(100);
    expect(done()).toBe(4);
  });
});

describe('OnboardingBuildingPlanScreen — fatos do BLENDi', () => {
  it('a lista tem exatamente os 5 fatos aprovados, nesta ordem', () => {
    expect(BLENDI_FACT_KEYS).toEqual([
      'onboarding.buildingPlan.facts.dormRoom',
      'onboarding.buildingPlan.facts.featuredOnTv',
      'onboarding.buildingPlan.facts.firstPrototype',
      'onboarding.buildingPlan.facts.umassEngineers',
      'onboarding.buildingPlan.facts.firstBatchSoldOut',
    ]);
  });

  it('trocam na ordem a cada ~2 s, com rótulo e live region', async () => {
    const utils = await renderScreen();
    const card = () => utils.getByTestId('building-plan-fact');

    expect(card().props.accessibilityLiveRegion).toBe('polite');
    expect(card().props.accessibilityLabel).toBe(
      'onboarding.buildingPlan.factLabel onboarding.buildingPlan.facts.dormRoom',
    );
    expect(utils.getByText('onboarding.buildingPlan.facts.dormRoom')).toBeTruthy();

    advance(FACT_ROTATION_MS + FACT_FADE_MS);
    expect(utils.getByText('onboarding.buildingPlan.facts.featuredOnTv')).toBeTruthy();

    advance(FACT_ROTATION_MS);
    expect(utils.getByText('onboarding.buildingPlan.facts.firstPrototype')).toBeTruthy();
  });
});

describe('OnboardingBuildingPlanScreen — saída', () => {
  it('ao fim de 6 s chama completeOnboarding e resetOnboarding uma vez só', async () => {
    await renderScreen();

    advance(BUILDING_PLAN_DURATION_MS - 1);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(mockResetOnboarding).not.toHaveBeenCalled();

    advance(1);
    await act(async () => { await Promise.resolve(); });
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockResetOnboarding).toHaveBeenCalledTimes(1);

    advance(10_000);
    await act(async () => { await Promise.resolve(); });
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockResetOnboarding).toHaveBeenCalledTimes(1);
  });

  it('completeOnboarding vem antes do resetOnboarding', async () => {
    const calls: string[] = [];
    mockCompleteOnboarding.mockImplementationOnce(() => { calls.push('complete'); return Promise.resolve(); });
    mockResetOnboarding.mockImplementationOnce(() => { calls.push('reset'); });
    await renderScreen();

    advance(BUILDING_PLAN_DURATION_MS);
    await act(async () => { await Promise.resolve(); });
    expect(calls).toEqual(['complete', 'reset']);
  });

  it('haptic leve uma vez ao chegar em 100%', async () => {
    await renderScreen();

    advance(5000);
    expect(mockImpactAsync).not.toHaveBeenCalled();

    advance(BUILDING_PLAN_DURATION_MS - 5000);
    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
  });

  it('desmontar antes do fim não conclui nada e não gera warning', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    const warnSpy = jest.spyOn(console, 'warn');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const utils = await renderScreen();

    advance(3000);
    clearIntervalSpy.mockClear();
    clearTimeoutSpy.mockClear();
    utils.unmount();
    // Relógio (100 ms) e rotação dos fatos (2 s) param; a saída de 6 s é cancelada.
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    advance(10_000);
    await act(async () => { await Promise.resolve(); });

    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(mockResetOnboarding).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('OnboardingBuildingPlanScreen — reduzir movimento', () => {
  it('sem animação do anel nem fade; anel em saltos por passo; conclui no tempo', async () => {
    reduceMotionEnabled = true;
    const timingSpy = jest.spyOn(Animated, 'timing');
    const utils = await renderScreen({ dietaryPreferences: [] });

    advance(1000); // 18% contínuo → 0% em saltos (4 passos de 25%)
    expect(percentShown(utils)).toBe(0);
    advance(400); // ≈ 26% → 25%
    expect(percentShown(utils)).toBe(25);

    // Fato troca exatamente no intervalo, sem esperar fade.
    advance(FACT_ROTATION_MS - 1400);
    expect(utils.getByText('onboarding.buildingPlan.facts.featuredOnTv')).toBeTruthy();

    advance(BUILDING_PLAN_DURATION_MS - FACT_ROTATION_MS);
    await act(async () => { await Promise.resolve(); });
    expect(percentShown(utils)).toBe(100);
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockResetOnboarding).toHaveBeenCalledTimes(1);
    expect(timingSpy).not.toHaveBeenCalled();
  });
});

describe('OnboardingBuildingPlanScreen — voltar', () => {
  it('botão voltar do Android bloqueado enquanto a tela está aberta', async () => {
    const utils = await renderScreen();

    expect(backHandlers).toHaveLength(1);
    expect(backHandlers[0]?.()).toBe(true);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();

    utils.unmount();
    expect(mockRemoveBackHandler).toHaveBeenCalledTimes(1);
  });

  it('o anel é uma progressbar com o valor atual', async () => {
    const utils = await renderScreen();
    const ring = utils.getByTestId('building-plan-ring');

    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0 });
    advance(2700);
    expect(percentShown(utils)).toBe(50);
  });
});
