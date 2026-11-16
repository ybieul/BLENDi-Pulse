// Fonte unica de verdade para precos e IDs comerciais do Pulse Pro no backend.
// Qualquer ajuste de preco deve ser feito somente neste arquivo.

import { BLENDER_LIMITS, type BlenderLimit } from '@blendi/shared';

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

// Capacidade física de cada modelo BLENDi — desde o CP-1.1.9 mora no shared
// (fonte única também para o filtro das receitas da Home no app). Reexportado
// aqui para os consumidores do backend continuarem importando deste arquivo.
export { BLENDER_LIMITS, type BlenderLimit };

export const PRICING_CONFIG = {
  PRO_MONTHLY_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  PRO_ANNUAL_DISCOUNT_PERCENT,
  REVENUECAT_PRODUCT_ID_MONTHLY,
  REVENUECAT_PRODUCT_ID_ANNUAL,
  BLENDER_LIMITS,
} as const;

export type PricingConfig = typeof PRICING_CONFIG;