import { createHmac, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { env, paymentsConfig } from '../config/env';
import { UserModel } from '../models/User';
import {
  RevenueCatConfigurationError,
  RevenueCatInvalidPurchaseError,
  RevenueCatRequestError,
  extractActiveSubscriptionSnapshot,
  getSubscriberCustomerInfo,
} from '../services/revenueCat.service';
import { sendErrorResponse } from '../utils/error.utils';

const WEBHOOK_SIGNATURE_HEADER = 'x-revenuecat-webhook-signature';
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const revenueCatWebhookSchema = z.object({
  api_version: z.string(),
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_id: z.string().optional(),
    app_user_id: z.string(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    product_id: z.string().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    original_transaction_id: z.string().optional(),
    store: z.string().optional(),
    event_timestamp_ms: z.number(),
  }),
});

type RevenueCatWebhookPayload = z.infer<typeof revenueCatWebhookSchema>;

function parseSignatureHeader(signatureHeader: string): { timestamp: string; signature: string } | null {
  const segments = signatureHeader.split(',');
  const parsed = new Map<string, string>();

  for (const segment of segments) {
    const [key, value] = segment.split('=', 2);
    if (!key || !value) {
      continue;
    }

    parsed.set(key.trim(), value.trim());
  }

  const timestamp = parsed.get('t');
  const signature = parsed.get('v1');

  if (!timestamp || !signature) {
    return null;
  }

  return { timestamp, signature };
}

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return false;
  }

  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = Buffer.concat([
    Buffer.from(`${parsed.timestamp}.`, 'utf8'),
    rawBody,
  ]);

  const computedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const receivedSignature = parsed.signature;

  if (computedSignature.length !== receivedSignature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(computedSignature, 'utf8'), Buffer.from(receivedSignature, 'utf8'));
}

async function findUserForWebhook(event: RevenueCatWebhookPayload['event']) {
  const candidateIds = new Set<string>([
    event.app_user_id,
    event.original_app_user_id ?? '',
    ...(event.aliases ?? []),
  ]);

  const objectIds = [...candidateIds].filter(id => id && mongoose.isValidObjectId(id));
  const revenueCatIds = [...candidateIds].filter(Boolean);

  return UserModel.findOne({
    $or: [
      ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
      ...(revenueCatIds.length > 0 ? [{ revenueCatCustomerId: { $in: revenueCatIds } }] : []),
    ],
  });
}

async function syncActiveSubscriptionFromRevenueCat(userId: string) {
  const customerInfo = await getSubscriberCustomerInfo(userId);
  const subscription = extractActiveSubscriptionSnapshot(customerInfo);

  return UserModel.findByIdAndUpdate(
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
}

async function markCancellationRequested(
  userId: string,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const requestedAt = new Date(event.event_timestamp_ms);

  await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        subscriptionCancelRequestedAt: requestedAt,
        ...(event.expiration_at_ms ? { subscriptionExpiresAt: new Date(event.expiration_at_ms) } : {}),
        ...(event.original_transaction_id ? { subscriptionId: event.original_transaction_id } : {}),
      },
    },
    {
      runValidators: true,
    }
  ).lean();
}

async function revokeExpiredSubscription(
  userId: string,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const expirationDate = event.expiration_at_ms ? new Date(event.expiration_at_ms) : new Date();

  await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        isPro: false,
        subscriptionExpiresAt: expirationDate,
      },
      $unset: {
        subscriptionCancelRequestedAt: 1,
      },
    },
    {
      runValidators: true,
    }
  ).lean();
}

function sendWebhookIgnored(res: Response, reason: string): void {
  res.status(200).json({
    success: true,
    data: {
      ignored: true,
      reason,
    },
  });
}

export async function handleRevenueCatWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!paymentsConfig.isConfigured || !env.REVENUECAT_WEBHOOK_SECRET) {
      sendErrorResponse(res, {
        statusCode: 503,
        code: 'webhooks/system-unavailable',
        message:
          'Payment system is temporarily unavailable while RevenueCat keys are being configured.',
      });
      return;
    }

    const signatureHeader = req.header(WEBHOOK_SIGNATURE_HEADER);
    if (!signatureHeader) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'webhooks/unauthorized',
        message: 'Missing RevenueCat webhook signature.',
      });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!verifyWebhookSignature(rawBody, signatureHeader, env.REVENUECAT_WEBHOOK_SECRET)) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'webhooks/unauthorized',
        message: 'Invalid RevenueCat webhook signature.',
      });
      return;
    }

    const parsedJson = JSON.parse(rawBody.toString('utf8')) as unknown;
    const parsed = revenueCatWebhookSchema.safeParse(parsedJson);
    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'webhooks/invalid-payload',
        message: 'Invalid RevenueCat webhook payload.',
        errors: parsed.error.issues.map(issue => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
        })),
      });
      return;
    }

    const { event } = parsed.data;

    if (env.REVENUECAT_APP_ID && event.app_id && event.app_id !== env.REVENUECAT_APP_ID) {
      sendWebhookIgnored(res, 'RevenueCat app_id does not match this backend configuration.');
      return;
    }

    if (!['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'EXPIRATION'].includes(event.type)) {
      sendWebhookIgnored(res, `Unhandled RevenueCat event type: ${event.type}`);
      return;
    }

    const user = await findUserForWebhook(event);
    if (!user) {
      sendWebhookIgnored(res, 'No matching user found for RevenueCat webhook event.');
      return;
    }

    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      await syncActiveSubscriptionFromRevenueCat(String(user._id));

      res.status(200).json({
        success: true,
        data: {
          processed: true,
          eventId: event.id,
          eventType: event.type,
        },
      });
      return;
    }

    if (event.type === 'CANCELLATION') {
      await syncActiveSubscriptionFromRevenueCat(String(user._id)).catch(async err => {
        if (
          err instanceof RevenueCatConfigurationError ||
          err instanceof RevenueCatRequestError ||
          err instanceof RevenueCatInvalidPurchaseError
        ) {
          await markCancellationRequested(String(user._id), event);
          return null;
        }

        throw err;
      });

      await markCancellationRequested(String(user._id), event);

      res.status(200).json({
        success: true,
        data: {
          processed: true,
          eventId: event.id,
          eventType: event.type,
        },
      });
      return;
    }

    try {
      await syncActiveSubscriptionFromRevenueCat(String(user._id));
    } catch (err) {
      if (
        err instanceof RevenueCatInvalidPurchaseError &&
        (!event.expiration_at_ms || event.expiration_at_ms <= Date.now())
      ) {
        await revokeExpiredSubscription(String(user._id), event);
      } else if (
        err instanceof RevenueCatRequestError &&
        (!event.expiration_at_ms || event.expiration_at_ms <= Date.now())
      ) {
        await revokeExpiredSubscription(String(user._id), event);
      } else {
        throw err;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        processed: true,
        eventId: event.id,
        eventType: event.type,
      },
    });
  } catch (err) {
    next(err);
  }
}