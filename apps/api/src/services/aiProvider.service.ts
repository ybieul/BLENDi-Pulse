import Anthropic from '@anthropic-ai/sdk';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  type GenerateContentRequest,
  type GenerativeModel,
} from '@google/generative-ai';
import OpenAI from 'openai';

import { env } from '../config/env';
import { getAiRequestRemainingMs } from './aiRequestBudget.service';

const AI_PROVIDER_TIMEOUT_MS = 30_000;
const VISION_PROVIDER_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_VISION_MAX_TOKENS = 1000;
// CP-B1 — sobrecarga do Gemini. Antes: 1 retry fixo de 1 s em 503 (achado da
// Tarefa 10 do diagnóstico de resiliência); na auditoria de 2026-11-16 o
// Gemini de dev deu 503 em 14 de 53 pedidos do Pulse AI, e 1 retry não bastou.
// Agora: até 3 tentativas no total, com espera crescente e aleatória (~1 s e
// ~3 s, ±25%), todas dentro da MESMA janela de timeout da chamada (30 s texto,
// 45 s visão — ou menos, se o orçamento da requisição estiver no fim).
// O SDK do Google não tem retry embutido (OpenAI/Anthropic têm).
const GOOGLE_TRANSIENT_MAX_ATTEMPTS = 3;
const GOOGLE_TRANSIENT_RETRY_BASE_DELAYS_MS = [1_000, 3_000] as const;
const GOOGLE_TRANSIENT_RETRY_JITTER_RATIO = 0.25;
// 503 UNAVAILABLE ("model is overloaded / high demand") e 500 INTERNAL são os
// dois que a documentação do Gemini manda tentar de novo. 429 (cota) não é
// repetido no mesmo modelo: a cota é por minuto/dia e o retryDelay que o
// Google devolve costuma ser de dezenas de segundos, maior que a janela — mas
// a cota é por modelo, então 429 ainda leva ao modelo reserva, se houver.
const GOOGLE_TRANSIENT_STATUS_CODES: ReadonlySet<number> = new Set([500, 503]);
const GOOGLE_FALLBACK_STATUS_CODES: ReadonlySet<number> = new Set([429, 500, 503]);
// Não começa uma tentativa (nem a espera antes dela) se sobrar menos que isto
// na janela — uma chamada de geração do Gemini quase nunca termina abaixo disso.
const AI_MIN_ATTEMPT_BUDGET_MS = 5_000;
const ANTHROPIC_JSON_INSTRUCTION =
  'You must respond with valid JSON only, no additional text.';
const ANTHROPIC_VISION_JSON_INSTRUCTION = 'Respond with valid JSON only.';

type AiProviderMessageRole = 'user' | 'assistant';

export interface AiProviderRequest {
  systemPrompt: string;
  messages: Array<{
    role: AiProviderMessageRole;
    content: string;
  }>;
  maxTokens?: number;
}

export interface AiProviderResponse {
  content: string;
  model: string;
  provider: string;
  fromFallback: boolean;
}

export interface VisionProviderRequest {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  maxTokens?: number;
}

export interface VisionProviderResponse {
  content: string;
  model: string;
  provider: string;
  processingTimeMs: number;
}

type VisionProviderResult = Omit<VisionProviderResponse, 'processingTimeMs'>;

export class AiProviderRequestError extends Error {
  constructor(message = 'AI provider request failed.') {
    super(message);
    this.name = 'AiProviderRequestError';
  }
}

function getMaxTokens(maxTokens?: number, defaultMaxTokens = DEFAULT_MAX_TOKENS): number {
  if (Number.isInteger(maxTokens) && typeof maxTokens === 'number' && maxTokens > 0) {
    return maxTokens;
  }

  return defaultMaxTokens;
}

function getBase64SizeBytes(base64: string): number {
  const normalizedBase64 = base64.replace(/\s+/g, '');
  const padding = normalizedBase64.endsWith('==') ? 2 : normalizedBase64.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((normalizedBase64.length * 3) / 4) - padding);
}

function getImageSizeKb(imageBase64: string): number {
  return Number((getBase64SizeBytes(imageBase64) / 1024).toFixed(1));
}

function ensureTextContent(content: string | null | undefined, provider: string): string {
  const normalizedContent = content?.trim();

  if (!normalizedContent) {
    throw new Error(`[aiProvider] ${provider} returned empty content.`);
  }

  return normalizedContent;
}

async function callOpenAI(request: AiProviderRequest): Promise<AiProviderResponse> {
  const client = new OpenAI({ apiKey: env.AI_API_KEY });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: request.systemPrompt,
    },
    ...request.messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const response = await client.chat.completions.create({
    model: env.AI_MODEL,
    max_tokens: getMaxTokens(request.maxTokens),
    response_format: { type: 'json_object' },
    messages,
  });

  return {
    content: ensureTextContent(response.choices[0]?.message?.content, 'openai'),
    model: env.AI_MODEL,
    provider: env.AI_PROVIDER,
    fromFallback: false,
  };
}

async function callAnthropic(request: AiProviderRequest): Promise<AiProviderResponse> {
  const client = new Anthropic({ apiKey: env.AI_API_KEY });
  const response = await client.messages.create({
    model: env.AI_MODEL,
    max_tokens: getMaxTokens(request.maxTokens),
    system: `${request.systemPrompt}\n\n${ANTHROPIC_JSON_INSTRUCTION}`,
    messages: request.messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  });

  const firstContentBlock = response.content[0];

  if (!firstContentBlock || firstContentBlock.type !== 'text') {
    throw new Error('[aiProvider] anthropic returned non-text content.');
  }

  return {
    content: ensureTextContent(firstContentBlock.text, 'anthropic'),
    model: env.AI_MODEL,
    provider: env.AI_PROVIDER,
    fromFallback: false,
  };
}

function getGoogleErrorStatus(error: unknown): number | undefined {
  return error instanceof GoogleGenerativeAIFetchError ? error.status : undefined;
}

function isGoogleTransientError(error: unknown): boolean {
  const status = getGoogleErrorStatus(error);
  return status !== undefined && GOOGLE_TRANSIENT_STATUS_CODES.has(status);
}

function isGoogleFallbackEligibleError(error: unknown): boolean {
  const status = getGoogleErrorStatus(error);
  return status !== undefined && GOOGLE_FALLBACK_STATUS_CODES.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Relógio, espera e sorteio das novas tentativas do Google. Só os testes
 * substituem (para não esperar de verdade nem depender do acaso).
 */
export const aiProviderTiming = {
  now: (): number => Date.now(),
  delay,
  random: (): number => Math.random(),
};

function getGoogleRetryDelayMs(failedAttempt: number): number {
  const baseDelayMs =
    GOOGLE_TRANSIENT_RETRY_BASE_DELAYS_MS[
      Math.min(failedAttempt, GOOGLE_TRANSIENT_RETRY_BASE_DELAYS_MS.length) - 1
    ];
  const jitter = (aiProviderTiming.random() * 2 - 1) * GOOGLE_TRANSIENT_RETRY_JITTER_RATIO;

  return Math.round(baseDelayMs * (1 + jitter));
}

interface GoogleModelCandidate {
  name: string;
  model: GenerativeModel;
}

interface GoogleGenerationResult {
  response: Awaited<ReturnType<GenerativeModel['generateContent']>>;
  modelName: string;
  fromFallback: boolean;
}

/**
 * Chama model.generateContent com cancelamento real via AbortController — o
 * SDK do Google só cria um internamente se `signal`/`timeout` forem passados
 * explicitamente (ver Tarefa 3 do diagnóstico de resiliência); sem isso, a
 * chamada ao Gemini seguia rodando em background mesmo depois do withTimeout
 * já ter descartado o resultado.
 *
 * CP-B1: o mesmo AbortController (e a mesma janela de `timeoutMs`) cobre
 * todas as tentativas — até GOOGLE_TRANSIENT_MAX_ATTEMPTS no modelo principal
 * em 500/503 e, se `fallback` vier (AI_FALLBACK_MODEL), 1 tentativa nele
 * depois de esgotar o principal com sobrecarga (429/500/503). Uma tentativa
 * (com a espera antes dela) só começa se couber na janela com pelo menos
 * AI_MIN_ATTEMPT_BUDGET_MS de sobra. Logs sem prompt nem dados do usuário.
 */
async function generateGoogleContent(
  primary: GoogleModelCandidate,
  request: GenerateContentRequest,
  timeoutMs: number,
  fallback?: GoogleModelCandidate
): Promise<GoogleGenerationResult> {
  const startedAt = aiProviderTiming.now();
  const deadline = startedAt + timeoutMs;
  const controller = new AbortController();
  const abortTimeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fitsInWindow = (waitMs: number) =>
    aiProviderTiming.now() + waitMs + AI_MIN_ATTEMPT_BUDGET_MS <= deadline;

  try {
    let lastError: unknown;

    for (let attempt = 1; attempt <= GOOGLE_TRANSIENT_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await primary.model.generateContent(request, { signal: controller.signal });

        if (attempt > 1) {
          console.info('[aiProvider] google succeeded after retry', {
            model: primary.name,
            attempt,
          });
        }

        return { response, modelName: primary.name, fromFallback: false };
      } catch (error) {
        lastError = error;

        if (!isGoogleTransientError(error) || attempt === GOOGLE_TRANSIENT_MAX_ATTEMPTS) {
          break;
        }

        const retryDelayMs = getGoogleRetryDelayMs(attempt);

        if (!fitsInWindow(retryDelayMs)) {
          console.warn('[aiProvider] google retry skipped, not enough time left', {
            model: primary.name,
            attempt,
            status: getGoogleErrorStatus(error),
            remainingMs: Math.max(0, deadline - aiProviderTiming.now()),
          });
          break;
        }

        console.warn('[aiProvider] google transient error, retrying', {
          model: primary.name,
          attempt,
          status: getGoogleErrorStatus(error),
          retryDelayMs,
        });

        await aiProviderTiming.delay(retryDelayMs);
      }
    }

    if (fallback && isGoogleFallbackEligibleError(lastError) && fitsInWindow(0)) {
      console.warn('[aiProvider] google primary model unavailable, trying fallback model', {
        model: primary.name,
        fallbackModel: fallback.name,
        status: getGoogleErrorStatus(lastError),
      });

      const response = await fallback.model.generateContent(request, { signal: controller.signal });

      return { response, modelName: fallback.name, fromFallback: true };
    }

    throw lastError;
  } finally {
    clearTimeout(abortTimeoutId);
  }
}

async function callGoogle(
  request: AiProviderRequest,
  timeoutMs: number
): Promise<AiProviderResponse> {
  const client = new GoogleGenerativeAI(env.AI_API_KEY);
  const getModel = (modelName: string): GoogleModelCandidate => ({
    name: modelName,
    model: client.getGenerativeModel({
      model: modelName,
      systemInstruction: request.systemPrompt,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: getMaxTokens(request.maxTokens),
      },
    }),
  });
  const fallbackModelName = env.AI_FALLBACK_MODEL;

  const result = await generateGoogleContent(
    getModel(env.AI_MODEL),
    {
      contents: request.messages.map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    },
    timeoutMs,
    fallbackModelName && fallbackModelName !== env.AI_MODEL ? getModel(fallbackModelName) : undefined
  );

  return {
    content: ensureTextContent(result.response.response.text(), 'google'),
    model: result.modelName,
    provider: env.AI_PROVIDER,
    fromFallback: result.fromFallback,
  };
}

async function callOpenAIVision(request: VisionProviderRequest): Promise<VisionProviderResult> {
  const client = new OpenAI({ apiKey: env.VISION_API_KEY });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:${request.mimeType};base64,${request.imageBase64}`,
          },
        },
        {
          type: 'text',
          text: request.prompt,
        },
      ],
    },
  ];

  const response = await client.chat.completions.create({
    model: env.VISION_MODEL,
    max_tokens: getMaxTokens(request.maxTokens, DEFAULT_VISION_MAX_TOKENS),
    response_format: { type: 'json_object' },
    messages,
  });

  return {
    content: ensureTextContent(response.choices[0]?.message?.content, 'openai vision'),
    model: env.VISION_MODEL,
    provider: env.VISION_PROVIDER,
  };
}

async function callAnthropicVision(request: VisionProviderRequest): Promise<VisionProviderResult> {
  const client = new Anthropic({ apiKey: env.VISION_API_KEY });
  const response = await client.messages.create({
    model: env.VISION_MODEL,
    max_tokens: getMaxTokens(request.maxTokens, DEFAULT_VISION_MAX_TOKENS),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: request.mimeType as 'image/jpeg' | 'image/png',
              data: request.imageBase64,
            },
          },
          {
            type: 'text',
            text: `${request.prompt}\n\n${ANTHROPIC_VISION_JSON_INSTRUCTION}`,
          },
        ],
      },
    ],
  });

  const firstTextBlock = response.content.find(contentBlock => contentBlock.type === 'text');

  if (!firstTextBlock) {
    throw new Error('[aiProvider] anthropic vision returned non-text content.');
  }

  return {
    content: ensureTextContent(firstTextBlock.text, 'anthropic vision'),
    model: env.VISION_MODEL,
    provider: env.VISION_PROVIDER,
  };
}

async function callGoogleVision(
  request: VisionProviderRequest,
  timeoutMs: number
): Promise<VisionProviderResult> {
  const client = new GoogleGenerativeAI(env.VISION_API_KEY);
  const model = client.getGenerativeModel({
    model: env.VISION_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: getMaxTokens(request.maxTokens, DEFAULT_VISION_MAX_TOKENS),
    },
  });

  // Visão: só as novas tentativas no mesmo modelo. AI_FALLBACK_MODEL é a
  // reserva do modelo de texto (AI_MODEL/AI_API_KEY), não do de visão.
  const result = await generateGoogleContent(
    { name: env.VISION_MODEL, model },
    {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: request.mimeType,
                data: request.imageBase64,
              },
            },
            {
              text: request.prompt,
            },
          ],
        },
      ],
    },
    timeoutMs
  );

  return {
    content: ensureTextContent(result.response.response.text(), 'google vision'),
    model: env.VISION_MODEL,
    provider: env.VISION_PROVIDER,
  };
}

async function withTimeout<T>(
  operation: Promise<T>,
  provider: string,
  model: string,
  timeoutMs = AI_PROVIDER_TIMEOUT_MS,
  requestType = 'request'
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `[aiProvider] ${provider} ${requestType} timed out after ${timeoutMs}ms for model ${model}.`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

class AiRequestBudgetExhaustedError extends Error {
  constructor(remainingMs: number) {
    super(`[aiProvider] request budget exhausted (${remainingMs}ms left), call not started.`);
    this.name = 'AiRequestBudgetExhaustedError';
  }
}

/**
 * CP-B1: timeout desta chamada = min(timeout padrão, tempo restante do
 * orçamento da requisição — aiRequestBudget.service.ts). Sem tempo para uma
 * tentativa útil, a chamada nem começa: lança, e o caller trata como falha
 * do provedor (AiProviderRequestError → 503 com uso/scan devolvido).
 */
function resolveCallTimeoutMs(defaultTimeoutMs: number): number {
  const remainingMs = getAiRequestRemainingMs(aiProviderTiming.now());

  if (remainingMs === null) {
    return defaultTimeoutMs;
  }

  if (remainingMs < AI_MIN_ATTEMPT_BUDGET_MS) {
    throw new AiRequestBudgetExhaustedError(remainingMs);
  }

  return Math.min(defaultTimeoutMs, remainingMs);
}

export async function callVisionAi(
  request: VisionProviderRequest
): Promise<VisionProviderResponse> {
  const provider = env.VISION_PROVIDER;
  const model = env.VISION_MODEL;
  const imageSizeKb = getImageSizeKb(request.imageBase64);
  const startedAt = Date.now();

  try {
    const timeoutMs = resolveCallTimeoutMs(VISION_PROVIDER_TIMEOUT_MS);
    let response: VisionProviderResult;

    switch (provider) {
      case 'openai':
        response = await withTimeout(
          callOpenAIVision(request),
          provider,
          model,
          timeoutMs,
          'vision request'
        );
        break;
      case 'anthropic':
        response = await withTimeout(
          callAnthropicVision(request),
          provider,
          model,
          timeoutMs,
          'vision request'
        );
        break;
      case 'google':
        response = await withTimeout(
          callGoogleVision(request, timeoutMs),
          provider,
          model,
          timeoutMs,
          'vision request'
        );
        break;
      default:
        throw new Error(`[aiProvider] Unsupported vision provider: ${provider}`);
    }

    const processingTimeMs = Date.now() - startedAt;

    console.info('[aiProvider] vision request completed', {
      provider,
      model,
      imageSizeKb,
      processingTimeMs,
    });

    return {
      ...response,
      processingTimeMs,
    };
  } catch (error) {
    console.error('[aiProvider] vision request failed', {
      provider,
      model,
      imageSizeKb,
      processingTimeMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new AiProviderRequestError();
  }
}

export async function callAi(request: AiProviderRequest): Promise<AiProviderResponse> {
  const provider = env.AI_PROVIDER;
  const model = env.AI_MODEL;
  const startedAt = Date.now();

  console.info(`[aiProvider] provider=${provider} model=${model}`);

  try {
    const timeoutMs = resolveCallTimeoutMs(AI_PROVIDER_TIMEOUT_MS);

    switch (provider) {
      case 'openai':
        return await withTimeout(callOpenAI(request), provider, model, timeoutMs);
      case 'anthropic':
        return await withTimeout(callAnthropic(request), provider, model, timeoutMs);
      case 'google':
        return await withTimeout(callGoogle(request, timeoutMs), provider, model, timeoutMs);
      default:
        throw new Error(`[aiProvider] Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error('[aiProvider] request failed', {
      provider,
      model,
      processingTimeMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new AiProviderRequestError();
  }
}
