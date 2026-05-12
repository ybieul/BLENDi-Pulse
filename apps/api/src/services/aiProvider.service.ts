import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import { env } from '../config/env';

const AI_PROVIDER_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 800;
const ANTHROPIC_JSON_INSTRUCTION =
  'You must respond with valid JSON only, no additional text.';

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

export class AiProviderRequestError extends Error {
  constructor(message = 'AI provider request failed.') {
    super(message);
    this.name = 'AiProviderRequestError';
  }
}

function getMaxTokens(maxTokens?: number): number {
  if (Number.isInteger(maxTokens) && typeof maxTokens === 'number' && maxTokens > 0) {
    return maxTokens;
  }

  return DEFAULT_MAX_TOKENS;
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

  const response = await model.generateContent({
    contents: request.messages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
  });

  return {
    content: ensureTextContent(response.response.text(), 'google'),
    model: env.AI_MODEL,
    provider: env.AI_PROVIDER,
    fromFallback: false,
  };
}

async function withTimeout<T>(operation: Promise<T>, provider: string, model: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`[aiProvider] ${provider} request timed out after ${AI_PROVIDER_TIMEOUT_MS}ms for model ${model}.`));
        }, AI_PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
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