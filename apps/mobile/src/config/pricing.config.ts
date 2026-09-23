// Fonte unica de verdade para precos e IDs comerciais do Pulse Pro no app mobile.
// Qualquer ajuste de preco deve ser feito somente neste arquivo.

export const PRO_MONTHLY_PRICE_USD = 6.99;
export const PRO_ANNUAL_PRICE_USD = 39.99;
export const PRO_ANNUAL_DISCOUNT_PERCENT = 52;

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