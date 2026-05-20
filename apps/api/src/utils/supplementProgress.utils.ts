import type { ISupplementLog } from '../models/SupplementLog';

const INTEGER_DOSAGE_PATTERN = /^\d+$/;

export function getSupplementDailyTargetCount(
  dosage: string,
  explicitDailyTargetCount?: number | null,
): number {
  if (
    typeof explicitDailyTargetCount === 'number'
    && Number.isSafeInteger(explicitDailyTargetCount)
    && explicitDailyTargetCount >= 1
  ) {
    return explicitDailyTargetCount;
  }

  const normalizedDosage = dosage.trim();

  if (!INTEGER_DOSAGE_PATTERN.test(normalizedDosage)) {
    return 1;
  }

  const parsedCount = Number(normalizedDosage);

  if (!Number.isSafeInteger(parsedCount) || parsedCount < 1) {
    return 1;
  }

  return parsedCount;
}

export function getSupplementConsumedCount(
  log?: Pick<ISupplementLog, 'consumedCount'> | null,
): number {
  if (!log) {
    return 0;
  }

  const parsedCount = typeof log.consumedCount === 'number' ? log.consumedCount : 1;

  if (!Number.isFinite(parsedCount) || parsedCount < 1) {
    return 1;
  }

  return Math.floor(parsedCount);
}