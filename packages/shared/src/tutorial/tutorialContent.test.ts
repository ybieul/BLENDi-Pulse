// CP-C2 / CP-C2a — Roteiro do tutorial: schema aceita o roteiro inicial e
// recusa roteiro quebrado; marcadores (lista fechada, limite no texto
// preenchido, app antigo nunca mostra "{{" cru); regras de texto do Jon;
// Pulse Pro como Pulse AI ilimitado.
// Rodar com: pnpm --filter @blendi/shared test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DAILY_MISSIONS_PER_DAY,
  FREE_PANTRY_SCANS_PER_MONTH,
  FREE_PULSE_AI_MESSAGES_PER_DAY,
} from '../planLimits';
import {
  TUTORIAL_BODY_MAX_LENGTH,
  TUTORIAL_LOCALES,
  TUTORIAL_MARKERS,
  TUTORIAL_MARKER_MAX_LENGTH,
  TUTORIAL_MAX_STEPS,
  TUTORIAL_TITLE_MAX_LENGTH,
  fillTutorialText,
  findTutorialMarkers,
  hasOnlyKnownTutorialMarkers,
  parseTutorialContent,
  tutorialContentSchema,
  updateTutorialProgressSchema,
  type TutorialContentInput,
  type TutorialMarkerValues,
} from '../schemas/tutorial';
import { TUTORIAL_CONTENT } from './tutorial.content';

function clone(): TutorialContentInput {
  return JSON.parse(JSON.stringify(TUTORIAL_CONTENT)) as TutorialContentInput;
}

function allTexts(content: TutorialContentInput) {
  return [
    { id: 'whatsNewIntro', condition: undefined as string | undefined, text: content.whatsNewIntro },
    ...content.steps.map(step => ({ id: step.id, condition: step.condition as string | undefined, text: step.text })),
  ];
}

function step(id: string) {
  const found = TUTORIAL_CONTENT.steps.find(item => item.id === id);
  assert.ok(found, id);
  return found;
}

/** Valores reais que o app usa (o mesmo formatador do botão). */
const METRIC: TutorialMarkerValues = {
  waterGlass: '250 ml',
  freeAiPerDay: String(FREE_PULSE_AI_MESSAGES_PER_DAY),
  freeScansPerMonth: String(FREE_PANTRY_SCANS_PER_MONTH),
  missionsPerDay: String(DAILY_MISSIONS_PER_DAY),
};
const IMPERIAL: TutorialMarkerValues = { ...METRIC, waterGlass: '8.5 fl oz' };

describe('CP-C2 — schema do roteiro', () => {
  it('aceita o roteiro inicial', () => {
    const result = tutorialContentSchema.safeParse(TUTORIAL_CONTENT);
    assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues));
  });

  it('recusa id repetido e ordem repetida', () => {
    const ids = clone();
    ids.steps[1] = { ...ids.steps[1]!, id: ids.steps[0]!.id };
    assert.equal(parseTutorialContent(ids), null);
    const orders = clone();
    orders.steps[1] = { ...orders.steps[1]!, order: orders.steps[0]!.order };
    assert.equal(parseTutorialContent(orders), null);
  });

  it('recusa texto faltando em um idioma ou vazio', () => {
    const content = clone();
    const first = content.steps[0]!;
    content.steps[0] = { ...first, text: { en: first.text.en } as typeof first.text };
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

  it('recusa texto longo, id fora do formato, versão futura, outra schemaVersion e roteiro vazio', () => {
    const long = clone();
    long.steps[0]!.text.en.body = 'a'.repeat(TUTORIAL_BODY_MAX_LENGTH + 1);
    assert.equal(parseTutorialContent(long), null);
    const badId = clone();
    badId.steps[0]!.id = 'Home Rings';
    assert.equal(parseTutorialContent(badId), null);
    const future = clone();
    future.steps[0]!.addedInVersion = future.contentVersion + 1;
    assert.equal(parseTutorialContent(future), null);
    assert.equal(parseTutorialContent({ ...clone(), schemaVersion: 2 }), null);
    assert.equal(parseTutorialContent({ ...clone(), steps: [] }), null);
    assert.equal(parseTutorialContent(null), null);
  });

  it('ignora campo novo desconhecido numa etapa (app antigo não quebra)', () => {
    const content = clone() as unknown as { steps: Array<Record<string, unknown>> };
    content.steps[0]!.futureField = { anything: true };
    const parsed = parseTutorialContent(content);
    assert.ok(parsed);
    assert.equal('futureField' in parsed.steps[0]!, false);
  });

  it('cabe no teto de etapas', () => {
    assert.ok(TUTORIAL_CONTENT.steps.length <= TUTORIAL_MAX_STEPS);
  });

  it('schema do PATCH: teto de ids, chave desconhecida e tipo errado', () => {
    assert.equal(updateTutorialProgressSchema.safeParse({}).success, true);
    const tooMany = Array.from({ length: TUTORIAL_MAX_STEPS + 1 }, (_, index) => `a.b${index}`);
    assert.equal(updateTutorialProgressSchema.safeParse({ seenStepIds: tooMany }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ userId: 'x' }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ seenStepIds: 'home.rings' }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ seenStepIds: [{ $gt: '' }] }).success, false);
    assert.equal(updateTutorialProgressSchema.safeParse({ status: 'done' }).success, false);
  });
});

describe('CP-C2a — marcadores', () => {
  it('preenche os marcadores conhecidos (métrico, imperial, en e pt-BR)', () => {
    const water = step('home.logWater');
    assert.match(fillTutorialText(water.text.en.body, METRIC), /one 250 ml glass/);
    assert.match(fillTutorialText(water.text.en.body, IMPERIAL), /one 8\.5 fl oz glass/);
    assert.match(fillTutorialText(water.text['pt-BR'].body, METRIC), /copo de 250 ml/);
    assert.match(fillTutorialText(water.text['pt-BR'].body, IMPERIAL), /copo de 8\.5 fl oz/);

    const usage = step('pulseAi.usage');
    assert.match(fillTutorialText(usage.text.en.body, METRIC), new RegExp(`includes ${FREE_PULSE_AI_MESSAGES_PER_DAY} Pulse AI`));
    assert.match(fillTutorialText(step('pulseAi.pantry').text['pt-BR'].body, METRIC), new RegExp(`inclui ${FREE_PANTRY_SCANS_PER_MONTH} leituras`));
    assert.match(fillTutorialText(step('home.missions').text.en.body, METRIC), new RegExp(`^${DAILY_MISSIONS_PER_DAY} new missions`));
  });

  it('as etapas com número usam marcador (nenhum número de limite escrito no texto)', () => {
    const expected: Record<string, string> = {
      'home.logWater': 'waterGlass',
      'home.missions': 'missionsPerDay',
      'pulseAi.usage': 'freeAiPerDay',
      'pulseAi.pantry': 'freeScansPerMonth',
    };
    for (const [id, marker] of Object.entries(expected)) {
      for (const locale of TUTORIAL_LOCALES) {
        assert.deepEqual(findTutorialMarkers(step(id).text[locale].body), [marker], `${id} ${locale}`);
      }
    }
    for (const { id, text } of allTexts(TUTORIAL_CONTENT)) {
      for (const locale of TUTORIAL_LOCALES) {
        const value = `${text[locale].title} ${text[locale].body}`;
        assert.doesNotMatch(value, /\b\d+\s?(ml|fl oz)\b/i, `${id} ${locale}: volume escrito à mão`);
        assert.doesNotMatch(value, /\b(three|três|tres)\b/i, `${id} ${locale}: número por extenso`);
        assert.doesNotMatch(value, /\b3\b/, `${id} ${locale}: limite escrito à mão`);
      }
    }
  });

  it('marcador desconhecido, chave solta ou marcador vazio = roteiro inválido', () => {
    for (const bad of ['Use {{petName}} today.', 'Half {{waterGlass', 'Odd }} brace.', 'Empty {{}} marker.', 'Spaced {{ waterGlass }}.']) {
      assert.equal(hasOnlyKnownTutorialMarkers(bad), false, bad);
      const content = clone();
      content.steps[0]!.text.en.body = bad;
      assert.equal(parseTutorialContent(content), null, bad);
    }
    assert.equal(hasOnlyKnownTutorialMarkers('A {{waterGlass}} glass.'), true);
  });

  it('app antigo: marcador que ele não conhece recusa o roteiro do servidor (cai na cópia embutida, nunca "{{" cru)', () => {
    // Simula um marcador criado depois: o schema desta versão não o conhece.
    const newer = clone();
    newer.steps[0]!.text.en.body = 'You have {{freeBlendsPerWeek}} free blends.';
    assert.equal(parseTutorialContent(newer), null);
    // Regra: marcador novo sobe a schemaVersion; app antigo recusa por isso também.
    assert.equal(parseTutorialContent({ ...clone(), schemaVersion: 2 }), null);
  });

  it('o limite vale para o texto preenchido, com o maior valor possível de cada marcador', () => {
    const maxValues = Object.fromEntries(
      TUTORIAL_MARKERS.map(marker => [marker, 'x'.repeat(TUTORIAL_MARKER_MAX_LENGTH[marker])])
    ) as TutorialMarkerValues;
    for (const { id, text } of allTexts(TUTORIAL_CONTENT)) {
      for (const locale of TUTORIAL_LOCALES) {
        assert.ok(fillTutorialText(text[locale].title, maxValues).length <= TUTORIAL_TITLE_MAX_LENGTH, `${id} ${locale} título`);
        assert.ok(fillTutorialText(text[locale].body, maxValues).length <= TUTORIAL_BODY_MAX_LENGTH, `${id} ${locale} texto`);
      }
    }
    // Os valores reais cabem no tamanho máximo reservado.
    for (const values of [METRIC, IMPERIAL]) {
      for (const marker of TUTORIAL_MARKERS) {
        assert.ok(values[marker].length <= TUTORIAL_MARKER_MAX_LENGTH[marker], `${marker}: ${values[marker]}`);
      }
    }
    // Texto que só passa do limite depois de preenchido é recusado.
    const content = clone();
    const filler = 'a'.repeat(TUTORIAL_BODY_MAX_LENGTH - 5);
    content.steps[0]!.text.en.body = `${filler}{{waterGlass}}`;
    assert.equal(parseTutorialContent(content), null);
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
      text.en.title.split(/\s+/).forEach((word, index) => {
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
      assert.match(step(id).text.en.body, /estimate/i, id);
      assert.match(step(id).text['pt-BR'].body, /estimativa/i, id);
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

describe('CP-C2a — Pulse Pro ilimitado e Passo a passo', () => {
  it('Pro aparece como Pulse AI ilimitado, nunca "sem limite diário"', () => {
    for (const id of ['me.planPro', 'me.planFree', 'pulseAi.usage']) {
      assert.match(step(id).text.en.body, /unlimited Pulse AI/, id);
      assert.match(step(id).text['pt-BR'].body, /Pulse AI (é )?ilimitado/, id);
    }
    for (const { id, text } of allTexts(TUTORIAL_CONTENT)) {
      assert.doesNotMatch(text.en.body, /daily limit/i, id);
      assert.doesNotMatch(text['pt-BR'].body, /limite diário/i, id);
    }
  });

  it('o timer explica o Passo a passo; o seletor vem depois e não repete o timer', () => {
    const timer = step('blend.timer');
    const toggle = step('blend.modeToggle');
    assert.match(timer.text.en.body, /one step at a time/);
    assert.match(timer.text['pt-BR'].body, /uma etapa por vez/);
    assert.ok(toggle.order > timer.order);
    assert.doesNotMatch(toggle.text.en.body, /how long to blend/);
  });
});
