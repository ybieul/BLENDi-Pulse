// CP-C2 — O roteiro inicial nunca aponta para tela ou âncora que não existe:
//   1. toda âncora do roteiro está no catálogo desta versão;
//   2. toda âncora do catálogo está marcada em alguma tela/componente
//      (<TutorialAnchor id="...">), fora testes e a própria feature;
//   3. toda tela do roteiro é uma rota que o motor sabe abrir;
//   4. nenhuma etapa do roteiro inicial cai em "não se aplica" para todos.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { TUTORIAL_CONTENT, parseTutorialContent } from '@blendi/shared';

import { TUTORIAL_ANCHOR_IDS, isKnownTutorialAnchor } from './tutorialAnchors';
import { planTutorial } from './tutorialPlanner';
import { TUTORIAL_SCREEN_NAMES, isTutorialScreen } from './tutorialScreens';

const SRC = join(__dirname, '..', '..');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const appSources = listSourceFiles(SRC)
  .filter((path) => !relative(SRC, path).startsWith(join('features', 'tutorial')))
  .map((path) => ({ path: relative(SRC, path), code: readFileSync(path, 'utf8') }));

const usedAnchorIds = new Set(
  appSources.flatMap(({ code }) => [...code.matchAll(/<TutorialAnchor\s+id="([^"]+)"/g)].map((match) => match[1]))
);

describe('CP-C2 — âncoras e telas do roteiro inicial', () => {
  const content = parseTutorialContent(TUTORIAL_CONTENT);

  it('o roteiro inicial é válido', () => {
    expect(content).not.toBeNull();
  });

  it('toda âncora do roteiro está no catálogo desta versão', () => {
    const missing = (content?.steps ?? []).filter((step) => step.anchor && !isKnownTutorialAnchor(step.anchor));
    expect(missing.map((step) => `${step.id} → ${step.anchor}`)).toEqual([]);
  });

  it('toda âncora do catálogo está marcada em alguma tela', () => {
    const unused = TUTORIAL_ANCHOR_IDS.filter((id) => !usedAnchorIds.has(id));
    expect(unused).toEqual([]);
  });

  it('nenhuma tela marca âncora fora do catálogo (id digitado errado)', () => {
    const unknown = [...usedAnchorIds].filter((id) => !isKnownTutorialAnchor(id));
    expect(unknown).toEqual([]);
  });

  it('toda tela do roteiro é uma rota que o motor abre', () => {
    const bad = (content?.steps ?? []).filter((step) => !isTutorialScreen(step.screen));
    expect(bad.map((step) => `${step.id} → ${step.screen}`)).toEqual([]);
    expect(TUTORIAL_SCREEN_NAMES).toEqual(['Home', 'PulseAIChat', 'Blend', 'TrackMain', 'Me']);
  });

  it('para plano grátis e Pro, só a condição tira etapas do plano', () => {
    if (!content) throw new Error('roteiro inválido');
    for (const isPro of [false, true]) {
      const plan = planTutorial(content, { isPro, blendiOwnership: 'blendi' }, 'en', {
        isScreenSupported: isTutorialScreen,
        isAnchorSupported: isKnownTutorialAnchor,
      });
      expect(plan.unavailable.filter((item) => item.reason !== 'condition')).toEqual([]);
      expect(plan.supportedStepIds).toHaveLength(content.steps.length);
    }
  });

  it('todas as telas por onde o tour passa têm etapa', () => {
    const screens = new Set((content?.steps ?? []).map((step) => step.screen));
    expect([...screens].sort()).toEqual([...TUTORIAL_SCREEN_NAMES].sort());
  });
});
