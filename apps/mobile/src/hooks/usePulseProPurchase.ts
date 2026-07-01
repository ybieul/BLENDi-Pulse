import { Alert } from 'react-native';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { QUERY_KEYS } from '../config/cache.config';
import type { AuthUser } from '../services/auth.service';
import {
  getAvailablePurchasePlans,
  purchasePlan,
  PurchaseServiceError,
  restorePurchaseHistory,
  type PurchasePlanId,
  type PurchasePlan,
  type PurchaseSyncResult,
} from '../services/purchase.service';
import type { ShoppingListsResult } from '../services/shoppingList.service';
import { useAuthStore } from '../store/auth.store';
import { showToast } from '../utils/toast.events';
import { useAppTranslation } from './useAppTranslation';

interface CachedUserProfileResponse {
  success: true;
  data: {
    user: Record<string, unknown>;
  };
}

interface PurchaseFlowOptions {
  onActivated?: () => void;
}

const RESTORE_NOT_FOUND_CODE = 'purchases/restore-not-found';
const PURCHASE_SUCCESS_KEY = 'me.upgradeScreen.purchaseSuccess';
const RESTORE_SUCCESS_KEY = 'me.upgradeScreen.restoreSuccess';

function normalizePurchasedUser(user: PurchaseSyncResult['user']): AuthUser {
  return {
    ...user,
    lastCleanedAt: user.lastCleanedAt ?? null,
    pushToken: user.pushToken ?? null,
    isPro: user.isPro ?? false,
    subscriptionId: user.subscriptionId ?? null,
    subscriptionPlan: user.subscriptionPlan ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    subscriptionCancelRequestedAt: user.subscriptionCancelRequestedAt ?? null,
    revenueCatCustomerId: user.revenueCatCustomerId ?? null,
    totalXP: user.totalXP ?? 0,
  };
}

export function usePulseProPurchase() {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  const [availablePlans, setAvailablePlans] = useState<PurchasePlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [activePlanId, setActivePlanId] = useState<PurchasePlanId | null>(null);

  const syncPaidState = useCallback(
    (purchasedUser: PurchaseSyncResult['user']) => {
      const normalizedUser = normalizePurchasedUser(purchasedUser);

      setUser(normalizedUser);

      queryClient.setQueryData(
        QUERY_KEYS.userProfile,
        (current: CachedUserProfileResponse | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            data: {
              ...current.data,
              user: {
                ...current.data.user,
                blendiModel: normalizedUser.blendiModel,
                isPro: normalizedUser.isPro,
                subscriptionId: normalizedUser.subscriptionId,
                subscriptionPlan: normalizedUser.subscriptionPlan,
                subscriptionExpiresAt: normalizedUser.subscriptionExpiresAt,
                subscriptionCancelRequestedAt:
                  normalizedUser.subscriptionCancelRequestedAt,
                revenueCatCustomerId: normalizedUser.revenueCatCustomerId,
                totalXP: normalizedUser.totalXP,
                updatedAt: normalizedUser.updatedAt,
              },
            },
          };
        },
      );

      queryClient.setQueryData(
        QUERY_KEYS.shoppingLists,
        (current: ShoppingListsResult | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            canCreateMore: true,
          };
        },
      );

      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingLists });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shoppingListsArchived });
    },
    [queryClient, setUser],
  );

  const handlePurchaseError = useCallback(
    (error: unknown) => {
      const translationKey =
        error instanceof PurchaseServiceError
          ? error.translationKey
          : 'errors.purchases_failed';

      showToast(t(translationKey as Parameters<typeof t>[0]));
    },
    [t],
  );

  const finalizeActivation = useCallback(
    (
      result: PurchaseSyncResult,
      successTranslationKey: typeof PURCHASE_SUCCESS_KEY | typeof RESTORE_SUCCESS_KEY,
      options?: PurchaseFlowOptions,
    ) => {
      syncPaidState(result.user);
      showToast(t(successTranslationKey));
      options?.onActivated?.();
    },
    [syncPaidState, t],
  );

  const runPurchase = useCallback(
    async (planId: PurchasePlanId, options?: PurchaseFlowOptions) => {
      setActivePlanId(planId);

      try {
        const result = await purchasePlan(planId);
        finalizeActivation(result, PURCHASE_SUCCESS_KEY, options);
      } catch (error) {
        handlePurchaseError(error);
      } finally {
        setActivePlanId(null);
      }
    },
    [finalizeActivation, handlePurchaseError],
  );

  const loadPurchasePlans = useCallback(
    async () => {
      setIsLoadingPlans(true);

      try {
        const plans = await getAvailablePurchasePlans();
        const annualPlan = plans.find((plan) => plan.id === 'annual') ?? null;
        const monthlyPlan = plans.find((plan) => plan.id === 'monthly') ?? null;

        if (!annualPlan || !monthlyPlan) {
          throw new PurchaseServiceError(
            'Tracked purchase plans are unavailable.',
            'errors.purchases_plans_unavailable',
            'purchases/plans-unavailable',
          );
        }

        setAvailablePlans(plans);

        return plans;
      } catch (error) {
        setAvailablePlans([]);
        handlePurchaseError(error);
        return [];
      } finally {
        setIsLoadingPlans(false);
      }
    },
    [handlePurchaseError],
  );

  const purchaseProPlan = useCallback(
    async (planId: PurchasePlanId, options?: PurchaseFlowOptions) => {
      await runPurchase(planId, options);
    },
    [runPurchase],
  );

  const restoreProAccess = useCallback(
    async (options?: PurchaseFlowOptions) => {
      setIsRestoring(true);

      try {
        const result = await restorePurchaseHistory();
        finalizeActivation(result, RESTORE_SUCCESS_KEY, options);
      } catch (error) {
        if (
          error instanceof PurchaseServiceError
          && error.code === RESTORE_NOT_FOUND_CODE
        ) {
          Alert.alert(
            t('me.upgradeScreen.restoreNotFoundTitle'),
            t('me.upgradeScreen.restoreNotFoundMessage'),
          );
        } else {
          handlePurchaseError(error);
        }
      } finally {
        setIsRestoring(false);
      }
    },
    [finalizeActivation, handlePurchaseError, t],
  );

  return {
    availablePlans,
    isLoadingPlans,
    isRestoring,
    isPurchasing: activePlanId !== null,
    activePlanId,
    isBusy: isLoadingPlans || isRestoring || activePlanId !== null,
    loadPurchasePlans,
    purchaseProPlan,
    restoreProAccess,
  };
}
