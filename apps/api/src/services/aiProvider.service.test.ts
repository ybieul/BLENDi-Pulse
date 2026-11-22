// CP-B1 — sobrecarga do Gemini no aiProvider: até 3 tentativas em 500/503
// com espera crescente e aleatória, modelo reserva opcional (AI_FALLBACK_MODEL)
// e orçamento de tempo (janela da chamada e orçamento da requisição).
// SDK do Google e env mockados; relógio/espera/sorteio via aiProviderTiming.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { pathToFileURL } from 'node:url';

class FakeGoogleFetchError extends Error {
  constructor(public readonly status: number) {
    super(`[GoogleGenerativeAI Error]: [${status}] fake`);
  }
}

type Outcome = string | number; // texto = sucesso; número = erro HTTP do Google

// Respostas por modelo, em ordem.
let outcomesByModel: Record<string, Outcome[]> = {};
let callsByModel: Record<string, number> = {};
let modelConfigs: Array<Record<string, unknown>> = [];

class FakeGoogleGenerativeAI {
  getGenerativeModel(config: { model: string }) {
    modelConfigs.push(config);
    return {
      generateContent: async () => {
        fakeNow += callLatencyMs;
        callsByModel[config.model] = (callsByModel[config.model] ?? 0) + 1;
        const outcome = outcomesByModel[config.model]?.shift();
        if (outcome === undefined) throw new Error(`no outcome for ${config.model}`);
        if (typeof outcome === 'number') throw new FakeGoogleFetchError(outcome);
        return { response: { text: () => outcome } };
      },
    };
  }
}

// A API roda como CommonJS (require → dist/index.js); o mock por nome do
// pacote resolveria a entrada ESM (dist/index.mjs) e não pegaria. Mocka o
// arquivo que o aiProvider de fato carrega.
const GOOGLE_SDK_CJS_URL = pathToFileURL(
  createRequire(__filename).resolve('@google/generative-ai')
).href;

mock.module(GOOGLE_SDK_CJS_URL, {
  namedExports: {
    GoogleGenerativeAI: FakeGoogleGenerativeAI,
    GoogleGenerativeAIFetchError: FakeGoogleFetchError,
  },
});

const fakeEnv: Record<string, string | undefined> = {};

mock.module('../config/env', {
  namedExports: { env: fakeEnv },
});

type ProviderModule = typeof import('./aiProvider.service.js');
type BudgetModule = typeof import('./aiRequestBudget.service.js');
let provider: ProviderModule;
let budget: BudgetModule;

before(async () => {
  provider = await import('./aiProvider.service.js');
  budget = await import('./aiRequestBudget.service.js');
});

// Relógio falso: a espera só avança o relógio.
let fakeNow = 0;
let delays: number[] = [];
let randomValue = 0.5;
let callLatencyMs = 0;
let logLines: Array<{ text: unknown; payload: unknown }> = [];

beforeEach(() => {
  Object.assign(fakeEnv, {
    AI_PROVIDER: 'google',
    AI_MODEL: 'primary-model',
    AI_API_KEY: 'test-key-123456',
    AI_FALLBACK_MODEL: undefined,
    VISION_PROVIDER: 'google',
    VISION_MODEL: 'vision-model',
    VISION_API_KEY: 'test-key-123456',
  });
  outcomesByModel = {};
  callsByModel = {};
  modelConfigs = [];
  fakeNow = 1_000_000;
  delays = [];
  randomValue = 0.5;
  callLatencyMs = 0;
  logLines = [];
  mock.method(provider.aiProviderTiming, 'now', () => fakeNow);
  mock.method(provider.aiProviderTiming, 'random', () => randomValue);
  mock.method(provider.aiProviderTiming, 'delay', async (ms: number) => {
    delays.push(ms);
    fakeNow += ms;
  });
  for (const level of ['info', 'warn', 'error'] as const) {
    mock.method(console, level, (text: unknown, payload: unknown) => {
      logLines.push({ text, payload });
    });
  }
});

afterEach(() => {
  mock.restoreAll();
});

const REQUEST = {
  systemPrompt: 'SECRET SYSTEM PROMPT',
  messages: [{ role: 'user' as const, content: 'SECRET USER MESSAGE' }],
};

describe('aiProvider — sobrecarga do Gemini (CP-B1)', () => {
  it('503 → sucesso na 2ª tentativa, depois de ~1 s', async () => {
    outcomesByModel = { 'primary-model': [503, '{"ok":true}'] };

    const response = await provider.callAi(REQUEST);

    assert.equal(response.content, '{"ok":true}');
    assert.equal(response.model, 'primary-model');
    assert.equal(response.fromFallback, false);
    assert.equal(callsByModel['primary-model'], 2);
    assert.deepEqual(delays, [1_000]);
  });

  it('503 três vezes → erro, com esperas crescentes (~1 s e ~3 s) e sem 4ª tentativa', async () => {
    outcomesByModel = { 'primary-model': [503, 503, 503, '{"never":true}'] };

    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);

    assert.equal(callsByModel['primary-model'], 3);
    assert.deepEqual(delays, [1_000, 3_000]);
  });

  it('espera aleatória: ±25% em volta da base', async () => {
    randomValue = 0; // -25%
    outcomesByModel = { 'primary-model': [500, 503, '{"ok":true}'] };
    await provider.callAi(REQUEST);
    assert.deepEqual(delays, [750, 2_250]);

    delays = [];
    randomValue = 1; // +25%
    outcomesByModel = { 'primary-model': [503, 503, '{"ok":true}'] };
    await provider.callAi(REQUEST);
    assert.deepEqual(delays, [1_250, 3_750]);
  });

  it('429 e 400 não são repetidos no mesmo modelo', async () => {
    outcomesByModel = { 'primary-model': [429] };
    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    assert.equal(callsByModel['primary-model'], 1);

    outcomesByModel = { 'primary-model': [400] };
    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    assert.equal(callsByModel['primary-model'], 2);
    assert.deepEqual(delays, []);
  });

  it('reserva definida: usada depois de esgotar o principal, marcada fromFallback', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'primary-model': [503, 503, 503], 'backup-model': ['{"backup":true}'] };

    const response = await provider.callAi(REQUEST);

    assert.equal(response.content, '{"backup":true}');
    assert.equal(response.model, 'backup-model');
    assert.equal(response.fromFallback, true);
    assert.equal(callsByModel['primary-model'], 3);
    assert.equal(callsByModel['backup-model'], 1);
    // Mesmo system prompt e config no modelo reserva.
    const backupConfig = modelConfigs.find(config => config.model === 'backup-model');
    assert.equal(backupConfig?.systemInstruction, REQUEST.systemPrompt);
  });

  it('reserva definida: 429 no principal vai direto para a reserva (cota é por modelo)', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'primary-model': [429], 'backup-model': ['{"backup":true}'] };

    const response = await provider.callAi(REQUEST);

    assert.equal(response.fromFallback, true);
    assert.equal(callsByModel['primary-model'], 1);
  });

  it('reserva definida: falha que não é sobrecarga (400) não usa a reserva', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'primary-model': [400], 'backup-model': ['{"backup":true}'] };

    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    assert.equal(callsByModel['backup-model'], undefined);
  });

  it('reserva definida mas o principal responde: reserva não é usada', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'primary-model': ['{"ok":true}'] };

    const response = await provider.callAi(REQUEST);

    assert.equal(response.fromFallback, false);
    assert.equal(callsByModel['backup-model'], undefined);
  });

  it('reserva não definida: nada muda (3 tentativas e erro, nenhum outro modelo)', async () => {
    outcomesByModel = { 'primary-model': [503, 503, 503] };

    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);

    assert.deepEqual(Object.keys(callsByModel), ['primary-model']);
    assert.ok(modelConfigs.every(config => config.model === 'primary-model'));
  });

  it('visão: mesmas tentativas, mas nunca usa a reserva do texto', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'vision-model': [503, 503, 503] };

    await assert.rejects(
      provider.callVisionAi({ imageBase64: 'AAAA', mimeType: 'image/jpeg', prompt: 'p' }),
      provider.AiProviderRequestError
    );
    assert.equal(callsByModel['vision-model'], 3);
    assert.equal(callsByModel['backup-model'], undefined);
  });

  it('logs das tentativas sem prompt nem mensagem do usuário', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';
    outcomesByModel = { 'primary-model': [503, 503, 503], 'backup-model': [503] };

    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);

    const retryLogs = logLines.filter(line => line.text === '[aiProvider] google transient error, retrying');
    assert.deepEqual(retryLogs.map(line => line.payload), [
      { model: 'primary-model', attempt: 1, status: 503, retryDelayMs: 1_000 },
      { model: 'primary-model', attempt: 2, status: 503, retryDelayMs: 3_000 },
    ]);
    const logged = JSON.stringify(logLines);
    assert.ok(!logged.includes('SECRET'));
  });
});

describe('aiProvider — orçamento de tempo (CP-B1)', () => {
  it('sem tempo na janela para esperar + tentar: não faz a nova tentativa', async () => {
    outcomesByModel = { 'primary-model': [503, 503, '{"ok":true}'] };

    // Orçamento da requisição de 8 s: cabe a 1ª espera (1 s + 5 s mínimos),
    // não cabe a 2ª (já gastos ~1 s; 3 s + 5 s > ~7 s restantes).
    await budget.runWithAiRequestBudget(8_000, async () => {
      // O orçamento usa Date.now; alinha o relógio falso a ele.
      fakeNow = Date.now();
      await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    });

    assert.equal(callsByModel['primary-model'], 2);
    assert.deepEqual(delays, [1_000]);
    assert.ok(logLines.some(line => line.text === '[aiProvider] google retry skipped, not enough time left'));
  });

  it('orçamento da requisição esgotado: a chamada nem começa', async () => {
    outcomesByModel = { 'primary-model': ['{"ok":true}'] };

    await budget.runWithAiRequestBudget(4_000, async () => {
      fakeNow = Date.now();
      await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    });

    assert.equal(callsByModel['primary-model'], undefined);
  });

  it('sem orçamento de requisição: a janela é o timeout padrão da chamada (30 s)', async () => {
    outcomesByModel = { 'primary-model': [503, 503, '{"ok":true}'] };

    const response = await provider.callAi(REQUEST);

    assert.equal(response.content, '{"ok":true}');
    assert.equal(callsByModel['primary-model'], 3);
  });

  it('reserva só se ainda couber na janela', async () => {
    fakeEnv.AI_FALLBACK_MODEL = 'backup-model';

    // 8 s, chamadas instantâneas: 1ª espera cabe (1 + 5 ≤ 8), a 2ª não
    // (1 + 3 + 5 > 8) — mas a reserva cabe (1 + 5 ≤ 8) e roda.
    outcomesByModel = { 'primary-model': [503, 503], 'backup-model': ['{"backup":true}'] };
    await budget.runWithAiRequestBudget(8_000, async () => {
      fakeNow = Date.now();
      const response = await provider.callAi(REQUEST);
      assert.equal(response.fromFallback, true);
    });
    assert.equal(callsByModel['primary-model'], 2);

    // 12 s, cada chamada leva 1,5 s: as 3 tentativas cabem (a 3ª começa em
    // 7 s), mas depois dela (8,5 s) não sobram os 5 s mínimos para a reserva.
    callsByModel = {};
    delays = [];
    callLatencyMs = 1_500;
    outcomesByModel = { 'primary-model': [503, 503, 503], 'backup-model': ['{"backup":true}'] };
    await budget.runWithAiRequestBudget(12_000, async () => {
      fakeNow = Date.now();
      await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    });
    assert.equal(callsByModel['primary-model'], 3);
    assert.equal(callsByModel['backup-model'], undefined);
  });
});

// CP-B5.2: o 429 de cota do Gemini continua virando "IA indisponível" para o
// app, mas o log ganha um código interno próprio (ai/quota-exceeded).
describe('aiProvider — código interno da falha (CP-B5.2)', () => {
  function failureLogs(text: string) {
    return logLines.filter(line => line.text === text).map(line => line.payload as Record<string, unknown>);
  }

  it('429 (cota): mesmo erro para quem chama, log com ai/quota-exceeded e sem conteúdo', async () => {
    outcomesByModel = { 'primary-model': [429] };

    const error = await provider.callAi(REQUEST).then(
      () => assert.fail('deveria falhar'),
      (caught: unknown) => caught
    );

    assert.ok(error instanceof provider.AiProviderRequestError);
    assert.equal((error as InstanceType<typeof provider.AiProviderRequestError>).code, 'ai/quota-exceeded');
    const [log] = failureLogs('[aiProvider] request failed');
    assert.equal(log.code, 'ai/quota-exceeded');
    const serialized = JSON.stringify(logLines);
    assert.ok(!serialized.includes('SECRET SYSTEM PROMPT'));
    assert.ok(!serialized.includes('SECRET USER MESSAGE'));
  });

  it('503 esgotado e 400: ai/unavailable', async () => {
    outcomesByModel = { 'primary-model': [503, 503, 503] };
    await assert.rejects(provider.callAi(REQUEST), (error: unknown) => (
      error instanceof provider.AiProviderRequestError && error.code === 'ai/unavailable'
    ));

    logLines = [];
    outcomesByModel = { 'primary-model': [400] };
    await assert.rejects(provider.callAi(REQUEST), provider.AiProviderRequestError);
    assert.equal(failureLogs('[aiProvider] request failed')[0].code, 'ai/unavailable');
  });

  it('visão (Pantry): 429 também sai com ai/quota-exceeded no log', async () => {
    outcomesByModel = { 'vision-model': [429] };

    await assert.rejects(
      provider.callVisionAi({ imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg', prompt: 'SECRET SYSTEM PROMPT' }),
      (error: unknown) => error instanceof provider.AiProviderRequestError && error.code === 'ai/quota-exceeded'
    );
    assert.equal(failureLogs('[aiProvider] vision request failed')[0].code, 'ai/quota-exceeded');
    assert.ok(!JSON.stringify(logLines).includes('SECRET SYSTEM PROMPT'));
  });

  it('classifyAiFailure: só o status 429 é cota (OpenAI/Anthropic também expõem status)', () => {
    assert.equal(provider.classifyAiFailure({ status: 429 }), 'ai/quota-exceeded');
    assert.equal(provider.classifyAiFailure({ status: 503 }), 'ai/unavailable');
    assert.equal(provider.classifyAiFailure(new Error('timeout')), 'ai/unavailable');
    assert.equal(provider.classifyAiFailure(undefined), 'ai/unavailable');
  });
});
