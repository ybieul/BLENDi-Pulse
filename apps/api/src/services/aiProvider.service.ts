import Anthropic from '@anthropic-ai/sdk';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  type GenerateContentRequest,
  type GenerativeModel,
} from '@google/generative-ai';
import OpenAI from 'openai';

import { env } from '../config/env';

const AI_PROVIDER_TIMEOUT_MS = 30_000;
const VISION_PROVIDER_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_VISION_MAX_TOKENS = 1000;
// Retry único (backoff fixo, não exponencial) para 503 "high demand" do Gemini.
// Diferente de OpenAI/Anthropic, o SDK do Google não tem retry embutido —
// achado da Tarefa 10 do diagnóstico de resiliência, que confirmou instabilidade
// real desse tipo já documentada abaixo em AI_MODEL.
const GOOGLE_HIGH_DEMAND_RETRY_DELAY_MS = 1_000;
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

function isGoogleHighDemandError(error: unknown): boolean {
  return error instanceof GoogleGenerativeAIFetchError && error.status === 503;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chama model.generateContent com cancelamento real via AbortController — o
 * SDK do Google só cria um internamente se `signal`/`timeout` forem passados
 * explicitamente (ver Tarefa 3 do diagnóstico de resiliência); sem isso, a
 * chamada ao Gemini seguia rodando em background mesmo depois do withTimeout
 * já ter descartado o resultado. O mesmo AbortController cobre as duas
 * tentativas (original + 1 retry de 503), então o orçamento de `timeoutMs`
 * nunca dobra — o retry acontece dentro da mesma janela, não depois dela.
 */
async function generateGoogleContent(
  model: GenerativeModel,
  request: GenerateContentRequest,
  timeoutMs: number
): ReturnType<GenerativeModel['generateContent']> {
  const controller = new AbortController();
  const abortTimeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    try {
      return await model.generateContent(request, { signal: controller.signal });
    } catch (error) {
      if (!isGoogleHighDemandError(error)) {
        throw error;
      }

      await delay(GOOGLE_HIGH_DEMAND_RETRY_DELAY_MS);
      return await model.generateContent(request, { signal: controller.signal });
    }
  } finally {
    clearTimeout(abortTimeoutId);
  }
}

async function callGoogle(request: AiProviderRequest): Promise<AiProviderResponse> {
  const client = new GoogleGenerativeAI(env.AI_API_KEY);
  const model = client.getGenerativeModel({
    model: env.AI_MODEL,
    systemInstruction: request.systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: getMaxTokens(request.maxTokens),
    },
  });

  const response = await generateGoogleContent(
    model,
    {
      contents: request.messages.map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    },
    AI_PROVIDER_TIMEOUT_MS
  );

  return {
    content: ensureTextContent(response.response.text(), 'google'),
    model: env.AI_MODEL,
    provider: env.AI_PROVIDER,
    fromFallback: false,
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

async function callGoogleVision(request: VisionProviderRequest): Promise<VisionProviderResult> {
  const client = new GoogleGenerativeAI(env.VISION_API_KEY);
  const model = client.getGenerativeModel({
    model: env.VISION_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: getMaxTokens(request.maxTokens, DEFAULT_VISION_MAX_TOKENS),
    },
  });

  const response = await generateGoogleContent(
    model,
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
    VISION_PROVIDER_TIMEOUT_MS
  );

  return {
    content: ensureTextContent(response.response.text(), 'google vision'),
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

export async function callVisionAi(
  request: VisionProviderRequest
): Promise<VisionProviderResponse> {
  const provider = env.VISION_PROVIDER;
  const model = env.VISION_MODEL;
  const imageSizeKb = getImageSizeKb(request.imageBase64);
  const startedAt = Date.now();

  try {
    let response: VisionProviderResult;

    switch (provider) {
      case 'openai':
        response = await withTimeout(
          callOpenAIVision(request),
          provider,
          model,
          VISION_PROVIDER_TIMEOUT_MS,
          'vision request'
        );
        break;
      case 'anthropic':
        response = await withTimeout(
          callAnthropicVision(request),
          provider,
          model,
          VISION_PROVIDER_TIMEOUT_MS,
          'vision request'
        );
        break;
      case 'google':
        response = await withTimeout(
          callGoogleVision(request),
          provider,
          model,
          VISION_PROVIDER_TIMEOUT_MS,
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

  console.info(`[aiProvider] provider=${provider} model=${model}`);

  try {
    switch (provider) {
      case 'openai':
        return await withTimeout(callOpenAI(request), provider, model);
      case 'anthropic':
        return await withTimeout(callAnthropic(request), provider, model);
      case 'google':
        return await withTimeout(callGoogle(request), provider, model);
      default:
        throw new Error(`[aiProvider] Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error('[aiProvider] request failed', {
      provider,
      model,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new AiProviderRequestError();
  }
}