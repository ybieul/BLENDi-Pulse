// Fonte unica de verdade para precos e IDs comerciais do Pulse Pro no backend.
// Qualquer ajuste de preco deve ser feito somente neste arquivo.

import type { BlendiModel } from '../models/User';

export const PRO_MONTHLY_PRICE_USD = 6.99;
export const PRO_ANNUAL_PRICE_USD = 39.99;
export const PRO_ANNUAL_DISCOUNT_PERCENT = 52;

export const REVENUECAT_PRODUCT_ID_MONTHLY = 'pulse_pro_monthly';
export const REVENUECAT_PRODUCT_ID_ANNUAL = 'pulse_pro_annual';

// No Google Play a RevenueCat identifica produtos como "<assinatura>:<plano base>"
// (ex.: "pulse_pro_monthly:monthly"); no iOS o ID é simples. Esta função devolve só
// a parte antes do primeiro ":" e deve ser usada APENAS para comparar IDs: o ID
// original continua sendo o que se guarda, envia e registra.
export function normalizeProductId(productId: string): string {
  const separatorIndex = productId.indexOf(':');
  return separatorIndex === -1 ? productId : productId.slice(0, separatorIndex);
}

// Capacidade física de cada modelo BLENDi. Usado pelo promptBuilder do Pulse AI
// para nunca sugerir um volume de ingredientes ou uma proteina por receita
// acima do que o hardware do usuario comporta.
export interface BlenderLimit {
  maxVolumeMl: number;
  maxVolumeOz: number;
  maxProteinGrams: number;
}

export const BLENDER_LIMITS: Record<BlendiModel, BlenderLimit> = {
  Lite: {
    maxVolumeMl: 400,
    maxVolumeOz: 17.5,
    maxProteinGrams: 35,
  },
  ProPlus: {
    maxVolumeMl: 400,
    maxVolumeOz: 17.5,
    maxProteinGrams: 45,
  },
  Steel: {
    maxVolumeMl: 600,
    maxVolumeOz: 21,
    maxProteinGrams: 55,
  },
} as const;

export const PRICING_CONFIG = {
  PRO_MONTHLY_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  PRO_ANNUAL_DISCOUNT_PERCENT,
  REVENUECAT_PRODUCT_ID_MONTHLY,
  REVENUECAT_PRODUCT_ID_ANNUAL,
  BLENDER_LIMITS,
} as const;

export type PricingConfig = typeof PRICING_CONFIG;