// Fonte unica de verdade para precos e IDs comerciais do Pulse Pro no backend.
// Qualquer ajuste de preco deve ser feito somente neste arquivo.

import type { BlendiModel } from '../models/User';

export const PRO_MONTHLY_PRICE_USD = 4.99;
export const PRO_ANNUAL_PRICE_USD = 49.99;
export const PRO_ANNUAL_DISCOUNT_PERCENT = 17;

export const REVENUECAT_PRODUCT_ID_MONTHLY = 'pulse_pro_monthly';
export const REVENUECAT_PRODUCT_ID_ANNUAL = 'pulse_pro_annual';

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