// Fonte unica de verdade para precos e IDs comerciais do Pulse Pro no backend.
// Qualquer ajuste de preco deve ser feito somente neste arquivo.

export const PRO_MONTHLY_PRICE_USD = 4.99;
export const PRO_ANNUAL_PRICE_USD = 49.99;
export const PRO_ANNUAL_DISCOUNT_PERCENT = 17;

export const REVENUECAT_PRODUCT_ID_MONTHLY = 'pulse_pro_monthly';
export const REVENUECAT_PRODUCT_ID_ANNUAL = 'pulse_pro_annual';

export const PRICING_CONFIG = {
  PRO_MONTHLY_PRICE_USD,
  PRO_ANNUAL_PRICE_USD,
  PRO_ANNUAL_DISCOUNT_PERCENT,
  REVENUECAT_PRODUCT_ID_MONTHLY,
  REVENUECAT_PRODUCT_ID_ANNUAL,
} as const;

export type PricingConfig = typeof PRICING_CONFIG;