import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { env, paymentsConfig, revenueCatAppIds } from '../config/env';
import { isRevenueCatAppIdAccepted } from '../config/revenuecat.config';
import { UserModel } from '../models/User';
import { captureServerEvent } from '../services/analytics.service';
import {
  RevenueCatConfigurationError,
  RevenueCatInvalidPurchaseError,
  RevenueCatRequestError,
  extractActiveSubscriptionSnapshot,
  getSubscriberCustomerInfo,
} from '../services/revenueCat.service';
import { sendErrorResponse } from '../utils/error.utils';
import { authorizeRevenueCatWebhook } from '../utils/revenueCatWebhookAuth';

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

/**
 * Resultado da sincronização na compra/renovação (CP-1.1.1d):
 * - 'synced': assinatura ativa gravada.
 * - 'invalid-purchase': erro PERMANENTE — a RevenueCat respondeu, mas não há
 *   assinatura ativa de produto conhecido (RevenueCatInvalidPurchaseError).
 *   Reenviar não muda a resposta, então o webhook responde 2xx.
 * - 'retry': erro TEMPORÁRIO — falha de rede/timeout, erro HTTP da API da
 *   RevenueCat (RevenueCatRequestError), configuração ausente ou falha do
 *   banco. O webhook responde fora de 2xx para a RevenueCat reenviar; a
 *   renovação é aplicada (e o evento disparado) na tentativa que der certo.
 */
export type PurchaseOrRenewalOutcome = 'synced' | 'invalid-purchase' | 'retry';

// Exportada para teste direto do ponto de ciclo de vida 'subscription_renewed' sem
// precisar simular toda a requisicao HTTP do webhook (ver *.test.ts).
export async function handleInitialPurchaseOrRenewal(
  user: { _id: unknown },
  event: RevenueCatWebhookPayload['event']
): Promise<PurchaseOrRenewalOutcome> {
  const userId = String(user._id);

  try {
    await syncActiveSubscriptionFromRevenueCat(userId);
  } catch (err) {
    // Só nome e status do erro: a mensagem pode trazer texto da API externa.
    const errorInfo = {
      userId,
      eventId: event.id,
      eventType: event.type,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      ...(err instanceof RevenueCatRequestError ? { statusCode: err.statusCode } : {}),
    };

    if (err instanceof RevenueCatInvalidPurchaseError) {
      // Sem subscription_renewed: nada foi renovado no nosso banco.
      console.warn(
        '[revenueCatWebhook.controller] purchase/renewal without an active subscription on RevenueCat — not retrying.',
        errorInfo
      );
      return 'invalid-purchase';
    }

    // Sem subscription_renewed aqui: o evento só sai quando a sincronização
    // de fato acontecer (na tentativa reenviada), para não duplicar.
    console.error(
      '[revenueCatWebhook.controller] purchase/renewal sync failed — asking RevenueCat to retry.',
      errorInfo
    );
    return 'retry';
  }

  if (event.type === 'RENEWAL') {
    captureServerEvent(userId, 'subscription_renewed', {
      product_id: event.product_id,
      store: event.store,
    });
  }

  return 'synced';
}

export async function markCancellationRequested(
  userId: string,
  event: RevenueCatWebhookPayload['event']
): Promise<void> {
  const currentUser = await UserModel.findById(userId).select({ isPro: 1 }).lean();

  if (!currentUser || !currentUser.isPro) {
    console.info(
      '[revenueCatWebhook.controller] CANCELLATION received after EXPIRATION, ignoring — subscription is already inactive.',
      { userId, eventId: event.id }
    );
    return;
  }

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

  captureServerEvent(userId, 'subscription_cancel_requested', {
    product_id: event.product_id,
    store: event.store,
  });
}

export async function revokeExpiredSubscription(
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

  captureServerEvent(userId, 'subscription_expired', {
    product_id: event.product_id,
    store: event.store,
  });
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

    if (!authorizeRevenueCatWebhook(req, res, env.REVENUECAT_WEBHOOK_SECRET)) {
      return;
    }

    // O corpo chega bruto (express.raw em index.ts); requisicao autenticada com corpo
    // ausente ou JSON invalido e erro do cliente (400), nao falha interna.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'webhooks/invalid-payload',
        message: 'Invalid RevenueCat webhook payload.',
      });
      return;
    }

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

    if (!isRevenueCatAppIdAccepted(event.app_id, revenueCatAppIds)) {
      console.warn(
        `[revenuecat-webhook] Evento ignorado: app_id ${event.app_id} nao esta em REVENUECAT_APP_IDS.`
      );
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
      const outcome = await handleInitialPurchaseOrRenewal(user, event);

      if (outcome === 'retry') {
        // Fora de 2xx: a RevenueCat reenvia o webhook com backoff.
        sendErrorResponse(res, {
          statusCode: 503,
          code: 'webhooks/subscription-sync-unavailable',
          message: 'Subscription sync is temporarily unavailable. Please retry.',
        });
        return;
      }

      if (outcome === 'invalid-purchase') {
        sendWebhookIgnored(res, 'No active subscription found on RevenueCat for this event.');
        return;
      }

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
      await syncActiveSubscriptionFromRevenueCat(String(user._id)).catch(err => {
        if (
          err instanceof RevenueCatConfigurationError ||
          err instanceof RevenueCatRequestError ||
          err instanceof RevenueCatInvalidPurchaseError
        ) {
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