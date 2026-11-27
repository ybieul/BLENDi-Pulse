// CP-C2 — Planejamento do tour (funções puras, sem React nem navegação).
//
// "Visto" (seenStepIds) quer dizer "já tratado": a etapa foi mostrada, ou o
// usuário concluiu/pulou um tour em que ela existia. Por isso, ao Concluir
// ou Pular, TODAS as etapas que esta versão do app sabe mostrar entram na
// lista (inclusive as de condição falsa e as cuja âncora não apareceu): o
// modo novidades fica só com o que é de fato novo, e nunca repete etapa que
// não aparece neste aparelho. Fica de fora só o que esta versão não conhece
// (tela ou âncora nova): isso aparece como novidade depois da atualização.
import {
  fillTutorialText,
  type TutorialCondition,
  type TutorialContent,
  type TutorialMarkerValues,
  type TutorialProgress,
  type TutorialStep,
} from '@blendi/shared';

import type {
  PlannedTutorialStep,
  TutorialMode,
  TutorialUnavailableReason,
  TutorialUserContext,
} from './tutorial.types';

export const WHATS_NEW_INTRO_STEP_ID = 'tutorial.whatsNewIntro';

export type TutorialContentLocale = 'en' | 'pt-BR';

export function resolveTutorialLocale(locale: string | undefined): TutorialContentLocale {
  return locale?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function evaluateTutorialCondition(
  condition: TutorialCondition | undefined,
  context: TutorialUserContext
): boolean {
  switch (condition) {
    case undefined:
      return true;
    case 'isPro':
      return context.isPro;
    case 'notPro':
      return !context.isPro;
    case 'hasBlendi':
      return (context.blendiOwnership ?? 'blendi') === 'blendi';
    case 'noBlendi':
      return (context.blendiOwnership ?? 'blendi') !== 'blendi';
    default:
      // Lista fechada no schema; aqui por segurança (nunca mostra o que não entende).
      return false;
  }
}

export interface TutorialPlanSupport {
  isScreenSupported: (screen: string) => boolean;
  isAnchorSupported: (anchor: string) => boolean;
}

export interface TutorialPlan {
  /** Etapas que se aplicam a este usuário nesta versão, em ordem. */
  steps: PlannedTutorialStep[];
  /** Ids que esta versão sabe mostrar (qualquer condição). */
  supportedStepIds: string[];
  unavailable: Array<{ id: string; reason: TutorialUnavailableReason }>;
}

function hasLeftoverMarker(text: string): boolean {
  return text.includes('{{') || text.includes('}}');
}

/** Texto no idioma da conta com os marcadores preenchidos; null se sobrar marcador. */
function toPlannedStep(
  step: TutorialStep,
  locale: TutorialContentLocale,
  markers: TutorialMarkerValues
): PlannedTutorialStep | null {
  const text = step.text[locale];
  const title = fillTutorialText(text.title, markers);
  const body = fillTutorialText(text.body, markers);
  if (hasLeftoverMarker(title) || hasLeftoverMarker(body)) {
    return null;
  }
  return {
    id: step.id,
    screen: step.screen,
    ...(step.anchor !== undefined && { anchor: step.anchor }),
    placement: step.placement,
    title,
    body,
  };
}

export function planTutorial(
  content: TutorialContent,
  context: TutorialUserContext,
  locale: TutorialContentLocale,
  support: TutorialPlanSupport,
  markers: TutorialMarkerValues
): TutorialPlan {
  const ordered = [...content.steps].sort((a, b) => a.order - b.order);
  const seenIds = new Set<string>();
  const plan: TutorialPlan = { steps: [], supportedStepIds: [], unavailable: [] };

  for (const step of ordered) {
    if (seenIds.has(step.id)) {
      plan.unavailable.push({ id: step.id, reason: 'duplicate' });
      continue;
    }
    seenIds.add(step.id);

    if (!support.isScreenSupported(step.screen)) {
      plan.unavailable.push({ id: step.id, reason: 'route' });
      continue;
    }
    if (step.anchor !== undefined && !support.isAnchorSupported(step.anchor)) {
      plan.unavailable.push({ id: step.id, reason: 'anchorUnknown' });
      continue;
    }

    plan.supportedStepIds.push(step.id);

    if (!evaluateTutorialCondition(step.condition, context)) {
      plan.unavailable.push({ id: step.id, reason: 'condition' });
      continue;
    }

    const planned = toPlannedStep(step, locale, markers);
    if (!planned) {
      plan.unavailable.push({ id: step.id, reason: 'invalidText' });
      continue;
    }
    plan.steps.push(planned);
  }

  return plan;
}

export interface TutorialStartDecision {
  mode: TutorialMode;
  steps: PlannedTutorialStep[];
  startIndex: number;
}

function hasFinished(progress: TutorialProgress): boolean {
  return progress.completedAt !== null || progress.skippedAt !== null;
}

/**
 * Decide se o tour abre sozinho na Home, em que modo e de onde.
 *   - nunca terminou: tour completo, retomando da última etapa mostrada;
 *   - já concluiu ou pulou: só etapas ainda não vistas (novidades), com
 *     uma abertura própria; sem etapa nova, nada.
 */
export function decideTutorialStart(
  plan: TutorialPlan,
  progress: TutorialProgress,
  content: TutorialContent,
  locale: TutorialContentLocale,
  activeMode: TutorialMode | null,
  markers: TutorialMarkerValues
): TutorialStartDecision | null {
  if (plan.steps.length === 0) {
    return null;
  }

  const seen = new Set(progress.seenStepIds);

  if (!hasFinished(progress)) {
    const mode: TutorialMode = activeMode === 'review' ? 'review' : 'full';
    const lastIndex = progress.lastStepId
      ? plan.steps.findIndex((step) => step.id === progress.lastStepId)
      : -1;
    if (lastIndex >= 0) {
      return { mode, steps: plan.steps, startIndex: lastIndex };
    }
    const firstUnseen = plan.steps.findIndex((step) => !seen.has(step.id));
    return { mode, steps: plan.steps, startIndex: firstUnseen >= 0 ? firstUnseen : 0 };
  }

  const fresh = plan.steps.filter((step) => !seen.has(step.id));
  if (fresh.length === 0) {
    return null;
  }

  const intro = content.whatsNewIntro[locale];
  const introTitle = fillTutorialText(intro.title, markers);
  const introBody = fillTutorialText(intro.body, markers);
  if (hasLeftoverMarker(introTitle) || hasLeftoverMarker(introBody)) {
    return { mode: 'whatsNew', steps: fresh, startIndex: 0 };
  }
  const introStep: PlannedTutorialStep = {
    id: WHATS_NEW_INTRO_STEP_ID,
    screen: 'Home',
    placement: 'auto',
    title: introTitle,
    body: introBody,
    isSynthetic: true,
  };

  return { mode: 'whatsNew', steps: [introStep, ...fresh], startIndex: 0 };
}
