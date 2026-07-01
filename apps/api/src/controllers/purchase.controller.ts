import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';

import { UserModel, type IUser } from '../models/User';
import {
  extractActiveSubscriptionSnapshot,
  RevenueCatConfigurationError,
  RevenueCatInvalidPurchaseError,
  RevenueCatRequestError,
  getSubscriberCustomerInfo,
  postReceiptAndGetActiveSubscription,
} from '../services/revenueCat.service';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

const DEFAULT_DAILY_HYDRATION_TARGET = 2500;

const verifyPurchaseSchema = z
  .object({
    platform: z
      .enum(['ios', 'android'], {
        errorMap: () => ({ message: 'errors.validation.invalid_option' }),
      })
      .optional(),
    receipt: z
      .string({
        required_error: 'errors.validation.required',
        invalid_type_error: 'errors.validation.required',
      })
      .trim()
      .min(1, 'errors.validation.required')
      .optional(),
    productId: z
      .string({ invalid_type_error: 'errors.validation.invalid_option' })
      .trim()
      .min(1, 'errors.validation.required')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.receipt && !value.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platform'],
        message: 'errors.validation.required',
      });
    }

    if (value.receipt && value.platform === 'android' && !value.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productId'],
        message: 'errors.validation.required',
      });
    }
  });

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

type PurchaseProfileUser = IUser & { _id: unknown };

function buildPurchaseProfileResponse(user: PurchaseProfileUser) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    profilePhoto: user.profilePhoto,
    blendiModel: user.blendiModel,
    goal: user.goal,
    locale: user.locale,
    unitSystem: user.unitSystem,
    timezone: user.timezone,
    dailyProteinTarget: user.dailyProteinTarget,
    dailyCalorieTarget: user.dailyCalorieTarget,
    dailyCarbTarget: user.dailyCarbTarget ?? 200,
    dailyHydrationTarget: user.dailyHydrationTarget ?? DEFAULT_DAILY_HYDRATION_TARGET,
    isPro: user.isPro ?? false,
    subscriptionId: user.subscriptionId ?? null,
    subscriptionPlan: user.subscriptionPlan ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    revenueCatCustomerId: user.revenueCatCustomerId ?? null,
    subscriptionCancelRequestedAt: user.subscriptionCancelRequestedAt ?? null,
    longestStreak: user.longestStreak ?? 0,
    weight: user.weight,
    height: user.height,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function verifyPurchase(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = verifyPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const existingUser = await UserModel.findById(userId).lean();
    if (!existingUser) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const subscription = parsed.data.receipt
      ? await postReceiptAndGetActiveSubscription({
          appUserId: userId,
          platform: parsed.data.platform!,
          receipt: parsed.data.receipt,
          productId: parsed.data.productId,
        })
      : extractActiveSubscriptionSnapshot(await getSubscriberCustomerInfo(userId));

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          isPro: true,
          subscriptionId: subscription.subscriptionId,
          subscriptionPlan: subscription.subscriptionPlan,
          subscriptionExpiresAt: subscription.subscriptionExpiresAt,
          revenueCatCustomerId: subscription.revenueCatCustomerId || userId,
          ...(subscription.cancelRequestedAt
            ? { subscriptionCancelRequestedAt: subscription.cancelRequestedAt }
            : {}),
        },
        ...(subscription.cancelRequestedAt
          ? {}
          : { $unset: { subscriptionCancelRequestedAt: 1 } }),
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedUser) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: buildPurchaseProfileResponse(updatedUser),
      },
    });
  } catch (err) {
    if (err instanceof RevenueCatConfigurationError) {
      sendErrorResponse(res, {
        statusCode: 503,
        code: 'purchases/system-unavailable',
        message: err.message,
      });
      return;
    }

    if (err instanceof RevenueCatInvalidPurchaseError) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'purchases/invalid-receipt',
        message: err.message,
      });
      return;
    }

    if (err instanceof RevenueCatRequestError) {
      sendErrorResponse(res, {
        statusCode: err.statusCode >= 400 && err.statusCode < 500 ? 400 : 502,
        code: 'purchases/provider-error',
        message: err.message,
      });
      return;
    }

    next(err);
  }
}