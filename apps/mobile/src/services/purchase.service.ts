import axios from 'axios';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { api } from '../config/api';
import { PRICING_CONFIG } from '../config/pricing.config';
import { getRevenueCatApiKey, isRevenueCatNativePlatform } from '../config/revenuecat.config';
import { getApiErrorTranslationKey } from '../utils/error.utils';

export type PurchasePlanId = 'monthly' | 'annual';

type PurchasePlatform = 'ios' | 'android';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface PurchaseVerifiedUser {
  id: string;
  email: string;
  name: string;
  profilePhoto?: string;
  lastCleanedAt?: string | null;
  pushToken?: string | null;
  blendiModel: 'Lite' | 'ProPlus' | 'Steel';
  goal: 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';
  locale: 'en' | 'pt-BR';
  unitSystem: 'metric' | 'imperial';
  timezone: string;
  dailyProteinTarget: number;
  dailyCalorieTarget: number;
  dailyCarbTarget: number;
  dailyHydrationTarget: number;
  isPro: boolean;
  subscriptionId?: string | null;
  subscriptionPlan?: PurchasePlanId | null;
  subscriptionExpiresAt?: string | null;
  subscriptionCancelRequestedAt?: string | null;
  revenueCatCustomerId?: string | null;
  longestStreak: number;
  totalXP?: number;
  weight?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

interface VerifyPurchaseResponse {
  success: true;
  data: {
    user: PurchaseVerifiedUser;
  };
}

export interface PurchasePlan {
  id: PurchasePlanId;
  productId: string;
  title: string;
  description: string;
  price: number;
  priceString: string;
  currencyCode: string;
  pricePerMonthString: string | null;
  packageType: PACKAGE_TYPE;
}

export interface PurchaseSyncResult {
  user: PurchaseVerifiedUser;
  customerInfo: CustomerInfo;
  productIdentifier: string;
}

export class PurchaseServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly code?: string,
    public readonly isUserCancelled = false
  ) {
    super(message);
    this.name = 'PurchaseServiceError';
  }
}

let cachedPackages = new Map<PurchasePlanId, PurchasesPackage>();

function getCurrentPurchasePlatform(): PurchasePlatform | null {
  if (Platform.OS === 'ios') {
    return 'ios';
  }

  if (Platform.OS === 'android') {
    return 'android';
  }

  return null;
}

function getPlatformSupportError(): PurchaseServiceError {
  return new PurchaseServiceError(
    'Purchases are only available on iOS and Android in this app.',
    'errors.purchases_platform_unavailable',
    'purchases/platform-unavailable'
  );
}

function getConfigurationError(): PurchaseServiceError {
  return new PurchaseServiceError(
    'Payment system is temporarily unavailable while RevenueCat mobile keys are being configured.',
    'errors.purchases_system_unavailable',
    'purchases/system-unavailable'
  );
}

async function ensureRevenueCatConfigured(appUserId?: string | null): Promise<boolean> {
  if (!isRevenueCatNativePlatform()) {
    return false;
  }

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    return false;
  }

  const isConfigured = await Purchases.isConfigured().catch(() => false);

  if (!isConfigured) {
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({
      apiKey,
      ...(appUserId ? { appUserID: appUserId } : {}),
    });

    return true;
  }

  if (!appUserId) {
    return true;
  }

  const currentAppUserId = await Purchases.getAppUserID().catch(() => null);
  if (currentAppUserId !== appUserId) {
    await Purchases.logIn(appUserId);
  }

  return true;
}

function selectTrackedPackage(offering: PurchasesOffering, planId: PurchasePlanId): PurchasesPackage | null {
  const directMatch = planId === 'monthly' ? offering.monthly : offering.annual;
  if (directMatch) {
    return directMatch;
  }

  const targetProductId =
    planId === 'monthly'
      ? PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY
      : PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL;

  return offering.availablePackages.find((pkg) => pkg.product.identifier === targetProductId) ?? null;
}

function toPurchasePlan(planId: PurchasePlanId, pkg: PurchasesPackage): PurchasePlan {
  return {
    id: planId,
    productId: pkg.product.identifier,
    title: pkg.product.title,
    description: pkg.product.description,
    price: pkg.product.price,
    priceString: pkg.product.priceString,
    currencyCode: pkg.product.currencyCode,
    pricePerMonthString: pkg.product.pricePerMonthString,
    packageType: pkg.packageType,
  };
}

function cachePackages(nextPackages: Partial<Record<PurchasePlanId, PurchasesPackage>>): void {
  cachedPackages = new Map<PurchasePlanId, PurchasesPackage>();

  if (nextPackages.monthly) {
    cachedPackages.set('monthly', nextPackages.monthly);
  }

  if (nextPackages.annual) {
    cachedPackages.set('annual', nextPackages.annual);
  }
}

function getCachedPackage(planId: PurchasePlanId): PurchasesPackage | null {
  return cachedPackages.get(planId) ?? null;
}

function getPurchaseErrorTranslationKey(error: PurchasesError): string {
  switch (error.code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return 'errors.purchases_cancelled';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return 'errors.network.offline';
    case PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR:
      return 'errors.network.timeout';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'errors.purchases_payment_pending';
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
    case PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR:
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return 'errors.purchases_payment_declined';
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.UNSUPPORTED_ERROR:
      return 'errors.purchases_system_unavailable';
    default:
      return 'errors.network_internal_server_error';
  }
}

function toPurchaseServiceError(error: unknown): PurchaseServiceError {
  if (error instanceof PurchaseServiceError) {
    return error;
  }

  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    return new PurchaseServiceError(
      error.response?.data?.message ?? error.message,
      apiCode ? getApiErrorTranslationKey(apiCode) : 'errors.network_internal_server_error',
      apiCode,
      false
    );
  }

  const candidate = error as Partial<PurchasesError> | undefined;
  if (candidate?.code && typeof candidate.message === 'string') {
    return new PurchaseServiceError(
      candidate.message,
      getPurchaseErrorTranslationKey(candidate as PurchasesError),
      String(candidate.code),
      candidate.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    );
  }

  return new PurchaseServiceError(
    'Unexpected purchase service error.',
    'errors.network_internal_server_error',
  );
}

async function verifySubscriptionOnBackend(productId?: string): Promise<PurchaseVerifiedUser> {
  const platform = getCurrentPurchasePlatform();

  if (!platform) {
    throw getPlatformSupportError();
  }

  const response = await api.post<VerifyPurchaseResponse>('/purchases/verify', {
    platform,
    ...(productId ? { productId } : {}),
  });

  return response.data.data.user;
}

function hasTrackedSubscription(customerInfo: CustomerInfo): boolean {
  const activeSubscriptions = Object.keys(customerInfo.activeSubscriptions ?? {});

  return activeSubscriptions.includes(PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY)
    || activeSubscriptions.includes(PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL);
}

export async function initializePurchases(): Promise<boolean> {
  return ensureRevenueCatConfigured();
}

export async function identifyPurchasesUser(appUserId: string): Promise<void> {
  try {
    await ensureRevenueCatConfigured(appUserId);
  } catch {
    // Melhor esforço: auth não deve falhar por causa de pagamentos.
  }
}

export async function logoutPurchasesUser(): Promise<void> {
  if (!isRevenueCatNativePlatform() || !getRevenueCatApiKey()) {
    return;
  }

  const isConfigured = await Purchases.isConfigured().catch(() => false);
  if (!isConfigured) {
    return;
  }

  try {
    await Purchases.logOut();
  } catch {
    // Melhor esforço: logout principal nao depende disso.
  }
}

export async function getAvailablePurchasePlans(): Promise<PurchasePlan[]> {
  try {
    if (!isRevenueCatNativePlatform()) {
      throw getPlatformSupportError();
    }

    const configured = await ensureRevenueCatConfigured();
    if (!configured) {
      throw getConfigurationError();
    }

    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;

    if (!currentOffering) {
      throw new PurchaseServiceError(
        'No active RevenueCat offering is available for this user.',
        'errors.purchases_plans_unavailable',
        'purchases/plans-unavailable'
      );
    }

    const monthlyPackage = selectTrackedPackage(currentOffering, 'monthly');
    const annualPackage = selectTrackedPackage(currentOffering, 'annual');

    if (!monthlyPackage || !annualPackage) {
      throw new PurchaseServiceError(
        'Monthly and annual plans are not both available in the current offering.',
        'errors.purchases_plans_unavailable',
        'purchases/plans-unavailable'
      );
    }

    cachePackages({
      monthly: monthlyPackage,
      annual: annualPackage,
    });

    return [
      toPurchasePlan('monthly', monthlyPackage),
      toPurchasePlan('annual', annualPackage),
    ];
  } catch (error) {
    throw toPurchaseServiceError(error);
  }
}

async function getRequiredPackage(planId: PurchasePlanId): Promise<PurchasesPackage> {
  const cachedPackage = getCachedPackage(planId);
  if (cachedPackage) {
    return cachedPackage;
  }

  const plans = await getAvailablePurchasePlans();
  const targetPlan = plans.find((plan) => plan.id === planId);
  const resolvedPackage = getCachedPackage(planId);

  if (!targetPlan || !resolvedPackage) {
    throw new PurchaseServiceError(
      `Unable to resolve ${planId} purchase package.`,
      'errors.purchases_plans_unavailable',
      'purchases/plans-unavailable'
    );
  }

  return resolvedPackage;
}

export async function purchasePlan(planId: PurchasePlanId): Promise<PurchaseSyncResult> {
  try {
    if (!isRevenueCatNativePlatform()) {
      throw getPlatformSupportError();
    }

    const configured = await ensureRevenueCatConfigured();
    if (!configured) {
      throw getConfigurationError();
    }

    const targetPackage = await getRequiredPackage(planId);
    const purchaseResult = await Purchases.purchasePackage(targetPackage);
    const user = await verifySubscriptionOnBackend(purchaseResult.productIdentifier);

    return {
      user,
      customerInfo: purchaseResult.customerInfo,
      productIdentifier: purchaseResult.productIdentifier,
    };
  } catch (error) {
    throw toPurchaseServiceError(error);
  }
}

export async function restorePurchaseHistory(): Promise<PurchaseSyncResult> {
  try {
    if (!isRevenueCatNativePlatform()) {
      throw getPlatformSupportError();
    }

    const configured = await ensureRevenueCatConfigured();
    if (!configured) {
      throw getConfigurationError();
    }

    const customerInfo = await Purchases.restorePurchases();

    if (!hasTrackedSubscription(customerInfo)) {
      throw new PurchaseServiceError(
        'No previous Pulse Pro purchases were found to restore.',
        'errors.purchases_restore_not_found',
        'purchases/restore-not-found'
      );
    }

    const productIdentifier =
      customerInfo.activeSubscriptions.includes(PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL)
        ? PRICING_CONFIG.REVENUECAT_PRODUCT_ID_ANNUAL
        : PRICING_CONFIG.REVENUECAT_PRODUCT_ID_MONTHLY;

    const user = await verifySubscriptionOnBackend(productIdentifier);

    return {
      user,
      customerInfo,
      productIdentifier,
    };
  } catch (error) {
    throw toPurchaseServiceError(error);
  }
}