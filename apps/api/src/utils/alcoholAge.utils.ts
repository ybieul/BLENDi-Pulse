// apps/api/src/utils/alcoholAge.utils.ts
// CP-B5: idade para álcool, usada pelo Pulse AI e (CP-B7) pelo Pantry Scanner.

import { ALCOHOL_MIN_AGE_YEARS } from '@blendi/shared';

import { calculateAge } from './macroCalculation.utils';

/** 21+ (data de nascimento real ou confirmação), menor, ou sem resposta. */
export type AlcoholAgeStatus = 'of-age' | 'under-age' | 'unknown';

/**
 * CP-B5: idade para álcool. A data de nascimento só conta quando é real
 * (hasRealBodyProfile): toda conta nasce com o placeholder de 30 anos
 * (accountDefaults.utils.ts) e, sem esse cuidado, quem nunca informou a data
 * passaria como 21+. Sem data real, vale a resposta única gravada.
 */
export function resolveAlcoholAge(
  user: { birthDate?: Date | null; hasRealBodyProfile?: boolean | null; alcoholAgeConfirmed?: boolean | null },
  now: Date = new Date()
): AlcoholAgeStatus {
  if (user.hasRealBodyProfile === true && user.birthDate instanceof Date && !Number.isNaN(user.birthDate.getTime())) {
    return calculateAge(user.birthDate, now) >= ALCOHOL_MIN_AGE_YEARS ? 'of-age' : 'under-age';
  }

  if (user.alcoholAgeConfirmed === true) return 'of-age';
  if (user.alcoholAgeConfirmed === false) return 'under-age';
  return 'unknown';
}
