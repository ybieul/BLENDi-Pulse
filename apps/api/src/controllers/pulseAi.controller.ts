import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  XP_EVENTS,
  pulseAiChatSchema,
  pulseAiRecipeSchema,
  type PulseAiRecipe,
} from '@blendi/shared';
import { ZodError, z } from 'zod';

import { env } from '../config/env';
import { BlendLogModel } from '../models/BlendLog';
import {
  ConversationModel,
  type IConversation,
  type IConversationMessage,
} from '../models/Conversation';
import {
  UserModel,
  type BlendiModel,
  type UserGoal,
  type UserLocale,
  type UserUnitSystem,
} from '../models/User';
import {
  buildPulseAiPrompt,
  type BuildPulseAiPromptResult,
  type PulseAiApiMessage,
} from '../services/promptBuilder.service';
import {
  AiProviderRequestError,
  callAi,
  type AiProviderResponse,
} from '../services/aiProvider.service';
import {
  generateCacheKey,
  getFromCache,
  invalidateUserCache,
  setInCache,
} from '../services/cache.service';
import { updateMissionProgress } from '../services/missionProgress.service';
import { awardXP } from '../services/xp.service';
import { sendErrorResponse } from '../utils/error.utils';
import { isSameDayInTimezone } from '../utils/timezone.utils';
import {
  buildMacroInconsistencyRetryMessage,
  validateMacroConsistency,
} from '../utils/macroValidation.utils';
import {
  buildProteinGuardrailRetryMessage,
  validateProteinGuardrail,
} from '../utils/blenderGuardrail.utils';

const DAILY_FREE_LIMIT = 3;
const INVALID_JSON_RETRY_INSTRUCTION =
  'Your previous response had an invalid format. Return only valid JSON.';
const CONVERSATION_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
// 6 exchanges = 6 user messages + 6 assistant messages, interleaved.
const CONVERSATION_HISTORY_MESSAGE_LIMIT = 12;

type ConversationRecord = IConversation & {
  _id: mongoose.Types.ObjectId | string;
};

interface ConversationContext {
  conversationId: mongoose.Types.ObjectId | string;
  historyMessages: PulseAiApiMessage[];
}

interface PulseAiUserProfile {
  id: string;
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  timezone: string;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  dailyAiUsage: number;
  aiUsageResetDate: Date;
  isPro: boolean;
}

interface PulseAiCachedResponse {
  recipe: PulseAiRecipe;
  aiProvider: string;
  aiModel: string;
}

interface GeneratedPulseAiRecipe {
  recipe: PulseAiRecipe | null;
  aiResponse: AiProviderResponse;
}

const pulseAiCachedResponseSchema: z.ZodType<PulseAiCachedResponse> = z.object({
  recipe: pulseAiRecipeSchema,
  aiProvider: z.string().trim().min(1),
  aiModel: z.string().trim().min(1),
});

function sendPulseAiUnavailable(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 503,
    code: 'pulseai/ai-unavailable',
    message: 'Pulse AI is temporarily unavailable.',
  });
}

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendUserNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'User not found.',
  });
}

function triggerPulseAiXP(userId: string, timezone: string): number {
  Promise.resolve()
    .then(() => awardXP(userId, 'pulseAi', timezone))
    .catch(err => console.error('XP award failed:', err));

  return XP_EVENTS.pulseAi;
}

function triggerPulseAiMissionProgress(userId: string, timezone: string): void {
  Promise.resolve()
    .then(() => updateMissionProgress(userId, 'usePulseAI', timezone))
    .catch(err => console.error('Mission update failed:', err));
}

function normalizeMessageForCache(message: string): string {
  return message
    .normalize('NFKD')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function getUsageRemaining(dailyAiUsage: number, isPro: boolean): number | null {
  return isPro ? null : Math.max(0, DAILY_FREE_LIMIT - dailyAiUsage);
}

type PulseAiUsageReservationResult =
  | {
      ok: true;
      usageRemaining: number | null;
    }
  | {
      ok: false;
    };

function sendDailyLimitReached(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 429,
    code: 'pulseai/daily-limit-reached',
    message: 'Daily Pulse AI limit reached.',
  });
}

async function reservePulseAiUsage(
  user: PulseAiUserProfile
): Promise<PulseAiUsageReservationResult> {
  if (user.isPro) {
    return {
      ok: true,
      usageRemaining: null,
    };
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: user.id,
      isPro: false,
      dailyAiUsage: { $lt: DAILY_FREE_LIMIT },
    },
    {
      $inc: {
        dailyAiUsage: 1,
      },
    },
    {
      new: true,
    }
  )
    .select({ dailyAiUsage: 1, isPro: 1 })
    .lean()
    .exec();

  if (!updatedUser) {
    return { ok: false };
  }

  return {
    ok: true,
    usageRemaining: getUsageRemaining(
      updatedUser.dailyAiUsage ?? DAILY_FREE_LIMIT,
      updatedUser.isPro ?? false,
    ),
  };
}

async function rollbackPulseAiUsageReservation(user: PulseAiUserProfile): Promise<void> {
  if (user.isPro) {
    return;
  }

  await UserModel.updateOne(
    {
      _id: user.id,
      isPro: false,
      dailyAiUsage: { $gt: 0 },
    },
    {
      $inc: {
        dailyAiUsage: -1,
      },
    }
  ).exec();
}

async function findPulseAiUserProfile(userId: string): Promise<PulseAiUserProfile | null> {
  const user = await UserModel.findById(userId)
    .select({
      blendiModel: 1,
      goal: 1,
      locale: 1,
      unitSystem: 1,
      timezone: 1,
      dailyProteinTarget: 1,
      dailyCarbTarget: 1,
      dailyCalorieTarget: 1,
      dailyAiUsage: 1,
      aiUsageResetDate: 1,
      isPro: 1,
    })
    .lean()
    .exec();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    blendiModel: user.blendiModel as BlendiModel,
    goal: user.goal as UserGoal,
    locale: user.locale as UserLocale,
    unitSystem: user.unitSystem as UserUnitSystem,
    timezone: user.timezone,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCarbTarget: user.dailyCarbTarget ?? 200,
    dailyCalorieTarget: user.dailyCalorieTarget,
    dailyAiUsage: user.dailyAiUsage ?? 0,
    aiUsageResetDate: user.aiUsageResetDate ?? new Date(),
    isPro: user.isPro ?? false,
  };
}

async function resetDailyAiUsageIfNeeded(user: PulseAiUserProfile): Promise<void> {
  const now = new Date();

  if (isSameDayInTimezone(user.aiUsageResetDate, now, user.timezone)) {
    return;
  }

  await UserModel.updateOne(
    {
      _id: user.id,
      aiUsageResetDate: user.aiUsageResetDate,
    },
    {
      $set: {
        dailyAiUsage: 0,
        aiUsageResetDate: now,
      },
    }
  ).exec();
}

function parsePulseAiRecipe(content: string): PulseAiRecipe | null {
  try {
    const rawPayload: unknown = JSON.parse(content);
    const parsed = pulseAiRecipeSchema.safeParse(rawPayload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function generatePulseAiRecipe(
  systemPrompt: string,
  messages: PulseAiApiMessage[]
): Promise<GeneratedPulseAiRecipe> {
  const aiResponse = await callAi({
    systemPrompt,
    messages,
    // gemini-2.5-flash consome parte do orçamento de saída com "thinking" interno
    // antes do JSON visível — 800 truncava a resposta quase sempre. 2000 testado
    // e confirmado suficiente com esse modelo (ver aiProvider.service.ts).
    maxTokens: 2000,
  });

  return {
    recipe: parsePulseAiRecipe(aiResponse.content),
    aiResponse,
  };
}

async function ensureBlenderGuardrail(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult,
  blendiModel: BlendiModel
): Promise<PulseAiRecipe> {
  const initialGuardrail = validateProteinGuardrail(recipe, blendiModel);

  if (initialGuardrail.withinGuardrail) {
    return recipe;
  }

  console.info('[pulseAi.controller] protein guardrail exceeded, retrying', {
    blendiModel,
    discrepancy: initialGuardrail.discrepancy,
  });

  try {
    const retryMessage = buildProteinGuardrailRetryMessage(initialGuardrail.discrepancy);
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: retryMessage },
    ]);

    return retried.recipe ?? recipe;
  } catch (error) {
    console.error('[pulseAi.controller] protein guardrail retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return recipe;
  }
}

async function ensureMacroConsistency(
  recipe: PulseAiRecipe,
  prompt: BuildPulseAiPromptResult
): Promise<PulseAiRecipe> {
  const initialConsistency = validateMacroConsistency(recipe);

  if (initialConsistency.macrosValidated) {
    return { ...recipe, macrosValidated: true };
  }

  console.info('[pulseAi.controller] macro inconsistency detected, retrying', {
    discrepancy: initialConsistency.discrepancy,
  });

  try {
    const retryMessage = buildMacroInconsistencyRetryMessage(
      recipe,
      initialConsistency.discrepancy
    );
    const retried = await generatePulseAiRecipe(prompt.systemPrompt, [
      ...prompt.messages,
      { role: 'assistant', content: JSON.stringify(recipe) },
      { role: 'user', content: retryMessage },
    ]);

    if (!retried.recipe) {
      return { ...recipe, macrosValidated: false };
    }

    const retriedConsistency = validateMacroConsistency(retried.recipe);
    return { ...retried.recipe, macrosValidated: retriedConsistency.macrosValidated };
  } catch (error) {
    console.error('[pulseAi.controller] macro consistency retry failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return { ...recipe, macrosValidated: false };
  }
}

function serializeConversationMessage(message: IConversationMessage): PulseAiApiMessage {
  if (message.role === 'user') {
    return { role: 'user', content: message.content as string };
  }

  return { role: 'assistant', content: (message.content as PulseAiRecipe).title };
}

async function resolveConversationContext(userId: string): Promise<ConversationContext> {
  const since = new Date(Date.now() - CONVERSATION_CONTEXT_WINDOW_MS);

  const recentConversation = (await ConversationModel.findOne({
    userId,
    createdAt: { $gt: since },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec()) as ConversationRecord | null;

  if (recentConversation) {
    return {
      conversationId: recentConversation._id,
      historyMessages: recentConversation.messages
        .slice(-CONVERSATION_HISTORY_MESSAGE_LIMIT)
        .map(serializeConversationMessage),
    };
  }

  const createdConversation = await ConversationModel.insertOne({
    userId,
    messages: [],
  });

  return {
    conversationId: createdConversation._id,
    historyMessages: [],
  };
}

async function persistConversationTurn(params: {
  conversationId: mongoose.Types.ObjectId | string;
  userMessage: string;
  userSentAt: Date;
  recipe: PulseAiRecipe;
}): Promise<void> {
  await ConversationModel.updateOne(
    { _id: params.conversationId },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: params.userMessage, timestamp: params.userSentAt },
            { role: 'assistant', content: params.recipe, timestamp: new Date() },
          ],
        },
      },
      $set: {
        lastRecipeName: params.recipe.title,
      },
    },
    {
      runValidators: true,
    }
  ).exec();
}

export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = pulseAiChatSchema.safeParse(req.body);

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'pulseai/invalid-message',
        message: 'Invalid Pulse AI message.',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const { message, language: requestedLanguage } = parsed.data;
    const normalizedMessage = normalizeMessageForCache(message);

    if (!normalizedMessage) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'pulseai/invalid-message',
        message: 'Invalid Pulse AI message.',
      });
      return;
    }

    const normalizedMessageHash = sha256(normalizedMessage);

    const initialUser = await findPulseAiUserProfile(userId);
    if (!initialUser) {
      sendUserNotFound(res);
      return;
    }

    await resetDailyAiUsageIfNeeded(initialUser);
    const currentUser = await findPulseAiUserProfile(userId);
    if (!currentUser) {
      sendUserNotFound(res);
      return;
    }

    const effectiveLanguage = requestedLanguage ?? currentUser.locale;
    const requestReceivedAt = new Date();
    const conversationContext = await resolveConversationContext(currentUser.id);

    const cacheKey = generateCacheKey({
      userId: currentUser.id,
      model: currentUser.blendiModel,
      goal: currentUser.goal,
      language: effectiveLanguage,
      unitSystem: currentUser.unitSystem,
      aiProvider: env.AI_PROVIDER,
      aiModel: env.AI_MODEL,
      rawMessage: normalizedMessage,
    });

    const cacheKeyParts = cacheKey.split(':');
    if (cacheKeyParts[7] !== normalizedMessageHash) {
      throw new Error('[pulseAi.controller] cacheKey hash mismatch');
    }

    const cachedResponse = await getFromCache(cacheKey);
    if (cachedResponse) {
      const parsedCachedResponse = pulseAiCachedResponseSchema.safeParse(cachedResponse);

      if (parsedCachedResponse.success) {
        const usageReservation = await reservePulseAiUsage(currentUser);

        if (!usageReservation.ok) {
          sendDailyLimitReached(res);
          return;
        }

        try {
          await persistConversationTurn({
            conversationId: conversationContext.conversationId,
            userMessage: message,
            userSentAt: requestReceivedAt,
            recipe: parsedCachedResponse.data.recipe,
          });
        } catch (error) {
          await rollbackPulseAiUsageReservation(currentUser);
          throw error;
        }

        const xpAwarded = triggerPulseAiXP(currentUser.id, currentUser.timezone);
        triggerPulseAiMissionProgress(currentUser.id, currentUser.timezone);

        res.status(200).json({
          success: true,
          data: {
            recipe: parsedCachedResponse.data.recipe,
            fromCache: true,
            usageRemaining: usageReservation.usageRemaining,
            aiProvider: parsedCachedResponse.data.aiProvider,
            aiModel: parsedCachedResponse.data.aiModel,
            xpAwarded,
            conversationId: String(conversationContext.conversationId),
            macrosValidated: parsedCachedResponse.data.recipe.macrosValidated ?? true,
          },
        });
        return;
      }
    }

    const recentBlendLogs = await BlendLogModel.find({ userId: currentUser.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ recipeName: 1, _id: 0 })
      .lean()
      .exec();

    const prompt = buildPulseAiPrompt({
      blendiModel: currentUser.blendiModel,
      goal: currentUser.goal,
      language: requestedLanguage,
      locale: currentUser.locale,
      unitSystem: currentUser.unitSystem,
      dailyProteinTarget: currentUser.dailyProteinTarget,
      dailyCarbTarget: currentUser.dailyCarbTarget,
      dailyCalorieTarget: currentUser.dailyCalorieTarget,
      recentBlendRecipeNames: recentBlendLogs.flatMap(log => (
        log.recipeName ? [log.recipeName] : []
      )),
      message,
    });

    if (conversationContext.historyMessages.length > 0) {
      prompt.messages = [...conversationContext.historyMessages, ...prompt.messages];
    }

    const usageReservation = await reservePulseAiUsage(currentUser);

    if (!usageReservation.ok) {
      sendDailyLimitReached(res);
      return;
    }

    let shouldRollbackUsage = !currentUser.isPro;

    let recipe: PulseAiRecipe | null = null;
    let aiResponse: AiProviderResponse | null = null;

    try {
      try {
        const generatedRecipe = await generatePulseAiRecipe(prompt.systemPrompt, prompt.messages);
        recipe = generatedRecipe.recipe;
        aiResponse = generatedRecipe.aiResponse;
      } catch (error) {
        if (shouldRollbackUsage) {
          await rollbackPulseAiUsageReservation(currentUser);
          shouldRollbackUsage = false;
        }

        if (error instanceof AiProviderRequestError) {
          sendPulseAiUnavailable(res);
          return;
        }

        throw error;
      }

      if (!recipe) {
        try {
          const regeneratedRecipe = await generatePulseAiRecipe(prompt.systemPrompt, [
            ...prompt.messages,
            {
              role: 'user',
              content: INVALID_JSON_RETRY_INSTRUCTION,
            },
          ]);
          recipe = regeneratedRecipe.recipe;
          aiResponse = regeneratedRecipe.aiResponse;
        } catch (error) {
          if (shouldRollbackUsage) {
            await rollbackPulseAiUsageReservation(currentUser);
            shouldRollbackUsage = false;
          }

          if (error instanceof AiProviderRequestError) {
            sendPulseAiUnavailable(res);
            return;
          }

          throw error;
        }
      }

      if (!recipe || !aiResponse) {
        if (shouldRollbackUsage) {
          await rollbackPulseAiUsageReservation(currentUser);
          shouldRollbackUsage = false;
        }

        sendErrorResponse(res, {
          statusCode: 500,
          code: 'pulseai/invalid-ai-response',
          message: 'Pulse AI returned an invalid response.',
        });
        return;
      }

      recipe = await ensureBlenderGuardrail(recipe, prompt, currentUser.blendiModel);
      recipe = await ensureMacroConsistency(recipe, prompt);

      await persistConversationTurn({
        conversationId: conversationContext.conversationId,
        userMessage: message,
        userSentAt: requestReceivedAt,
        recipe,
      });

      await setInCache({
        cacheKey,
        userId: currentUser.id,
        model: currentUser.blendiModel,
        goal: currentUser.goal,
        language: effectiveLanguage,
        unitSystem: currentUser.unitSystem,
        aiProvider: aiResponse.provider,
        aiModel: aiResponse.model,
        rawMessage: normalizedMessage,
        response: {
          recipe,
          aiProvider: aiResponse.provider,
          aiModel: aiResponse.model,
        },
      });

      shouldRollbackUsage = false;

      const xpAwarded = triggerPulseAiXP(currentUser.id, currentUser.timezone);
      triggerPulseAiMissionProgress(currentUser.id, currentUser.timezone);

      res.status(200).json({
        success: true,
        data: {
          recipe,
          fromCache: false,
          usageRemaining: usageReservation.usageRemaining,
          aiProvider: aiResponse.provider,
          aiModel: aiResponse.model,
          xpAwarded,
          conversationId: String(conversationContext.conversationId),
          macrosValidated: recipe.macrosValidated ?? true,
        },
      });
    } catch (error) {
      if (shouldRollbackUsage) {
        await rollbackPulseAiUsageReservation(currentUser);
        shouldRollbackUsage = false;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function getUsage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await findPulseAiUserProfile(userId);
    if (!user) {
      sendUserNotFound(res);
      return;
    }

    await resetDailyAiUsageIfNeeded(user);

    const currentUser = await findPulseAiUserProfile(userId);
    if (!currentUser) {
      sendUserNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        dailyAiUsage: currentUser.dailyAiUsage,
        isPro: currentUser.isPro,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function invalidateCache(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const deletedCount = await invalidateUserCache(userId);

    res.status(200).json({
      success: true,
      data: {
        deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
}