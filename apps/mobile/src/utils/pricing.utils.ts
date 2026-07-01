export function formatUsdCurrency(locale: string, value: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}