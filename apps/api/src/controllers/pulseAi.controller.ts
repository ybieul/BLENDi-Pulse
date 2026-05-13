import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  pulseAiChatSchema,
  pulseAiRecipeSchema,
  type PulseAiRecipe,
} from '@blendi/shared';
import { ZodError, z } from 'zod';

import { env } from '../config/env';
import { BlendLogModel } from '../models/BlendLog';
import {
  UserModel,
  type BlendiModel,
  type UserGoal,
  type UserLocale,
  type UserUnitSystem,
} from '../models/User';
import {
  buildPulseAiPrompt,
  type PulseAiApiMessage,
} from '../services/promptBuilder.service';
import {
  AiProviderRequestError,
  callAi,
  type AiProviderResponse,
} from '../services/aiProvider.service';
import { generateCacheKey, getFromCache, setInCache } from '../services/cache.service';
import { sendErrorResponse } from '../utils/error.utils';
import { isSameDayInTimezone } from '../utils/timezone.utils';

const DAILY_FREE_LIMIT = 3;
const INVALID_JSON_RETRY_INSTRUCTION =
  'Your previous response had an invalid format. Return only valid JSON.';

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
    maxTokens: 800,
  });

  return {
    recipe: parsePulseAiRecipe(aiResponse.content),
    aiResponse,
  };
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

    const normalizedMessage = normalizeMessageForCache(parsed.data.message);

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

    const cacheKey = generateCacheKey({
      userId: currentUser.id,
      model: currentUser.blendiModel,
      goal: currentUser.goal,
      language: currentUser.locale,
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

        res.status(200).json({
          success: true,
          data: {
            recipe: parsedCachedResponse.data.recipe,
            fromCache: true,
            usageRemaining: usageReservation.usageRemaining,
            aiProvider: parsedCachedResponse.data.aiProvider,
            aiModel: parsedCachedResponse.data.aiModel,
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
      locale: currentUser.locale,
      unitSystem: currentUser.unitSystem,
      dailyProteinTarget: currentUser.dailyProteinTarget,
      dailyCarbTarget: currentUser.dailyCarbTarget,
      dailyCalorieTarget: currentUser.dailyCalorieTarget,
      recentBlendRecipeNames: recentBlendLogs.flatMap(log => (
        log.recipeName ? [log.recipeName] : []
      )),
      message: parsed.data.message,
    });

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

      await setInCache({
        cacheKey,
        userId: currentUser.id,
        model: currentUser.blendiModel,
        goal: currentUser.goal,
        language: currentUser.locale,
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

      res.status(200).json({
        success: true,
        data: {
          recipe,
          fromCache: false,
          usageRemaining: usageReservation.usageRemaining,
          aiProvider: aiResponse.provider,
          aiModel: aiResponse.model,
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