// CP-C2 — Roteiro do tutorial: o schema do shared aceita o roteiro inicial e
// recusa roteiro quebrado; o texto segue as regras do Jon; o update do
// progresso descarta ids desconhecidos e nunca passa da versão do servidor.
// (O pacote shared não tem runner de teste próprio: o teste mora aqui.)
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TUTORIAL_BODY_MAX_LENGTH,
  TUTORIAL_CONTENT,
  TUTORIAL_LOCALES,
  TUTORIAL_MAX_STEPS,
  parseTutorialContent,
  tutorialContentSchema,
  updateTutorialProgressSchema,
  type TutorialContentInput,
} from '@blendi/shared';

import { buildTutorialProgressUpdate, loadTutorialContent, matchesIfNoneMatch } from './tutorial.service';

function clone(): TutorialContentInput {
  return JSON.parse(JSON.stringify(TUTORIAL_CONTENT)) as TutorialContentInput;
}

function allTexts(content: TutorialContentInput) {
  return [
    { id: 'whatsNewIntro', condition: undefined, text: content.whatsNewIntro },
    ...content.steps.map(step => ({ id: step.id, condition: step.condition, text: step.text })),
  ];
}

describe('CP-C2 — schema do roteiro', () => {
  it('aceita o roteiro inicial', () => {
    const result = tutorialContentSchema.safeParse(TUTORIAL_CONTENT);
    assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues));
  });

  it('recusa id repetido', () => {
    const content = clone();
    content.steps[1] = { ...content.steps[1]!, id: content.steps[0]!.id };
    assert.equal(parseTutorialContent(content), null);
  });

  it('recusa ordem repetida', () => {
    const content = clone();
    content.steps[1] = { ...content.steps[1]!, order: content.steps[0]!.order };
    assert.equal(parseTutorialContent(content), null);
  });

  it('recusa texto faltando em um idioma', () => {
    const content = clone();
    const step = content.steps[0]!;
    content.steps[0] = { ...step, text: { en: step.text.en } as typeof step.text };
    assert.equal(parseTutorialContent(content), null);

    const empty = clone();
    empty.steps[0]!.text['pt-BR'].body = '   ';
    assert.equal(parseTutorialContent(empty), null);
  });

  it('recusa condição desconhecida', () => {
    const content = clone() as unknown as { steps: Array<Record<string, unknown>> };
    content.steps[0]!.condition = 'hasPets';
    assert.equal(parseTutorialContent(content), null);
  });

  it('recusa texto acima do limite do balão, id fora do formato e etapa de versão futura', () => {
    const long = clone();
    long.steps[0]!.text.en.body = 'a'.repeat(TUTORIAL_BODY_MAX_LENGTH + 1);
    assert.equal(parseTutorialContent(long), null);

    const badId = clone();
    badId.steps[0]!.id = 'Home Rings';
    assert.equal(parseTutorialContent(badId), null);

    const future = clone();
    future.steps[0]!.addedInVersion = future.contentVersion + 1;
    assert.equal(parseTutorialContent(future), null);
  });

  it('recusa outra schemaVersion e roteiro sem etapas', () => {
    assert.equal(parseTutorialContent({ ...clone(), schemaVersion: 2 }), null);
    assert.equal(parseTutorialContent({ ...clone(), steps: [] }), null);
    assert.equal(parseTutorialContent(null), null);
    assert.equal(parseTutorialContent('x'), null);
  });

  it('ignora campo novo desconhecido numa etapa (app antigo não quebra)', () => {
    const content = clone() as unknown as { steps: Array<Record<string, unknown>> };
    content.steps[0]!.futureField = { anything: true };
    const parsed = parseTutorialContent(content);
    assert.ok(parsed);
    assert.equal('futureField' in parsed.steps[0]!, false);
  });

  it('o roteiro inicial cabe no teto de etapas', () => {
    assert.ok(TUTORIAL_CONTENT.steps.length <= TUTORIAL_MAX_STEPS);
  });
});

describe('CP-C2 — regras de texto do roteiro (Jon)', () => {
  const texts = allTexts(TUTORIAL_CONTENT);
  const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'at', 'by', 'with', 'from']);

  it('sem travessão nem exclamação, em nenhum idioma', () => {
    for (const { id, text } of texts) {
      for (const locale of TUTORIAL_LOCALES) {
        const value = `${text[locale].title} ${text[locale].body}`;
        assert.doesNotMatch(value, /[—–]/, `${id} ${locale}: travessão`);
        assert.doesNotMatch(value, /!/, `${id} ${locale}: exclamação`);
      }
    }
  });

  it('títulos em inglês em Title Case', () => {
    for (const { id, text } of texts) {
      const words = text.en.title.split(/\s+/);
      words.forEach((word, index) => {
        const bare = word.replace(/[^A-Za-z]/g, '');
        if (!bare) return;
        if (index > 0 && SMALL_WORDS.has(bare.toLowerCase())) {
          assert.equal(bare, bare.toLowerCase(), `${id}: "${word}" deveria ser minúscula`);
          return;
        }
        assert.match(bare, /^[A-Z]/, `${id}: "${word}" deveria começar com maiúscula`);
      });
    }
  });

  it('nunca "no ice"; o Lite só aparece como "made for powders and fresh fruit"', () => {
    for (const { id, text } of texts) {
      assert.doesNotMatch(`${text.en.title} ${text.en.body}`, /no ice/i, id);
      assert.doesNotMatch(`${text['pt-BR'].title} ${text['pt-BR'].body}`, /sem gelo/i, id);
      if (/\bLite\b/.test(text.en.body)) {
        assert.match(text.en.body, /made for powders and fresh fruit/, id);
      }
    }
  });

  it('nutrição como estimativa nas etapas que falam de valores', () => {
    for (const id of ['home.rings', 'pulseAi.input']) {
      const step = TUTORIAL_CONTENT.steps.find(item => item.id === id);
      assert.ok(step, id);
      assert.match(step.text.en.body, /estimate/i, id);
      assert.match(step.text['pt-BR'].body, /estimativa/i, id);
    }
  });

  it('texto neutro: sem "seu BLENDi" em etapa que vale para quem não tem BLENDi', () => {
    for (const { id, condition, text } of texts) {
      if (condition === 'hasBlendi') continue;
      assert.doesNotMatch(text.en.body, /your BLENDi/i, id);
      assert.doesNotMatch(text['pt-BR'].body, /seu BLENDi/i, id);
    }
  });
});

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

  it('schema do PATCH: teto de ids, chave desconhecida e tipo errado', () => {
    assert.equal(updateTutorialProgressSchema.safeParse({}).success, true);
    assert.equal(
      updateTutorialProgressSchema.safeParse({ seenStepIds: Array.from({ length: TUTORIAL_MAX_STEPS + 1 }, (_, i) => `a.b${i}`) }).success,
      false
    );
    assert.equal(updateTutorialProgressSchema.safeParse({ userId: 'x' }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ seenStepIds: 'home.rings' }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ seenStepIds: [{ $gt: '' }] }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ status: 'done' }).success, false);
  });
});
