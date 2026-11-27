// CP-C2 — Progresso com cópia local e fila offline; carga do roteiro com
// fallback (servidor → cache → cópia embutida); estado salvo corrompido.
import { loadTutorialContent } from './tutorialApi';
import { TutorialProgressSync, applyTutorialOperation, enqueueTutorialOperation } from './tutorialProgressSync';
import { TUTORIAL_MAX_PENDING_OPERATIONS, createTutorialStorage, parseTutorialLocalState } from './tutorialStorage';
import { TEST_CONTENT_INPUT, createFakeServer, createMemoryAppStorage } from './testUtils/tutorialTestKit';

const NOW = '2026-11-27T12:00:00.000Z';
const empty = { seenStepIds: [], lastStepId: null, completedAt: null, skippedAt: null, contentVersion: null };

describe('CP-C2 — fila de progresso', () => {
  it('aplica patch, junta ids sem repetir e só sobe a versão', () => {
    const one = applyTutorialOperation(empty, { type: 'patch', seenStepIds: ['a.b', 'a.c'], lastStepId: 'a.c', contentVersion: 2 }, NOW);
    const two = applyTutorialOperation(one, { type: 'patch', seenStepIds: ['a.c', 'a.d'], status: 'completed', contentVersion: 1 }, NOW);
    expect(two).toEqual({ seenStepIds: ['a.b', 'a.c', 'a.d'], lastStepId: 'a.c', completedAt: NOW, skippedAt: null, contentVersion: 2 });
    expect(applyTutorialOperation(two, { type: 'reset' }, NOW)).toEqual(empty);
  });

  it('patches seguidos viram um só; reset descarta o que veio antes; teto da fila', () => {
    let queue = enqueueTutorialOperation([], { type: 'patch', seenStepIds: ['a.b'], lastStepId: 'a.b' });
    queue = enqueueTutorialOperation(queue, { type: 'patch', seenStepIds: ['a.c'], lastStepId: 'a.c' });
    expect(queue).toEqual([{ type: 'patch', seenStepIds: ['a.b', 'a.c'], lastStepId: 'a.c' }]);
    queue = enqueueTutorialOperation(queue, { type: 'reset' });
    expect(queue).toEqual([{ type: 'reset' }]);

    let long = [] as ReturnType<typeof enqueueTutorialOperation>;
    for (let index = 0; index < TUTORIAL_MAX_PENDING_OPERATIONS + 5; index += 1) {
      long = [...long, { type: 'reset' }];
      long = enqueueTutorialOperation(long, { type: 'patch', seenStepIds: [`a.b${index}`] });
    }
    expect(long.length).toBeLessThanOrEqual(TUTORIAL_MAX_PENDING_OPERATIONS);
  });

  it('offline: vale na hora no aparelho, persiste e é enviado quando a rede volta', async () => {
    const backend = createMemoryAppStorage();
    const storage = createTutorialStorage(backend);
    const server = createFakeServer();
    server.online = false;
    const sync = new TutorialProgressSync('u1', storage, server, () => new Date(NOW));
    await sync.hydrateFromServer();
    sync.apply({ type: 'patch', seenStepIds: ['test.welcome'], lastStepId: 'test.welcome' });
    expect(sync.progress.seenStepIds).toEqual(['test.welcome']);
    expect(sync.hasPending).toBe(true);

    // Reinício do app ainda offline: o estado local volta do disco.
    const restarted = new TutorialProgressSync('u1', storage, server, () => new Date(NOW));
    expect(restarted.progress.lastStepId).toBe('test.welcome');
    expect(restarted.hasPending).toBe(true);

    server.online = true;
    await restarted.flush();
    expect(restarted.hasPending).toBe(false);
    expect(server.progress.seenStepIds).toEqual(['test.welcome']);
  });

  it('servidor mais antigo que a fila: a fila vale por cima', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer();
    server.progress = { ...empty, seenStepIds: ['test.homeA'], completedAt: NOW };
    server.online = false;
    const sync = new TutorialProgressSync('u1', storage, server, () => new Date(NOW));
    sync.apply({ type: 'reset' });
    sync.apply({ type: 'patch', seenStepIds: ['test.welcome'] });
    server.online = true;
    await sync.hydrateFromServer();
    await sync.flush();
    expect(server.progress.completedAt).toBeNull();
    expect(server.progress.seenStepIds).toEqual(['test.welcome']);
    expect(sync.progress.seenStepIds).toEqual(['test.welcome']);
  });

  it('progresso separado por conta no mesmo aparelho', () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer();
    server.online = false;
    new TutorialProgressSync('u1', storage, server).apply({ type: 'patch', seenStepIds: ['test.welcome'] });
    expect(new TutorialProgressSync('u2', storage, server).progress.seenStepIds).toEqual([]);
  });

  it('estado salvo corrompido volta ao estado vazio (nunca lança)', () => {
    expect(parseTutorialLocalState(null)).toBeNull();
    expect(parseTutorialLocalState({ progress: { seenStepIds: 'x' }, pending: [], activeMode: null })).toBeNull();
    expect(parseTutorialLocalState({ progress: empty, pending: [{ type: 'drop' }], activeMode: null })).toBeNull();
    expect(parseTutorialLocalState({ progress: empty, pending: [], activeMode: 'weird' })).toBeNull();
    expect(parseTutorialLocalState({ progress: empty, pending: [{ type: 'reset' }], activeMode: 'review' })).not.toBeNull();

    const backend = createMemoryAppStorage();
    backend.set('state:u1', '{nao é json');
    expect(createTutorialStorage(backend).loadState('u1').progress.seenStepIds).toEqual([]);
  });
});

describe('CP-C2 — carga do roteiro', () => {
  it('servidor válido: usa e guarda em cache com ETag', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer();
    const result = await loadTutorialContent(server, storage, { invalid: true });
    expect(result?.source).toBe('server');
    expect(storage.loadCachedContent()?.etag).toBe('"test"');
  });

  it('sem rede e sem cache: cópia embutida validada pelo mesmo schema', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer();
    server.online = false;
    const result = await loadTutorialContent(server, storage, TEST_CONTENT_INPUT);
    expect(result?.source).toBe('embedded');
    expect(result?.content.steps.length).toBe(TEST_CONTENT_INPUT.steps.length);
  });

  it('servidor devolve roteiro inválido: cai no cache; 304 usa o cache', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer();
    await loadTutorialContent(server, storage, TEST_CONTENT_INPUT);

    server.content = { schemaVersion: 99 };
    expect((await loadTutorialContent(server, storage, { invalid: true }))?.source).toBe('cache');

    const notModified = { fetchContent: () => Promise.resolve({ raw: null, etag: '"test"' }) };
    expect((await loadTutorialContent(notModified, storage, { invalid: true }))?.source).toBe('cache');
  });

  it('sem rede: entre cache e cópia embutida, o mais novo (app atualizado)', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    storage.saveCachedContent(TEST_CONTENT_INPUT, '"v1"');
    const server = createFakeServer();
    server.online = false;
    const newer = { ...TEST_CONTENT_INPUT, contentVersion: 3 };
    const result = await loadTutorialContent(server, storage, newer);
    expect(result?.source).toBe('embedded');
    expect(result?.content.contentVersion).toBe(3);
  });

  it('nada válido em lugar nenhum: null (o tour não abre)', async () => {
    const storage = createTutorialStorage(createMemoryAppStorage());
    const server = createFakeServer({ nope: true });
    expect(await loadTutorialContent(server, storage, { nope: true })).toBeNull();
  });
});
