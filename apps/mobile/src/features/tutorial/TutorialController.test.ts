// CP-C2 — Motor do tutorial com roteiro de TESTE (não o real) e ambiente
// falso: navega entre telas, pula etapa sem âncora/rota/condição, Voltar,
// Próximo, Concluir, Pular, retomada após reinício, modo novidades só com ids
// novos, cópia embutida sem rede, não abre com folha/paywall, pausa no meio,
// "Ver tutorial de novo".
import { TutorialController } from './TutorialController';
import { loadTutorialContent } from './tutorialApi';
import { TutorialProgressSync } from './tutorialProgressSync';
import { createTutorialStorage, type TutorialStorage } from './tutorialStorage';
import {
  TEST_CONTENT_INPUT,
  createFakeEnvironment,
  createFakeServer,
  createFakeTelemetry,
  createMemoryAppStorage,
  testSupport,
  until,
  type FakeEnvironment,
  type FakeServer,
  type FakeTelemetry,
} from './testUtils/tutorialTestKit';

const USER_ID = 'user-test-1';

interface Harness {
  controller: TutorialController;
  sync: TutorialProgressSync;
  env: FakeEnvironment;
  server: FakeServer;
  telemetry: FakeTelemetry;
  storage: TutorialStorage;
}

async function setup(options: {
  server?: FakeServer;
  storage?: TutorialStorage;
  env?: FakeEnvironment;
  isPro?: boolean;
  embedded?: unknown;
} = {}): Promise<Harness> {
  const server = options.server ?? createFakeServer();
  const storage = options.storage ?? createTutorialStorage(createMemoryAppStorage());
  const env = options.env ?? createFakeEnvironment();
  const telemetry = createFakeTelemetry();
  const sync = new TutorialProgressSync(USER_ID, storage, server);
  const controller = new TutorialController({
    userId: USER_ID,
    context: { isPro: options.isPro ?? false, blendiOwnership: 'blendi' },
    locale: 'en',
    env,
    telemetry,
    sync,
    loadContent: async () =>
      (await loadTutorialContent(server, storage, options.embedded ?? TEST_CONTENT_INPUT))?.content ?? null,
    support: testSupport,
  });
  await controller.init();
  return { controller, sync, env, server, telemetry, storage };
}

function stepId(h: Harness): string | undefined {
  return h.controller.getState().step?.id;
}

async function showing(h: Harness, id: string): Promise<void> {
  await until(() => h.controller.getState().phase === 'showing' && stepId(h) === id);
}

async function runToEnd(h: Harness): Promise<string[]> {
  const seen: string[] = [];
  while (h.controller.getState().isRunning) {
    await until(() => !h.controller.getState().isRunning || h.controller.getState().phase === 'showing');
    if (!h.controller.getState().isRunning) break;
    seen.push(stepId(h) ?? '');
    h.controller.next();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return seen;
}

describe('CP-C2 — TutorialController', () => {
  it('tour completo: navega entre telas e pula etapa sem âncora, rota inexistente e condição falsa', async () => {
    const h = await setup();
    expect(h.controller.maybeAutoStart('Home')).toBe(true);

    const seen = await runToEnd(h);
    expect(seen).toEqual(['test.welcome', 'test.homeA', 'test.blend', 'test.me', 'test.done']);
    expect(h.env.navigations).toEqual(expect.arrayContaining(['Home', 'Blend', 'Me']));
    expect(h.env.navigations[h.env.navigations.length - 1]).toBe('Home');
    expect(h.env.scrolledToTop).toBe(1);

    const unavailable = h.telemetry.unavailable.map((item) => `${item.stepId}:${item.reason}`);
    expect(unavailable).toEqual(
      expect.arrayContaining(['test.ghostScreen:route', 'test.proOnly:condition', 'test.missing:anchorTimeout'])
    );
    // Analytics sem dado pessoal: só ids, modo e números.
    expect(JSON.stringify(h.telemetry.events)).not.toContain(USER_ID);
    expect(h.telemetry.events.map((item) => item.event)).toEqual(
      expect.arrayContaining(['tutorial_started', 'tutorial_step_viewed', 'tutorial_completed', 'tutorial_step_unavailable'])
    );
    expect(h.telemetry.events.find((item) => item.event === 'tutorial_started')?.properties.mode).toBe('full');
  });

  it('"N de M" conta só as etapas que se aplicam (a etapa sem âncora sai da conta)', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    // 6 planejadas (ghost e proOnly já fora); test.missing sai ao não aparecer.
    expect(h.controller.getState().total).toBe(6);
    h.controller.next();
    await showing(h, 'test.homeA');
    h.controller.next();
    await showing(h, 'test.blend');
    expect(h.controller.getState().total).toBe(5);
    expect(h.controller.getState().index).toBe(2);
  });

  it('Voltar volta uma etapa (e não faz nada na primeira); Próximo avança', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    h.controller.back();
    expect(stepId(h)).toBe('test.welcome');
    h.controller.next();
    await showing(h, 'test.homeA');
    h.controller.next();
    await showing(h, 'test.blend');
    h.controller.back();
    // test.missing já saiu da lista: volta direto para test.homeA.
    await showing(h, 'test.homeA');
  });

  it('Pular encerra, marca dispensado e não reabre sozinho', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    h.controller.next();
    await showing(h, 'test.homeA');
    h.controller.skip();

    expect(h.controller.getState().isRunning).toBe(false);
    expect(h.telemetry.events.find((item) => item.event === 'tutorial_skipped')?.properties.step_id).toBe('test.homeA');
    await until(() => !h.sync.hasPending);
    expect(h.server.progress.skippedAt).not.toBeNull();
    // Todas as etapas que esta versão sabe mostrar ficam "vistas" (inclusive condição falsa).
    expect(h.server.progress.seenStepIds).toEqual(
      expect.arrayContaining(['test.welcome', 'test.homeA', 'test.missing', 'test.proOnly', 'test.blend', 'test.me', 'test.done'])
    );
    expect(h.server.progress.seenStepIds).not.toContain('test.ghostScreen');

    // Nova sessão do app: nada abre.
    const next = await setup({ server: h.server, storage: h.storage });
    expect(next.controller.maybeAutoStart('Home')).toBe(false);
  });

  it('retoma da última etapa depois de fechar o app no meio', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    h.controller.next();
    await showing(h, 'test.homeA');
    h.controller.next();
    await showing(h, 'test.blend');
    h.controller.dispose();
    h.sync.dispose();

    // Reinício sem rede: vale a cópia local.
    h.server.online = false;
    const restarted = await setup({ server: h.server, storage: h.storage });
    expect(restarted.controller.maybeAutoStart('Home')).toBe(true);
    await showing(restarted, 'test.blend');
    expect(restarted.env.navigations).toContain('Blend');
  });

  it('modo novidades: depois de uma atualização, só as etapas com id novo, com abertura própria', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await runToEnd(h);
    await until(() => !h.sync.hasPending);

    const updated = {
      ...TEST_CONTENT_INPUT,
      contentVersion: 2,
      steps: [
        ...TEST_CONTENT_INPUT.steps,
        { id: 'test.newFeature', order: 65, screen: 'Blend', anchor: 'test.anchorBlend', addedInVersion: 2, text: TEST_CONTENT_INPUT.steps[0].text },
        // Âncora que esta versão do app não tem: fica para depois da atualização do app.
        { id: 'test.futureAnchor', order: 66, screen: 'Blend', anchor: 'test.notInThisBuild', addedInVersion: 2, text: TEST_CONTENT_INPUT.steps[0].text },
      ],
    };
    h.server.content = updated;
    const next = await setup({ server: h.server, storage: h.storage });
    expect(next.controller.maybeAutoStart('Home')).toBe(true);
    const seen = await runToEnd(next);
    expect(seen).toEqual(['tutorial.whatsNewIntro', 'test.newFeature']);
    expect(next.telemetry.events.find((item) => item.event === 'tutorial_started')?.properties.mode).toBe('whatsNew');
    await until(() => !next.sync.hasPending);
    expect(h.server.progress.seenStepIds).toContain('test.newFeature');
    expect(h.server.progress.seenStepIds).not.toContain('test.futureAnchor');
    expect(h.server.progress.seenStepIds).not.toContain('tutorial.whatsNewIntro');

    // Sem etapa nova: nada aparece.
    const again = await setup({ server: h.server, storage: h.storage });
    expect(again.controller.maybeAutoStart('Home')).toBe(false);
  });

  it('sem rede: usa a cópia embutida e guarda o progresso para enviar depois', async () => {
    const server = createFakeServer();
    server.online = false;
    const h = await setup({ server });
    expect(h.controller.maybeAutoStart('Home')).toBe(true);
    await showing(h, 'test.welcome');
    expect(h.sync.hasPending).toBe(true);

    server.online = true;
    await h.sync.flush();
    expect(h.sync.hasPending).toBe(false);
    expect(server.progress.seenStepIds).toContain('test.welcome');
  });

  it('não abre por cima de folha/paywall: espera a tela ficar livre', async () => {
    const env = createFakeEnvironment();
    env.free = false;
    const h = await setup({ env });
    expect(h.controller.maybeAutoStart('Home')).toBe(false);
    expect(h.controller.getState().isRunning).toBe(false);

    env.setFree(true);
    expect(h.controller.maybeAutoStart('Home')).toBe(true);
  });

  it('só abre na Home', async () => {
    const h = await setup();
    expect(h.controller.maybeAutoStart('Me')).toBe(false);
    expect(h.controller.maybeAutoStart(undefined)).toBe(false);
    expect(h.controller.maybeAutoStart('Home')).toBe(true);
  });

  it('pausa quando uma folha abre no meio e retoma a mesma etapa quando fecha', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    h.controller.next();
    await showing(h, 'test.homeA');

    h.env.setFree(false);
    await until(() => h.controller.getState().phase === 'paused');
    h.controller.next(); // sem efeito pausado
    expect(stepId(h)).toBe('test.homeA');

    h.env.setFree(true);
    await showing(h, 'test.homeA');
  });

  it('"Ver tutorial de novo": apaga o progresso e começa da primeira etapa no modo revisão', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await runToEnd(h);
    await until(() => !h.sync.hasPending);
    expect(h.server.progress.completedAt).not.toBeNull();

    h.env.currentScreen = 'Me';
    expect(h.controller.replay()).toBe(true);
    await showing(h, 'test.welcome');
    expect(h.controller.getState().mode).toBe('review');
    expect(h.server.calls).toContain('resetProgress');
    expect(h.env.navigations[h.env.navigations.length - 1]).toBe('Home');
  });

  it('etapa cuja âncora some durante a exibição é resolvida de novo (nunca fica travada)', async () => {
    const h = await setup();
    h.controller.maybeAutoStart('Home');
    await showing(h, 'test.welcome');
    h.controller.next();
    await showing(h, 'test.homeA');
    h.env.rendered.get('Home')?.delete('test.anchorA');
    await h.controller.refreshTarget();
    // A âncora não volta: a etapa sai e o tour segue.
    await showing(h, 'test.blend');
  });

  it('roteiro vazio/inválido no servidor e cópia embutida inválida: não abre e não lança', async () => {
    const server = createFakeServer({ schemaVersion: 1, steps: [] });
    const h = await setup({ server, embedded: { nope: true } });
    expect(h.controller.maybeAutoStart('Home')).toBe(false);
    expect(h.controller.replay()).toBe(false);
  });
});
