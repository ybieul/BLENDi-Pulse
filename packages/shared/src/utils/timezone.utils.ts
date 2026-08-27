// Validação de timezone IANA compartilhada entre backend e mobile.
// Usada pelos schemas Zod (user.ts, auth.ts) como fonte única da verdade —
// mesma técnica usada em apps/api/src/utils/timezone.utils.ts (validateTimezone).

export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone) {
    return false;
  }

  // Intl.supportedValuesOf('timeZone') só lista os nomes canônicos da IANA —
  // 'UTC', 'GMT' e formas como 'Etc/GMT+5' são timezones válidos aceitos pelo
  // Intl.DateTimeFormat mas NÃO aparecem nessa lista. Por isso ela é usada só
  // como atalho rápido; o construtor é sempre a fonte de verdade final.
  if (typeof Intl.supportedValuesOf === 'function' && Intl.supportedValuesOf('timeZone').includes(timezone)) {
    return true;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
