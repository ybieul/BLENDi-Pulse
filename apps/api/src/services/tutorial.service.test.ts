// CP-C2 — tutorial.service: ETag (estável e sensível a texto), If-None-Match,
// roteiro inválido não lança, e o update do PATCH descarta ids desconhecidos e
// nunca passa da versão do servidor. Schema, marcadores e regras de texto do
// roteiro são testados no shared (packages/shared/src/tutorial/tutorialContent.test.ts).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TUTORIAL_CONTENT, type TutorialContentInput } from '@blendi/shared';

import { buildTutorialProgressUpdate, loadTutorialContent, matchesIfNoneMatch } from './tutorial.service';

function clone(): TutorialContentInput {
  return JSON.parse(JSON.stringify(TUTORIAL_CONTENT)) as TutorialContentInput;
}

describe('CP-C2 — tutorial.service', () => {
  const loaded = loadTutorialContent();

  it('carrega o roteiro com ETag estável e ids conhecidos', () => {
    assert.ok(loaded);
    assert.equal(loadTutorialContent()?.etag, loaded.etag);
    assert.match(loaded.etag, /^"tutorial-1-\d+-[\w-]+"$/);
    assert.equal(loaded.knownStepIds.has('home.rings'), true);
  });

  it('ETag muda quando um texto muda, mesmo sem subir a versão', () => {
    const content = clone();
    content.steps[0]!.text.en.body = `${content.steps[0]!.text.en.body} x`;
    assert.notEqual(loadTutorialContent(content)?.etag, loaded?.etag);
  });

  it('roteiro inválido não lança: devolve null', () => {
    assert.equal(loadTutorialContent({ schemaVersion: 1 }), null);
  });

  it('If-None-Match: igual, lista, fraco e *', () => {
    assert.equal(matchesIfNoneMatch(undefined, '"a"'), false);
    assert.equal(matchesIfNoneMatch('"a"', '"a"'), true);
    assert.equal(matchesIfNoneMatch('"b", "a"', '"a"'), true);
    assert.equal(matchesIfNoneMatch('W/"a"', '"a"'), true);
    assert.equal(matchesIfNoneMatch('*', '"a"'), true);
    assert.equal(matchesIfNoneMatch('"b"', '"a"'), false);
  });

  it('update descarta id desconhecido e repetido, e não grava lixo', () => {
    assert.ok(loaded);
    const now = new Date('2026-11-27T12:00:00.000Z');
    const update = buildTutorialProgressUpdate(
      { seenStepIds: ['home.rings', 'home.rings', 'fake.step', 'home.streak'], lastStepId: 'fake.step' },
      loaded,
      now
    );
    assert.deepEqual(update.$addToSet, { seenStepIds: { $each: ['home.rings', 'home.streak'] } });
    assert.equal(update.$set, undefined);

    const onlyUnknown = buildTutorialProgressUpdate({ seenStepIds: ['fake.step'] }, loaded, now);
    assert.equal(onlyUnknown.$addToSet, undefined);
    assert.deepEqual(onlyUnknown.$setOnInsert, { seenStepIds: [] });
  });

  it('status, lastStepId e contentVersion (limitada à versão do servidor)', () => {
    assert.ok(loaded);
    const now = new Date('2026-11-27T12:00:00.000Z');
    const completed = buildTutorialProgressUpdate(
      { status: 'completed', lastStepId: 'end.done', contentVersion: 999 },
      loaded,
      now
    );
    assert.deepEqual(completed.$set, { completedAt: now, lastStepId: 'end.done' });
    assert.deepEqual(completed.$max, { contentVersion: loaded.content.contentVersion });

    const skipped = buildTutorialProgressUpdate({ status: 'skipped', lastStepId: null }, loaded, now);
    assert.deepEqual(skipped.$set, { lastStepId: null, skippedAt: now });
  });
});
