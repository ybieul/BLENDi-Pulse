import { PRICING_CONFIG } from '../config/pricing.config';
import { env, paymentsConfig } from '../config/env';
import type { UserSubscriptionPlan } from '../models/User';

const REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com/v1';

export type RevenueCatPlatform = 'ios' | 'android';

interface RevenueCatCustomerInfoResponse {
  request_date: string;
  request_date_ms: number;
  subscriber: RevenueCatSubscriber;
}

interface RevenueCatSubscriber {
  original_app_user_id?: string;
  subscriptions?: Record<string, RevenueCatSubscription>;
}

interface RevenueCatSubscription {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  purchase_date?: string;
  original_purchase_date?: string;
  store_transaction_id?: string;
  unsubscribe_detected_at?: string | null;
}

export interface RevenueCatSubscriptionSnapshot {
  productId: string;
  subscriptionPlan: UserSubscriptionPlan;
  subscriptionExpiresAt: Date;
  subscriptionId: string;
  revenueCatCustomerId: string;
  cancelRequestedAt: Date | null;
}

export class RevenueCatConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueCatConfigurationError';
  }
}

export class RevenueCatInvalidPurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueCatInvalidPurchaseError';
  }
}

export class RevenueCatRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'RevenueCatRequestError';
    this.statusCode = statusCode;
  }
}

function getRevenueCatHeaders(platform?: RevenueCatPlatform): Record<string, string> {
  if (!env.REVENUECAT_API_KEY) {
    throw new RevenueCatConfigurationError(
      'Payment system is temporarily unavailable while RevenueCat keys are being configured.'
    );
  }

  return {
    Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
    'Content-Type': 'application/json',
    ...(platform ? { 'X-Platform': platform } : {}),
  };
}

function isTrackedProductId(productId: string): productId is typeof PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY | typeof PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL {
  return (
    productId === PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY ||
    productId === PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL
  );
}

function mapProductIdToPlan(productId: string): UserSubscriptionPlan | null {
  if (productId === PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY) {
    return 'monthly';
  }

  if (productId === PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL) {
    return 'annual';
  }

  return null;
}

function parseRevenueCatResponse(input: unknown): RevenueCatCustomerInfoResponse {
  if (!input || typeof input !== 'object') {
    throw new RevenueCatRequestError('RevenueCat returned an invalid response body.', 502);
  }

  const candidate = input as Partial<RevenueCatCustomerInfoResponse>;
  if (!candidate.subscriber || typeof candidate.subscriber !== 'object') {
    throw new RevenueCatRequestError('RevenueCat response did not include subscriber data.', 502);
  }

  return candidate as RevenueCatCustomerInfoResponse;
}

function getEffectiveExpiration(subscription: RevenueCatSubscription): Date | null {
  const rawExpiration = subscription.grace_period_expires_date ?? subscription.expires_date;
  if (!rawExpiration) {
    return null;
  }

  const parsed = new Date(rawExpiration);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractActiveSubscriptionSnapshot(
  customerInfo: RevenueCatCustomerInfoResponse
): RevenueCatSubscriptionSnapshot {
  const subscriptions = customerInfo.subscriber.subscriptions ?? {};
  const now = Date.now();

  let selected:
    | {
        productId: string;
        plan: UserSubscriptionPlan;
        expirationDate: Date;
        subscription: RevenueCatSubscription;
      }
    | undefined;

  for (const [productId, subscription] of Object.entries(subscriptions)) {
    if (!isTrackedProductId(productId)) {
      continue;
    }

    const plan = mapProductIdToPlan(productId);
    const expirationDate = getEffectiveExpiration(subscription);

    if (!plan || !expirationDate || expirationDate.getTime() <= now) {
      continue;
    }

    if (!selected || expirationDate.getTime() > selected.expirationDate.getTime()) {
      selected = {
        productId,
        plan,
        expirationDate,
        subscription,
      };
    }
  }

  if (!selected) {
    throw new RevenueCatInvalidPurchaseError(
      'No active Pulse Pro subscription was found for this purchase receipt.'
    );
  }

  return {
    productId: selected.productId,
    subscriptionPlan: selected.plan,
    subscriptionExpiresAt: selected.expirationDate,
    subscriptionId: selected.subscription.store_transaction_id ?? selected.productId,
    revenueCatCustomerId: customerInfo.subscriber.original_app_user_id ?? '',
    cancelRequestedAt: selected.subscription.unsubscribe_detected_at
      ? new Date(selected.subscription.unsubscribe_detected_at)
      : null,
  };
}

async function parseRevenueCatError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const { message } = payload as { message?: unknown };
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
  } catch {
    // noop
  }

  return `RevenueCat request failed with status ${response.status}.`;
}

export async function postReceiptAndGetActiveSubscription(input: {
  appUserId: string;
  platform: RevenueCatPlatform;
  receipt: string;
  productId?: string;
}): Promise<RevenueCatSubscriptionSnapshot> {
  if (!paymentsConfig.isConfigured) {
    throw new RevenueCatConfigurationError(
      'Payment system is temporarily unavailable while RevenueCat keys are being configured.'
    );
  }

  const response = await fetch(`${REVENUECAT_API_BASE_URL}/receipts`, {
    method: 'POST',
    headers: getRevenueCatHeaders(input.platform),
    body: JSON.stringify({
      app_user_id: input.appUserId,
      fetch_token: input.receipt,
      ...(input.productId ? { product_id: input.productId } : {}),
    }),
  });

  if (!response.ok) {
    throw new RevenueCatRequestError(await parseRevenueCatError(response), response.status);
  }

  const payload = parseRevenueCatResponse(await response.json());
  return extractActiveSubscriptionSnapshot(payload);
}

export async function getSubscriberCustomerInfo(appUserId: string): Promise<RevenueCatCustomerInfoResponse> {
  if (!paymentsConfig.isConfigured) {
    throw new RevenueCatConfigurationError(
      'Payment system is temporarily unavailable while RevenueCat keys are being configured.'
    );
  }

  const response = await fetch(
    `${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: 'GET',
      headers: getRevenueCatHeaders(),
    }
  );

  if (!response.ok) {
    throw new RevenueCatRequestError(await parseRevenueCatError(response), response.status);
  }

  return parseRevenueCatResponse(await response.json());
}