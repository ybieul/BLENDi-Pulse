// CP-C2 — Planejamento (funções puras): condições, etapas puladas, idioma,
// decisão de abertura (completo, retomada, novidades, nada).
import { EMPTY_TUTORIAL_PROGRESS, type TutorialProgress } from '@blendi/shared';

import {
  WHATS_NEW_INTRO_STEP_ID,
  decideTutorialStart,
  evaluateTutorialCondition,
  planTutorial,
  resolveTutorialLocale,
} from './tutorialPlanner';
import { TEST_CONTENT_INPUT, TEST_MARKERS, testContent, testSupport } from './testUtils/tutorialTestKit';

const free = { isPro: false, blendiOwnership: 'blendi' as const };
const progress = (overrides: Partial<TutorialProgress> = {}): TutorialProgress => ({
  ...EMPTY_TUTORIAL_PROGRESS,
  seenStepIds: [],
  ...overrides,
});

describe('CP-C2 — tutorialPlanner', () => {
  it('condições da lista fechada', () => {
    expect(evaluateTutorialCondition(undefined, free)).toBe(true);
    expect(evaluateTutorialCondition('isPro', free)).toBe(false);
    expect(evaluateTutorialCondition('notPro', free)).toBe(true);
    expect(evaluateTutorialCondition('isPro', { isPro: true })).toBe(true);
    expect(evaluateTutorialCondition('hasBlendi', { isPro: false })).toBe(true);
    expect(evaluateTutorialCondition('hasBlendi', { isPro: false, blendiOwnership: 'other' })).toBe(false);
    expect(evaluateTutorialCondition('noBlendi', { isPro: false, blendiOwnership: 'none' })).toBe(true);
  });

  it('idioma: pt* → pt-BR, resto → en', () => {
    expect(resolveTutorialLocale('pt-BR')).toBe('pt-BR');
    expect(resolveTutorialLocale('pt')).toBe('pt-BR');
    expect(resolveTutorialLocale('en')).toBe('en');
    expect(resolveTutorialLocale(undefined)).toBe('en');
  });

  it('plano: ordem, texto no idioma, rota/âncora desconhecida e condição falsa fora', () => {
    const plan = planTutorial(testContent(), free, 'pt-BR', testSupport, TEST_MARKERS);
    expect(plan.steps.map((step) => step.id)).toEqual([
      'test.welcome',
      'test.homeA',
      'test.missing',
      'test.blend',
      'test.me',
      'test.done',
    ]);
    expect(plan.steps[0]?.title).toBe('Welcome título');
    expect(plan.unavailable).toEqual(
      expect.arrayContaining([
        { id: 'test.ghostScreen', reason: 'route' },
        { id: 'test.proOnly', reason: 'condition' },
      ])
    );
    // Suportadas = qualquer condição; a de tela inexistente não.
    expect(plan.supportedStepIds).toContain('test.proOnly');
    expect(plan.supportedStepIds).not.toContain('test.ghostScreen');
  });

  it('plano: id repetido (roteiro malformado que passou do schema) e âncora fora do catálogo', () => {
    const content = testContent();
    const broken = {
      ...content,
      steps: [
        ...content.steps,
        { ...content.steps[1], order: 999 },
        { ...content.steps[1], id: 'test.unknownAnchor', anchor: 'test.notInCatalog', order: 1000 },
      ],
    };
    const plan = planTutorial(broken, free, 'en', testSupport, TEST_MARKERS);
    expect(plan.unavailable).toEqual(
      expect.arrayContaining([
        { id: 'test.homeA', reason: 'duplicate' },
        { id: 'test.unknownAnchor', reason: 'anchorUnknown' },
      ])
    );
    expect(plan.steps.filter((step) => step.id === 'test.homeA')).toHaveLength(1);
  });

  it('decisão: conta nova → completo do início', () => {
    const content = testContent();
    const plan = planTutorial(content, free, 'en', testSupport, TEST_MARKERS);
    expect(decideTutorialStart(plan, progress(), content, 'en', null, TEST_MARKERS)).toMatchObject({ mode: 'full', startIndex: 0 });
  });

  it('decisão: no meio → retoma da última etapa; modo revisão é mantido', () => {
    const content = testContent();
    const plan = planTutorial(content, free, 'en', testSupport, TEST_MARKERS);
    const inProgress = progress({ seenStepIds: ['test.welcome', 'test.homeA', 'test.missing', 'test.blend'], lastStepId: 'test.blend' });
    expect(decideTutorialStart(plan, inProgress, content, 'en', null, TEST_MARKERS)).toMatchObject({ mode: 'full', startIndex: 3 });
    expect(decideTutorialStart(plan, inProgress, content, 'en', 'review', TEST_MARKERS)?.mode).toBe('review');
    // lastStepId de etapa que saiu do roteiro: primeira não vista.
    const stale = progress({ seenStepIds: ['test.welcome'], lastStepId: 'test.removed' });
    expect(decideTutorialStart(plan, stale, content, 'en', null, TEST_MARKERS)?.startIndex).toBe(1);
  });

  it('decisão: concluído/pulado → só etapas não vistas, com abertura; nada se não houver', () => {
    const content = testContent({
      contentVersion: 2,
      steps: [
        ...TEST_CONTENT_INPUT.steps,
        { id: 'test.new', order: 65, screen: 'Blend', anchor: 'test.anchorBlend', addedInVersion: 2, text: TEST_CONTENT_INPUT.steps[0].text },
      ],
    });
    const plan = planTutorial(content, free, 'en', testSupport, TEST_MARKERS);
    const allOld = TEST_CONTENT_INPUT.steps.map((step) => step.id);
    const done = progress({ seenStepIds: allOld, completedAt: '2026-11-27T00:00:00.000Z', contentVersion: 1 });
    const decision = decideTutorialStart(plan, done, content, 'en', null, TEST_MARKERS);
    expect(decision?.mode).toBe('whatsNew');
    expect(decision?.steps.map((step) => step.id)).toEqual([WHATS_NEW_INTRO_STEP_ID, 'test.new']);
    expect(decision?.steps[0]?.isSynthetic).toBe(true);

    const skippedAll = progress({ seenStepIds: [...allOld, 'test.new'], skippedAt: '2026-11-27T00:00:00.000Z' });
    expect(decideTutorialStart(plan, skippedAll, content, 'en', null, TEST_MARKERS)).toBeNull();
  });
});
